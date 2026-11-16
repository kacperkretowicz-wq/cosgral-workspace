// COSGRAL W8-BE2: the source of `cosgral-job-host.exe`, a tiny Windows program that starts ONE other program inside a Job
// Object (a limit on how many processes it may have, and "kill everything when the host ends") and, when asked, inside an
// AppContainer (a process that sees only the folders it was granted). Node cannot do either, so this is the one native piece.
//
// It is compiled on this computer with `csc.exe` of the .NET Framework that every Windows 10/11 has (no administrator, no
// download, nothing installed). C# 5 only (that compiler). The std handles of the host are inherited by the program it starts,
// so the program's stdin/stdout/stderr are the very same pipes Node gave the host: no copying, no encoding changes.
//
// Usage:  cosgral-job-host.exe [--max-processes N] [--keep-on-exit] [--cwd DIR]
//                              [--appcontainer NAME [--capability SID]... [--grant PATH[:r|:rw]]... [--keep-grants]]
//                              -- PROGRAM [ARGS...]
// Exit code: that of the program; 125 when the host itself could not do what was asked (nothing was started unprotected:
// when isolation was asked for and failed, the program does NOT start).
// `cosgral-job-host.exe --revoke NAME PATH...` removes the grants of that AppContainer from those folders;
// `cosgral-job-host.exe --delete-profile NAME` removes the container itself (its per-user profile);
// `cosgral-job-host.exe --probe` prints what this computer can do (job=ok|why, appcontainer=ok|why, windows=version).

export const ISOLATION_HOST_VERSION = "1";

