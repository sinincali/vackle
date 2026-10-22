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
import { flackleAuth, flackleStore } from "../../components/flackleStores";
import { roleColor, type ServerRole } from "../../components/flackleRole";
import { fiberProps } from "../../components/reactFiber";

interface User { id: string; username?: string; display_name?: string | null; avatar_url?: string | null; banner_url?: string | null; }
interface Typing { typingUsers: Record<string, { userId: string }[] | undefined>; }
interface Members { byServer: Record<string, { membersById?: Record<string, { user?: User; role_ids?: string[] }> } | undefined>; }
interface Roles { byServer: Record<string, { roles?: ServerRole[] } | undefined>; }
interface Conversations { conversations: { id: string; members?: { user?: User }[] }[]; }
interface Social { friends: User[]; blockedUsers: User[]; }
export const typingTail = (count: number, alternative: boolean): string =>
    count === 1 ? " is typing..." : count === 2 ? " are typing..." : alternative ? ` and ${count - 2} other${count === 3 ? "" : "s"} are typing...` : " and others are typing...";

export default {
    id: "typing-tweaks", name: "Typing Tweaks", description: "Show avatars and role colours in the typing indicator.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Appearance", "Customisation"], enabledByDefault: false,
    settings: {
        "show-avatars": { label: "Show avatars in the typing indicator", default: true },
        "show-role-colors": { label: "Show role colors in the typing indicator", default: true },
        "alternative-formatting": { label: "Show a more useful message when several users are typing", default: true }
    },
    async start({ settings, resources, api }) {
        const typing = flackleStore<Typing>("sendGuildTypingStart"), members = flackleStore<Members>("fetchMentionedMembers");
        const roles = flackleStore<Roles>("setRolesSnapshot"), conversations = flackleStore<Conversations>("setActiveConversation");
        const social = flackleStore<Social>("removeFriendBySnowflake"), profiles = flackleStore<{ openProfileModal(user: User, serverId?: string): void }>("openProfileModal");
        const auth = flackleAuth<User>();
        if (!typing || !members || !roles || !conversations || !social || !auth) throw new Error("One of Flackle's typing, member, role, conversation, friend or account stores was not found");
        api.observe("div.flex.items-center.gap-1\\.5.text-sm.font-medium.min-w-0", line => {
            let conversationId: string | undefined;
            for (const props of fiberProps(line, 4)) if (typeof props.conversationId === "string") { conversationId = props.conversationId; break; }
            if (!conversationId) return undefined;
            const key = conversationId, serverId = /^g:(\d+):/.exec(key)?.[1];
            const ours = Object.assign(document.createElement("span"), { className: "vackle-typing-line" });
            const userOf = (id: string): User | undefined => (serverId ? members.getState().byServer[serverId]?.membersById?.[id]?.user : undefined)
                ?? conversations.getState().conversations.find(conversation => conversation.id === key)?.members?.find(member => member.user?.id === id)?.user
                ?? social.getState().friends.find(friend => friend.id === id);
            const render = (): void => {
                const me = auth.getState().user?.id, blocked = new Set(social.getState().blockedUsers.map(user => user.id));
                const ids = (typing.getState().typingUsers[key] ?? []).map(user => user.userId).filter(id => id !== me && !blocked.has(id));
                const tail = [...line.querySelectorAll(":scope > span")].pop()?.textContent ?? "";
                const custom = ids.length === 1 && !/ is typing\.\.\.$/.test(tail) ? tail.slice(tail.indexOf(" ")) : undefined;
                const names = ids.slice(0, ids.length > 3 ? 2 : 3).map(id => {
                    const user = userOf(id), name = user?.display_name || user?.username || "Someone";
                    const strong = Object.assign(document.createElement("strong"), { className: "vackle-typing-user" });
                    if (settings["show-avatars"] !== false) {
                        const url = user?.avatar_url;
                        strong.append(url?.startsWith("https://") ? Object.assign(document.createElement("img"), { src: url, alt: "" }) : Object.assign(document.createElement("span"), { className: "vackle-typing-letter", textContent: name.charAt(0).toUpperCase() }));
                    }
                    strong.append(name);
                    const ids = serverId ? members.getState().byServer[serverId]?.membersById?.[id]?.role_ids : undefined;
                    const color = settings["show-role-colors"] !== false && serverId && ids ? roleColor(roles.getState().byServer[serverId]?.roles ?? [], ids) : undefined;
                    if (color) strong.style.color = color;
                    if (user && profiles) { strong.setAttribute("role", "button"); strong.tabIndex = 0; strong.addEventListener("click", () => profiles.getState().openProfileModal(user, serverId)); }
                    return strong;
                });
                const parts: (Node | string)[] = [];
                names.forEach((name, index) => { if (index) parts.push(index === names.length - 1 && ids.length <= 3 ? " and " : ", "); parts.push(name); });
                parts.push(custom ?? typingTail(ids.length, settings["alternative-formatting"] !== false));
                ours.replaceChildren(...parts);
                line.classList.toggle("vackle-typing-tweaked", ids.length > 0);
                if (ours.parentElement !== line || line.lastElementChild !== ours) line.append(ours);
            };
            const watch = new MutationObserver(records => { if (records.some(record => record.target !== ours && !ours.contains(record.target))) render(); });
            watch.observe(line, { childList: true, subtree: true, characterData: true });
            const unsubscribe = [typing.subscribe(render), members.subscribe(render), roles.subscribe(render)];
            render();
            return () => { watch.disconnect(); for (const stop of unsubscribe) stop(); ours.remove(); line.classList.remove("vackle-typing-tweaked"); };
        });
        await resources.style(".vackle-typing-tweaked>:not(:first-child):not(.vackle-typing-line){display:none!important}.vackle-typing-line{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.vackle-typing-user{display:inline-flex;align-items:center;gap:4px;vertical-align:bottom;color:rgb(255 255 255 / .8);font-weight:600;cursor:pointer}.vackle-typing-user:hover{text-decoration:underline}.vackle-typing-user>img,.vackle-typing-letter{width:16px;height:16px;border-radius:50%;object-fit:cover}.vackle-typing-letter{display:inline-grid;place-items:center;background:rgb(255 255 255 / .15);color:#fff;font-size:9px}");
    }
} satisfies Plugin;
