using System.ComponentModel;
using System.Diagnostics;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Security.AccessControl;
using System.Text;
using System.Text.Json;

namespace ToolDock.QuickLaunch;

static class Program
{
    static async Task<int> Main(string[] args)
    {
        Console.InputEncoding = new UTF8Encoding(false); Console.OutputEncoding = new UTF8Encoding(false);
        string stage = "initializing";
        try
        {
            if (args[0] == "environment")
            {
                Console.WriteLine(Protocol.Serialize(new { sid = WindowsIdentity.GetCurrent().User!.Value, sessionId = Process.GetCurrentProcess().SessionId, elevated = new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator) }));
            }
            else if (args[0] == "protect")
            {
                var path = Path.GetFullPath(await Console.In.ReadLineAsync() ?? ""); var directory = new DirectoryInfo(path);
                if (directory.Attributes.HasFlag(FileAttributes.ReparsePoint)) throw new InvalidDataException();
                var security = new DirectorySecurity(); security.SetAccessRuleProtection(true, false);
                foreach (var sid in new[] { WindowsIdentity.GetCurrent().User!, new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null), new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null) })
                    security.AddAccessRule(new FileSystemAccessRule(sid, FileSystemRights.FullControl, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
                directory.SetAccessControl(security); Console.WriteLine("{}");
            }
            else if (args[0] == "launch")
            {
                var config = Protocol.Parse<Configuration>(await Console.In.ReadLineAsync() ?? "");
                Validate(config);
                string boot = "tooldock-boot-" + Guid.NewGuid().ToString("N");
                using var pipe = Protocol.Server(boot, config.OwnerSid);
                var start = new ProcessStartInfo(Environment.ProcessPath!) { UseShellExecute = config.Elevated, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden };
                if (config.Elevated) start.Verb = "runas";
                else { start.RedirectStandardOutput = true; start.RedirectStandardError = true; }
                foreach (string arg in new[] { "serve", boot, Environment.ProcessId.ToString() }) start.ArgumentList.Add(arg);
                using var runner = Process.Start(start) ?? throw new InvalidOperationException();
                using var deadline = new CancellationTokenSource(90000);
                await pipe.WaitForConnectionAsync(deadline.Token);
                if (!Native.GetNamedPipeClientProcessId(pipe.SafePipeHandle.DangerousGetHandle(), out uint peer) || peer != runner.Id) throw new InvalidDataException();
                Native.VerifyProcess(runner.Id, null, Environment.ProcessPath);
                using var reader = Protocol.Reader(pipe); using var writer = Protocol.Writer(pipe);
                await writer.WriteLineAsync(Protocol.Serialize(config));
                Console.WriteLine(await Protocol.Read(reader, 20000, 10000));
            }
            else if (args[0] == "serve")
            {
                using var boot = new NamedPipeClientStream(".", args[1], PipeDirection.InOut, PipeOptions.Asynchronous);
                await boot.ConnectAsync(10000); Protocol.VerifyServer(boot, int.Parse(args[2]), null, Environment.ProcessPath);
                using var reader = Protocol.Reader(boot); using var writer = Protocol.Writer(boot);
                var config = Protocol.Parse<Configuration>(await Protocol.Read(reader)); Validate(config);
                if (config.SessionId != Process.GetCurrentProcess().SessionId || config.Elevated && !new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator)) throw new InvalidDataException();
                await new Runner(config).Run(writer);
            }
            else if (args[0] == "client")
            {
                var input = JsonDocument.Parse(await Console.In.ReadLineAsync() ?? "").RootElement;
                var identity = Protocol.Parse<Identity>(input.GetProperty("identity").GetRawText());
                string token = input.GetProperty("token").GetString()!, pipeName = input.GetProperty("pipe").GetString()!, command = input.GetProperty("command").GetString()!;
                using var pipe = new NamedPipeClientStream(".", pipeName, PipeDirection.InOut, PipeOptions.Asynchronous);
                stage = "connecting"; try { await pipe.ConnectAsync(2500); }
                catch (TimeoutException) { if (Native.DefinitelyExited(identity.RunnerPid, identity.RunnerStart, identity.Image)) { Console.WriteLine("{\"gone\":true}"); return 0; } throw; }
                stage = "verifying"; Protocol.VerifyServer(pipe, identity.RunnerPid, identity.RunnerStart, identity.Image);
                using var reader = Protocol.Reader(pipe); using var writer = Protocol.Writer(pipe);
                stage = "challenge"; string challenge = await Protocol.Read(reader, 1024);
                string nonce = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
                await writer.WriteLineAsync(Protocol.Serialize(new { command, nonce, proof = Protocol.Mac(token, challenge + ":" + nonce + ":" + command) }));
                stage = "response"; string result = await Protocol.Read(reader, 16000000, 12000);
                var response = JsonDocument.Parse(result).RootElement;
                string payload = response.GetProperty("payload").GetString()!;
                if (!Protocol.Matches(response.GetProperty("proof").GetString()!, Protocol.Mac(token, nonce + ":" + payload))) throw new InvalidDataException();
                await writer.WriteLineAsync("ack");
                Console.WriteLine(payload);
            }
            return 0;
        }
        catch (Exception error)
        {
            // Exception messages may include user command text or paths. Return a fixed category only.
            Console.WriteLine(Protocol.Serialize(new { error = error is Win32Exception w && w.NativeErrorCode == 1223 ? "UAC_CANCELLED" : "RUNNER_ERROR", kind = error.GetType().Name, stage, code = error is Win32Exception win ? win.NativeErrorCode : 0 }));
            return 1;
        }
    }
    static void Validate(Configuration config)
    {
        if (!Guid.TryParse(config.Id, out _) || !Guid.TryParse(config.AppId, out _) || config.Token.Length != 64 || Convert.FromHexString(config.Token).Length != 32 || !config.Pipe.StartsWith("tooldock-quick-")) throw new InvalidDataException();
        if (config.Shell is not ("cmd" or "powershell") || !Path.IsPathFullyQualified(config.Executable) || !File.Exists(config.Executable) || !Directory.Exists(config.WorkingDirectory) || Encoding.UTF8.GetByteCount(config.Content) > 65536) throw new InvalidDataException();
        if (config.ScriptPath != null && (!File.Exists(config.ScriptPath) || !(config.Shell == "powershell" ? new[] { ".ps1" } : new[] { ".bat", ".cmd" }).Contains(Path.GetExtension(config.ScriptPath).ToLowerInvariant()))) throw new InvalidDataException();
        string expected = config.Shell == "cmd" ? "cmd.exe" : Path.GetFileName(config.Executable).ToLowerInvariant();
        if (config.Shell == "cmd" && Path.GetFileName(config.Executable).ToLowerInvariant() != expected || config.Shell == "powershell" && expected is not ("powershell.exe" or "pwsh.exe")) throw new InvalidDataException();
    }
}

