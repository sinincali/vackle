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
import { randomUUID } from "node:crypto";
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Cdp, flackleTarget, targets } from "./cdp";
import { validateInstallation } from "./detection";
import { atomicWrite, exists, readJson, safeTree } from "./files";
import { clearStaleLock, verifyFiles } from "./installer";
import { RendererSession } from "./rendererSession";
import { watchPictureInPicture } from "./pipWindow";
import { processes, verifyPortOwner } from "./windows";
import { isRecord } from "../settings/schema";
import { cleanStaged, type Updates } from "./updater";
import { version } from "./version";

async function freePort(): Promise<number> {
    const server = createServer();
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Cannot allocate debugging port");
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    return address.port;
}
export async function launch(root: string, updates?: Updates): Promise<void> {
    await cleanStaged(root).catch(() => undefined);
    for (;;) {
        const outcome = await launchSession(root, updates);
        if (outcome === "exit") return;
        if (outcome !== "restart") { handOff(outcome.handoff); return; }
    }
}
export function handOff(staged: string): void {
    const helper = spawn(join(staged, "Vackle.exe"), ["apply-update", "--stage", staged, "--pid", String(process.pid)], { detached: true, windowsHide: true, stdio: "ignore", cwd: staged });
    helper.on("error", error => console.error("[Vackle:update] Could not start the update:", error));
    helper.unref();
    console.info(`Handing off to the Vackle update in ${staged}`);
}
async function launcherAlive(root: string): Promise<boolean> {
    const owner = await readJson(join(root, "launcher.lock")).catch(() => undefined);
    const pid = isRecord(owner) && typeof owner.pid === "number" ? owner.pid : undefined;
    return pid !== undefined && pid !== process.pid && (await processes()).some(item => item.pid === pid);
}
const pidAlive = (pid: number): boolean => { try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; } };
const fileStamp = async (path: string): Promise<string> => { const info = await stat(path); return `${info.size}:${info.mtimeMs}`; };
export async function relaunchedHost(executable: string, previousPid: number, launchedStamp: string, owns: (pid: number) => Promise<boolean>, deps = { processes, stamp: fileStamp, delay: (ms: number) => delay(ms), now: () => Date.now() }): Promise<number | undefined> {
    const start = deps.now();
    for (let updating = false; deps.now() - start < 120000; await deps.delay(1000)) {
        const items = await deps.processes();
        for (const item of items) if (item.pid !== previousPid && item.path.toLowerCase() === executable.toLowerCase() && await owns(item.pid).catch(() => false)) return item.pid;
        updating ||= items.some(item => item.parent === previousPid && !/msedgewebview2\.exe$/i.test(item.path)) || await deps.stamp(executable).then(stamp => stamp !== launchedStamp, () => true);
        if (!updating && deps.now() - start >= 5000) return undefined;
    }
    return undefined;
}
async function launchSession(root: string, updates?: Updates): Promise<"exit" | "restart" | { handoff: string }> {
    const manifest = await verifyFiles(root);
    let host = await validateInstallation(manifest.host.directory);
    const running = (await processes()).find(item => item.path.toLowerCase() === host.executable.toLowerCase());
    if (running) {
        for (const deadline = Date.now() + 60000; !await verifyRuntime(root).then(() => true, () => false); await delay(1000))
            if (Date.now() > deadline || !await launcherAlive(root)) throw new Error("Flackle is running without a verified Vackle session. Quit it completely, including its tray icon, and open Flackle again using the installed shortcut.");
        console.info("Flackle is already running with Vackle.");
        const focus = spawn(host.executable, [], { cwd: host.directory, detached: true, windowsHide: false, stdio: "ignore" });
        focus.on("error", error => console.warn("Unable to show Flackle:", error)); focus.unref();
        return "exit";
    }
    const lock = join(root, "launcher.lock");
    if (await launcherAlive(root)) { await delay(1000); return "restart"; }
    await clearStaleLock(root);
    const session = randomUUID();
    try { await writeFile(lock, JSON.stringify({ pid: process.pid, session }), { flag: "wx" }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; await delay(1000); return "restart"; }
    let stopping = false;
    let restarting = false;
    let handoff: string | undefined;
    const stop = (): void => { stopping = true; };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    let renderer: RendererSession | undefined;
    let child: ReturnType<typeof spawn> | undefined;
    let hostPid = 0;
    let adopted = false;
    const hostAlive = (): boolean => adopted ? pidAlive(hostPid) : Boolean(child && child.exitCode === null && child.signalCode === null);
    const pip = watchPictureInPicture();
    const receiptPath = join(root, "runtime.json");
    try {
        await safeTree(root, receiptPath);
        await rm(receiptPath, { force: true });
        const source = await readFile(join(root, "installed", "renderer.js"), "utf8");
        const port = await freePort();
        const env: NodeJS.ProcessEnv = { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1 --disable-features=msEdgePipAlignedUI` };
        delete env.WEBVIEW2_WAIT_FOR_SCRIPT_DEBUGGER;
        delete env.WEBVIEW2_PIPE_FOR_SCRIPT_DEBUGGER;
        let launchedStamp = await fileStamp(host.executable);
        child = spawn(host.executable, [], { cwd: host.directory, env, windowsHide: false, stdio: "ignore" });
        let launchError: Error | undefined;
        child.once("error", error => { launchError = error; });
        if (!child.pid) throw new Error("Failed to launch Flackle");
        hostPid = child.pid;
        console.info(`Launched Flackle ${host.version}. Waiting for the Vackle renderer handshake…`);
        const deadline = Date.now() + 60000;
        let verifiedOwner = false;
        let lastFailure = "Renderer not yet available";
        let acknowledged = false;
        let previousReceipt = "";
        let previousFailure = "";
        for (;;) {
            while (!stopping && hostAlive()) {
                if (launchError) throw launchError;
                try {
                    if (!renderer || !renderer.cdp.connected) {
                        const listed = await targets(port);
                        if (!verifiedOwner) { await verifyPortOwner(port, hostPid); verifiedOwner = true; continue; }
                        const pages = listed.filter(flackleTarget);
                        if (pages.length > 1) throw new Error("Multiple Flackle pages detected; refusing ambiguous target");
                        if (pages[0]) {
                            const cdp = await Cdp.connect(pages[0].webSocketDebuggerUrl, port);
                            renderer = new RendererSession(cdp, root, source, session, host.version, () => { restarting = true; stopping = true; }, updates,
                                staged => { handoff = staged; restarting = true; stopping = true; });
                            try { await renderer.initialize(); } catch (error) { cdp.close(); renderer = undefined; throw error; }
                        }
                    }
                    const state = await renderer?.ensure();
                    if (isRecord(state) && state.ready && state.session === session) {
                        const receipt = { session, hostPid, launcherPid: process.pid, port,
                            hostHash: host.sha256, targetOrigin: state.origin, version: state.version, hostVersion: state.hostVersion, plugins: state.plugins };
                        const encoded = JSON.stringify(receipt);
                        if (encoded !== previousReceipt) {
                            await atomicWrite(receiptPath, JSON.stringify({ ...receipt, observedAt: new Date().toISOString() }, null, 2));
                            previousReceipt = encoded;
                        }
                        if (!acknowledged) { console.info(`Verified: Vackle ${version} is ready inside the real Flackle desktop renderer. Keep this launcher running.`); acknowledged = true; }
                    } else if (!acknowledged && Date.now() > deadline) throw new Error("Runtime handshake did not complete");
                } catch (error) {
                    lastFailure = error instanceof Error ? error.message : String(error);
                    if (Date.now() > deadline && !acknowledged) throw new Error(`Flackle runtime verification failed: ${lastFailure}`);
                    if (acknowledged && lastFailure !== previousFailure) { console.error(`[Vackle:launcher] ${lastFailure}`); previousFailure = lastFailure; }
                }
                await delay(acknowledged ? 3000 : 250);
            }
            if (!acknowledged && !stopping) throw new Error(`Flackle exited before loading Vackle: ${lastFailure}`);
            if (stopping) break;
            const next = await relaunchedHost(host.executable, hostPid, launchedStamp, pid => verifyPortOwner(port, pid).then(() => true));
            if (next === undefined) break;
            await renderer?.dispose().catch(() => renderer?.cdp.close()); renderer = undefined;
            hostPid = next; adopted = true; previousReceipt = "";
            host = await validateInstallation(host.directory);
            launchedStamp = await fileStamp(host.executable);
            console.info(`Flackle restarted itself (now ${host.version}). Reconnecting Vackle…`);
        }
    } finally {
        pip.kill();
        process.removeListener("SIGINT", stop);
        process.removeListener("SIGTERM", stop);
        if (renderer) {
            try { await renderer.dispose(); } catch (error) { console.error("[Vackle:launcher] Cleanup failed:", error); renderer.cdp.close(); }
        }
        if (restarting && adopted && hostAlive()) {
            try {
                process.kill(hostPid);
                for (let attempt = 0; attempt < 40 && pidAlive(hostPid); attempt++) await delay(250);
                if (pidAlive(hostPid)) throw new Error("Flackle did not exit for restart");
            } finally { await rm(receiptPath, { force: true }); await rm(lock, { force: true }); }
        } else if (restarting && child && child.exitCode === null && child.signalCode === null) {
            try {
                await new Promise<void>((resolve, reject) => {
                    const timer = setTimeout(() => reject(new Error("Flackle did not exit for restart")), 10000);
                    child!.once("exit", () => { clearTimeout(timer); resolve(); });
                    if (!child!.kill()) { clearTimeout(timer); reject(new Error("Unable to close Flackle for restart")); }
                });
            } finally { await rm(receiptPath, { force: true }); await rm(lock, { force: true }); }
        }
        child?.unref();
        await rm(receiptPath, { force: true });
        await rm(lock, { force: true });
    }
    return handoff ? { handoff } : restarting ? "restart" : "exit";
}
export async function verifyRuntime(root: string): Promise<unknown> {
    const manifest = await verifyFiles(root);
    const host = await validateInstallation(manifest.host.directory);
    const path = join(root, "runtime.json");
    await safeTree(root, path);
    if (!await exists(path)) throw new Error("No runtime handshake. Open Flackle with Vackle first.");
    const receipt = await readJson(path);
    if (!isRecord(receipt) || receipt.hostHash !== host.sha256 || typeof receipt.hostPid !== "number" ||
        typeof receipt.launcherPid !== "number" || typeof receipt.port !== "number" || typeof receipt.session !== "string" ||
        !Number.isInteger(receipt.port) || receipt.port < 1 || receipt.port > 65535) throw new Error("Invalid runtime receipt");
    const items = await processes();
    if (!items.some(item => item.pid === receipt.hostPid && item.path.toLowerCase() === host.executable.toLowerCase()) ||
        !items.some(item => item.pid === receipt.launcherPid)) throw new Error("Runtime receipt is stale");
    await verifyPortOwner(receipt.port, receipt.hostPid);
    const pages = (await targets(receipt.port)).filter(flackleTarget);
    if (pages.length !== 1) throw new Error("Flackle renderer is unavailable or ambiguous");
    const cdp = await Cdp.connect(pages[0]!.webSocketDebuggerUrl, receipt.port);
    try {
        const state = await cdp.evaluate("({ready:Boolean(window.__VACKLE__?.ready),session:window.__VACKLE__?.session,version:window.__VACKLE__?.version,hostVersion:window.__VACKLE__?.hostVersion,plugins:window.__VACKLE__?.plugins(),native:Boolean(window.__TAURI_INTERNALS__),origin:location.origin})");
        if (!isRecord(state) || !state.ready || !state.native || state.origin !== "https://flackle.com" || state.session !== receipt.session ||
            state.version !== manifest.version || state.hostVersion !== host.version) throw new Error("Live Vackle renderer handshake failed");
        return state;
    } finally { cdp.close(); }
}
