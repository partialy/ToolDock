using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace ToolDock.QuickLaunch;

static class Native
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] internal struct Startup { public int cb; public string? reserved, desktop, title; public int x, y, xs, ys, xc, yc, fill, flags; public short show, reserved2; public IntPtr reservedPtr, input, output, error; }
    [StructLayout(LayoutKind.Sequential)] internal struct StartupEx { public Startup startup; public IntPtr attributes; }
    [StructLayout(LayoutKind.Sequential)] internal struct ProcessInfo { public IntPtr process, thread; public uint pid, tid; }
    [StructLayout(LayoutKind.Sequential)] struct Security { public int length; public IntPtr descriptor; [MarshalAs(UnmanagedType.Bool)] public bool inherit; }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CreateProcess(string app, StringBuilder command, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string cwd, ref StartupEx startup, out ProcessInfo info);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool CreatePipe(out IntPtr read, out IntPtr write, ref Security security, int size);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, int flags, ref IntPtr size);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attribute, IntPtr value, IntPtr size, IntPtr previous, IntPtr returned);
    [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll", SetLastError = true)] internal static extern IntPtr CreateJobObject(IntPtr attrs, string? name);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, int kind, IntPtr data, uint size);
    [DllImport("kernel32.dll", SetLastError = true)] internal static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError = true)] internal static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)] internal static extern bool TerminateJobObject(IntPtr job, uint code);
    [DllImport("kernel32.dll")] internal static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll")] internal static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", SetLastError = true)] internal static extern bool GetExitCodeProcess(IntPtr process, out uint code);
    [DllImport("kernel32.dll", SetLastError = true)] internal static extern bool QueryInformationJobObject(IntPtr job, int kind, IntPtr data, uint length, IntPtr returned);
    [DllImport("kernel32.dll", SetLastError = true)] internal static extern bool GetNamedPipeServerProcessId(IntPtr pipe, out uint pid);
    [DllImport("kernel32.dll", SetLastError = true)] internal static extern bool GetNamedPipeClientProcessId(IntPtr pipe, out uint pid);
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint rights, bool inherit, int pid);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetProcessTimes(IntPtr process, out long creation, out long exit, out long kernel, out long user);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool QueryFullProcessImageName(IntPtr process, int flags, StringBuilder path, ref int length);
    [DllImport("kernel32.dll")] static extern bool FreeConsole();
    [DllImport("kernel32.dll")] static extern bool AttachConsole(uint pid);
    [DllImport("kernel32.dll")] static extern bool SetConsoleCtrlHandler(IntPtr handler, bool add);
    delegate bool ConsoleHandler(uint control);
    static readonly ConsoleHandler IgnoreControl = _ => true;
    [DllImport("kernel32.dll")] static extern bool GenerateConsoleCtrlEvent(uint control, uint group);
    [DllImport("kernel32.dll")] internal static extern uint GetACP();
    internal static void Check(bool result) { if (!result) throw new Win32Exception(Marshal.GetLastWin32Error()); }
    internal static void KillJobOnClose(IntPtr job)
    {
        // JOBOBJECT_EXTENDED_LIMIT_INFORMATION: BasicLimitInformation.LimitFlags at offset 16.
        int size = IntPtr.Size == 8 ? 144 : 112; var data = Marshal.AllocHGlobal(size);
        try { Marshal.Copy(new byte[size], 0, data, size); Marshal.WriteInt32(data, 16, 0x2000); Check(SetInformationJobObject(job, 9, data, (uint)size)); }
        finally { Marshal.FreeHGlobal(data); }
    }
    internal static string Quote(string value) => "\"" + System.Text.RegularExpressions.Regex.Replace(value, "(\\\\*)\"", "$1$1\\\"").TrimEnd('\\') + new string('\\', value.Length - value.TrimEnd('\\').Length) + new string('\\', value.Length - value.TrimEnd('\\').Length) + "\"";
    internal static void VerifyProcess(int pid, long? ticks, string? image)
    {
        var process = OpenProcess(0x1000, false, pid);
        if (process == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
        try
        {
            Check(GetProcessTimes(process, out long created, out _, out _, out _));
            var path = new StringBuilder(32768); int length = path.Capacity; Check(QueryFullProcessImageName(process, 0, path, ref length));
            if (ticks.HasValue && DateTime.FromFileTimeUtc(created).Ticks != ticks.Value || image != null && !string.Equals(Path.GetFullPath(path.ToString()), Path.GetFullPath(image), StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Process identity mismatch");
        }
        finally { CloseHandle(process); }
    }
    internal static bool DefinitelyExited(int pid, long ticks, string image)
    {
        try { VerifyProcess(pid, ticks, image); return false; }
        catch (Win32Exception error) when (error.NativeErrorCode == 87) { return true; }
    }
    internal static void Interrupt(uint pid)
    {
        FreeConsole(); if (!AttachConsole(pid)) return;
        IntPtr handler = Marshal.GetFunctionPointerForDelegate(IgnoreControl);
        try { SetConsoleCtrlHandler(handler, true); GenerateConsoleCtrlEvent(1, 0); Thread.Sleep(100); }
        finally { FreeConsole(); SetConsoleCtrlHandler(handler, false); }
    }
    internal static (ProcessInfo info, FileStream input, FileStream? output, FileStream? error) Launch(Configuration config, string arguments, IntPtr job)
    {
        var security = new Security { length = Marshal.SizeOf<Security>(), inherit = true };
        Check(CreatePipe(out var inputRead, out var inputWrite, ref security, 0));
        IntPtr outputRead = IntPtr.Zero, outputWrite = IntPtr.Zero, errorRead = IntPtr.Zero, errorWrite = IntPtr.Zero;
        var startup = new StartupEx { startup = new Startup { cb = Marshal.SizeOf<StartupEx>(), flags = 0x100, input = inputRead } };
        IntPtr handles = IntPtr.Zero; ProcessInfo info = default;
        try
        {
            Check(SetHandleInformation(inputWrite, 1, 0));
            // Visible terminals retain their own stdout/stderr; stdin remains a finite in-memory script stream.
            if (config.Silent)
            {
                Check(CreatePipe(out outputRead, out outputWrite, ref security, 0)); Check(CreatePipe(out errorRead, out errorWrite, ref security, 0));
                Check(SetHandleInformation(outputRead, 1, 0)); Check(SetHandleInformation(errorRead, 1, 0));
                startup.startup.output = outputWrite; startup.startup.error = errorWrite;
            }
            else { startup.startup.flags = 0; }
            IntPtr size = IntPtr.Zero; InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref size);
            startup.attributes = Marshal.AllocHGlobal(size); Check(InitializeProcThreadAttributeList(startup.attributes, 1, 0, ref size));
            IntPtr[] inherited = config.Silent ? [inputRead, outputWrite, errorWrite] : [inputRead];
            handles = Marshal.AllocHGlobal(IntPtr.Size * inherited.Length); Marshal.Copy(inherited, 0, handles, inherited.Length);
            Check(UpdateProcThreadAttribute(startup.attributes, 0, (IntPtr)0x20002, handles, (IntPtr)(IntPtr.Size * inherited.Length), IntPtr.Zero, IntPtr.Zero));
            Check(CreateProcess(config.Executable, new StringBuilder(Quote(config.Executable) + " " + arguments), IntPtr.Zero, IntPtr.Zero, true,
                0x00080004u | (config.Silent ? 0x08000000u : 0x00000010u), IntPtr.Zero, config.WorkingDirectory, ref startup, out info));
            Check(AssignProcessToJobObject(job, info.process));
            if (ResumeThread(info.thread) == uint.MaxValue) throw new Win32Exception(Marshal.GetLastWin32Error());
            CloseHandle(info.thread); info.thread = IntPtr.Zero;
            var input = new FileStream(new SafeFileHandle(inputWrite, true), FileAccess.Write); inputWrite = IntPtr.Zero;
            FileStream? output = config.Silent ? new(new SafeFileHandle(outputRead, true), FileAccess.Read) : null; outputRead = IntPtr.Zero;
            FileStream? error = config.Silent ? new(new SafeFileHandle(errorRead, true), FileAccess.Read) : null; errorRead = IntPtr.Zero;
            return (info, input, output, error);
        }
        catch { if (info.process != IntPtr.Zero) { TerminateProcess(info.process, 126); CloseHandle(info.process); } if (info.thread != IntPtr.Zero) CloseHandle(info.thread); throw; }
        finally
        {
            foreach (var handle in new[] { inputRead, inputWrite, outputRead, outputWrite, errorRead, errorWrite }) if (handle != IntPtr.Zero) CloseHandle(handle);
            if (startup.attributes != IntPtr.Zero) { DeleteProcThreadAttributeList(startup.attributes); Marshal.FreeHGlobal(startup.attributes); }
            if (handles != IntPtr.Zero) Marshal.FreeHGlobal(handles);
        }
    }
}