sealed class Runner(Configuration config)
{
    readonly object outputLock = new(); readonly StringBuilder output = new(); bool truncated; IntPtr job; Native.ProcessInfo process; bool stopping; long outputSequence;
    async Task Capture(FileStream stream, Encoding encoding)
    {
        using (stream) using (var reader = new StreamReader(stream, encoding, true))
        {
            var buffer = new char[4096]; int read;
            while ((read = await reader.ReadAsync(buffer)) > 0) lock (outputLock)
            {
                output.Append(buffer, 0, read); outputSequence += read;
                // UTF-16 memory is bounded to 2 MiB; UTF-8 response frames have a separate bound.
                if (output.Length > 1048576) { output.Remove(0, output.Length - 1048576); truncated = true; }
            }
        }
    }
    uint[] Members()
    {
        int size = 16 + IntPtr.Size * 4096; var data = Marshal.AllocHGlobal(size);
        try
        {
            Native.Check(Native.QueryInformationJobObject(job, 3, data, (uint)size, IntPtr.Zero)); int count = Marshal.ReadInt32(data, 4);
            return Enumerable.Range(0, Math.Min(count, 4096)).Select(i => (uint)Marshal.ReadIntPtr(data, 8 + i * IntPtr.Size).ToInt64()).ToArray();
        }
        finally { Marshal.FreeHGlobal(data); }
    }
    public async Task Run(StreamWriter boot)
    {
        string? temporaryDirectory = null;
        // Visible terminals receive a protected temporary script, avoiding Windows command-line limits.
        if ((!config.Silent || config.Shell == "cmd") && config.ScriptPath == null)
        {
            temporaryDirectory = Path.Combine(Path.GetTempPath(), "ToolDock-quick-" + Guid.NewGuid().ToString("N"));
            var directory = Directory.CreateDirectory(temporaryDirectory); var security = new DirectorySecurity(); security.SetAccessRuleProtection(true, false);
            foreach (var sid in new[] { WindowsIdentity.GetCurrent().User!, new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null), new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null) })
                security.AddAccessRule(new FileSystemAccessRule(sid, FileSystemRights.FullControl, InheritanceFlags.ObjectInherit | InheritanceFlags.ContainerInherit, PropagationFlags.None, AccessControlType.Allow));
            directory.SetAccessControl(security);
            string script = Path.Combine(temporaryDirectory, config.Shell == "cmd" ? "run.cmd" : "run.ps1");
            File.WriteAllText(script, config.Content, new UTF8Encoding(config.Shell == "powershell"));
            config = config with { ScriptPath = script };
        }
        job = Native.CreateJobObject(IntPtr.Zero, null); if (job == IntPtr.Zero) throw new Win32Exception();
        Native.KillJobOnClose(job);
        try
        {
            var identity = Protocol.Self(config.Id);
            var metadata = System.Text.Json.Nodes.JsonNode.Parse(config.MetadataJson)!;
            metadata["identity"] = System.Text.Json.Nodes.JsonNode.Parse(Protocol.Serialize(new { identity.Id, identity.RunnerPid, runnerStart = identity.RunnerStart.ToString(), identity.Image }));
            string temporary = config.MetadataPath + ".runner";
            File.WriteAllText(temporary, metadata.ToJsonString()); File.Move(temporary, config.MetadataPath, true);
            string arguments; Encoding outputEncoding = Encoding.UTF8;
            if (config.Shell == "powershell")
            {
                string code = config.ScriptPath != null ? "& '" + config.ScriptPath.Replace("'", "''") + "'; if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }" : config.Content;
                if (config.Silent && config.ScriptPath == null) code = "$s=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd())); & ([scriptblock]::Create($s)); if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }";
                code = "$ProgressPreference='SilentlyContinue';[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);[Console]::InputEncoding=[Text.UTF8Encoding]::new($false);$OutputEncoding=[Console]::OutputEncoding;" + code;
                arguments = "-NoLogo -NoProfile -NonInteractive -OutputFormat Text -ExecutionPolicy Bypass -EncodedCommand " + Convert.ToBase64String(Encoding.Unicode.GetBytes(code));
            }
            else
            {
                int codePage = 65001;
                if (config.ScriptPath != null)
                {
                    Environment.SetEnvironmentVariable("TOOLDOCK_QUICK_SCRIPT", config.ScriptPath);
                    if (temporaryDirectory == null)
                    {
                        // Existing managed scripts retain their bytes. Recognize UTF-8; otherwise use system ANSI.
                        try { _ = new UTF8Encoding(false, true).GetString(File.ReadAllBytes(config.ScriptPath)); }
                        catch (DecoderFallbackException) { codePage = (int)Native.GetACP(); Encoding.RegisterProvider(CodePagesEncodingProvider.Instance); outputEncoding = Encoding.GetEncoding(codePage); }
                    }
                }
                arguments = config.ScriptPath != null ? "/D /Q /V:OFF /S /C \"chcp " + codePage + " >nul & \"%TOOLDOCK_QUICK_SCRIPT%\"\"" : config.Silent ? "/D /Q /V:OFF" : "/D /Q /V:OFF /S /C \"" + config.Content + "\"";
            }
            if (arguments.Length > 32000 || config.Shell == "cmd" && !config.Silent && arguments.Length > 8000) throw new InvalidDataException("Command line too large");
            using var server = Protocol.Server(config.Pipe, config.OwnerSid);
            var child = Native.Launch(config, arguments, job); process = child.info;
            var captures = new List<Task>(); if (child.output != null) captures.Add(Capture(child.output, outputEncoding)); if (child.error != null) captures.Add(Capture(child.error, outputEncoding));
            _ = Task.Run(async () => { try { using (child.input) { if (config.ScriptPath == null && config.Silent) await child.input.WriteAsync(Encoding.ASCII.GetBytes(Convert.ToBase64String(Encoding.UTF8.GetBytes(config.Content)))); } } catch (IOException) { } });
            await boot.WriteLineAsync(Protocol.Serialize(new { identity = new { identity.Id, identity.RunnerPid, runnerStart = identity.RunnerStart.ToString(), identity.Image }, pid = process.pid, elevated = config.Elevated }));
            DateTime? ended = null; int? exitCode = null;
            while (true)
            {
                var members = Members(); if (members.Length == 0 && ended == null)
                {
                    if (temporaryDirectory != null) { try { File.Delete(Path.Combine(temporaryDirectory, config.Shell == "cmd" ? "run.cmd" : "run.ps1")); Directory.Delete(temporaryDirectory); temporaryDirectory = null; } catch (IOException) { } }
                    ended = DateTime.UtcNow; Native.Check(Native.GetExitCodeProcess(process.process, out uint code)); exitCode = code == 259 ? null : unchecked((int)code);
                    try { string final = Protocol.Serialize(new { id = config.Id, runnerPid = identity.RunnerPid, runnerStart = identity.RunnerStart.ToString(), status = exitCode == 0 || stopping ? "completed" : "failed", exitCode, endedAt = ended, stopped = stopping }); File.WriteAllText(config.ResultPath, Protocol.Serialize(new { payload = final, proof = Protocol.Mac(config.Token, final) })); } catch (IOException) { }
                }
                if (ended.HasValue && DateTime.UtcNow - ended > TimeSpan.FromSeconds(30)) break;
                using var tick = new CancellationTokenSource(1000);
                try { await server.WaitForConnectionAsync(tick.Token); }
                catch (OperationCanceledException) { continue; }
                try
                {
                    using var reader = Protocol.Reader(server); using var writer = Protocol.Writer(server);
                    if (!Native.GetNamedPipeClientProcessId(server.SafePipeHandle.DangerousGetHandle(), out uint peer)) continue;
                    using var client = Process.GetProcessById((int)peer); if (client.SessionId != config.SessionId) continue;
                    string challenge = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)); await writer.WriteLineAsync(challenge);
                    var request = JsonDocument.Parse(await Protocol.Read(reader, 2048)).RootElement;
                    if (!request.TryGetProperty("command",out var commandField) || commandField.ValueKind != JsonValueKind.String || !request.TryGetProperty("nonce",out var nonceField) || nonceField.ValueKind != JsonValueKind.String || !request.TryGetProperty("proof",out var proofField) || proofField.ValueKind != JsonValueKind.String) continue;
                    string command = commandField.GetString()!, nonce = nonceField.GetString()!;
                    if (nonce.Length != 64 || !Protocol.Matches(proofField.GetString()!, Protocol.Mac(config.Token, challenge + ":" + nonce + ":" + command))) continue;
                    if (command == "stop" && members.Length != 0)
                    {
                        stopping = true; Native.Interrupt(process.pid);
                        for (int i = 0; i < 10 && Members().Length != 0; i++) await Task.Delay(100);
                        if (Members().Length != 0) Native.Check(Native.TerminateJobObject(job, 1223));
                    }
                    else if (command == "attach") lock (outputLock) { output.Clear(); truncated = false; }
                    else if (command != "status" && command != "stop") continue;
                    string payload; lock (outputLock) payload = Protocol.Serialize(new { id = config.Id, status = ended.HasValue ? exitCode == 0 || stopping ? "completed" : "failed" : "running", pid = process.pid, childPids = members, exitCode, endedAt = ended, output = output.ToString(), truncated, sequence = outputSequence });
                    await writer.WriteLineAsync(Protocol.Serialize(new { payload, proof = Protocol.Mac(config.Token, nonce + ":" + payload) }));
                    await Protocol.Read(reader, 16);
                }
                catch (Exception e) when (e is IOException or OperationCanceledException or JsonException or InvalidOperationException or Win32Exception or InvalidDataException or KeyNotFoundException or FormatException) { }
                finally { if (server.IsConnected) server.Disconnect(); }
            }
        }
        finally
        {
            if (job != IntPtr.Zero) { Native.TerminateJobObject(job, 126); Native.CloseHandle(job); }
            if (process.process != IntPtr.Zero) Native.CloseHandle(process.process);
            if (temporaryDirectory != null) { try { File.Delete(Path.Combine(temporaryDirectory, config.Shell == "cmd" ? "run.cmd" : "run.ps1")); Directory.Delete(temporaryDirectory); } catch (IOException) { } }
        }
    }
}
