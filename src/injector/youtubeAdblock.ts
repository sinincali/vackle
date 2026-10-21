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
import { isRecord } from "../settings/schema";
import type { Cdp } from "./cdp";
import adguard from "./adguard.js" with { type: "text" };

const origins = ["https://www.youtube-nocookie.com", "https://www.youtube.com"];
export function youtubeEmbed(url: unknown): boolean {
    try { const parsed = new URL(String(url)); return origins.includes(parsed.origin) && parsed.pathname.startsWith("/embed/"); }
    catch { return false; }
}
export const adblockEnabled = (settings: Settings | undefined): boolean => settings?.plugins["youtube-adblock"]?.enabled === true;
export const adblockSource = `if(${JSON.stringify(origins)}.includes(location.origin)&&location.pathname.startsWith("/embed/")){${adguard}\n}`;
export async function attachFrame(cdp: Pick<Cdp, "send">, params: Record<string, unknown>, enabled: boolean, navigations: Map<string, string>): Promise<void> {
    const session = params.sessionId;
    const info = params.targetInfo;
    if (typeof session !== "string") return;
    const target = isRecord(info) && typeof info.targetId === "string" ? info.targetId : "";
    const pending = navigations.get(target);
    navigations.delete(target);
    const inject = enabled && isRecord(info) && info.type === "iframe" && youtubeEmbed(info.url || pending);
    try {
        if (inject) {
            await cdp.send("Page.enable", {}, session);
            await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: adblockSource }, session);
            if (params.waitingForDebugger !== true) await cdp.send("Runtime.evaluate", { expression: adblockSource }, session);
        }
    } finally {
        if (params.waitingForDebugger === true) await cdp.send("Runtime.runIfWaitingForDebugger", {}, session);
        if (!inject) await cdp.send("Target.detachFromTarget", { sessionId: session });
    }
}
