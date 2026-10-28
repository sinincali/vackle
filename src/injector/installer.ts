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
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { hash, type Installation } from "./detection";
import { exists, readJson, renameRetry, safeTree } from "./files";
import { isRecord } from "../settings/schema";
import { removeShortcuts } from "./shortcuts";
import { compareVersions, runtimeFiles, type RuntimeFile } from "./updater";
import { runtime, version } from "./version";
import { processes } from "./windows";

export interface Manifest {
    schema: 1 | 2;
    version: string;
    host: Installation;
    files: Record<string, string>;
    runtime?: string;
}
const legacyFiles = ["injector.cjs", "launch.cmd", "renderer.js"];
const fileNames = (schema: 1 | 2): string[] => schema === 1 ? legacyFiles : [...runtimeFiles].sort();
export function dataDirectory(): string {
    if (!process.env.LOCALAPPDATA) throw new Error("LOCALAPPDATA is unavailable");
    return join(process.env.LOCALAPPDATA, "Vackle");
}
export async function readManifest(root: string, folder = "installed"): Promise<Manifest> {
    const path = join(root, folder, "manifest.json");
    await safeTree(root, path);
    const value = await readJson(path);
    if (!isRecord(value) || (value.schema !== 1 && value.schema !== 2) || typeof value.version !== "string" || !isRecord(value.host) || !isRecord(value.files) ||
        typeof value.host.directory !== "string" || typeof value.host.executable !== "string" ||
        typeof value.host.version !== "string" || typeof value.host.sha256 !== "string") throw new Error("Invalid Vackle installation manifest");
    if (value.schema === 2) compareVersions(value.version, value.version);
    if (value.runtime !== undefined && (typeof value.runtime !== "string" || value.runtime.length > 64)) throw new Error("Invalid Vackle installation manifest");
    if (Object.keys(value.files).sort().join(",") !== fileNames(value.schema).join(",") ||
        Object.values(value.files).some(entry => typeof entry !== "string" || !/^[a-f0-9]{64}$/.test(entry))) throw new Error("Invalid installed file manifest");
    return value as unknown as Manifest;
}
export async function clearStaleLock(root: string): Promise<void> {
    const path = join(root, "launcher.lock");
    await safeTree(root, path);
    if (!await exists(path)) return;
    const owner = await readJson(path).catch(() => undefined);
    const pid = isRecord(owner) && typeof owner.pid === "number" ? owner.pid : undefined;
    const alive = pid !== undefined && (await processes()).some(item => item.pid === pid && /\\(vackle|node)\.exe$/i.test(item.path));
    if (alive) throw new Error("Vackle launcher is already running. Quit Flackle completely, including its tray icon, and try again.");
    await rm(path, { force: true });
}
async function checkFolder(root: string, folder: string, manifest: Manifest): Promise<void> {
    const directory = join(root, folder);
    const names = (await readdir(directory)).sort();
    if (names.join(",") !== [...fileNames(manifest.schema), "manifest.json"].sort().join(",")) throw new Error("Unexpected files in Vackle installation; refusing automatic replacement");
    for (const name of names) await safeTree(root, join(directory, name));
}
export async function verifyFiles(root: string, folder = "installed"): Promise<Manifest> {
    const manifest = await readManifest(root, folder);
    if (manifest.schema !== 2) throw new Error("This Vackle installation is from an older installer. Run the latest Vackle.exe to upgrade it.");
    await checkFolder(root, folder, manifest);
    for (const [name, expected] of Object.entries(manifest.files)) {
        if (hash(await readFile(join(root, folder, name))) !== expected) throw new Error(`Installed file changed: ${name}. Run Vackle.exe and choose Repair.`);
    }
    return manifest;
}
export interface InstallOptions { repair?: boolean; afterStaging?: () => Promise<void>; version?: string; runtime?: string; }
export async function install(root: string, host: Installation, files: Record<RuntimeFile, Buffer>, options: InstallOptions = {}): Promise<"installed" | "unchanged"> {
    await safeTree(root);
    const target = options.version ?? version;
    compareVersions(target, target);
    await clearStaleLock(root);
    await mkdir(root, { recursive: true });
    const installed = join(root, "installed");
    const hashes = Object.fromEntries(runtimeFiles.map(name => [name, hash(files[name])])) as Record<RuntimeFile, string>;
    if (await exists(installed)) {
        const previous = await readManifest(root);
        if (resolve(previous.host.executable).toLowerCase() !== resolve(host.executable).toLowerCase())
            throw new Error("Vackle is installed for a different Flackle location; uninstall it first");
        if (previous.schema === 2 && compareVersions(target, previous.version) < 0)
            throw new Error(`Vackle ${previous.version} is already installed, which is newer than ${target}. Download the latest Vackle.exe instead.`);
        await checkFolder(root, "installed", previous);
        if (!options.repair && previous.schema === 2 && previous.version === target && previous.host.sha256 === host.sha256) {
            await verifyFiles(root);
            if (runtimeFiles.every(name => previous.files[name] === hashes[name])) return "unchanged";
        }
    }
    const stage = join(root, `stage-${randomUUID()}`);
    const backup = join(root, `backup-${randomUUID()}`);
    let moved = false;
    let committed = false;
    try {
        await mkdir(stage);
        for (const name of runtimeFiles) await writeFile(join(stage, name), files[name], { flag: "wx" });
        const manifest: Manifest = { schema: 2, version: target, host, files: hashes, runtime: options.runtime ?? runtime };
        await writeFile(join(stage, "manifest.json"), JSON.stringify(manifest, null, 2), { flag: "wx" });
        await options.afterStaging?.();
        if (await exists(installed)) { await renameRetry(installed, backup); moved = true; }
        await renameRetry(stage, installed);
        committed = true;
        await verifyFiles(root);
    } catch (error) {
        if (committed) await rm(installed, { recursive: true });
        if (moved && await exists(backup)) await renameRetry(backup, installed);
        throw error;
    } finally { await rm(stage, { recursive: true, force: true }); }
    if (moved) {
        const kept = join(root, "previous");
        const old = await readManifest(root, basename(backup)).catch(() => undefined);
        await rm(kept, { recursive: true, force: true });
        if (old?.schema === 2) await renameRetry(backup, kept); else await rm(backup, { recursive: true });
    }
    return "installed";
}
export async function restorePrevious(root: string): Promise<Manifest> {
    await safeTree(root);
    const previous = await verifyFiles(root, "previous");
    const installed = join(root, "installed");
    const failed = join(root, `failed-${randomUUID()}`);
    if (await exists(installed)) await renameRetry(installed, failed);
    try { await renameRetry(join(root, "previous"), installed); }
    catch (error) { if (await exists(failed)) await renameRetry(failed, installed); throw error; }
    await rm(failed, { recursive: true, force: true });
    await verifyFiles(root);
    return previous;
}
export async function uninstall(root: string): Promise<void> {
    await safeTree(root);
    await clearStaleLock(root);
    if (!await exists(root)) { console.info("Vackle is not installed."); return; }
    const manifest = await readManifest(root).catch(() => undefined);
    if (manifest) await checkFolder(root, "installed", manifest);
    await removeShortcuts(root, undefined, manifest?.host);
    await rm(root, { recursive: true, maxRetries: 10, retryDelay: 200 });
}
