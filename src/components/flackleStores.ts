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

export interface FlackleStore<S> { getState(): S; setState(partial: Partial<S>): void; subscribe(listener: (state: S, previous: S) => void): () => void; }
type Require = ((id: string) => Record<string, unknown>) & { m: Record<string, unknown> };
const cache = new WeakMap<Require, Map<string, unknown>>();

export function flackleExport<T>(needle: string, accept: (value: unknown, name: string) => boolean): T | undefined {
    let require: Require | undefined;
    const chunks = Reflect.get(window, Object.keys(window).find(name => name.startsWith("webpackChunk")) ?? "") as { push?(chunk: unknown): void } | undefined;
    chunks?.push?.([[Symbol("vackle")], {}, (found: Require) => { require = found; }]);
    if (!require) return undefined;
    const known = cache.get(require) ?? new Map<string, unknown>();
    cache.set(require, known);
    if (known.has(needle)) return known.get(needle) as T;
    for (const id of Object.keys(require.m)) {
        if (!String(require.m[id]).includes(needle)) continue;
        const found = Object.entries(require(id)).find(([name, value]) => accept(value, name));
        if (found) { known.set(needle, found[1]); return found[1] as T; }
    }
    return undefined;
}
export function flackleStore<S>(key: string): FlackleStore<S> | undefined {
    return flackleExport<FlackleStore<S>>(`${key}:`, value => {
        const store = value as Partial<FlackleStore<Record<string, unknown>>> | undefined;
        return typeof store?.getState === "function" && typeof store.getState()?.[key] !== "undefined";
    });
}
export interface FlackleUser { id: string; username?: string; display_name?: string | null; avatar_url?: string | null; banner_url?: string | null; }
export function flackleAuth<U = FlackleUser>(): FlackleStore<{ user?: U | null }> | undefined {
    return flackleExport("useAuthStore:()=>", value => typeof (value as { getState?: unknown } | undefined)?.getState === "function" && "user" in ((value as FlackleStore<object>).getState()));
}
export function flackleMe(): FlackleUser | null | undefined {
    return flackleAuth()?.getState().user;
}
export function flackleUser(id: string): FlackleUser | undefined {
    const members = flackleStore<{ byServer: Record<string, { membersById?: Record<string, { user?: FlackleUser }> } | undefined> }>("fetchMentionedMembers")?.getState().byServer ?? {};
    const conversations = flackleStore<{ conversations: { members?: { user?: FlackleUser }[] }[] }>("setActiveConversation")?.getState().conversations ?? [];
    const social = flackleStore<{ friends: FlackleUser[]; blockedUsers: FlackleUser[] }>("removeFriendBySnowflake")?.getState();
    const me = flackleMe();
    return (me?.id === id ? me : undefined)
        ?? Object.values(members).map(server => server?.membersById?.[id]?.user).find(Boolean)
        ?? conversations.flatMap(conversation => conversation.members ?? []).find(member => member.user?.id === id)?.user
        ?? [...social?.friends ?? [], ...social?.blockedUsers ?? []].find(user => user.id === id);
}
