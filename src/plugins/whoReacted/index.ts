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
import { flackleStore, flackleUser, type FlackleUser } from "../../components/flackleStores";
import { fiberProps } from "../../components/reactFiber";

interface Reaction { emoji?: string; count?: number; users?: FlackleUser[]; }
const reactionOf = (pill: Element): Reaction | undefined => {
    for (const props of fiberProps(pill, 5)) if (props.reaction && typeof props.reaction === "object") return props.reaction as Reaction;
    return undefined;
};

export default {
    id: "who-reacted", name: "Who Reacted", description: "Renders the avatars of users who reacted to a message.",
    version: "1.1.0", author: "Xrm0s and contributors", tags: ["Chat", "Reactions"], enabledByDefault: false,
    settings: { "avatar-click": { label: "While this is enabled, clicking a reacting user's avatar will open their profile instead of adding the reaction", default: true } },
    async start({ settings, resources, api }) {
        const profiles = flackleStore<{ openProfileModal(user: FlackleUser, serverId?: string): void }>("openProfileModal");
        const messages = flackleStore<{ cache: Record<string, { messages: { id: string; reactions?: Reaction[] }[] } | undefined> }>("addOptimisticMessage");
        if (!messages) throw new Error("Flackle's message store was not found");
        const clickable = settings["avatar-click"] !== false && profiles !== undefined;
        const avatars = new Map<string, string | undefined>();
        const avatarOf = (user: FlackleUser): string | undefined => {
            if (user.avatar_url) return user.avatar_url;
            if (!avatars.get(user.id)) avatars.set(user.id, flackleUser(user.id)?.avatar_url ?? undefined);
            return avatars.get(user.id);
        };
        const thumbs = new Map<string, ImageBitmap>();
        const loading = new Map<string, Promise<ImageBitmap | undefined>>();
        resources.add(() => { for (const bitmap of thumbs.values()) bitmap.close(); });
        const thumb = (url: string): Promise<ImageBitmap | undefined> => {
            if (!loading.has(url)) loading.set(url, (async () => {
                const image = Object.assign(new Image(), { src: url });
                await image.decode();
                const side = Math.min(image.naturalWidth, image.naturalHeight);
                const bitmap = await createImageBitmap(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, { resizeWidth: 32, resizeHeight: 32, resizeQuality: "high" });
                thumbs.set(url, bitmap);
                return bitmap;
            })().catch(() => undefined));
            return loading.get(url)!;
        };
        const picture = (url: string, name: string): HTMLCanvasElement => {
            const canvas = Object.assign(document.createElement("canvas"), { width: 32, height: 32 });
            canvas.style.cssText = "width:16px;height:16px;border-radius:50%;flex-shrink:0";
            canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", name);
            const draw = (bitmap: ImageBitmap | undefined): void => { if (bitmap) canvas.getContext("2d")?.drawImage(bitmap, 0, 0); };
            const ready = thumbs.get(url);
            if (ready) draw(ready); else void thumb(url).then(draw);
            return canvas;
        };
        api.observe("[data-message-id] button.inline-flex.items-center.gap-1.rounded-md[aria-pressed]", pill => {
            const row = pill.closest<HTMLElement>("[data-message-id]")!; const id = row.dataset.messageId; const emoji = reactionOf(pill)?.emoji;
            if (!id || !emoji) return undefined;
            const current = (): Reaction | undefined => {
                for (const entry of Object.values(messages.getState().cache)) { const message = entry?.messages.find(candidate => candidate.id === id); if (message) return message.reactions?.find(reaction => reaction.emoji === emoji); }
                return reactionOf(pill);
            };
            let serverId: string | undefined;
            for (const props of fiberProps(row, 3)) if (typeof props.guildServerId === "string") { serverId = props.guildServerId; break; }
            const stack = Object.assign(document.createElement("span"), { className: "vackle-reactors" });
            stack.style.cssText = "display:inline-flex;align-items:center;flex-wrap:nowrap";
            let shown = "";
            const render = (): void => {
                const users = (current()?.users ?? []).filter(user => typeof user?.id === "string");
                const key = `${users.map(user => user.id).join(",")}:${current()?.count ?? 0}`;
                if (!pill.isConnected || key === shown && stack.isConnected) return;
                shown = key;
                const extra = Math.max(0, (current()?.count ?? users.length) - 5);
                stack.replaceChildren(...users.slice(0, 5).map(user => {
                    const name = user.display_name || user.username || "Someone";
                    const url = avatarOf(user);
                    const avatar = url?.startsWith("https://") ? picture(url, name) : Object.assign(document.createElement("span"), { textContent: name.charAt(0).toUpperCase() });
                    avatar.title = name;
                    if (clickable) avatar.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); profiles!.getState().openProfileModal(user, serverId); });
                    return avatar;
                }), ...extra ? [Object.assign(document.createElement("span"), { className: "vackle-reactors-more", textContent: `+${extra}` })] : []);
                stack.classList.toggle("vackle-reactors-clickable", clickable);
                if (!users.length) stack.remove(); else if (pill.lastElementChild !== stack) pill.append(stack);
            };
            const unsubscribe = messages.subscribe(render);
            render();
            return () => { unsubscribe(); stack.remove(); };
        });
        await resources.style(".vackle-reactors{display:inline-flex;align-items:center;margin-left:2px}.vackle-reactors>canvas,.vackle-reactors>span:not(.vackle-reactors-more){display:inline-grid;place-items:center;width:16px;height:16px;margin-left:-3px;border-radius:50%;object-fit:cover;background:rgb(255 255 255 / .15);color:#fff;font-size:9px;font-weight:600}.vackle-reactors>:first-child{margin-left:0}.vackle-reactors-clickable>:not(.vackle-reactors-more){cursor:pointer}.vackle-reactors-more{margin-left:3px;font-size:11px;color:rgb(255 255 255 / .6)}");
    }
} satisfies Plugin;
