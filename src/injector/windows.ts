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
import { promisify } from "node:util";

const execute = promisify(execFile);
export async function powershell<T>(script: string, variables: Record<string, string> = {}, timeout = 15000): Promise<T> {
    const encoded = Buffer.from("[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); " + script, "utf16le").toString("base64");
    const { stdout } = await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
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
export async function verifyPortOwner(port: number, hostPid: number): Promise<void> {
    const [listeners, items] = await Promise.all([powershell<{ pid: number; address: string }[]>(
        "$ErrorActionPreference='Stop'; $items=@(Get-NetTCPConnection -State Listen -LocalPort ([int]$env:VACKLE_PORT) | ForEach-Object { @{pid=[int]$_.OwningProcess; address=[string]$_.LocalAddress} }); ConvertTo-Json -InputObject $items -Compress",
        { VACKLE_PORT: String(port) }), processes()]);
    if (!listeners.length || listeners.some(listener => !["127.0.0.1", "::1"].includes(listener.address) ||
        !descendant(listener.pid, hostPid, items))) throw new Error("Debugging endpoint is not owned by launched Flackle on loopback");
}
