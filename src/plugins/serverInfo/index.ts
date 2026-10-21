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
import { flackleExport, flackleStore, type FlackleStore } from "../../components/flackleStores";
import { openModal } from "../../components/modal";
import { element } from "../../components/primitives";

interface User { id: string; username?: string; display_name?: string | null; avatar_url?: string | null; }
interface Server { id: string; name: string; icon_url?: string | null; banner_url?: string | null; owner_id?: string; created_at?: string; approx_member_count?: number; approx_presence_count?: number; }
interface Member { user?: User; nickname?: string | null; joined_at?: string; }
interface Servers { servers: Server[]; }
interface Members { byServer: Record<string, { membersById?: Record<string, Member> } | undefined>; fetchMembers(serverId: string): Promise<void>; }
interface Roles { byServer: Record<string, { roles?: unknown[] } | undefined>; fetchRoles(serverId: string): Promise<unknown>; }
interface Channels { byServer: Record<string, { channels?: unknown[] } | undefined>; fetchServerChannels(serverId: string): Promise<unknown>; }
interface Social { friends: User[]; blockedUsers: User[]; }
const https = (url?: string | null): string | undefined => url?.startsWith("https://") ? url : undefined;
const nameOf = (user?: User, member?: Member): string => member?.nickname || user?.display_name || user?.username || "Unknown";
const date = (value?: string): string => { const time = Date.parse(value ?? ""); return time ? new Date(time).toLocaleString(undefined, { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }) : "-"; };

function avatar(user: User | undefined, label: string): HTMLElement {
    const url = https(user?.avatar_url);
    if (url) { const image = element("img", "vackle-server-info-avatar"); image.src = url; image.alt = ""; return image; }
    return element("span", "vackle-server-info-avatar vackle-server-info-letter", label.charAt(0).toUpperCase());
}
function clickable(className: string, open: (() => void) | undefined): HTMLElement {
    if (!open) return element("span", className);
    const node = element("button", className); node.type = "button"; node.addEventListener("click", open); return node;
}
function mention(user: User | undefined, member: Member | undefined, open?: () => void): HTMLElement {
    const pill = clickable("vackle-server-info-mention", open); const name = nameOf(user, member);
    pill.append(avatar(user, name), `@${name}`); return pill;
}
function person(user: User | undefined, member: Member | undefined, open?: () => void): HTMLElement {
    const row = clickable("vackle-server-info-person", open); const name = nameOf(user, member);
    row.append(avatar(user, name), element("span", "", name)); return row;
}

