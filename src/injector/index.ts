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

import { spawn } from "node:child_process";
import { appendFileSync, existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { createInterface } from "node:readline/promises";
import { getAsset, isSea } from "node:sea";
import { setTimeout as delay } from "node:timers/promises";
import { format } from "node:util";
import { applyUpdate } from "./applyUpdate";
import { selectInstallation, validateInstallation, type Installation } from "./detection";
import { exists, readJson, safeTree } from "./files";
import { dataDirectory, install, readManifest, uninstall, verifyFiles } from "./installer";
import { handOff, launch, verifyRuntime } from "./launcher";
import { installShortcuts, verifyShortcuts } from "./shortcuts";
import { directoryFeed, githubFeed, readStaged, reusable, Updates, type RuntimeFile } from "./updater";
import { publicKey, repository, runtime, version } from "./version";
import { powershell, processes, requireWindows } from "./windows";

const hidden = new Set(["launch-hidden", "apply-update"]);
function updatesFor(root: string): Updates {
    const feed = process.env.VACKLE_UPDATE_FEED;
    return new Updates(root, version, feed ? directoryFeed(feed) : repository ? githubFeed(repository) : undefined, publicKey);
}
async function popup(message: string, question = false): Promise<boolean> {
    const answer = await powershell<number>("$shell=New-Object -ComObject WScript.Shell; $shell.Popup($env:VACKLE_MESSAGE,0,'Vackle',[int]$env:VACKLE_BUTTONS)",
        { VACKLE_MESSAGE: message, VACKLE_BUTTONS: question ? "36" : "64" }, 0).catch(() => 7);
    return answer === 6;
}
async function sources(): Promise<Record<RuntimeFile, Buffer>> {
    if (isSea()) return { "Vackle.exe": await readFile(process.execPath), "injector.cjs": Buffer.from(getAsset("injector.cjs")), "renderer.js": Buffer.from(getAsset("renderer.js")) };
    const folder = dirname(process.argv[1]!);
    return { "Vackle.exe": await readFile(join(folder, "Vackle.exe")), "injector.cjs": await readFile(join(folder, "injector.cjs")), "renderer.js": await readFile(join(folder, "renderer.js")) };
}
function insideData(root: string): boolean {
    const rel = relative(resolve(root), resolve(process.execPath));
    return Boolean(rel) && !rel.startsWith(`..${sep}`) && rel !== "..";
}
async function closeFlackle(root: string, host: Installation): Promise<void> {
    for (const item of await processes()) if (item.path.toLowerCase() === host.executable.toLowerCase()) { try { process.kill(item.pid); } catch { } }
    for (let attempt = 0; attempt < 60; attempt++) {
        if (!await exists(join(root, "launcher.lock")) && !(await processes()).some(item => item.path.toLowerCase() === host.executable.toLowerCase())) return;
        await delay(250);
    }
    throw new Error("Flackle did not close. Quit it from the tray icon and try again.");
}
async function running(root: string, host: Installation): Promise<boolean> {
    return await exists(join(root, "launcher.lock")) || (await processes()).some(item => item.path.toLowerCase() === host.executable.toLowerCase());
}
async function newest(root: string): Promise<{ files: Record<RuntimeFile, Buffer>; version: string; runtime: string } | undefined> {
    const updates = updatesFor(root);
    if (!updates.enabled) return undefined;
    try {
        const staged = await updates.stage();
        try { const { release, files } = await readStaged(staged, publicKey, await reusable(root)); return { files, version: release.version, runtime: release.runtime }; }
        finally { await rm(staged, { recursive: true, force: true }); }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/No newer/.test(message)) console.warn(`Could not download the latest Vackle (${message}). Installing the bundled ${version} instead.`);
        return undefined;
    }
}
async function installFor(root: string, host: Installation, repair: boolean): Promise<void> {
    if (insideData(root)) throw new Error("This is the installed copy of Vackle. Run the Vackle.exe you downloaded to install, repair or update.");
    const latest = await newest(root);
    const target = latest?.version ?? version;
    const outcome = await install(root, host, latest?.files ?? await sources(), { repair, version: target, runtime: latest?.runtime ?? runtime });
    const shortcuts = await installShortcuts(root, host);
    console.info(outcome === "unchanged" ? `Vackle ${target} is already installed and up to date.` : `Vackle ${target} installed for Flackle ${host.version}.`);
    console.info(`Shortcuts: ${shortcuts.join(", ")}`);
}
function startInstalled(root: string): void {
    const child = spawn(join(root, "installed", "Vackle.exe"), ["launch-hidden"], { detached: true, windowsHide: true, stdio: "ignore", cwd: root });
    child.on("error", error => console.error("Could not start Flackle:", error.message)); child.unref();
}
async function interactive(root: string): Promise<void> {
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    const ask = async (question: string, fallback = true): Promise<boolean> => {
        const answer = (await prompt.question(`${question} ${fallback ? "[Y/n]" : "[y/N]"} `)).trim().toLowerCase();
        return answer ? answer.startsWith("y") : fallback;
    };
    try {
        console.info(`\n  Vackle ${version} Installer\n  ${"─".repeat(24)}\n`);
        let host: Installation;
        try { host = await selectInstallation(); }
        catch (error) {
            console.error(`  ${error instanceof Error ? error.message : String(error)}`);
            const path = (await prompt.question("  Paste the Flackle install folder, or press Enter to quit: ")).trim().replace(/^"|"$/g, "");
            if (!path) return;
            host = await validateInstallation(path);
        }
        console.info(`  Flackle ${host.version} found at ${host.directory}`);
        const current = await readManifest(root).catch(() => undefined);
        console.info(current ? `  Installed: Vackle ${current.version}\n` : "  Vackle is not installed yet.\n");
        const options = current ? ["Install / Update", "Repair", "Uninstall", "Quit"] : ["Install", "Quit"];
        options.forEach((label, index) => console.info(`  ${index + 1}) ${label}`));
        const choice = options[Number((await prompt.question("\n  Choose an option: ")).trim()) - 1];
        if (!choice || choice === "Quit") return;
        if (await running(root, host)) {
            if (!await ask("\n  Flackle is open. Close it and continue?")) return;
            await closeFlackle(root, host);
        }
        if (choice === "Uninstall") {
            await uninstall(root);
            console.info("\n  Vackle was removed. Your Vackle settings were kept, and Flackle itself was never changed.");
            return;
        }
        console.info("");
        await installFor(root, host, choice === "Repair");
        if (await ask("\n  Open Flackle with Vackle now?")) startInstalled(root);
    } catch (error) {
        console.error(`\n  Something went wrong: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
    } finally {
        await prompt.question("\n  Press Enter to close.").catch(() => "");
        prompt.close();
    }
}
async function flackleChanged(root: string, reason: string): Promise<boolean> {
    const updates = updatesFor(root);
    const status = await updates.status(true);
    if (status.available && await popup(`Flackle was updated and Vackle ${version} does not support it yet.\n\nVackle ${status.available.version} is available. Install it now?`, true)) {
        handOff(await updates.stage());
        return true;
    }
    const manifest = await readManifest(root);
    await popup(status.available ? "Flackle will open without Vackle this time." :
        `Flackle was updated and Vackle does not support this version yet (${reason}).\n\nFlackle will open without Vackle. Vackle will offer an update as soon as a compatible version is released.`);
    const child = spawn(manifest.host.executable, [], { cwd: manifest.host.directory, detached: true, stdio: "ignore" });
    child.on("error", () => undefined); child.unref();
    return true;
}
async function main(): Promise<void> {
    requireWindows();
    const [command, ...args] = process.argv.slice(2);
    const root = dataDirectory();
    const option = (name: string): string | undefined => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
    if (command && hidden.has(command)) {
        const path = join(root, command === "apply-update" ? "update.log" : "launcher.log"); await safeTree(root, path);
        const log = (...values: unknown[]): void => { appendFileSync(path, `[${new Date().toISOString()}] ${format(...values)}\n`, "utf8"); };
        console.info = log; console.error = log; console.warn = log;
    }
    if (!command) {
        if (process.stdin.isTTY) return interactive(root);
        throw new Error("Usage: Vackle.exe [install|repair|uninstall|status|verify|launch] [--path <Flackle directory>]");
    }
    if (command === "install" || command === "repair") await installFor(root, await selectInstallation(option("--path")), command === "repair");
    else if (command === "uninstall") {
        if (insideData(root)) throw new Error("Run the Vackle.exe you downloaded to uninstall.");
        await uninstall(root);
        console.info("Vackle removed. Settings retained. Flackle application files were never modified.");
    } else if (command === "launch" || command === "launch-hidden") {
        process.chdir(root);
        try { await launch(root, updatesFor(root)); }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (command === "launch-hidden" && /fingerprint|Flackle changed|product metadata/i.test(message) && await flackleChanged(root, message).catch(() => false)) return;
            throw error;
        }
    } else if (command === "apply-update") {
        const staged = option("--stage"); const pid = Number(option("--pid"));
        if (!staged || !Number.isSafeInteger(pid)) throw new Error("apply-update needs --stage and --pid");
        await safeTree(root, staged);
        const outcome = await applyUpdate(root, staged, pid, publicKey, {
            alive: target => { try { process.kill(target, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; } },
            launch: executable => { const child = spawn(executable, ["launch-hidden"], { detached: true, windowsHide: true, stdio: "ignore", cwd: root, env: { ...process.env, VACKLE_SUPERVISED: "1" } }); child.on("error", () => undefined); child.unref(); return child.pid ?? -1; },
            receipt: () => readJson(join(root, "runtime.json")),
            stop: async (launcher, host) => {
                try { process.kill(launcher); } catch { }
                for (const item of await processes()) if (item.path.toLowerCase() === host.executable.toLowerCase()) { try { process.kill(item.pid); } catch { } }
                await delay(1500);
            },
            delay: ms => delay(ms),
            validateHost: validateInstallation,
            shortcuts: async host => { await installShortcuts(root, host); },
            notify: async message => { await popup(message); }
        });
        console.info(`Update finished: ${outcome}`);
    } else if (command === "verify") console.info("Live Vackle verification:", JSON.stringify(await verifyRuntime(root), null, 2));
    else if (command === "status") {
        if (await exists(join(root, "installed"))) {
            const manifest = await verifyFiles(root);
            await validateInstallation(manifest.host.directory);
            const shortcuts = await verifyShortcuts(root);
            const status = await updatesFor(root).status(true);
            console.info(`Vackle ${manifest.version} installed for Flackle ${manifest.host.version}: ${manifest.host.directory}`);
            console.info(`${shortcuts.length} persistent launch shortcuts verified.`);
            console.info(status.available ? `Update available: ${status.available.version}` : status.error ? `Update check failed: ${status.error}` : repository || process.env.VACKLE_UPDATE_FEED ? "Vackle is up to date." : "Updates are not configured for this build.");
        } else {
            const host = await selectInstallation(option("--path"));
            console.info(`Flackle ${host.version}: ${host.directory}\nVackle is not installed.`);
        }
    } else throw new Error(`Unknown command: ${command}`);
}
const delegate = isSea() && !Reflect.get(globalThis, "__vackleDelegated") ? join(dirname(process.execPath), "injector.cjs") : undefined;
if (delegate && existsSync(delegate)) {
    Reflect.set(globalThis, "__vackleDelegated", true);
    createRequire(delegate)(delegate);
} else void main().catch(async error => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Vackle] ${message}`); process.exitCode = 1;
    const supervised = process.env.VACKLE_SUPERVISED === "1" && process.uptime() < 180;
    if (process.argv[2] && hidden.has(process.argv[2]) && !supervised) await popup(message).catch(() => undefined);
});
