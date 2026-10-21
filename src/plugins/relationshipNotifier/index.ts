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

interface User { id: string; username?: string; display_name?: string | null; avatar_url?: string | null; }
interface Social { friends: User[]; incomingRequests: { id: string; sender?: User }[]; }
interface Servers { servers: { id: string; name?: string; icon_url?: string | null }[]; }
interface Conversations { conversations: { id: string; type: string; name?: string | null; icon_url?: string | null }[]; }
const nameOf = (user?: User): string => user?.display_name || user?.username || "Someone";
export const gone = <T extends { id: string }>(now: readonly T[], before: readonly T[]): T[] =>
    now.length === 0 && before.length > 1 ? [] : before.filter(entry => !now.some(other => other.id === entry.id));

export default {
    id: "relationship-notifier", name: "Relationship Notifier", description: "Notifies you when a friend removes you, a friend request is cancelled, or you're removed from a server or group.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Notifications", "Friends"], enabledByDefault: false,
    settings: {
        friends: { label: "Notify when a friend removes you", default: true },
        requests: { label: "Notify when a friend request to you is cancelled", default: true },
        servers: { label: "Notify when you're removed from a server", default: true },
        groups: { label: "Notify when you're removed from a group", default: true }
    },
    start({ settings, resources, api }) {
        const social = flackleStore<Social>("removeFriendBySnowflake");
        const servers = flackleStore<Servers>("removeServer");
        const conversations = flackleStore<Conversations>("leaveGroup");
        if (!social || !servers || !conversations) throw new Error("Flackle's friend, server or conversation store was not found");
        const mine = new Map<string, number>();
        api.patch(globalThis, "fetch", fetch => (...args: unknown[]) => {
            const [input, init] = args as [RequestInfo | URL, RequestInit | undefined];
            const method = init?.method ?? (input instanceof Request ? input.method : "GET");
            if (method.toUpperCase() !== "GET") {
                const text = `${input instanceof Request ? input.url : String(input)} ${typeof init?.body === "string" ? init.body : ""}`;
                for (const id of text.match(/\d{15,}/g) ?? []) mine.set(id, Date.now() + 15000);
            }
            return fetch(...args);
        });
        const notify = (message: string, name: string, url?: string | null): void => api.notify(message, "info", { duration: 8000, ...url ? { avatar: { url, before: name } } : {} });
        const theirs = (...ids: (string | undefined)[]): boolean => ids.every(id => !id || (mine.get(id) ?? 0) < Date.now());
        const timers = new Set<ReturnType<typeof setTimeout>>();
        resources.add(() => { for (const timer of timers) clearTimeout(timer); });
        const later = (check: () => void): void => { const timer = setTimeout(() => { timers.delete(timer); check(); }, 3000); timers.add(timer); };
        resources.add(social.subscribe((now, before) => {
            if (settings.friends !== false) for (const friend of gone(now.friends, before.friends)) later(() => {
                if (theirs(friend.id) && !social.getState().friends.some(entry => entry.id === friend.id)) notify(`${nameOf(friend)} removed you as a friend`, nameOf(friend), friend.avatar_url);
            });
            if (settings.requests !== false) for (const request of gone(now.incomingRequests, before.incomingRequests)) later(() => {
                const state = social.getState();
                if (theirs(request.id, request.sender?.id) && !state.friends.some(friend => friend.id === request.sender?.id) && !state.incomingRequests.some(entry => entry.id === request.id))
                    notify(`${nameOf(request.sender)} cancelled their friend request`, nameOf(request.sender), request.sender?.avatar_url);
            });
        }));
        resources.add(servers.subscribe((now, before) => {
            if (settings.servers !== false) for (const server of gone(now.servers, before.servers)) later(() => {
                if (theirs(server.id) && !servers.getState().servers.some(entry => entry.id === server.id)) notify(`You were removed from the server ${server.name ?? server.id}`, server.name ?? server.id, server.icon_url);
            });
        }));
        resources.add(conversations.subscribe((now, before) => {
            if (settings.groups !== false) for (const group of gone(now.conversations, before.conversations)) if (group.type === "group") later(() => {
                if (theirs(group.id) && !conversations.getState().conversations.some(entry => entry.id === group.id)) notify(`You were removed from the group ${group.name || "chat"}`, group.name || "chat", group.icon_url);
            });
        }));
    }
} satisfies Plugin;
