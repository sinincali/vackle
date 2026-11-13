/*
 * Vackle, a modification for Flackle's desktop app
 * Copyright (c) 2026 Xrm0s and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { escapeRegex } from "../settings/schema";

const execute = promisify(execFile);
export const windowsDirectory = (): string => process.env.SystemRoot ?? "C:\\Windows";
export const powershellPath = (): string => join(windowsDirectory(), "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
export async function powershell<T>(script: string, variables: Record<string, string> = {}, timeout = 15000): Promise<T> {
    const encoded = Buffer.from("[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); " + script, "utf16le").toString("base64");
    const { stdout } = await execute(powershellPath(), ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
        { windowsHide: true, env: { ...process.env, ...variables }, maxBuffer: 4 * 1024 * 1024, timeout });
    return JSON.parse(stdout.trim() || "null") as T;
}
export function requireWindows(): void {
    if (process.platform !== "win32") throw new Error("Vackle supports Windows 10 and 11 only");
}
interface ProcessInfo { pid: number; parent: number; path: string; }
export async function processes(): Promise<ProcessInfo[]> {
    return powershell<ProcessInfo[]>("$ErrorActionPreference='Stop'; $items=@(Get-CimInstance Win32_Process | ForEach-Object { @{pid=[int]$_.ProcessId; parent=[int]$_.ParentProcessId; path=[string]$_.ExecutablePath} }); ConvertTo-Json -InputObject $items -Compress");
}
export async function hostWebViews(executableName: string): Promise<number[]> {
    return powershell<number[]>("$ErrorActionPreference='Stop'; $session=(Get-Process -Id $PID).SessionId; $pattern='--webview-exe-name=\"?'+[regex]::Escape($env:VACKLE_EXE)+'\"?(\\s|$)'; $items=@(Get-CimInstance Win32_Process -Filter \"Name='msedgewebview2.exe'\" | Where-Object { $_.SessionId -eq $session -and $_.CommandLine -match $pattern -and -not (Get-Process -Id $_.ParentProcessId -ErrorAction SilentlyContinue) } | ForEach-Object { [int]$_.ProcessId }); ConvertTo-Json -InputObject $items -Compress",
        { VACKLE_EXE: executableName });
}
export async function launchReport(executableName: string): Promise<string[]> {
    return powershell<string[]>("$ErrorActionPreference='SilentlyContinue'; $exe=$env:VACKLE_EXE; $lines=@('Running as admin: '+([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)); $all=@(Get-CimInstance Win32_Process); " +
        "foreach ($p in $all | Where-Object { $_.Name -eq $exe }) { $path = if ($p.ExecutablePath) { $p.ExecutablePath } else { 'path hidden (admin or other user)' }; $lines += \"Flackle $($p.ProcessId) parent=$($p.ParentProcessId) session=$($p.SessionId) $path\" }; " +
        "foreach ($p in $all | Where-Object { $_.Name -eq 'msedgewebview2.exe' -and $_.CommandLine -match ('--webview-exe-name=\"?'+[regex]::Escape($exe)) -and $_.CommandLine -notmatch '--type=' }) { $flag = if ($p.CommandLine -match '--remote-debugging-port=(\\d+)') { 'debug port '+$Matches[1] } else { 'no debug flag' }; $lines += \"WebView2 $($p.ProcessId) parent=$($p.ParentProcessId): $flag\" }; " +
        "$policy=@('HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge\\WebView2','HKCU:\\SOFTWARE\\Policies\\Microsoft\\Edge\\WebView2') | Where-Object { Test-Path $_ }; $lines += 'WebView2 policy: '+$(if ($policy) { $policy -join ', ' } else { 'none' }); ConvertTo-Json -InputObject $lines -Compress",
        { VACKLE_EXE: executableName });
}
const unelevated = `using System; using System.ComponentModel; using System.Runtime.InteropServices;
public static class VackleUnelevated {
    [StructLayout(LayoutKind.Sequential)] struct SidAndAttributes { public IntPtr Sid; public uint Attributes; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct StartupInfo { public int cb; public string lpReserved, lpDesktop, lpTitle; public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags; public short wShowWindow, cbReserved2; public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError; }
    [StructLayout(LayoutKind.Sequential)] struct ProcessInformation { public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId; }
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool SaferCreateLevel(uint scope, uint level, uint flags, out IntPtr handle, IntPtr reserved);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool SaferComputeTokenFromLevel(IntPtr level, IntPtr input, out IntPtr output, uint flags, IntPtr reserved);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool SaferCloseLevel(IntPtr handle);
    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool ConvertStringSidToSid(string sid, out IntPtr result);
    [DllImport("advapi32.dll", SetLastError = true)] static extern int GetLengthSid(IntPtr sid);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool SetTokenInformation(IntPtr token, int type, ref SidAndAttributes info, int length);
    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool CreateProcessAsUser(IntPtr token, string application, string command, IntPtr processAttributes, IntPtr threadAttributes, bool inherit, uint flags, IntPtr environment, string directory, ref StartupInfo startup, out ProcessInformation info);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);
    public static int Start(string executable, string directory) {
        IntPtr level, token, sid;
        if (!SaferCreateLevel(2, 0x20000, 1, out level, IntPtr.Zero)) throw new Win32Exception();
        try { if (!SaferComputeTokenFromLevel(level, IntPtr.Zero, out token, 0, IntPtr.Zero)) throw new Win32Exception(); }
        finally { SaferCloseLevel(level); }
        try {
            if (!ConvertStringSidToSid("S-1-16-8192", out sid)) throw new Win32Exception();
            try {
                SidAndAttributes label = new SidAndAttributes { Sid = sid, Attributes = 0x20 };
                if (!SetTokenInformation(token, 25, ref label, Marshal.SizeOf(label) + GetLengthSid(sid))) throw new Win32Exception();
            } finally { LocalFree(sid); }
            StartupInfo startup = new StartupInfo { cb = Marshal.SizeOf(typeof(StartupInfo)) };
            ProcessInformation info;
            if (!CreateProcessAsUser(token, executable, '"' + executable + '"', IntPtr.Zero, IntPtr.Zero, false, 0, IntPtr.Zero, directory, ref startup, out info)) throw new Win32Exception();
            CloseHandle(info.hThread); CloseHandle(info.hProcess);
            return info.dwProcessId;
        } finally { CloseHandle(token); }
    }
}`;
export const isElevated = (): Promise<boolean> =>
    powershell<boolean>("([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) | ConvertTo-Json");
export async function startUnelevated(executable: string, directory: string, browserArguments: string): Promise<number> {
    return powershell<number>("$ErrorActionPreference='Stop'; if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { 0; return }; Add-Type -TypeDefinition $env:VACKLE_CS; Remove-Item Env:VACKLE_CS; [VackleUnelevated]::Start($env:VACKLE_EXE, $env:VACKLE_DIR)",
        { VACKLE_CS: unelevated, VACKLE_EXE: executable, VACKLE_DIR: directory, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: browserArguments }, 30000);
}
export function descendant(pid: number, root: number, items: ProcessInfo[]): boolean {
    const visited = new Set<number>();
    while (!visited.has(pid)) {
        if (pid === root) return true;
        visited.add(pid);
        const process = items.find(item => item.pid === pid);
        if (!process || !process.parent) return false;
        pid = process.parent;
    }
    return false;
}
export function portListeners(table: string, port: number): { pid: number; address: string }[] {
    return table.split(/\r?\n/).flatMap(line => {
        const [proto, local = "", foreign = "", ...rest] = line.trim().split(/\s+/);
        const match = /^\[?(.*?)\]?:(\d+)$/.exec(local); const pid = Number(rest.at(-1));
        return proto === "TCP" && match && Number(match[2]) === port && /^(0\.0\.0\.0|\[::\]):0$/.test(foreign) && Number.isSafeInteger(pid) ? [{ pid, address: match[1]! }] : [];
    });
}
export async function verifyPortOwner(port: number, hostPid: number): Promise<void> {
    const [table, items] = await Promise.all([execute(join(windowsDirectory(), "System32", "NETSTAT.EXE"), ["-ano"], { windowsHide: true, maxBuffer: 16 * 1024 * 1024, timeout: 15000 }).then(result => result.stdout), processes()]);
    const listeners = portListeners(table, port);
    const strangers = listeners.filter(listener => !descendant(listener.pid, hostPid, items)).map(listener => listener.pid);
    const commands = strangers.length ? await powershell<{ pid: number; command: string }[]>(
        "$ErrorActionPreference='Stop'; $pids=$env:VACKLE_PIDS -split ','; $items=@(Get-CimInstance Win32_Process | Where-Object { $pids -contains [string]$_.ProcessId } | ForEach-Object { @{pid=[int]$_.ProcessId; command=[string]$_.CommandLine} }); ConvertTo-Json -InputObject $items -Compress",
        { VACKLE_PIDS: strangers.join(",") }) : [];
    const host = items.find(item => item.pid === hostPid)?.path.split("\\").pop()?.toLowerCase();
    const hostWebView = (command: string): boolean => Boolean(host) && /\\msedgewebview2\.exe"?\s/i.test(command) &&
        new RegExp(`--webview-exe-name="?${escapeRegex(host!)}"?(\\s|$)`, "i").test(command) && new RegExp(`--remote-debugging-port=${port}(\\s|$)`).test(command);
    if (!listeners.length || listeners.some(listener => !["127.0.0.1", "::1"].includes(listener.address) ||
        !(descendant(listener.pid, hostPid, items) || hostWebView(commands.find(entry => entry.pid === listener.pid)?.command ?? "")))) throw new Error("Debugging endpoint is not owned by launched Flackle on loopback");
}