export const ISOLATION_HOST_SOURCE = String.raw`
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;

public static class Host
{
    const uint CREATE_SUSPENDED = 0x4;
    const uint CREATE_UNICODE_ENVIRONMENT = 0x400;
    const uint EXTENDED_STARTUPINFO_PRESENT = 0x80000;
    const uint STARTF_USESTDHANDLES = 0x100;
    const int STD_INPUT = -10, STD_OUTPUT = -11, STD_ERROR = -12;
    const uint JOB_OBJECT_LIMIT_ACTIVE_PROCESS = 0x8;
    const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;
    const uint UILIMIT = 0x40 | 0x80 | 0x8 | 0x10; // no other desktop, no log-off, no system parameters, no display settings
    static readonly IntPtr PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES = (IntPtr)0x20009;

    [StructLayout(LayoutKind.Sequential)] struct JOBOBJECT_BASIC_LIMIT_INFORMATION { public long PerProcessUserTimeLimit; public long PerJobUserTimeLimit; public uint LimitFlags; public UIntPtr MinimumWorkingSetSize; public UIntPtr MaximumWorkingSetSize; public uint ActiveProcessLimit; public UIntPtr Affinity; public uint PriorityClass; public uint SchedulingClass; }
    [StructLayout(LayoutKind.Sequential)] struct IO_COUNTERS { public ulong a, b, c, d, e, f; }
    [StructLayout(LayoutKind.Sequential)] struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION { public JOBOBJECT_BASIC_LIMIT_INFORMATION Basic; public IO_COUNTERS Io; public UIntPtr ProcessMemoryLimit; public UIntPtr JobMemoryLimit; public UIntPtr PeakProcessMemoryUsed; public UIntPtr PeakJobMemoryUsed; }
    [StructLayout(LayoutKind.Sequential)] struct JOBOBJECT_BASIC_UI_RESTRICTIONS { public uint UIRestrictionsClass; }
    [StructLayout(LayoutKind.Sequential)] struct SID_AND_ATTRIBUTES { public IntPtr Sid; public uint Attributes; }
    [StructLayout(LayoutKind.Sequential)] struct SECURITY_CAPABILITIES { public IntPtr AppContainerSid; public IntPtr Capabilities; public uint CapabilityCount; public uint Reserved; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct STARTUPINFO { public int cb; public string lpReserved; public string lpDesktop; public string lpTitle; public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute; public uint dwFlags; public short wShowWindow; public short cbReserved2; public IntPtr lpReserved2; public IntPtr hStdInput, hStdOutput, hStdError; }
    [StructLayout(LayoutKind.Sequential)] struct STARTUPINFOEX { public STARTUPINFO StartupInfo; public IntPtr lpAttributeList; }
    [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public uint dwProcessId, dwThreadId; }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateJobObjectW(IntPtr a, string name);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, int cls, IntPtr info, int len);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CreateProcessW(string app, StringBuilder cmd, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string cwd, ref STARTUPINFOEX si, out PROCESS_INFORMATION pi);
    [DllImport("kernel32.dll", SetLastError = true)] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)] static extern uint WaitForSingleObject(IntPtr h, uint ms);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetExitCodeProcess(IntPtr h, out uint code);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool TerminateProcess(IntPtr h, uint code);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int which);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetHandleInformation(IntPtr h, uint mask, uint flags);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, int flags, ref IntPtr size);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attribute, IntPtr value, IntPtr size, IntPtr prev, IntPtr ret);
    [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("userenv.dll", CharSet = CharSet.Unicode)] static extern int DeriveAppContainerSidFromAppContainerName(string name, out IntPtr sid);
    [DllImport("userenv.dll", CharSet = CharSet.Unicode)] static extern int CreateAppContainerProfile(string name, string displayName, string description, IntPtr capabilities, uint capabilityCount, out IntPtr sid);
    [DllImport("userenv.dll", CharSet = CharSet.Unicode)] static extern int DeleteAppContainerProfile(string name);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool ConvertStringSidToSidW(string s, out IntPtr sid);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool ConvertSidToStringSidW(IntPtr sid, out IntPtr str);
    [DllImport("advapi32.dll")] static extern IntPtr FreeSid(IntPtr sid);

    static int Fail(string message) { Console.Error.WriteLine("COSGRAL-HOST: " + message); return 125; }

    static string AppContainerDerive(string name)
    {
        IntPtr sid;
        int hr = DeriveAppContainerSidFromAppContainerName(name, out sid);
        if (hr != 0) throw new Exception("cannot derive an AppContainer id (0x" + hr.ToString("x") + ")");
        IntPtr text;
        if (!ConvertSidToStringSidW(sid, out text)) throw new Win32Exception();
        string value = Marshal.PtrToStringUni(text);
        FreeSid(sid);
        return value;
    }

    static string AppContainerSid(string name)
    {
        // A process can only start in a container that has a profile (a per-user entry, no administrator needed). It is made
        // the first time and found again after; "already exists" is not an error.
        IntPtr sid;
        int hr = CreateAppContainerProfile(name, "COSGRAL agent sandbox", "Folders granted to COSGRAL agents", IntPtr.Zero, 0, out sid);
        if (hr == unchecked((int)0x800700B7)) hr = DeriveAppContainerSidFromAppContainerName(name, out sid);
        if (hr != 0) throw new Exception("cannot make or find the AppContainer (0x" + hr.ToString("x") + ")");
        IntPtr text;
        if (!ConvertSidToStringSidW(sid, out text)) throw new Win32Exception();
        string value = Marshal.PtrToStringUni(text);
        FreeSid(sid);
        return value;
    }

    static void Grant(string sid, string path, bool write)
    {
        DirectoryInfo dir = new DirectoryInfo(path);
        if (!dir.Exists) throw new Exception("grant: folder not found: " + path);
        FileSystemRights rights = write ? (FileSystemRights.Modify | FileSystemRights.Synchronize) : (FileSystemRights.ReadAndExecute | FileSystemRights.Synchronize);
        DirectorySecurity acl = dir.GetAccessControl();
        acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(sid), rights, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
        dir.SetAccessControl(acl);
    }

    static void Revoke(string sid, string path)
    {
        DirectoryInfo dir = new DirectoryInfo(path);
        if (!dir.Exists) return;
        DirectorySecurity acl = dir.GetAccessControl();
        acl.PurgeAccessRules(new SecurityIdentifier(sid));
        dir.SetAccessControl(acl);
    }

    static string Quote(string arg)
    {
        if (arg.Length > 0 && arg.IndexOfAny(new char[] { ' ', '\t', '\n', '\v', '"' }) < 0) return arg;
        StringBuilder sb = new StringBuilder("\"");
        int slashes = 0;
        foreach (char c in arg)
        {
            if (c == '\\') { slashes++; continue; }
            if (c == '"') { sb.Append('\\', slashes * 2 + 1); sb.Append('"'); slashes = 0; continue; }
            sb.Append('\\', slashes); slashes = 0; sb.Append(c);
        }
        sb.Append('\\', slashes * 2); sb.Append('"');
        return sb.ToString();
    }

    public static int Main(string[] args)
    {
        try { return Run(args); }
        catch (Exception e) { return Fail(e.Message); }
    }

    static int Run(string[] args)
    {
        if (args.Length == 1 && args[0] == "--probe")
        {
            // What this computer can do, without starting or changing anything: a Job Object with limits (made and dropped),
            // and whether an AppContainer id can be derived (the profile itself is made only when a program is started in it).
            string appContainerNote = "ok";
            try { AppContainerDerive("cosgral.probe"); } catch (Exception e) { appContainerNote = e.Message; }
            string jobNote = "ok";
            IntPtr probeJob = CreateJobObjectW(IntPtr.Zero, null);
            if (probeJob == IntPtr.Zero) jobNote = new Win32Exception().Message;
            else
            {
                JOBOBJECT_EXTENDED_LIMIT_INFORMATION probeLimits = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
                probeLimits.Basic.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_ACTIVE_PROCESS;
                probeLimits.Basic.ActiveProcessLimit = 8;
                int probeSize = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
                IntPtr probeBuffer = Marshal.AllocHGlobal(probeSize);
                Marshal.StructureToPtr(probeLimits, probeBuffer, false);
                if (!SetInformationJobObject(probeJob, 9, probeBuffer, probeSize)) jobNote = new Win32Exception().Message;
                CloseHandle(probeJob);
            }
            Console.Out.WriteLine("job=" + jobNote.Replace("\n", " "));
            Console.Out.WriteLine("appcontainer=" + appContainerNote.Replace("\n", " "));
            Console.Out.WriteLine("windows=" + Environment.OSVersion.Version.ToString());
            return 0;
        }
        if (args.Length == 2 && args[0] == "--delete-profile")
        {
            int result = DeleteAppContainerProfile(args[1]);
            return result == 0 ? 0 : Fail("cannot delete the AppContainer profile (0x" + result.ToString("x") + ")");
        }
        if (args.Length >= 2 && args[0] == "--revoke")
        {
            string revokeSid = AppContainerSid(args[1]);
            for (int i = 2; i < args.Length; i++) Revoke(revokeSid, args[i]);
            return 0;
        }
        uint maxProcesses = 0;
        bool keepOnExit = false, keepGrants = false;
        string cwd = null, container = null;
        List<string> capabilities = new List<string>();
        List<string[]> grants = new List<string[]>();
        int index = 0;
        for (; index < args.Length && args[index] != "--"; index++)
        {
            string a = args[index];
            if (a == "--max-processes") maxProcesses = uint.Parse(args[++index]);
            else if (a == "--keep-on-exit") keepOnExit = true;
            else if (a == "--cwd") cwd = args[++index];
            else if (a == "--appcontainer") container = args[++index];
            else if (a == "--capability") capabilities.Add(args[++index]);
            else if (a == "--keep-grants") keepGrants = true;
            else if (a == "--grant")
            {
                string spec = args[++index];
                bool write = spec.EndsWith(":rw", StringComparison.OrdinalIgnoreCase);
                if (write) spec = spec.Substring(0, spec.Length - 3);
                else if (spec.EndsWith(":r", StringComparison.OrdinalIgnoreCase)) spec = spec.Substring(0, spec.Length - 2);
                grants.Add(new string[] { spec, write ? "rw" : "r" });
            }
            else return Fail("unknown option " + a);
        }
        if (index >= args.Length - 1) return Fail("no program given after --");
        string program = args[index + 1];
        StringBuilder commandLine = new StringBuilder();
        for (int i = index + 1; i < args.Length; i++) { if (i > index + 1) commandLine.Append(' '); commandLine.Append(Quote(args[i])); }

        IntPtr job = CreateJobObjectW(IntPtr.Zero, null);
        if (job == IntPtr.Zero) return Fail("cannot create the job object (" + new Win32Exception().Message + ")");
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
        if (!keepOnExit) limits.Basic.LimitFlags |= JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if (maxProcesses > 0) { limits.Basic.LimitFlags |= JOB_OBJECT_LIMIT_ACTIVE_PROCESS; limits.Basic.ActiveProcessLimit = maxProcesses; }
        int size = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
        IntPtr buffer = Marshal.AllocHGlobal(size);
        Marshal.StructureToPtr(limits, buffer, false);
        if (!SetInformationJobObject(job, 9, buffer, size)) return Fail("cannot set the process limits (" + new Win32Exception().Message + ")");
        JOBOBJECT_BASIC_UI_RESTRICTIONS ui = new JOBOBJECT_BASIC_UI_RESTRICTIONS(); ui.UIRestrictionsClass = UILIMIT;
        IntPtr uiBuffer = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(JOBOBJECT_BASIC_UI_RESTRICTIONS)));
        Marshal.StructureToPtr(ui, uiBuffer, false);
        SetInformationJobObject(job, 4, uiBuffer, Marshal.SizeOf(typeof(JOBOBJECT_BASIC_UI_RESTRICTIONS)));

        string sidText = null;
        IntPtr sidPtr = IntPtr.Zero;
        IntPtr attributeList = IntPtr.Zero;
        IntPtr capabilityArray = IntPtr.Zero;
        IntPtr securityCapabilities = IntPtr.Zero;
        uint flags = CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT;
        if (container != null)
        {
            // A container cannot use the folder of this program as its working folder: without --cwd it starts in System32.
            if (cwd == null) cwd = Environment.SystemDirectory;
            sidText = AppContainerSid(container);
            if (!ConvertStringSidToSidW(sidText, out sidPtr)) return Fail("cannot read the AppContainer id");
            foreach (string[] g in grants) Grant(sidText, g[0], g[1] == "rw");
            // The program's folder and the working folder must be readable by the container or it cannot even start.
            capabilityArray = Marshal.AllocHGlobal(Math.Max(1, capabilities.Count) * Marshal.SizeOf(typeof(SID_AND_ATTRIBUTES)));
            for (int i = 0; i < capabilities.Count; i++)
            {
                IntPtr capSid;
                if (!ConvertStringSidToSidW(capabilities[i], out capSid)) return Fail("bad capability id " + capabilities[i]);
                SID_AND_ATTRIBUTES entry = new SID_AND_ATTRIBUTES(); entry.Sid = capSid; entry.Attributes = 4; // SE_GROUP_ENABLED
                Marshal.StructureToPtr(entry, (IntPtr)((long)capabilityArray + i * Marshal.SizeOf(typeof(SID_AND_ATTRIBUTES))), false);
            }
            SECURITY_CAPABILITIES caps = new SECURITY_CAPABILITIES(); caps.AppContainerSid = sidPtr; caps.Capabilities = capabilities.Count > 0 ? capabilityArray : IntPtr.Zero; caps.CapabilityCount = (uint)capabilities.Count;
            securityCapabilities = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(SECURITY_CAPABILITIES)));
            Marshal.StructureToPtr(caps, securityCapabilities, false);
            IntPtr listSize = IntPtr.Zero;
            InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref listSize);
            attributeList = Marshal.AllocHGlobal(listSize);
            if (!InitializeProcThreadAttributeList(attributeList, 1, 0, ref listSize)) return Fail("cannot prepare the AppContainer attributes");
            if (!UpdateProcThreadAttribute(attributeList, 0, PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES, securityCapabilities, (IntPtr)Marshal.SizeOf(typeof(SECURITY_CAPABILITIES)), IntPtr.Zero, IntPtr.Zero)) return Fail("cannot set the AppContainer attributes");
            flags |= EXTENDED_STARTUPINFO_PRESENT;
        }

        STARTUPINFOEX si = new STARTUPINFOEX();
        si.StartupInfo.cb = Marshal.SizeOf(typeof(STARTUPINFOEX));
        si.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
        si.StartupInfo.hStdInput = GetStdHandle(STD_INPUT);
        si.StartupInfo.hStdOutput = GetStdHandle(STD_OUTPUT);
        si.StartupInfo.hStdError = GetStdHandle(STD_ERROR);
        si.lpAttributeList = attributeList;
        PROCESS_INFORMATION pi;
        bool created = CreateProcessW(null, commandLine, IntPtr.Zero, IntPtr.Zero, true, flags, IntPtr.Zero, cwd, ref si, out pi);
        if (!created)
        {
            Win32Exception failure = new Win32Exception();
            if (sidText != null && !keepGrants) foreach (string[] g in grants) Revoke(sidText, g[0]);
            return Fail("cannot start " + program + " (error " + failure.NativeErrorCode + ": " + failure.Message + ")");
        }
        int code;
        if (!AssignProcessToJobObject(job, pi.hProcess))
        {
            string why = new Win32Exception().Message;
            TerminateProcess(pi.hProcess, 1);
            if (sidText != null && !keepGrants) foreach (string[] g in grants) Revoke(sidText, g[0]);
            return Fail("cannot put the program in the job (" + why + "); it was not started");
        }
        ResumeThread(pi.hThread);
        CloseHandle(pi.hThread);
        WaitForSingleObject(pi.hProcess, 0xFFFFFFFF);
        uint exit;
        GetExitCodeProcess(pi.hProcess, out exit);
        code = unchecked((int)exit);
        CloseHandle(pi.hProcess);
        if (sidText != null && !keepGrants) foreach (string[] g in grants) Revoke(sidText, g[0]);
        CloseHandle(job); // KILL_ON_JOB_CLOSE ends whatever the program left running
        return code;
    }
}
`;
