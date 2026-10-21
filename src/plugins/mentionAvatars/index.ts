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
import { fiberProps } from "../../components/reactFiber";

interface User { id?: string; username?: string; display_name?: string | null; avatar_url?: string | null; }
interface Member { user?: User; nickname?: string | null; }

export default {
    id: "mention-avatars", name: "Mention Avatars", description: "Shows the user's avatar next to @mentions in messages and in the message box.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Appearance", "Chat"], enabledByDefault: false,
    async start({ resources, api }) {
        api.observe('button[data-user-card-trigger][class*="5865F2"]', mention => {
            for (const props of fiberProps(mention, 3)) {
                const avatar = (props.user as { avatar_url?: unknown } | undefined)?.avatar_url;
                if (typeof avatar !== "string" || !avatar.startsWith("https://")) continue;
                const image = document.createElement("img"); image.src = avatar; image.alt = ""; image.className = "vackle-mention-avatar";
                mention.prepend(image);
                return () => image.remove();
            }
        });
        const conversations = flackleStore<{ conversations: { id: string; members?: Member[] }[] }>("setActiveConversation");
        const servers = flackleStore<{ byServer: Record<string, { membersById?: Record<string, Member> } | undefined> }>("fetchMentionedMembers");
        const avatarOf = (name: string): string | undefined => {
            const server = /^\/app\/channels\/(\d+)\//.exec(location.pathname)?.[1];
            const conversation = /^\/app\/conversations\/(\d+)/.exec(location.pathname)?.[1];
            const members = server ? Object.values(servers?.getState().byServer[server]?.membersById ?? {}) : conversations?.getState().conversations.find(entry => entry.id === conversation)?.members ?? [];
            const avatar = members.find(member => [member.nickname, member.user?.display_name, member.user?.username].includes(name))?.user?.avatar_url;
            return avatar?.startsWith("https://") ? avatar : undefined;
        };
        api.observe(".rich-composer-input ~ * span.absolute > span.truncate.px-1", label => {
            const chip = label.parentElement!;
            const overlay = Object.assign(document.createElement("span"), { className: "vackle-chip-overlay" });
            const image = Object.assign(document.createElement("img"), { alt: "", className: "vackle-chip-avatar" });
            const name = Object.assign(document.createElement("span"), { className: "vackle-chip-name" });
            overlay.append(image, name);
            const update = (): void => {
                const text = label.textContent ?? ""; const avatar = text.startsWith("@") ? avatarOf(text.slice(1)) : undefined;
                label.classList.toggle("vackle-chip-hidden", Boolean(avatar));
                if (!avatar) { overlay.remove(); return; }
                const range = document.createRange(); const node = label.firstChild;
                if (node?.nodeType === Node.TEXT_NODE) { range.setStart(node, 0); range.setEnd(node, 1); }
                const room = Math.floor(range.getBoundingClientRect().width) || 13; const gap = Math.max(0, Math.min(4, room - 10));
                image.style.width = image.style.height = `${room - gap}px`; image.style.marginRight = `${gap}px`;
                if (image.src !== avatar) image.src = avatar;
                name.textContent = text.slice(1);
                if (!overlay.isConnected) chip.append(overlay);
            };
            const watch = new MutationObserver(update); watch.observe(label, { childList: true, characterData: true, subtree: true }); update();
            return () => { watch.disconnect(); overlay.remove(); label.classList.remove("vackle-chip-hidden"); };
        });
        await resources.style(".vackle-chip-hidden{color:transparent!important}.vackle-chip-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:0 4px;pointer-events:none}.vackle-chip-avatar{flex-shrink:0;border-radius:50%;object-fit:cover}.vackle-chip-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.vackle-mention-avatar{display:inline-block;width:1em;height:1em;margin:-.25em .25em -.25em 0;border-radius:50%;object-fit:cover;vertical-align:middle}");
    }
} satisfies Plugin;
