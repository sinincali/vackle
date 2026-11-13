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

import type { Settings } from "../api/types";
import { adblockEnabled } from "../shared/youtubeAdblock";
import { isRecord } from "../settings/schema";
import { createHandler } from "./handler";

const adblock = { id: "youtube-adblock", js: ["adblock.js"], matches: ["https://www.youtube-nocookie.com/embed/*", "https://www.youtube.com/embed/*"], allFrames: true, runAt: "document_start", world: "MAIN" } as const;
async function syncAdblock(settings: Settings): Promise<void> {
    const registered = (await chrome.scripting.getRegisteredContentScripts({ ids: [adblock.id] })).length > 0;
    if (adblockEnabled(settings) && !registered) await chrome.scripting.registerContentScripts([{ ...adblock, js: [...adblock.js], matches: [...adblock.matches] }]);
    if (!adblockEnabled(settings) && registered) await chrome.scripting.unregisterContentScripts({ ids: [adblock.id] });
}
const handle = createHandler(async () => (await chrome.storage.local.get("settings")).settings, settings => chrome.storage.local.set({ settings }), syncAdblock);
const flackle = (sender: ExtensionSender): boolean => {
    try { return sender.id === chrome.runtime.id && sender.frameId === 0 && new URL(sender.url ?? "").origin === "https://flackle.com"; }
    catch { return false; }
};
chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (!flackle(sender) || !isRecord(message)) return;
    handle(message.method, message.payload).then(result => reply([null, result ?? null]), (error: unknown) => reply([error instanceof Error ? error.message : String(error), null]));
    return true;
});
