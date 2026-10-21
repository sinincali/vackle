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
import { uiIcon } from "../../components/icons";
import { flackleStore } from "../../components/flackleStores";
import { tooltip } from "../../components/tooltip";

export default {
    id: "owner-crown", name: "Owner Crown", description: "Shows a crown next to the server owner in the member list, chat and voice channels.",
    version: "1.1.0", author: "Xrm0s and contributors", tags: ["Appearance", "Servers"], enabledByDefault: false,
    settings: {
        chat: { label: "Show the crown next to their name in chat", default: true },
        voice: { label: "Show the crown next to their name in voice channels", default: true }
    },
    async start({ settings, resources, api }) {
        const servers = flackleStore<{ servers: { id: string; owner_id?: string }[] }>("setServerNotificationLevel");
        if (!servers) throw new Error("Flackle's server store was not found");
        const ownerOf = (serverId: string): string | undefined => servers.getState().servers.find(server => server.id === serverId)?.owner_id;
        const crown = (userId: string | undefined, place: (icon: HTMLElement) => void): (() => void) | undefined => {
            const serverId = /^\/app\/channels\/(\d+)\//.exec(location.pathname)?.[1];
            if (!userId || !serverId || ownerOf(serverId) !== userId) return undefined;
            const icon = Object.assign(document.createElement("span"), { className: "vackle-owner-crown" });
            icon.setAttribute("role", "img"); icon.setAttribute("aria-label", "Server Owner"); icon.append(uiIcon("crown", 14));
            const hide = tooltip(icon, "Server Owner");
            place(icon);
            return () => { hide(); icon.remove(); };
        };
        api.observe('[class*="rightPanelRow"][data-user-card-trigger]', row => {
            const names = row.querySelector(".font-medium")?.parentElement;
            return names ? crown(row.dataset.userCardTrigger, icon => names.append(icon)) : undefined;
        });
        if (settings.chat !== false) api.observe("[data-message-id] button.font-medium[data-user-card-trigger]", name => crown(name.dataset.userCardTrigger, icon => name.after(icon)));
        if (settings.voice !== false) api.observe("[data-sidebar-context-owner][data-user-card-trigger] > span.truncate", name => crown(name.parentElement!.dataset.userCardTrigger, icon => name.after(icon)));
        await resources.style(".vackle-owner-crown{display:inline-flex;flex-shrink:0;color:#f0b232}[data-message-id] .vackle-owner-crown{align-self:center;order:1}[data-message-id] div.flex.items-end.gap-2:has(> button.font-medium[data-user-card-trigger]){gap:4px}[data-message-id] div.flex.items-end.gap-2:has(> button.font-medium[data-user-card-trigger])>span.cursor-default{order:2;margin-left:4px}[data-sidebar-context-owner]>span.truncate:has(+.vackle-owner-crown){flex:0 1 auto}");
    }
} satisfies Plugin;
