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

import { join } from "node:path";
import type { Installation } from "./detection";
import { install, readManifest, restorePrevious } from "./installer";
import { cleanStaged, compareVersions, readStaged, updateState } from "./updater";
import { isRecord } from "../settings/schema";

export interface ApplyDeps {
    alive(pid: number): boolean;
    launch(executable: string): number;
    receipt(): Promise<unknown>;
    stop(launcherPid: number, host: Installation): Promise<void>;
    delay(ms: number): Promise<void>;
    validateHost(directory: string): Promise<Installation>;
    shortcuts(host: Installation): Promise<void>;
    notify(message: string): Promise<void>;
}
export interface ApplyTimeouts { exit: number; health: number; }
export async function applyUpdate(root: string, staged: string, waitPid: number, key: string, deps: ApplyDeps,
    timeouts: ApplyTimeouts = { exit: 60000, health: 120000 }): Promise<"updated" | "rolled-back" | "refused"> {
    const executable = join(root, "installed", "Vackle.exe");
    for (const deadline = Date.now() + timeouts.exit; deps.alive(waitPid);) {
        if (Date.now() > deadline) throw new Error("The running Vackle launcher did not close, so the update was not applied");
        await deps.delay(200);
    }
    const previous = await readManifest(root);
    const refuse = async (reason: string, version?: string): Promise<"refused"> => {
        console.error(`Update refused: ${reason}`);
        if (version) await updateState(root, state => { if (!state.failed.includes(version)) state.failed.push(version); });
        deps.launch(executable);
        await deps.notify(`Vackle could not update: ${reason}\n\nVackle ${previous.version} is still installed.`);
        return "refused";
    };
    let release: Awaited<ReturnType<typeof readStaged>>["release"];
    let files: Awaited<ReturnType<typeof readStaged>>["files"];
    try { ({ release, files } = await readStaged(staged, key, previous.runtime ? { runtime: previous.runtime, exe: previous.files["Vackle.exe"] ?? "" } : undefined)); }
    catch (error) { return refuse(error instanceof Error ? error.message : String(error)); }
    if (compareVersions(release.version, previous.version) <= 0) return refuse(`${release.version} is not newer than ${previous.version}`);
    let host: Installation;
    try {
        host = await deps.validateHost(previous.host.directory);
        await install(root, host, files, { version: release.version, runtime: release.runtime });
    } catch (error) {
        const busy = ["EPERM", "EBUSY", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "");
        return refuse(error instanceof Error ? error.message : String(error), busy ? undefined : release.version);
    }
    await deps.shortcuts(host).catch(() => undefined);
    await updateState(root, state => { state.updated = { from: previous.version, to: release.version }; state.skipped = null; });
    const launcher = deps.launch(executable);
    let healthy = false;
    for (const deadline = Date.now() + timeouts.health; Date.now() < deadline && deps.alive(launcher);) {
        const receipt = await deps.receipt().catch(() => undefined);
        if (isRecord(receipt) && receipt.version === release.version && receipt.launcherPid === launcher) { healthy = true; break; }
        await deps.delay(500);
    }
    if (healthy) {
        await cleanStaged(root, staged, 0);
        return "updated";
    }
    console.error(`Vackle ${release.version} did not become healthy; restoring ${previous.version}`);
    await deps.stop(launcher, host);
    await restorePrevious(root);
    await updateState(root, state => { state.updated = null; if (!state.failed.includes(release.version)) state.failed.push(release.version); });
    deps.launch(executable);
    await deps.notify(`Vackle ${release.version} did not start correctly, so Vackle ${previous.version} was restored.\n\nYou will not be asked to install ${release.version} again.`);
    return "rolled-back";
}
