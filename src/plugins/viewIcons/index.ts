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
import { flackleStore, flackleUser } from "../../components/flackleStores";
import { modalHost, openModal } from "../../components/modal";
import { openExternal } from "../../components/openExternal";
import { button, element } from "../../components/primitives";
import { fiberProps } from "../../components/reactFiber";

interface Server { id: string; name: string; icon_url?: string | null; banner_url?: string | null; }
interface Group { id: string; type: string; name?: string | null; icon_url?: string | null; }
const https = (url?: string | null): string | undefined => url?.startsWith("https://") ? url : undefined;
const groupOf = (row: Element): Group | undefined => {
    for (const props of fiberProps(row, 3)) { const group = props.conversation as Group | undefined; if (typeof group?.id === "string") return group.type === "group" ? group : undefined; }
    return undefined;
};

export default {
    id: "view-icons", name: "View Icons", description: "Adds View Avatar, View Banner and View Icon entries to the user, server and group context menus, and to the ⋯ menu on profiles. Click a profile's avatar or banner to view it.",
    version: "1.1.0", author: "Xrm0s and contributors", tags: ["Media", "Utility"], enabledByDefault: false,
    async start({ resources, api }) {
        const servers = flackleStore<{ servers: Server[] }>("removeServer");
        const profiles = flackleStore<{ target?: { user?: { id?: string } } | null }>("openProfileModal");
        if (!servers) throw new Error("Flackle's server store was not found");
        let close: (() => void) | undefined;
        resources.add(() => close?.());
        const view = (title: string, url: string, host = modalHost()): void => {
            const body = element("div", "vackle-view-icon");
            const image = element("img"); image.src = url; image.alt = title;
            const actions = element("div", "vackle-actions"); actions.append(button("Open in Browser", () => openExternal(url, api.notify), "vackle-ghost"));
            body.append(image, actions);
            close?.(); close = openModal(host, title, body, () => { close = undefined; });
        };
        const user = (target: HTMLElement) => { const id = target.dataset.userCardTrigger ?? target.dataset.vackleProfileMenu; return id ? flackleUser(id) : undefined; };
        const userIdOf = (element: Element, depth: number): string | undefined => {
            for (const props of fiberProps(element, depth)) { const id = (props.user as { id?: unknown } | undefined)?.id ?? props.userId; if (typeof id === "string") return id; }
            return undefined;
        };
        const more = (event: MouseEvent): void => {
            const button = event.target instanceof Element ? event.target.closest('button[aria-label="More options"]') : null;
            const id = button ? userIdOf(button, 12) ?? profiles?.getState().target?.user?.id : undefined;
            if (!id) return;
            const proxy = Object.assign(document.createElement("span"), { hidden: true }); proxy.dataset.vackleProfileMenu = id;
            document.body.append(proxy);
            setTimeout(() => { proxy.dispatchEvent(new MouseEvent("contextmenu", { bubbles: false })); setTimeout(() => proxy.remove(), 1000); });
        };
        const picture = (event: MouseEvent): void => {
            const target = event.target instanceof Element ? event.target : null;
            if (event.button !== 0 || !target || target.closest('[data-vackle-root], a, button:not([aria-label$="full profile"])')) return;
            const avatar = target.closest(".rounded-full.p-1\\.5.bg-ui-raised");
            for (const props of fiberProps(target, 8)) {
                const id = (props.user as { id?: unknown } | undefined)?.id ?? props.userId;
                if (typeof id !== "string") continue;
                const found = flackleUser(id); const label = found?.display_name || found?.username || "User";
                const url = avatar ? https(typeof props.src === "string" ? props.src : undefined) ?? https((props.user as { avatar_url?: string | null } | undefined)?.avatar_url) ?? https(found?.avatar_url)
                    : "bannerUrl" in props ? https(props.bannerUrl as string | null | undefined) : undefined;
                if (!url || !avatar && !("bannerUrl" in props)) continue;
                event.preventDefault(); event.stopPropagation();
                view(`${label}'s ${avatar ? "Avatar" : "Banner"}`, url);
                return;
            }
        };
        document.addEventListener("click", more, true); document.addEventListener("click", picture, true);
        resources.add(() => { document.removeEventListener("click", more, true); document.removeEventListener("click", picture, true); });
        const server = (target: HTMLElement): Server | undefined => servers.getState().servers.find(entry => entry.id === target.dataset.railIcon);
        const name = (target: HTMLElement): string => { const found = user(target); return found?.display_name || found?.username || "User"; };
        api.contextMenu({ id: "view-avatar", label: "View Avatar", icon: "image", after: "Copy ID", selector: "[data-user-card-trigger]", matches: target => https(user(target)?.avatar_url) !== undefined, run: target => view(`${name(target)}'s Avatar`, https(user(target)?.avatar_url)!) });
        api.contextMenu({ id: "view-banner", label: "View Banner", icon: "image", after: "View Avatar", selector: "[data-user-card-trigger]", matches: target => https(user(target)?.banner_url) !== undefined, run: target => view(`${name(target)}'s Banner`, https(user(target)?.banner_url)!) });
        for (const [id, label, key] of [["profile-avatar", "View Avatar", "avatar_url"], ["profile-banner", "View Banner", "banner_url"]] as const)
            api.contextMenu({ id, label, icon: "image", after: "Copy ID", selector: "[data-vackle-profile-menu]", matches: target => https(user(target)?.[key]) !== undefined, run: target => view(`${name(target)}'s ${label.slice(5)}`, https(user(target)?.[key])!, document.body) });
        api.contextMenu({ id: "view-icon", label: "View Icon", icon: "image", after: "Copy Server ID", selector: "a[data-rail-icon]", matches: target => https(server(target)?.icon_url) !== undefined, run: target => view(`${server(target)!.name} Icon`, https(server(target)!.icon_url)!) });
        api.contextMenu({ id: "view-server-banner", label: "View Banner", icon: "image", after: "View Icon", selector: "a[data-rail-icon]", matches: target => https(server(target)?.banner_url) !== undefined, run: target => view(`${server(target)!.name} Banner`, https(server(target)!.banner_url)!) });
        api.contextMenu({ id: "view-group-icon", label: "View Icon", icon: "image", selector: 'div[role="button"][aria-label^="Open conversation with"]', matches: target => https(groupOf(target)?.icon_url) !== undefined, run: target => { const group = groupOf(target)!; view(`${group.name || "Group"} Icon`, https(group.icon_url)!); } });
        await resources.style(".vackle-view-icon{align-items:center}.vackle-view-icon img{display:block;max-width:100%;max-height:min(60vh,512px);border-radius:8px;object-fit:contain}");
    }
} satisfies Plugin;
