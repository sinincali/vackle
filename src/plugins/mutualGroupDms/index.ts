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
import { fiberProps } from "../../components/reactFiber";

interface User { id?: string; display_name?: string | null; username?: string; avatar_url?: string | null; }
interface Conversation { id: string; type: string; name?: string | null; icon_url?: string | null; members?: { user?: User }[]; }
interface Server { id: string; name: string; icon_url?: string | null; }
interface Servers { servers: Server[]; settingsByServer: Record<string, { last_viewed_channel_id?: string } | undefined>; }
interface Members { fetchMember(serverId: string, userId: string): Promise<unknown>; }
interface Entry { name: string; image: string | null | undefined; path: string; }

const nameOf = (group: Conversation): string => group.name || group.members?.map(member => member.user?.display_name || member.user?.username).filter(Boolean).join(", ") || "Group";
const groupEntry = (group: Conversation): Entry => ({ name: nameOf(group), image: [group.icon_url, ...group.members?.map(member => member.user?.avatar_url) ?? []].find(src => src?.startsWith("https://")), path: `/app/conversations/${group.id}` });
function icon(entry: Entry, className: string): HTMLElement {
    if (entry.image?.startsWith("https://")) return Object.assign(document.createElement("img"), { src: entry.image, alt: "", className });
    return Object.assign(document.createElement("span"), { className: `${className} vackle-mutual-letter`, textContent: entry.name.charAt(0).toUpperCase() });
}

