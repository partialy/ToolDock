using System.Diagnostics;
using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.Json;

namespace ToolDock.QuickLaunch;

record Configuration(string Id, string AppId, string Token, string Pipe, string OwnerSid, int SessionId,
    string Executable, string Shell, string? ScriptPath, string Content, string WorkingDirectory, bool Silent, bool Elevated, string ResultPath, string MetadataPath, string MetadataJson);
record Identity(string Id, int RunnerPid, long RunnerStart, string Image);

static class Protocol
{
    internal static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, PropertyNameCaseInsensitive = true, NumberHandling = System.Text.Json.Serialization.JsonNumberHandling.AllowReadingFromString };
    internal static string Serialize(object value) => JsonSerializer.Serialize(value, Json);
    internal static T Parse<T>(string value) => JsonSerializer.Deserialize<T>(value, Json) ?? throw new InvalidDataException();
    internal static NamedPipeServerStream Server(string name, string sid)
    {
        var security = new PipeSecurity(); security.SetAccessRuleProtection(true, false);
        foreach (var identity in new[] { new SecurityIdentifier(sid), new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null), new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null) })
            security.AddAccessRule(new PipeAccessRule(identity, PipeAccessRights.FullControl, AccessControlType.Allow));
        return NamedPipeServerStreamAcl.Create(name, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous, 4096, 4096, security);
    }
    internal static async Task<string> Read(StreamReader reader, int max = 200000, int timeout = 5000)
    {
        using var deadline = new CancellationTokenSource(timeout);
        var buffer = new char[1]; var result = new StringBuilder();
        while (result.Length <= max)
        {
            if (await reader.ReadAsync(buffer.AsMemory(), deadline.Token) == 0) throw new EndOfStreamException();
            if (buffer[0] == '\n') return result.ToString().TrimEnd('\r');
            result.Append(buffer[0]);
        }
        throw new InvalidDataException("Frame too large");
    }
    internal static StreamReader Reader(Stream stream) => new(stream, new UTF8Encoding(false), false, 4096, true);
    internal static StreamWriter Writer(Stream stream) => new(stream, new UTF8Encoding(false), 4096, true) { AutoFlush = true };
    internal static string Mac(string token, string text) => Convert.ToHexString(HMACSHA256.HashData(Convert.FromHexString(token), Encoding.UTF8.GetBytes(text)));
    internal static bool Matches(string a, string b) => a.Length == b.Length && CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(a), Encoding.ASCII.GetBytes(b));
    internal static Identity Self(string id) => new(id, Environment.ProcessId, Process.GetCurrentProcess().StartTime.ToUniversalTime().Ticks, Environment.ProcessPath!);
    internal static void VerifyServer(NamedPipeClientStream pipe, int pid, long? start = null, string? image = null)
    {
        if (!Native.GetNamedPipeServerProcessId(pipe.SafePipeHandle.DangerousGetHandle(), out uint actual) || actual != pid) throw new InvalidDataException("Pipe identity mismatch");
        Native.VerifyProcess(pid, start, image);
    }
}
