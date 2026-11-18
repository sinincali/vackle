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
import { badgeElement } from "../../components/customBadge";
import { flackleStore } from "../../components/flackleStores";
import { showPerk } from "../../components/perkModal";
import { fiberProps } from "../../components/reactFiber";
import { tooltip } from "../../components/tooltip";
import type { BadgeCatalog, CustomBadge } from "../../shared/badgeDesign";

const REFRESH = 10 * 60_000;
const NAME = /^@(\S+)$/;
type Who = { id?: unknown; username?: unknown } | null | undefined;
const rowSize = (row: HTMLElement): number => [...row.children].find(child => !child.classList.contains("vackle-custom-badge"))?.getBoundingClientRect().width || (row.classList.contains("gap-2") ? 24 : row.classList.contains("gap-1.5") ? 20 : 16);
const nativeRow = (parent: Element): HTMLElement | undefined => [...parent.children].find((child): child is HTMLElement => child.hasAttribute("data-profile-badges"));

export default {
    id: "custom-badges", name: "Custom Badges", description: "Shows the custom badges from users profiles.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Social", "Profiles"], enabledByDefault: true,
    start({ resources, api, log }) {
        const profiles = flackleStore<{ target?: { user?: Who } | null }>("openProfileModal");
        let catalog: BadgeCatalog | undefined;
        let badges = new Map<string, CustomBadge>();
        let byName = new Map<string, CustomBadge>();
        let loadedAt = 0;
        const placers = new Set<() => void>();

        const userId = (anchor: HTMLElement, name: string): string | undefined => {
            const pick = (who: Who): string | undefined => who && who.username === name && typeof who.id === "string" ? who.id : undefined;
            if (anchor.closest('[role="dialog"]')) {
                const id = pick(profiles?.getState().target?.user);
                if (id) return id;
            }
            const pageId = /^\/app\/profile\/(\d+)\/?$/.exec(location.pathname)?.[1];
            for (const props of fiberProps(anchor, 30)) {
                if (pageId && props.userId === pageId) return pageId;
                const member = props.member as { user?: Who } | undefined, target = props.target as { user?: Who } | undefined;
                const id = pick(props.user as Who) ?? pick(member?.user) ?? pick(target?.user);
                if (id) return id;
            }
            const avatar = anchor.closest("div.fixed")?.querySelector('button[aria-label$="full profile"]');
            if (avatar) for (const props of fiberProps(avatar.querySelector("span") ?? avatar, 2)) {
                const id = (props.user as { id?: unknown } | undefined)?.id ?? props.userId;
                if (typeof id === "string") return id;
            }
            return undefined;
        };
        const load = async (): Promise<void> => {
            loadedAt = Date.now();
            try {
                catalog = await resources.badges();
                badges = new Map(catalog.badges.map(badge => [badge.user, badge]));
                byName = new Map(catalog.badges.flatMap(badge => badge.username ? [[badge.username.toLowerCase(), badge] as const] : []));
                for (const place of placers) place();
            } catch (error) { log("Could not load the badge list", error); }
        };

        api.observe('p[class*="text-white/50"]', anchor => {
            const nameOf = (): string | undefined => NAME.exec(anchor.textContent?.trim() ?? "")?.[1], parent = anchor.parentElement;
            if (!nameOf() || !parent) return;
            let shown: { element: HTMLElement; dispose(): void } | undefined, own: HTMLElement | undefined, inNative = false, unhint: (() => void) | undefined;
            const clear = (): void => { unhint?.(); unhint = undefined; shown?.dispose(); shown = undefined; own?.remove(); own = undefined; };
            const place = (): void => {
                clear();
                const name = nameOf();
                if (!name) return;
                const id = userId(anchor, name), found = id ? badges.get(id) : byName.get(name.toLowerCase());
                const look = found && (!found.username || found.username.toLowerCase() === name.toLowerCase()) ? found : undefined;
                if (!look || !catalog) return;
                const perk = catalog.perk, native = nativeRow(parent);
                shown = badgeElement(look, native ? rowSize(native) : 16, perk.title, () => showPerk(look, perk, api.notify));
                if (native) shown.element.style.cssText += ";padding:2px;margin-right:2px;box-sizing:border-box";
                unhint = tooltip(shown.element, "Vackle Lifter", true);
                inNative = Boolean(native);
                if (native) native.prepend(shown.element);
                else {
                    own = document.createElement("div");
                    own.className = "flex flex-row shrink-0 items-center gap-0.5"; own.dataset.vackleRoot = "";
                    own.append(shown.element); parent.append(own);
                }
            };
            const watch = new MutationObserver(() => { if (shown && (!shown.element.isConnected || Boolean(nativeRow(parent)) !== inNative)) place(); });
            watch.observe(parent, { childList: true });
            const rename = new MutationObserver(place);
            rename.observe(anchor, { childList: true, characterData: true, subtree: true });
            placers.add(place); place();
            if (Date.now() - loadedAt > 60_000) void load();
            return () => { watch.disconnect(); rename.disconnect(); placers.delete(place); clear(); };
        });
        const timer = setInterval(() => void load(), REFRESH);
        resources.add(() => clearInterval(timer));
        void load();
    }
} satisfies Plugin;
