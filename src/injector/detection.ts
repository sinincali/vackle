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

import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { powershell, requireWindows } from "./windows";

export interface Installation {
    directory: string;
    executable: string;
    version: string;
    sha256: string;
}
export function hash(bytes: Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }
export async function validateInstallation(directory: string): Promise<Installation> {
    requireWindows();
    const canonical = await realpath(resolve(directory));
    const executable = await realpath(join(canonical, "flackle-desktop.exe"));
    if (basename(executable).toLowerCase() !== "flackle-desktop.exe" || resolve(executable).toLowerCase() !== join(canonical, "flackle-desktop.exe").toLowerCase())
        throw new Error("Executable redirects outside the selected installation");
    const data = await readFile(executable);
    if (data[0] !== 0x4d || data[1] !== 0x5a) throw new Error("Flackle product metadata does not match: not a Windows program");
    const info = await powershell<{ product: unknown; version: unknown }>(
        "$ErrorActionPreference='Stop'; $v=(Get-Item -LiteralPath $env:VACKLE_EXE).VersionInfo; @{product=$v.ProductName; version=$v.ProductVersion} | ConvertTo-Json -Compress", { VACKLE_EXE: executable });
    if (info.product !== "Flackle" || typeof info.version !== "string" || !/^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(info.version)) throw new Error("Flackle product metadata does not match");
    return { directory: canonical, executable, version: info.version, sha256: hash(data) };
}
export async function detectCandidates(localAppData = process.env.LOCALAPPDATA): Promise<string[]> {
    requireWindows();
    const registry = await powershell<string[]>(
        "$ErrorActionPreference='Stop'; $roots=@('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'); $items=@(Get-ItemProperty -Path $roots -ErrorAction SilentlyContinue | Where-Object {$_.DisplayName -eq 'Flackle' -and $_.InstallLocation} | ForEach-Object {$_.InstallLocation.Trim([char]34)}); ConvertTo-Json -InputObject $items -Compress");
    const candidates = [...registry];
    if (localAppData) candidates.push(join(localAppData, "Flackle"));
    const unique = [...new Map(candidates.map(path => [resolve(path).toLowerCase(), resolve(path)])).values()];
    const existing: string[] = [];
    for (const path of unique) {
        try { if ((await stat(join(path, "flackle-desktop.exe"))).isFile()) existing.push(path); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    return existing;
}
export async function selectInstallation(explicit?: string): Promise<Installation> {
    if (explicit) return validateInstallation(explicit);
    const candidates = await detectCandidates();
    if (candidates.length !== 1) throw new Error(candidates.length ? "Multiple Flackle installations found. Pass --path <directory>." : "Flackle not found. Pass --path <directory>.");
    return validateInstallation(candidates[0]!);
}
