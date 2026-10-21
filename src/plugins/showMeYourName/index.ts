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
import { flackleUser } from "../../components/flackleStores";
import { fiberProps } from "../../components/reactFiber";

interface Message { sender?: { username?: string }; reply_to?: { sender_username?: string } }
const messageOf = (element: Element): Message | undefined => {
    const row = element.closest("[data-message-id]");
    if (row) for (const props of fiberProps(row, 3)) if (typeof props.message === "object" && props.message) return props.message as Message;
    return undefined;
};

export default {
    id: "show-me-your-name", name: "Show Me Your Name", description: "Shows usernames next to display names and nicknames in chat and the member list.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Chat", "Appearance"], enabledByDefault: false,
    settings: {
        mode: { label: "Display style", default: "Nickname (username)", options: ["Nickname (username)", "Username (nickname)", "Username only"] },
        replies: { label: "Also show usernames in replies", default: true },
        members: { label: "Also show usernames in the member list", default: true }
    },
    async start({ settings, resources, api }) {
        const mode = String(settings.mode);
        const show = (target: HTMLElement, username: string | undefined): void | (() => void) => {
            const shown = target.textContent?.trim();
            if (!shown || !username || shown.toLowerCase() === username.toLowerCase()) return;
            const extra = Object.assign(document.createElement("span"), { className: "vackle-username" });
            if (mode === "Nickname (username)") extra.textContent = ` (${username})`;
            else {
                extra.style.fontSize = getComputedStyle(target).fontSize;
                extra.textContent = username;
                if (mode === "Username (nickname)") extra.append(Object.assign(document.createElement("span"), { className: "vackle-nickname", textContent: ` (${shown})` }));
                target.dataset.vackleName = "swap";
            }
            target.append(extra);
            return () => { extra.remove(); delete target.dataset.vackleName; };
        };
        api.observe("[data-message-id] button[data-user-card-trigger].font-medium", name => show(name, messageOf(name)?.sender?.username));
        if (settings.members !== false) api.observe('[class*="rightPanelRow"][data-user-card-trigger] .font-medium', name => {
            const id = name.closest<HTMLElement>("[data-user-card-trigger]")?.dataset.userCardTrigger;
            return id ? show(name, flackleUser(id)?.username) : undefined;
        });
        if (settings.replies !== false) api.observe("[data-message-id] > button span.text-xs.font-medium", name => show(name, messageOf(name)?.reply_to?.sender_username));
        await resources.style(".vackle-username{opacity:.6}[data-vackle-name=swap]{font-size:0!important}[data-vackle-name=swap]>.vackle-username{opacity:1}.vackle-nickname{opacity:.6}[data-message-id]>button span.text-xs.font-medium:has(.vackle-username){max-width:none}");
    }
} satisfies Plugin;
