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

import { SyncConflict, type CloudSync } from "../core/sync";
import type { SettingsStore } from "../settings/settingsStore";
import { modalHost, openModal } from "./modal";
import { button, element, settingRow, syncToggle, toggle, type RunAction } from "./primitives";

export function syncSection(sync: CloudSync, store: SettingsStore, run: RunAction, notify: (message: string) => void): HTMLElement {
    const root = element("section", "vackle-section vackle-sync-section");
    const head = element("div", "vackle-sync-head"), slot = element("div"), view = element("div", "vackle-sync");
    head.append(element("h3", "vackle-section-title", "Cloud Sync"), slot);
    root.append(head, view);
    const dialog = (title: string, text: string, ...actions: [label: string, work: () => Promise<void>, primary?: boolean][]): void => {
        const body = element("div", "vackle-update");
        body.append(element("p", "", text));
        const row = element("div", "vackle-actions vackle-update-actions");
        row.append(button("Cancel", () => close(), "vackle-ghost"));
        for (const [label, work, primary] of actions)
            row.append(button(label, () => { close(); void run(work, false).then(refresh); }, primary ? "vackle-primary" : ""));
        body.append(row);
        const close = openModal(modalHost(), title, body, refresh);
    };
    const showKey = (key: string, fresh: boolean): void => {
        const body = element("div", "vackle-update");
        const code = element("div", "vackle-update-notes vackle-sync-key", key);
        const copy = button("Copy key", () => void navigator.clipboard.writeText(key).then(() => notify("Recovery key copied.")), "vackle-primary");
        const row = element("div", "vackle-actions vackle-update-actions"); row.append(button("Done", () => close(), "vackle-ghost"), copy);
        body.append(element("p", "", fresh ? "Cloud Sync is on. Save this key: you'll need it to connect another device." : "Enter this key on another device to connect it."),
            code, element("p", "vackle-hint", "Keep it private. Nobody, including us, can recover it if it's lost."), row);
        const close = openModal(modalHost(), "Recovery key", body);
    };
    const download = (): Promise<void> => sync.pull().then(() => notify("Downloaded. Restart Flackle to finish applying plugin changes."));
    const upload = async (base?: number): Promise<void> => {
        try { await sync.push(base); notify("Uploaded this device's settings."); }
        catch (error) {
            if (!(error instanceof SyncConflict)) throw error;
            if (error.version === 0) return upload(0);
            dialog("Cloud copy is newer", "Another device uploaded changes this device doesn't have. Download them, or overwrite the cloud copy with this device's settings.",
                ["Overwrite cloud", () => upload(error.version)], ["Download", download, true]);
        }
    };
    const summary = (): string => {
        const saved = store.value;
        return `Includes your plugin settings, ${saved.themes.length} ${saved.themes.length === 1 ? "theme" : "themes"} and your QuickCSS, encrypted on this device. Nothing from your Flackle account or messages. Changes can take a minute to show on other devices.`;
    };
    function refresh(): void {
        void sync.saved().then(saved => {
            const control = toggle("Cloud Sync", Boolean(saved), checked => {
                const input = control.querySelector("input")!; input.checked = !checked; syncToggle(input);
                if (checked) {
                    control.querySelector("input")!.disabled = true;
                    void run(async () => { showKey(await sync.enable(), true); }, false).then(refresh);
                } else dialog("Turn off Cloud Sync?", "Delete the cloud copy, or keep it and only stop syncing on this device. Your settings stay as they are everywhere.",
                    ["Keep cloud copy", async () => { await sync.forget(); notify("Cloud Sync is off on this device. The cloud copy was kept."); }],
                    ["Delete cloud copy", async () => { await sync.disable(); notify("Cloud Sync is off and the cloud copy is deleted."); }, true]);
            });
            slot.replaceChildren(control);
            view.replaceChildren();
            if (!saved) {
                const key = element("input", "vackle-input"); key.placeholder = "ABCD-EFGH-…"; key.setAttribute("aria-label", "Recovery key"); key.autocomplete = "off"; key.spellcheck = false;
                view.append(settingRow("Connect another device", "Already using Cloud Sync? Enter your recovery key.", key, button("Connect", () => dialog("Replace this device's settings?",
                    "Your plugins, themes and QuickCSS here will be replaced with the cloud copy.", ["Replace", async () => { await sync.join(key.value); notify("Connected. Restart Flackle to finish applying plugin changes."); }, true]))));
                return;
            }
            const segment = (label: string, action: () => void): HTMLButtonElement => {
                const node = element("button", "", label); node.type = "button"; node.addEventListener("click", action); return node;
            };
            const row = element("div", "vackle-sync-actions");
            const send = segment("Upload", () => { send.disabled = true; void run(() => upload(), false).then(refresh); });
            row.append(
                send,
                segment("Download", () => dialog("Replace this device's settings?", "Your plugins, themes and QuickCSS here will be replaced with the cloud copy.", ["Replace", download, true])),
                segment("Recovery key", () => showKey(saved.key, false)));
            view.append(row, element("p", "vackle-hint", summary()));
        }, error => {
            notify(error instanceof Error ? error.message : String(error));
            view.replaceChildren(element("p", "vackle-hint", "Couldn't load Cloud Sync."), button("Retry", () => refresh(), "vackle-ghost"));
        });
    }
    refresh();
    return root;
}
