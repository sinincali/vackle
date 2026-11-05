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

import { isRecord } from "../settings/schema";

const channel = "vackle-extension";
const post = (message: Record<string, unknown>): void => window.postMessage({ channel, ...message }, location.origin);
export function serve(ask: (method: string, payload: unknown) => Promise<unknown>, version: string): void {
    let config: Promise<Record<string, unknown>> | undefined;
    const sendConfig = (): void => {
        config ??= ask("settings", null).then(settings => ({ version, hostVersion: "Web", session: crypto.randomUUID(), binding: "", settings }),
            (error: unknown) => { config = undefined; throw error; });
        config.then(value => post({ type: "config", config: value }), error => console.error("[Vackle:extension] Could not load settings:", error));
    };
    window.addEventListener("message", event => {
        const data: unknown = event.data;
        if (event.source !== window || !isRecord(data) || data.channel !== channel) return;
        if (data.type === "ready") sendConfig();
        if (data.type !== "request" || typeof data.method !== "string") return;
        const id = data.id;
        ask(data.method, data.payload).then(result => post({ type: "reply", id, error: null, result }),
            (error: unknown) => post({ type: "reply", id, error: error instanceof Error ? error.message : String(error), result: null }));
    });
    sendConfig();
}
