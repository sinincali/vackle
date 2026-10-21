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
import { searchItems } from "../../components/openExternal";

const engines = [
    ["Google", "https://lens.google.com/uploadbyurl?url="], ["Yandex", "https://yandex.com/images/search?rpt=imageview&url="],
    ["SauceNAO", "https://saucenao.com/search.php?url="], ["IQDB", "https://iqdb.org/?url="],
    ["Bing", "https://www.bing.com/images/search?view=detailv2&iss=sbi&q=imgurl:"],
    ["TinEye", "https://www.tineye.com/search?url="], ["ImgOps", "https://imgops.com/start?url="]
] as const;
export function imageUrl(src: string): string | undefined {
    let url: URL;
    try { url = new URL(src); } catch { return undefined; }
    const original = url.pathname === "/api/proxy-image" ? url.searchParams.get("url") : url.href;
    return original && /^https:\/\//.test(original) ? original : undefined;
}

export default {
    id: "reverse-image-search", name: "Reverse Image Search", description: "Right-click a message with an image to reverse search it with Google Lens, Yandex, SauceNAO and more.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Utility", "Media"], enabledByDefault: false,
    start({ api }) {
        const source = (image: HTMLImageElement): string | undefined => !image.closest("[data-user-card-trigger]") && image.getBoundingClientRect().width >= 48
            ? imageUrl(image.currentSrc || image.src) : undefined;
        const imageOf = (row: HTMLElement): string | undefined => {
            const images = [...row.querySelectorAll<HTMLImageElement>("img")];
            return [...images.filter(image => image.matches(":hover")), ...images].map(source).find(Boolean);
        };
        api.contextMenu({
            id: "search-image", label: "Search Image", after: "Copy Text", selector: "[data-message-id]",
            matches: target => imageOf(target) !== undefined,
            submenu: target => searchItems(engines, imageOf(target) ?? "", api.notify, true)
        });
    }
} satisfies Plugin;
