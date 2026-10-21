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

import type { Plugin } from "../../api/types";
import { flackleMe, flackleStore } from "../../components/flackleStores";

interface Conversations { conversations: { id: string; type: string }[]; activeConversationId?: string | null; updateLastMessage(id: string, message: { sender?: { id?: string } }): void; }

export default {
    id: "one-ping-per-dm", name: "One Ping Per DM", description: "Only pings once for unread DMs and group chats. Open the chat to get pinged again.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Notifications", "Chat"], enabledByDefault: false,
    start({ resources, api }) {
        const store = flackleStore<Conversations>("updateLastMessage");
        if (!store) throw new Error("Flackle's conversation store was not found");
        let quietUntil = 0;
        const pinged = new Set<string>();
        const original = store.getState().updateLastMessage;
        const updateLastMessage = (id: string, message: { sender?: { id?: string } }): void => {
            const type = store.getState().conversations.find(entry => entry.id === id)?.type;
            const dm = (type === "dm" || type === "group") && message?.sender?.id !== flackleMe()?.id;
            quietUntil = dm && pinged.has(id) ? Date.now() + 2000 : 0;
            if (dm) pinged.add(id);
            original(id, message);
        };
        store.setState({ updateLastMessage });
        const seen = (): void => { const active = store.getState().activeConversationId; if (active && document.hasFocus()) pinged.delete(active); };
        resources.add(store.subscribe(seen)); window.addEventListener("focus", seen); resources.add(() => window.removeEventListener("focus", seen));
        resources.add(() => { if (store.getState().updateLastMessage === updateLastMessage) store.setState({ updateLastMessage: original }); });
        const quiet = (): boolean => Date.now() < quietUntil;
        const play = HTMLMediaElement.prototype.play;
        const ping = (media: HTMLMediaElement): boolean => quiet() && media.src.endsWith("/audio/new_notification.mp3");
        const quietPlay = function (this: HTMLMediaElement): Promise<void> { return ping(this) ? Promise.resolve() : play.call(this); };
        HTMLMediaElement.prototype.play = quietPlay;
        resources.add(() => { if (HTMLMediaElement.prototype.play === quietPlay) HTMLMediaElement.prototype.play = play; });
        const time = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "currentTime");
        if (time?.set) {
            const rewind = { ...time, set(this: HTMLMediaElement, value: number) { if (!ping(this)) time.set!.call(this, value); } };
            Object.defineProperty(HTMLMediaElement.prototype, "currentTime", rewind);
            resources.add(() => { if (Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "currentTime")?.set === rewind.set) Object.defineProperty(HTMLMediaElement.prototype, "currentTime", time); });
        }
        api.patch(globalThis, "fetch", fetch => (...args: unknown[]) => quiet() && /^https?:\/\/ipc\.localhost\/send_desktop_notification/.test(String(args[0] instanceof Request ? args[0].url : args[0]))
            ? Promise.resolve(new Response("null", { headers: { "Content-Type": "application/json", "Tauri-Response": "ok" } }))
            : fetch(...args));
        const webview = (window as { chrome?: { webview?: object } }).chrome?.webview;
        const tauri = Reflect.get(window, "__TAURI_INTERNALS__") as { runCallback?(id: number, data: unknown): void } | undefined;
        if (webview && typeof Reflect.get(webview, "postMessage") === "function") api.patch(webview, "postMessage", post => (...args: unknown[]) => {
            if (quiet() && typeof args[0] === "string" && args[0].includes('"send_desktop_notification"')) {
                try {
                    const message = JSON.parse(args[0]) as { cmd?: unknown; callback?: unknown };
                    if (message.cmd === "send_desktop_notification" && typeof message.callback === "number") { tauri?.runCallback?.(message.callback, null); return undefined; }
                } catch { }
            }
            return post(...args);
        });
    }
} satisfies Plugin;
