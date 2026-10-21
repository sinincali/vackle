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

import type { Branding, Plugin } from "../../api/types";
import { fiberProps } from "../../components/reactFiber";

const player = 'button[aria-label^="Play YouTube video: "]';
function videoId(button: Element): string | undefined {
    for (const props of fiberProps(button, 3)) {
        const id = (props.video as { id?: unknown } | undefined)?.id;
        if (typeof id === "string" && /^[A-Za-z0-9_-]{11}$/.test(id)) return id;
    }
    return undefined;
}

export default {
    id: "dearrow", name: "DeArrow", description: "Replaces clickbait YouTube embed titles and thumbnails with community-submitted ones from DeArrow. Hover a title to see the original.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Appearance", "Media"], enabledByDefault: false,
    settings: { titles: { label: "Replace titles", default: true }, thumbnails: { label: "Replace thumbnails", default: true } },
    start({ settings, resources, api, log }) {
        const cache = new Map<string, Promise<Branding>>();
        let warned = false;
        api.observe(player, button => {
            const id = videoId(button);
            if (!id) return;
            let lookup = cache.get(id);
            if (!lookup) { lookup = resources.branding(id); cache.set(id, lookup); lookup.catch(() => cache.delete(id)); }
            const undo: (() => void)[] = [];
            let live = true;
            void lookup.then(branding => {
                if (!live || !button.isConnected) return;
                const card = button.closest("[data-embed-content]");
                const heading = card?.querySelector<HTMLElement>('a[class*="group/title"] > span:last-child, p.font-medium.text-ui-primary');
                if (settings.titles !== false && branding.title && heading) {
                    const original = heading.textContent ?? ""; const label = button.getAttribute("aria-label"); const tip = heading.getAttribute("title");
                    heading.textContent = branding.title; heading.title = `Original: ${original}`;
                    button.setAttribute("aria-label", `Play YouTube video: ${branding.title}`);
                    undo.push(() => {
                        heading.textContent = original; if (tip === null) heading.removeAttribute("title"); else heading.title = tip;
                        if (label !== null) button.setAttribute("aria-label", label);
                    });
                }
                const image = button.querySelector("img");
                if (settings.thumbnails !== false && branding.thumbnail !== null && image) {
                    const original = image.src;
                    const revert = (): void => { image.removeEventListener("error", revert); if (image.src !== original) image.src = original; };
                    image.addEventListener("error", revert);
                    image.src = `https://dearrow-thumb.ajay.app/api/v1/getThumbnail?videoID=${id}&time=${branding.thumbnail}`;
                    undo.push(revert);
                }
            }, (error: unknown) => { if (!warned) { warned = true; log("DeArrow lookup failed", error); } });
            return () => { live = false; for (const step of undo.reverse()) step(); };
        });
    }
} satisfies Plugin;
