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

export function appUri(href: string, apps: Readonly<Record<string, unknown>> = {}): string | undefined {
    let url: URL;
    try { url = new URL(href); } catch { return undefined; }
    if (url.protocol !== "https:") return undefined;
    const match = (pattern: RegExp): RegExpExecArray | null => pattern.exec(url.pathname);
    if (url.hostname === "open.spotify.com" && apps.spotify !== false) {
        const found = match(/^\/(?:intl-[a-z-]+\/)?(track|album|artist|playlist|user|episode|show)\/([A-Za-z0-9]+)/);
        return found ? `spotify:${found[1]}:${found[2]}` : undefined;
    }
    if (/^(store\.steampowered\.com|steamcommunity\.com)$/.test(url.hostname) && apps.steam !== false) return `steam://openurl/${url.href}`;
    if (url.hostname === "store.epicgames.com" && apps.epic !== false) {
        const found = match(/\/p\/([A-Za-z0-9-]+)/);
        return found ? `com.epicgames.launcher://store/p/${found[1]}` : undefined;
    }
    if (/^(listen\.)?tidal\.com$/.test(url.hostname) && apps.tidal !== false) {
        const found = match(/^\/(?:browse\/)?(track|album|artist|playlist|mix|video)\/([A-Za-z0-9-]+)/);
        return found ? `tidal://${found[1]}/${found[2]}` : undefined;
    }
    return undefined;
}

export default {
    id: "open-in-app", name: "Open In App", description: "Opens Spotify, Steam, Epic Games and Tidal links in their desktop apps instead of your browser.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Utility", "Media"], enabledByDefault: false,
    settings: { spotify: { label: "Spotify", default: true }, steam: { label: "Steam", default: true }, epic: { label: "Epic Games", default: true }, tidal: { label: "Tidal", default: true } },
    start({ settings, resources, api }) {
        const click = (event: MouseEvent): void => {
            if (event.button !== 0 || event.ctrlKey || event.shiftKey || event.metaKey || event.altKey) return;
            const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
            const uri = link && !link.closest("[data-vackle-root]") ? appUri(link.href, settings) : undefined;
            if (!uri) return;
            event.preventDefault(); event.stopPropagation();
            resources.openUri(uri).catch(error => api.notify(`Couldn't open the app: ${error instanceof Error ? error.message : String(error)}`, "error"));
        };
        document.addEventListener("click", click, true);
        resources.add(() => document.removeEventListener("click", click, true));
    }
} satisfies Plugin;
