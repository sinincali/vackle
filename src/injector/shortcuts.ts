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

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { hash, type Installation } from "./detection";
import { atomicWrite, exists, readJson, safeTree } from "./files";
import { powershell } from "./windows";
import { isRecord } from "../settings/schema";

interface ShortcutLocations { desktop: string; programs: string; pinned: string; }
interface ShortcutEntry { path: string; original: string | null; installedHash: string; }
interface ShortcutReceipt { schema: 1; entries: ShortcutEntry[]; }
async function shortcutLocations(): Promise<ShortcutLocations> {
    return powershell<ShortcutLocations>("$ErrorActionPreference='Stop'; @{desktop=[Environment]::GetFolderPath('DesktopDirectory'); programs=[Environment]::GetFolderPath('Programs'); pinned=(Join-Path $env:APPDATA 'Microsoft\\Internet Explorer\\Quick Launch\\User Pinned\\TaskBar')} | ConvertTo-Json -Compress");
}
function contains(folder: string, path: string): boolean {
    const rel = relative(resolve(folder), resolve(path));
    return Boolean(rel && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}
async function checkPath(path: string, locations: ShortcutLocations): Promise<void> {
    const base = Object.values(locations).find(folder => contains(folder, path));
    if (!base || !path.toLowerCase().endsWith(".lnk")) throw new Error("Shortcut path is outside the current user's launch locations");
    await safeTree(base, path);
}
async function receipt(root: string, locations: ShortcutLocations): Promise<ShortcutReceipt | undefined> {
    const path = join(root, "shortcuts.json"); await safeTree(root, path);
    if (!await exists(path)) return undefined;
    const value = await readJson(path);
    if (!isRecord(value) || value.schema !== 1 || !Array.isArray(value.entries) || value.entries.length > 128) throw new Error("Invalid shortcut backup");
    const seen = new Set<string>();
    for (const entry of value.entries) {
        if (!isRecord(entry) || typeof entry.path !== "string" || typeof entry.installedHash !== "string" ||
            !/^[a-f0-9]{64}$/.test(entry.installedHash) || entry.original !== null && (typeof entry.original !== "string" || entry.original.length > 2097152 || !/^[A-Za-z0-9+/]*={0,2}$/.test(entry.original)))
            throw new Error("Invalid shortcut backup entry");
        await checkPath(entry.path, locations);
        const key = resolve(entry.path).toLowerCase();
        if (seen.has(key)) throw new Error("Duplicate shortcut backup path");
        seen.add(key);
    }
    return value as unknown as ShortcutReceipt;
}
async function replace(path: string, bytes: Buffer): Promise<void> {
    const temporary = join(dirname(path), `.vackle-${randomUUID()}.lnk`);
    try { await writeFile(temporary, bytes, { flag: "wx" }); await rename(temporary, path); }
    finally { await rm(temporary, { force: true }); }
}
export function shortcutCommand(root: string): { target: string; arguments: string } {
    const quote = (value: string): string => "'" + value.replaceAll("'", "''") + "'";
    const script = `& ${quote(join(root, "installed", "Vackle.exe"))} launch-hidden`;
    const args = `-NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand ${Buffer.from(script, "utf16le").toString("base64")}`;
    if (args.length > 1023) throw new Error("Launcher path exceeds Windows shortcut argument capacity");
    return { target: join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
        arguments: args };
}
export function vackleLaunch(args: string, root: string): boolean {
    const encoded = /-EncodedCommand\s+([A-Za-z0-9+/=]+)\s*$/i.exec(args ?? "")?.[1];
    if (!encoded) return false;
    const script = Buffer.from(encoded, "base64").toString("utf16le").toLowerCase();
    return script.includes("launch-hidden") && script.includes(join(root, "installed").toLowerCase());
}
async function plainShortcut(root: string, host: Installation): Promise<Buffer> {
    const stage = join(root, `shortcut-${randomUUID()}.lnk`);
    try {
        await powershell<null>(
            "$ErrorActionPreference='Stop'; $shell=New-Object -ComObject WScript.Shell; $link=$shell.CreateShortcut($env:VACKLE_SHORTCUT_STAGE); $link.TargetPath=$env:VACKLE_SHORTCUT_TARGET; $link.WorkingDirectory=$env:VACKLE_SHORTCUT_CWD; $link.IconLocation=$env:VACKLE_SHORTCUT_TARGET + ',0'; $link.Description='Flackle'; $link.Save(); 'null'",
            { VACKLE_SHORTCUT_STAGE: stage, VACKLE_SHORTCUT_TARGET: host.executable, VACKLE_SHORTCUT_CWD: host.directory });
        return await readFile(stage);
    } finally { await rm(stage, { force: true }); }
}
export async function installShortcuts(root: string, host: Installation, locations?: ShortcutLocations): Promise<string[]> {
    locations ??= await shortcutLocations();
    await safeTree(root); await mkdir(root, { recursive: true });
    const previous = await receipt(root, locations);
    const candidates = await powershell<{ path: string; target: string; arguments: string }[]>(
        "$ErrorActionPreference='Stop'; $shell=New-Object -ComObject WScript.Shell; $items=@(foreach($folder in (ConvertFrom-Json $env:VACKLE_SHORTCUT_ROOTS)){if(Test-Path -LiteralPath $folder){Get-ChildItem -LiteralPath $folder -Filter '*.lnk' -Recurse | ForEach-Object { $link=$shell.CreateShortcut($_.FullName); @{path=$_.FullName;target=$link.TargetPath;arguments=$link.Arguments} }}}); ConvertTo-Json -InputObject $items -Compress",
        { VACKLE_SHORTCUT_ROOTS: JSON.stringify(Object.values(locations)) });
    const paths = new Set(previous?.entries.map(entry => entry.path) ?? []);
    const adopted = new Set<string>();
    for (const candidate of candidates) {
        if (resolve(candidate.target).toLowerCase() === resolve(host.executable).toLowerCase()) paths.add(candidate.path);
        else if (vackleLaunch(candidate.arguments, root) && !paths.has(candidate.path)) { paths.add(candidate.path); adopted.add(candidate.path); }
    }
    const desktop = join(locations.desktop, "Flackle.lnk");
    if (!await exists(desktop)) paths.add(desktop);
    if (![...paths].some(path => contains(locations.programs, path))) {
        const path = join(locations.programs, "Flackle (Vackle).lnk");
        if (await exists(path)) throw new Error("A Flackle (Vackle) shortcut already exists and is not owned by Vackle");
        paths.add(path);
    }
    const launch = shortcutCommand(root);
    const plans: { entry: ShortcutEntry; bytes: Buffer; before: Buffer | null }[] = [];
    for (const path of paths) {
        await checkPath(path, locations);
        const before = await exists(path) ? await readFile(path) : null;
        const saved = previous?.entries.find(entry => entry.path === path);
        if (before && saved && hash(before) !== saved.installedHash && hash(before) !== (saved.original === null ? "" : hash(Buffer.from(saved.original, "base64"))))
            throw new Error(`Shortcut changed since installation; preserving it: ${path}`);
        const stage = join(root, `shortcut-${randomUUID()}.lnk`);
        try {
            if (before) await writeFile(stage, before, { flag: "wx" });
            await powershell<null>(
                "$ErrorActionPreference='Stop'; $shell=New-Object -ComObject WScript.Shell; $link=$shell.CreateShortcut($env:VACKLE_SHORTCUT_STAGE); $link.TargetPath=$env:VACKLE_SHORTCUT_TARGET; $link.Arguments=$env:VACKLE_SHORTCUT_ARGUMENTS; $link.WorkingDirectory=$env:VACKLE_SHORTCUT_CWD; $link.IconLocation=$env:VACKLE_SHORTCUT_ICON; $link.Description='Flackle with Vackle'; $link.WindowStyle=7; $link.Save(); 'null'",
                { VACKLE_SHORTCUT_STAGE: stage, VACKLE_SHORTCUT_TARGET: launch.target, VACKLE_SHORTCUT_ARGUMENTS: launch.arguments,
                    VACKLE_SHORTCUT_CWD: root, VACKLE_SHORTCUT_ICON: host.executable + ",0" });
            const bytes = await readFile(stage);
            const original = saved ? saved.original : adopted.has(path) ? (await plainShortcut(root, host)).toString("base64") : before?.toString("base64") ?? null;
            plans.push({ entry: { path, original, installedHash: hash(bytes) }, bytes, before });
        } finally { await rm(stage, { force: true }); }
    }
    const path = join(root, "shortcuts.json");
    await atomicWrite(path, JSON.stringify({ schema: 1, entries: plans.map(plan => plan.entry) }, null, 2));
    const committed: typeof plans = [];
    try {
        for (const plan of plans) {
            await mkdir(dirname(plan.entry.path), { recursive: true });
            await checkPath(plan.entry.path, locations);
            const current = await exists(plan.entry.path) ? await readFile(plan.entry.path) : null;
            if ((current && hash(current)) !== (plan.before && hash(plan.before))) throw new Error("Shortcut changed during installation");
            await replace(plan.entry.path, plan.bytes); committed.push(plan);
        }
    } catch (error) {
        for (const plan of committed.reverse()) {
            if (plan.before) await replace(plan.entry.path, plan.before); else await rm(plan.entry.path);
        }
        if (previous) await atomicWrite(path, JSON.stringify(previous, null, 2)); else await rm(path);
        throw error;
    }
    return plans.map(plan => plan.entry.path);
}
export async function verifyShortcuts(root: string, locations?: ShortcutLocations): Promise<string[]> {
    locations ??= await shortcutLocations();
    const saved = await receipt(root, locations);
    for (const entry of saved?.entries ?? []) {
        if (!await exists(entry.path) || hash(await readFile(entry.path)) !== entry.installedHash) throw new Error(`Launch shortcut changed or missing: ${entry.path}. Run pnpm repair.`);
    }
    return saved?.entries.map(entry => entry.path) ?? [];
}
export async function removeShortcuts(root: string, locations?: ShortcutLocations): Promise<void> {
    const path = join(root, "shortcuts.json"); await safeTree(root, path);
    if (!await exists(path)) return;
    const allowed = locations ?? await shortcutLocations();
    const saved = await receipt(root, allowed);
    for (const entry of saved!.entries) {
        if (!await exists(entry.path)) continue;
        const current = hash(await readFile(entry.path));
        if (current !== entry.installedHash && (entry.original === null || current !== hash(Buffer.from(entry.original, "base64"))))
            throw new Error(`Shortcut changed since installation; preserving it: ${entry.path}`);
    }
    for (const entry of saved!.entries) {
        await checkPath(entry.path, allowed);
        if (!await exists(entry.path)) continue;
        if (entry.original === null) await rm(entry.path);
        else await replace(entry.path, Buffer.from(entry.original, "base64"));
    }
    await rm(path);
}
