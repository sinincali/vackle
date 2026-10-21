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

import { flackleExport } from "./flackleStores";
import type { PopupMenuItem } from "./popupMenu";

let cached: ((url: string) => Promise<void>) | undefined;
export function openExternal(url: string, notify: (message: string, level?: "info" | "error") => void): void {
    cached ??= flackleExport<(url: string) => Promise<void>>("openExternal:()=>", value => typeof value === "function");
    Promise.resolve().then(() => cached ? cached(url) : void window.open(url, "_blank", "noopener,noreferrer"))
        .catch(error => notify(`Couldn't open the link: ${error instanceof Error ? error.message : String(error)}`, "error"));
}
export function searchItems(engines: readonly (readonly [string, string])[], query: string, notify: (message: string, level?: "info" | "error") => void, all = false): PopupMenuItem[] {
    const items: PopupMenuItem[] = engines.map(([name, prefix]) => ({
        label: name, icon: "search", image: `https://icons.duckduckgo.com/ip3/${new URL(prefix).host}.ico`,
        run: () => openExternal(prefix + encodeURIComponent(query), notify)
    }));
    if (all) items.push({ label: "All", icon: "external", run: () => { for (const item of items.slice(0, -1)) item.run(); } });
    return items;
}
