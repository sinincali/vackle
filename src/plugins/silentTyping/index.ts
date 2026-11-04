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
import { flackleStore } from "../../components/flackleStores";

interface Socket { sendTypingStart(conversationId: string): void; sendGuildTypingStart(serverId: string, channelId: string): void; }
const icon = `<svg class="w-3.5 h-3.5 text-[#727276] group-hover:text-[#B9B9BB] transition-colors" viewBox="2 2 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M4.5 5h15A2.5 2.5 0 0 1 22 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 16.5v-9A2.5 2.5 0 0 1 4.5 5ZM5 8.5v2h2v-2H5Zm4 0v2h2v-2H9Zm4 0v2h2v-2h-2Zm4 0v2h2v-2h-2ZM7.5 13.5v2h9v-2h-9Z"/></svg>`;

export default {
    id: "silent-typing", name: "Silent Typing", description: "Hide that you are typing, and optionally hide when others are typing.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Chat", "Privacy"], enabledByDefault: false,
    settings: {
        "is-enabled": { label: "Toggle functionality", default: true },
        "show-icon": { label: "Show an icon for toggling the plugin", default: true },
        "hide-others": { label: "Hide when other people are typing", default: false }
    },
    start({ settings, setSetting, resources, api }) {
        const socket = flackleStore<Socket>("sendGuildTypingStart");
        if (!socket) throw new Error("Flackle's connection store was not found");
        if (settings["hide-others"] === true) {
            const store = socket as unknown as { setState(partial: unknown, replace?: boolean): void; getState(): Record<string, unknown> };
            const original = store.setState;
            const hidden = (partial: unknown, replace?: boolean): void => original((state: Record<string, unknown>) => {
                const next = typeof partial === "function" ? partial(state) : partial;
                return next && typeof next === "object" && "typingUsers" in next ? { ...next, typingUsers: {} } : next;
            }, replace);
            store.setState = hidden;
            original({ typingUsers: {} });
            resources.add(() => { if (store.setState === hidden) store.setState = original; });
        }
        const silent = settings["is-enabled"] !== false;
        const toggle = (): Promise<void> => setSetting("is-enabled", !silent).then(() => api.notify(silent ? "Silent typing disabled!" : "Silent typing enabled!"));
        if (silent) {
            const original = socket.getState();
            const quiet: Pick<Socket, keyof Socket> = { sendTypingStart: () => {}, sendGuildTypingStart: () => {} };
            socket.setState(quiet);
            resources.add(() => {
                const now = socket.getState();
                if (now.sendTypingStart === quiet.sendTypingStart && now.sendGuildTypingStart === quiet.sendGuildTypingStart)
                    socket.setState({ sendTypingStart: original.sendTypingStart, sendGuildTypingStart: original.sendGuildTypingStart });
            });
        }
        api.command({ id: "silenttype", label: "Toggle Silent Typing", description: "Toggle whether you're hiding that you're typing or not.", run: toggle });
        if (settings["show-icon"] !== false) api.observe('button[aria-label="Chat Settings"]', anchor => {
            const wrapper = anchor.parentElement!.cloneNode(false) as HTMLElement;
            const button = anchor.cloneNode(false) as HTMLButtonElement;
            const label = silent ? "Disable Silent Typing" : "Enable Silent Typing";
            button.setAttribute("aria-label", label); button.title = label; button.setAttribute("aria-pressed", String(silent)); button.innerHTML = icon;
            button.addEventListener("mousedown", event => event.preventDefault());
            button.addEventListener("click", () => void toggle().catch(error => api.notify(error instanceof Error ? error.message : String(error), "error")));
            wrapper.append(button);
            (anchor.parentElement!.parentElement!.querySelector(':scope > :has(> button[aria-label$="Auto-Translate"])') ?? anchor.parentElement!).after(wrapper);
            return () => wrapper.remove();
        });
    }
} satisfies Plugin;
