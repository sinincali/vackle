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
import { flackleAuth, flackleStore, type FlackleStore } from "../../components/flackleStores";
import { fiberProps } from "../../components/reactFiber";

interface User { id: string; username?: string; display_name?: string | null; avatar_url?: string | null; }
interface Typing { typingUsers: Record<string, { userId: string }[] | undefined>; }
interface Mute { muted?: boolean; muted_until?: string | null; }
interface Servers { settingsByServer: Record<string, Mute | undefined>; getChannelSetting(serverId: string, channelId: string): Mute | undefined; }
interface Members { byServer: Record<string, { membersById?: Record<string, { user?: User; nickname?: string | null }> } | undefined>; }
interface Conversations { conversations: { id: string; members?: { user?: User }[] }[]; }
interface Social { friends: User[]; blockedUsers: User[]; }
const muted = (setting?: Mute): boolean => setting?.muted === true || Date.parse(setting?.muted_until ?? "") > Date.now();
export function typingSummary(names: readonly string[]): string {
    if (names.length === 1) return `${names[0]} is typing...`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
    if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]} are typing...`;
    return "Several people are typing...";
}

export default {
    id: "typing-indicator", name: "Typing Indicator", description: "Adds an indicator if someone is typing on a channel.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Notifications", "Appearance", "Servers"], enabledByDefault: false,
    settings: {
        "include-current-channel": { label: "Whether to show the typing indicator for the currently selected channel", default: true },
        "include-muted-channels": { label: "Whether to show the typing indicator for muted channels.", default: false },
        "include-blocked-users": { label: "Whether to show the typing indicator for blocked users.", default: false },
        "indicator-mode": { label: "How should the indicator be displayed?", default: "Avatars and animated dots", options: ["Avatars and animated dots", "Animated dots", "Avatars"] }
    },
    async start({ settings, resources, api }) {
        const typing = flackleStore<Typing>("sendGuildTypingStart"), servers = flackleStore<Servers>("getChannelSetting");
        const members = flackleStore<Members>("fetchMentionedMembers"), conversations = flackleStore<Conversations>("setActiveConversation");
        const social = flackleStore<Social>("removeFriendBySnowflake");
        const auth = flackleAuth<User>();
        if (!typing || !servers || !members || !conversations || !social || !auth) throw new Error("One of Flackle's typing, server, member, conversation, friend or account stores was not found");
        const mode = String(settings["indicator-mode"]);
        const rows = new Map<HTMLElement, { key: string; serverId?: string; channelId?: string; badge: HTMLElement }>();
        const userOf = (id: string, serverId?: string): User | undefined => (serverId ? members.getState().byServer[serverId]?.membersById?.[id]?.user : undefined)
            ?? conversations.getState().conversations.flatMap(conversation => conversation.members ?? []).find(member => member.user?.id === id)?.user
            ?? social.getState().friends.find(friend => friend.id === id);
        const nameOf = (id: string, serverId?: string): string => {
            const member = serverId ? members.getState().byServer[serverId]?.membersById?.[id] : undefined; const user = userOf(id, serverId);
            return member?.nickname || user?.display_name || user?.username || "Someone";
        };
        const paint = (row: HTMLElement): void => {
            const entry = rows.get(row)!;
            const me = auth.getState().user?.id, blocked = new Set(social.getState().blockedUsers.map(user => user.id));
            const current = location.pathname === row.getAttribute("href") || location.pathname === `/app/conversations/${entry.key}`;
            const silenced = (settings["include-current-channel"] === false && current) || (settings["include-muted-channels"] !== true && entry.serverId
                && (muted(servers.getState().settingsByServer[entry.serverId]) || muted(servers.getState().getChannelSetting(entry.serverId, entry.channelId!))));
            const ids = silenced ? [] : (typing.getState().typingUsers[entry.key] ?? []).map(user => user.userId)
                .filter(id => id !== me && (settings["include-blocked-users"] === true || !blocked.has(id)));
            entry.badge.hidden = !ids.length;
            if (!ids.length) { entry.badge.replaceChildren(); return; }
            entry.badge.title = typingSummary(ids.map(id => nameOf(id, entry.serverId)));
            const parts: HTMLElement[] = [];
            if (mode !== "Animated dots") {
                const stack = Object.assign(document.createElement("span"), { className: "vackle-typing-avatars" });
                for (const id of ids.slice(0, 3)) {
                    const url = userOf(id, entry.serverId)?.avatar_url;
                    stack.append(url?.startsWith("https://") ? Object.assign(document.createElement("img"), { src: url, alt: "" }) : Object.assign(document.createElement("span"), { textContent: nameOf(id, entry.serverId).charAt(0).toUpperCase() }));
                }
                parts.push(stack);
            }
            if (mode !== "Avatars") { const dots = Object.assign(document.createElement("span"), { className: "vackle-typing-dots" }); dots.append(document.createElement("i"), document.createElement("i"), document.createElement("i")); parts.push(dots); }
            entry.badge.replaceChildren(...parts);
        };
        const paintAll = (): void => { for (const row of rows.keys()) paint(row); };
        const attach = (row: HTMLElement, key: string | undefined, serverId?: string, channelId?: string): (() => void) | undefined => {
            if (!key) return undefined;
            const badge = Object.assign(document.createElement("span"), { className: "vackle-typing-indicator", hidden: true }); badge.setAttribute("aria-hidden", "true");
            row.append(badge); rows.set(row, { key, badge, ...serverId ? { serverId } : {}, ...channelId ? { channelId } : {} }); paint(row);
            return () => { rows.delete(row); badge.remove(); };
        };
        api.observe('a[data-sidebar-context-owner][href^="/app/channels/"]', link => {
            const [, serverId, channelId] = /^\/app\/channels\/(\d+)\/(\d+)$/.exec(link.getAttribute("href") ?? "") ?? [];
            return serverId && channelId ? attach(link, `g:${serverId}:${channelId}`, serverId, channelId) : undefined;
        });
        api.observe('div[role="button"][aria-label^="Open conversation with"]', row => {
            for (const props of fiberProps(row, 3)) { const id = (props.conversation as { id?: unknown } | undefined)?.id; if (typeof id === "string") return attach(row, id); }
            return undefined;
        });
        for (const store of [typing, servers, members, social] as FlackleStore<unknown>[]) resources.add(store.subscribe(paintAll));
        api.onRoute(paintAll);
        await resources.style(".vackle-typing-indicator{display:inline-flex;align-items:center;gap:7px;flex-shrink:0;margin-left:auto;padding-left:4px}.vackle-typing-indicator[hidden]{display:none}.vackle-typing-avatars{display:flex}.vackle-typing-avatars>*{display:inline-grid;place-items:center;width:16px;height:16px;margin-left:-4px;border-radius:50%;object-fit:cover;background:rgb(255 255 255 / .15);color:#fff;font-size:9px;font-weight:600;box-shadow:0 0 0 2px var(--ui-layer-bar,#121216)}.vackle-typing-avatars>:first-child{margin-left:0}.vackle-typing-dots{display:inline-flex;gap:2px}.vackle-typing-dots i{width:4px;height:4px;border-radius:50%;background:currentColor;opacity:.4;animation:vackle-typing-dot 1.2s infinite ease-in-out}.vackle-typing-dots i:nth-child(2){animation-delay:.15s}.vackle-typing-dots i:nth-child(3){animation-delay:.3s}@keyframes vackle-typing-dot{0%,60%,100%{opacity:.35;transform:none}30%{opacity:1;transform:translateY(-2px)}}");
    }
} satisfies Plugin;