export default {
    id: "server-info", name: "Server Info", description: "Allows you to view info about a server.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Servers", "Utility"], enabledByDefault: false,
    async start({ resources, api }) {
        const servers = flackleStore<Servers>("removeServer"), members = flackleStore<Members>("fetchMentionedMembers");
        const roles = flackleStore<Roles>("setRolesSnapshot"), channels = flackleStore<Channels>("fetchServerChannels");
        const social = flackleStore<Social>("removeFriendBySnowflake");
        const profiles = flackleStore<{ openProfileModal(user: User, serverId?: string): void }>("openProfileModal");
        const auth = flackleExport<FlackleStore<{ user?: User | null }>>("useAuthStore:()=>", value => typeof (value as { getState?: unknown } | undefined)?.getState === "function" && "user" in ((value as FlackleStore<object>).getState()));
        if (!servers || !members || !roles || !channels || !social || !auth) throw new Error("One of Flackle's server, member, role, channel, friend or account stores was not found");
        let close: (() => void) | undefined;
        resources.add(() => close?.());
        const open = (server: Server): void => {
            const body = element("div", "vackle-server-info");
            const banner = https(server.banner_url);
            const tabs = element("div", "vackle-server-info-tabs"); tabs.setAttribute("role", "tablist");
            const panel = element("div", "vackle-server-info-panel"); panel.setAttribute("role", "tabpanel");
            let current = "Server Info";
            const memberOf = (id?: string): Member | undefined => id ? members.getState().byServer[server.id]?.membersById?.[id] : undefined;
            const profile = (user?: User): (() => void) | undefined => user && profiles ? () => { close?.(); profiles.getState().openProfileModal(user, server.id); } : undefined;
            const inServer = (users: User[]): User[] => users.filter(user => memberOf(user.id));
            const render = (): void => {
                const friends = inServer(social.getState().friends), blocked = inServer(social.getState().blockedUsers);
                const loaded = Boolean(members.getState().byServer[server.id]?.membersById);
                tabs.replaceChildren(...[["Server Info", ""], ["Friends", loaded ? ` (${friends.length})` : ""], ["Blocked Users", loaded ? ` (${blocked.length})` : ""]].map(([tab, count]) => {
                    const button = element("button", "vackle-server-info-tab", `${tab}${count}`); button.type = "button";
                    button.setAttribute("role", "tab"); button.setAttribute("aria-selected", String(tab === current));
                    button.addEventListener("click", () => { current = tab!; render(); });
                    return button;
                }));
                panel.replaceChildren();
                bannerImage?.toggleAttribute("hidden", current !== "Server Info");
                if (current === "Server Info") {
                    const owner = memberOf(server.owner_id);
                    const serverChannels = channels.getState().byServer[server.id]?.channels, serverRoles = roles.getState().byServer[server.id]?.roles;
                    const facts: [string, string | HTMLElement][] = [
                        ["Server Owner", owner ? mention(owner.user, owner, profile(owner.user)) : loaded ? "-" : "Loading..."],
                        ["Created At", date(server.created_at)],
                        ["Joined At", date(memberOf(auth.getState().user?.id)?.joined_at)],
                        ["Members", server.approx_member_count === undefined ? "?" : `${server.approx_member_count} (${server.approx_presence_count ?? 0} online)`],
                        ["Channels", serverChannels ? String(serverChannels.length) : "?"],
                        ["Roles", serverRoles ? String(Math.max(0, serverRoles.length - 1)) : "?"]
                    ];
                    const grid = element("div", "vackle-server-info-facts");
                    for (const [label, value] of facts) { const pair = element("div"); const text = element("div", "vackle-server-info-value"); text.append(value); pair.append(element("h3", "", label), text); grid.append(pair); }
                    panel.append(grid);
                } else {
                    const users = current === "Friends" ? friends : blocked;
                    if (!loaded) panel.append(element("p", "vackle-server-info-empty", "Loading..."));
                    else if (!users.length) panel.append(element("p", "vackle-server-info-empty", current === "Friends" ? "None of your friends are in this server." : "No blocked users are in this server."));
                    else panel.append(...users.map(user => person(user, memberOf(user.id), profile(memberOf(user.id)?.user ?? user))));
                }
            };
            const bannerImage = banner ? element("img", "vackle-server-info-banner") : undefined;
            if (bannerImage) { bannerImage.src = banner!; bannerImage.alt = ""; body.append(bannerImage); }
            body.append(tabs, panel); render();
            const unsubscribe = [members.subscribe(render), roles.subscribe(render), channels.subscribe(render), social.subscribe(render)];
            close?.();
            close = openModal(document.body, server.name, body, () => { for (const stop of unsubscribe) stop(); close = undefined; });
            body.parentElement!.classList.add("vackle-server-info-modal");
            const icon = https(server.icon_url), title = body.previousElementSibling!.firstElementChild!;
            const badge = icon ? element("img", "vackle-server-info-icon") : element("span", "vackle-server-info-icon vackle-server-info-letter", server.name.charAt(0).toUpperCase());
            if (badge instanceof HTMLImageElement) { badge.src = icon!; badge.alt = ""; }
            title.before(badge);
            for (const load of [() => members.getState().fetchMembers(server.id), () => roles.getState().fetchRoles(server.id), () => channels.getState().fetchServerChannels(server.id)])
                Promise.resolve().then(load).catch(error => api.notify(`Couldn't load server info: ${error instanceof Error ? error.message : String(error)}`, "error"));
        };
        const serverOf = (target: HTMLElement): Server | undefined => servers.getState().servers.find(server => server.id === target.dataset.railIcon);
        api.contextMenu({ id: "server-info", label: "Server Info", icon: "info", after: "Notification Settings", selector: "a[data-rail-icon]", matches: target => serverOf(target) !== undefined, run: target => { const server = serverOf(target); if (server) open(server); } });
        await resources.style(".vackle-modal.vackle-server-info-modal{width:min(570px,100%);max-height:min(720px,calc(100vh - 32px))}.vackle-server-info-modal .vackle-modal-header{justify-content:flex-start;padding:18px 12px 4px 20px}.vackle-server-info-modal .vackle-modal-header h2{flex:1;font-size:16px}.vackle-server-info{gap:16px}.vackle-server-info-icon{flex-shrink:0;width:44px;height:44px;border-radius:12px;object-fit:cover}.vackle-server-info-letter{display:inline-grid;place-items:center;background:rgb(255 255 255 / .1);color:#fff;font-weight:600}.vackle-server-info-banner{display:block;width:100%;height:auto;max-height:320px;border-radius:6px;object-fit:cover}.vackle-server-info-banner[hidden]{display:none}.vackle-server-info-tabs{display:flex;gap:28px;padding:0 4px;border-bottom:1px solid rgb(255 255 255 / .08)}.vackle-server-info-tab{margin-bottom:-1px;padding:8px 0;border:0;border-bottom:2px solid transparent;background:none;color:rgb(255 255 255 / .6);font:inherit;font-size:13px;font-weight:500;cursor:pointer}.vackle-server-info-tab:hover{color:rgb(255 255 255 / .85)}.vackle-server-info-tab[aria-selected=true]{border-bottom-color:var(--ui-text-accent,#ef5252);color:var(--ui-text-accent,#ef5252)}.vackle-server-info-panel{display:flex;flex-direction:column;gap:8px;min-height:120px;padding:0 6px}.vackle-server-info-facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px 16px}.vackle-server-info-facts h3{margin:0 0 6px;color:#fff;font-size:14px;font-weight:600}.vackle-server-info-value{color:rgb(255 255 255 / .85);font-size:14px;overflow-wrap:anywhere}button.vackle-server-info-mention{border:0;font:inherit;cursor:pointer}button.vackle-server-info-mention:hover{background:rgb(88 101 242 / .55);color:#fff}button.vackle-server-info-person{width:100%;padding:4px 6px;border:0;border-radius:6px;background:none;font:inherit;text-align:left;cursor:pointer}button.vackle-server-info-person:hover{background:rgb(255 255 255 / .06)}.vackle-server-info-mention{display:inline-flex;align-items:center;gap:4px;max-width:100%;padding:0 4px 0 2px;border-radius:4px;background:rgb(88 101 242 / .3);color:#c9cdfb;font-weight:500}.vackle-server-info-mention .vackle-server-info-avatar{width:18px;height:18px;font-size:10px}.vackle-server-info-person{display:flex;align-items:center;gap:10px;min-width:0;padding:4px 0;color:#fff}.vackle-server-info-person span:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.vackle-server-info-avatar{flex-shrink:0;width:28px;height:28px;border-radius:50%;object-fit:cover;font-size:12px}.vackle-server-info-empty{color:rgb(255 255 255 / .5)}");
    }
} satisfies Plugin;
