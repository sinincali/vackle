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
import { roleColor } from "../../components/flackleRole";
import { fiberProps } from "../../components/reactFiber";

interface Role { id: string; name?: string; color?: string | null; position: number; is_everyone?: boolean; }
interface Member { role_ids?: string[]; nickname?: string | null; user?: { username?: string; display_name?: string | null }; }
interface Roles { byServer: Record<string, { roles?: Role[] } | undefined>; }
interface Members { byServer: Record<string, { membersById?: Record<string, Member> } | undefined>; }

export default {
    id: "role-color-everywhere", name: "Role Color Everywhere", description: "Adds the top role colour anywhere possible: mentions, the message box, member list headers and optionally messages.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Roles", "Appearance"], enabledByDefault: false,
    settings: {
        "chat-mentions": { label: "Show role colors in chat mentions (including in the message box)", default: true },
        "member-list": { label: "Show role colors in member list role headers", default: true },
        "color-chat-messages": { label: "Color chat messages based on the author's role color", default: false },
        "message-color-intensity": { label: "Intensity of message coloring", default: 30, min: 0, max: 100 }
    },
    start({ settings, api }) {
        const roles = flackleStore<Roles>("setRolesSnapshot");
        const members = flackleStore<Members>("fetchMentionedMembers");
        if (!roles || !members) throw new Error("Flackle's role or member store was not found");
        const currentServer = (): string | undefined => /^\/app\/channels\/(\d+)\//.exec(location.pathname)?.[1];
        const rolesOf = (serverId: string): Role[] => roles.getState().byServer[serverId]?.roles ?? [];
        const colorOf = (serverId: string | undefined, member: Member | undefined): string | undefined =>
            serverId && member?.role_ids ? roleColor(rolesOf(serverId), member.role_ids) : undefined;
        const memberById = (serverId: string | undefined, userId: string | undefined): Member | undefined =>
            serverId && userId ? members.getState().byServer[serverId]?.membersById?.[userId] : undefined;
        const paint = (element: HTMLElement, color: string | undefined, background: boolean): (() => void) | undefined => {
            if (!color) return undefined;
            element.style.color = color;
            if (background) element.style.backgroundColor = `color-mix(in srgb, ${color} 18%, transparent)`;
            return () => { element.style.removeProperty("color"); element.style.removeProperty("background-color"); };
        };
        if (settings["chat-mentions"] !== false) {
            api.observe('button[data-user-card-trigger][class*="5865F2"]', mention => {
                let serverId = currentServer();
                for (const props of fiberProps(mention, 3)) if (typeof props.serverId === "string") { serverId = props.serverId; break; }
                return paint(mention, colorOf(serverId, memberById(serverId, mention.dataset.userCardTrigger)), true);
            });
            api.observe(".rich-composer-input ~ * span.absolute > span.truncate.px-1", label => {
                const chip = label.parentElement!;
                let undo: (() => void) | undefined;
                const update = (): void => {
                    undo?.(); undo = undefined;
                    const text = label.textContent ?? "", serverId = currentServer();
                    if (!text.startsWith("@") || !serverId) return;
                    const name = text.slice(1);
                    const member = Object.values(members.getState().byServer[serverId]?.membersById ?? {}).find(entry => [entry.nickname, entry.user?.display_name, entry.user?.username].includes(name));
                    undo = paint(chip, colorOf(serverId, member), true);
                };
                const watch = new MutationObserver(update); watch.observe(label, { childList: true, characterData: true, subtree: true }); update();
                return () => { watch.disconnect(); undo?.(); };
            });
        }
        if (settings["member-list"] !== false) api.observe(".server-member-list-content div.text-xs.font-medium > span.truncate", header => {
            const serverId = currentServer(); const name = header.firstChild?.textContent?.trim();
            const color = serverId && name ? rolesOf(serverId).find(role => role.name === name && !role.is_everyone)?.color : undefined;
            return paint(header, color ?? undefined, false);
        });
        if (settings["color-chat-messages"] === true) {
            const intensity = Math.min(100, Math.max(0, Number(settings["message-color-intensity"]) || 0));
            api.observe("[data-message-id] [data-message-content]", content => {
                for (const props of fiberProps(content.closest("[data-message-id]")!, 3)) {
                    const message = props.message as { sender?: { id?: unknown } } | undefined;
                    if (!message) continue;
                    const serverId = typeof props.guildServerId === "string" ? props.guildServerId : undefined;
                    const color = colorOf(serverId, memberById(serverId, typeof message.sender?.id === "string" ? message.sender.id : undefined));
                    if (!color) return undefined;
                    content.style.color = `color-mix(in oklab, ${color} ${intensity}%, currentColor)`;
                    return () => content.style.removeProperty("color");
                }
                return undefined;
            });
        }
    }
} satisfies Plugin;
