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

import type { Bridge } from "../api/types";
import type { Notifications } from "../api/notifications";
import { modalHost, openModal } from "../components/modal";
import { button, element } from "../components/primitives";
import { isRecord } from "../settings/schema";

interface Status { current: string; available: { version: string; notes: string } | null; updated: { from: string; to: string } | null; error: string | null; }
export function parseStatus(value: unknown): Status | undefined {
    if (!isRecord(value) || typeof value.current !== "string") return undefined;
    const available = isRecord(value.available) && typeof value.available.version === "string" && typeof value.available.notes === "string"
        ? { version: value.available.version, notes: value.available.notes } : null;
    const updated = isRecord(value.updated) && typeof value.updated.from === "string" && typeof value.updated.to === "string" ? { from: value.updated.from, to: value.updated.to } : null;
    return { current: value.current, available, updated, error: typeof value.error === "string" ? value.error : null };
}
export class UpdatePrompt {
    private close: (() => void) | undefined;
    constructor(private readonly bridge: Bridge, private readonly notices: Notifications) {}
    async check(manual = false): Promise<void> {
        if (!this.bridge.updateStatus) return;
        const status = parseStatus(await this.bridge.updateStatus(manual));
        if (!status) throw new Error("The launcher sent an unexpected update status");
        if (status.updated) this.notices.notify(`Vackle was updated to ${status.updated.to}.`);
        if (status.available) this.show(status.current, status.available);
        else if (manual) this.notices.notify(status.error ? `Could not check for updates: ${status.error}` : `Vackle ${status.current} is up to date.`, status.error ? "error" : "info");
    }
    private show(current: string, release: { version: string; notes: string }): void {
        if (this.close) return;
        const body = element("div", "vackle-update");
        body.append(element("p", "", `Vackle ${release.version} is ready to install. You have ${current}.`));
        if (release.notes.trim()) body.append(element("div", "vackle-update-notes", release.notes.slice(0, 4000)));
        const note = element("p", "vackle-hint", "Flackle restarts once to finish. If the new version fails to start, Vackle puts your current version back.");
        const error = element("p", "vackle-error"); error.hidden = true;
        const later = button("Later", () => this.close?.(), "vackle-ghost");
        const skip = button("Skip This Version", () => {
            void this.bridge.updateSkip?.(release.version).then(() => this.close?.(), failure => { error.hidden = false; error.textContent = failure instanceof Error ? failure.message : String(failure); });
        }, "vackle-ghost");
        const update = button("Update & Restart", () => {
            for (const control of [later, skip, update]) control.disabled = true;
            error.hidden = true; note.textContent = "Downloading and verifying the update…";
            void this.bridge.updateInstall?.().then(() => { note.textContent = "Restarting Flackle to finish updating…"; }, failure => {
                for (const control of [later, skip, update]) control.disabled = false;
                note.textContent = "The update was not installed. Nothing was changed.";
                error.hidden = false; error.textContent = failure instanceof Error ? failure.message : String(failure);
            });
        }, "vackle-primary");
        const actions = element("div", "vackle-actions vackle-update-actions"); actions.append(skip, later, update);
        body.append(note, error, actions);
        this.close = openModal(modalHost(), "Vackle Update Available", body, () => { this.close = undefined; });
    }
    dispose(): void { this.close?.(); }
}
