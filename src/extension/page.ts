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

import type { BootstrapConfig } from "../api/types";
import { bootstrap } from "../bootstrap";
import { isAppUri } from "../core/appUri";
import { isRecord, validateSettings } from "../settings/schema";

const channel = "vackle-extension";
const post = (message: Record<string, unknown>): void => window.postMessage({ channel, ...message }, location.origin);
const sheets = new Map<string, CSSStyleSheet>();
async function style(id: string, text: string): Promise<void> {
    let sheet = sheets.get(id);
    if (!sheet) {
        if (sheets.size >= 256) throw new Error("Too many stylesheets");
        sheet = new CSSStyleSheet();
        sheets.set(id, sheet);
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    }
    sheet.replaceSync(text);
}
function start(value: Record<string, unknown>): void {
    if (typeof value.version !== "string" || typeof value.session !== "string") return;
    const config: BootstrapConfig = { version: value.version, hostVersion: "Web", session: value.session, binding: "", settings: validateSettings(value.settings) };
    bootstrap(config, request => post({ type: "request", ...request }), call => ({
        save: settings => call("save", settings), style, restart: async () => location.reload(),
        branding: videoId => call<unknown>("branding", videoId), translate: request => call<unknown>("translate", request),
        openUri: async uri => { if (!isAppUri(uri)) throw new Error("Unsupported app link"); location.assign(uri); }
    }));
}
if (location.origin === "https://flackle.com" && window.top === window) {
    window.addEventListener("message", event => {
        const data: unknown = event.data;
        if (event.source !== window || !isRecord(data) || data.channel !== channel) return;
        if (data.type === "config" && isRecord(data.config)) start(data.config);
        if (data.type === "reply" && typeof data.id === "number") window.__VACKLE__?.resolve(data.id, typeof data.error === "string" ? data.error : null, data.result);
    });
    post({ type: "ready" });
}
