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
import { openExternal, searchItems } from "../../components/openExternal";

const engines: readonly (readonly [string, string])[] = [
    ["Google", "https://www.google.com/search?q="], ["DuckDuckGo", "https://duckduckgo.com/?q="], ["Brave", "https://search.brave.com/search?q="],
    ["Bing", "https://www.bing.com/search?q="], ["Yahoo", "https://search.yahoo.com/search?p="], ["Yandex", "https://yandex.com/search/?text="],
    ["GitHub", "https://github.com/search?q="], ["Reddit", "https://www.reddit.com/search?q="], ["Wikipedia", "https://wikipedia.org/w/index.php?search="],
    ["Startpage", "https://www.startpage.com/sp/search?query="], ["Kagi", "https://kagi.com/search?q="]
];
const textOf = (target: HTMLElement): string => window.getSelection()?.toString().trim() || (target.querySelector<HTMLElement>("[data-message-content]")?.innerText.trim() ?? "");

export default {
    id: "replace-google-search", name: "Replace Google Search", description: "Right-click a message, or selected text in it, to search it with the search engine of your choice.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Utility", "Chat"], enabledByDefault: false,
    settings: {
        "custom-engine-name": { label: "Name of the custom search engine", default: "" },
        "custom-engine-url": { label: "Custom Engine URL (e.g. https://google.com/search?q=)", default: "" },
        "replacement-engine": { label: "Replace with a specific search engine instead of adding a menu", default: "Off", options: ["Off", "Custom Engine", ...engines.map(([name]) => name)] }
    },
    start({ settings, api }) {
        const name = String(settings["custom-engine-name"] ?? "").trim(), url = String(settings["custom-engine-url"] ?? "").trim();
        const all = name && /^https?:\/\//.test(url) ? [...engines, [name, url] as const] : engines;
        const replacement = settings["replacement-engine"] === "Custom Engine" ? name : String(settings["replacement-engine"] ?? "Off");
        const direct = all.find(([engine]) => engine === replacement);
        const base = { id: "search-text", after: "Copy Text", selector: "[data-message-id]", matches: (target: HTMLElement) => textOf(target).length > 0 };
        api.contextMenu(direct
            ? { ...base, label: `Search with ${direct[0]}`, icon: "search", run: (target: HTMLElement) => openExternal(direct[1] + encodeURIComponent(textOf(target)), api.notify) }
            : { ...base, label: "Search Text", submenu: (target: HTMLElement) => searchItems(all, textOf(target), api.notify) });
    }
} satisfies Plugin;
