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
const icon = (silent: boolean): string => `<svg width="14" height="14" class="text-white/40 group-hover:text-white/70 transition-colors" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M4.5 5h15A2.5 2.5 0 0 1 22 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 16.5v-9A2.5 2.5 0 0 1 4.5 5ZM5 8.5v2h2v-2H5Zm4 0v2h2v-2H9Zm4 0v2h2v-2h-2Zm4 0v2h2v-2h-2ZM7.5 13.5v2h9v-2h-9Z"/>${silent ? '<path d="M3 3l18 18" fill="none" stroke-width="2.5" stroke-linecap="round" style="stroke:var(--ui-text-accent,#ef5252)"/>' : ""}</svg>`;

export default {
    id: "silent-typing", name: "Silent Typing", description: "Hide that you are typing.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Chat", "Privacy"], enabledByDefault: false,
    settings: {
        "is-enabled": { label: "Toggle functionality", default: true },
        "show-icon": { label: "Show an icon for toggling the plugin", default: true }
    },
    start({ settings, setSetting, resources, api }) {
        const socket = flackleStore<Socket>("sendGuildTypingStart");
        if (!socket) throw new Error("Flackle's connection store was not found");
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
            button.setAttribute("aria-label", label); button.title = label; button.setAttribute("aria-pressed", String(silent)); button.innerHTML = icon(silent);
            button.addEventListener("mousedown", event => event.preventDefault());
            button.addEventListener("click", () => void toggle().catch(error => api.notify(error instanceof Error ? error.message : String(error), "error")));
            wrapper.append(button); anchor.parentElement!.after(wrapper);
            return () => wrapper.remove();
        });
    }
} satisfies Plugin;