export default {
    id: "mutual-group-dms", name: "Mutual Group DMs", description: "Shows the group DMs and servers you share with someone on their profile card.",
    version: "1.2.0", author: "Xrm0s and contributors", tags: ["Social", "Profiles"], enabledByDefault: false,
    async start({ resources, api, log }) {
        const conversations = flackleStore<{ conversations: Conversation[] }>("setActiveConversation");
        const servers = flackleStore<Servers>("setServerNotificationLevel");
        const members = flackleStore<Members>("fetchMentionedMembers");
        if (!conversations || !servers || !members) throw new Error("Flackle's conversation, server or member store was not found");
        const shared = new Map<string, Promise<Entry[]>>();
        const mutualServers = (userId: string): Promise<Entry[]> => {
            const cached = shared.get(userId);
            if (cached) return cached;
            const { servers: list, settingsByServer } = servers.getState();
            const found: Promise<Entry[]> = Promise.all(list.map(async server => await members.getState().fetchMember(server.id, userId) ? [server] : []))
                .then(results => results.flat().map(server => ({ name: server.name, image: server.icon_url, path: `/app/channels/${server.id}${settingsByServer[server.id]?.last_viewed_channel_id ? `/${settingsByServer[server.id]!.last_viewed_channel_id}` : ""}` })));
            shared.set(userId, found);
            found.catch(() => shared.delete(userId));
            return found;
        };
        let closeList: (() => void) | undefined;
        resources.add(() => closeList?.());
        const openList = (anchor: HTMLElement, entries: Entry[]): void => {
            closeList?.();
            const list = Object.assign(document.createElement("div"), { className: "vackle-mutual-list" }); list.dataset.vackleRoot = ""; list.setAttribute("role", "menu");
            for (const entry of entries) {
                const item = Object.assign(document.createElement("button"), { type: "button", className: "vackle-mutual-item" }); item.setAttribute("role", "menuitem");
                item.append(icon(entry, "vackle-mutual-icon"), Object.assign(document.createElement("span"), { textContent: entry.name }));
                const go = (): void => {
                    closeList?.();
                    (window as { next?: { router?: { push(path: string): void } } }).next?.router?.push(entry.path);
                    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
                };
                item.addEventListener("pointerdown", event => { if (event.button === 0) go(); });
                item.addEventListener("click", go);
                list.append(item);
            }
            const box = anchor.getBoundingClientRect(); list.style.left = `${box.left}px`; list.style.top = `${box.bottom + 6}px`;
            const outside = (event: Event): void => { if (!list.contains(event.target as Node) && !anchor.contains(event.target as Node)) closeList?.(); };
            const escape = (event: KeyboardEvent): void => { if (event.key === "Escape") { event.stopPropagation(); closeList?.(); } };
            document.addEventListener("pointerdown", outside, true); window.addEventListener("keydown", escape, true);
            closeList = () => { list.remove(); document.removeEventListener("pointerdown", outside, true); window.removeEventListener("keydown", escape, true); closeList = undefined; };
            document.body.append(list); (list.firstElementChild as HTMLElement | null)?.focus();
        };
        const row = (entries: Entry[], noun: string): HTMLButtonElement => {
            const button = Object.assign(document.createElement("button"), { type: "button", className: "vackle-mutual-row" });
            button.setAttribute("aria-haspopup", "menu");
            const stack = Object.assign(document.createElement("span"), { className: "vackle-mutual-stack" });
            stack.append(...entries.slice(0, 3).map(entry => icon(entry, "vackle-mutual-mini")));
            button.append(stack, `${entries.length} Mutual ${noun}${entries.length === 1 ? "" : "s"}`);
            button.addEventListener("click", event => { event.stopPropagation(); if (closeList) closeList(); else openList(button, entries); });
            return button;
        };
        const profiles = flackleStore<{ target?: { user?: { id?: string } } | null }>("openProfileModal");
        const attach = (header: HTMLElement | null, userId: unknown): (() => void) | undefined => {
            if (!header || typeof userId !== "string" || userId === flackleMe()?.id) return undefined;
            const groups = conversations.getState().conversations.filter(conversation => conversation.type === "group" && conversation.members?.some(member => member.user?.id === userId)).map(groupEntry);
            const rows = Object.assign(document.createElement("div"), { className: "vackle-mutual-rows" });
            if (groups.length) rows.append(row(groups, "Group"));
            let live = true;
            mutualServers(userId).then(entries => { if (live && entries.length) { rows.append(row(entries, "Server")); } }).catch(error => log("Mutual servers failed", error));
            header.append(rows);
            return () => { live = false; closeList?.(); rows.remove(); };
        };
        api.observe('div.fixed button[aria-label$="full profile"]', avatar => {
            let userId: unknown;
            for (const props of fiberProps(avatar.querySelector("span") ?? avatar, 2)) userId ??= (props.user as { id?: unknown } | undefined)?.id ?? props.userId;
            return attach(avatar.parentElement, userId);
        });
        api.observe('[role="dialog"] div.w-30.h-30.rounded-full', frame => attach(frame.parentElement?.parentElement ?? null, profiles?.getState().target?.user?.id));
        await resources.style(".vackle-mutual-rows{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:6px}.vackle-mutual-rows:empty{display:none}.vackle-mutual-row{display:flex;align-items:center;gap:6px;padding:0;border:0;background:none;color:rgb(255 255 255 / .6);font:inherit;font-size:13px;cursor:pointer}.vackle-mutual-row:hover{color:#fff;text-decoration:underline}.vackle-mutual-stack{display:flex}.vackle-mutual-mini{width:18px;height:18px;margin-left:-5px;border-radius:50%;object-fit:cover;box-shadow:0 0 0 2px var(--ui-layer-raised,#18181d)}.vackle-mutual-mini:first-child{margin-left:0}.vackle-mutual-letter{display:inline-grid;place-items:center;background:rgb(255 255 255 / .12);color:#fff;font-size:10px;font-weight:600}.vackle-mutual-list{position:fixed;z-index:2147483646;box-sizing:border-box;width:240px;max-height:212px;overflow-y:auto;padding:4px;border-radius:12px;background:var(--ui-layer-bar,#121216);box-shadow:inset 0 0 0 1px rgb(255 255 255 / .06),0 8px 24px rgb(0 0 0 / .4);scrollbar-width:thin}.vackle-mutual-item{display:flex;align-items:center;gap:10px;width:100%;height:40px;padding:0 8px;border:0;border-radius:8px;background:transparent;color:rgb(255 255 255 / .85);font:inherit;font-size:14px;text-align:left;cursor:pointer}.vackle-mutual-item span:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.vackle-mutual-item:is(:hover,:focus-visible){background:rgb(255 255 255 / .06);color:#fff;outline:none}.vackle-mutual-icon{flex-shrink:0;width:28px;height:28px;border-radius:50%;object-fit:cover}");
    }
} satisfies Plugin;
