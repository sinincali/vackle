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

import type { Plugin, ResourceScope } from "../../api/types";
import { saveFile } from "../../components/saveFile";
import { imageUrl } from "../reverseImageSearch";
const image = (target: HTMLElement): HTMLImageElement | undefined =>
    target instanceof HTMLImageElement && !target.closest("[data-user-card-trigger]") && target.getBoundingClientRect().width >= 48 ? target : undefined;
const originalOf = (img: HTMLImageElement): string | undefined => img.closest("[data-image-url]")?.getAttribute("data-image-url") ?? imageUrl(img.currentSrc || img.src);
type Fetcher = Pick<ResourceScope, "image">;
export async function download(img: HTMLImageElement, resources: Fetcher): Promise<Blob> {
    const original = originalOf(img), shown = img.currentSrc || img.src;
    for (const url of [...original ? [`/api/attachments/blob?url=${encodeURIComponent(original)}`] : [], shown]) {
        const response = await fetch(url).catch(() => undefined);
        if (response?.ok) return response.blob();
    }
    return resources.image(original ?? shown);
}
export function fileName(alt: string, url: string | undefined): string {
    if (/\.\w{2,5}$/.test(alt)) return alt;
    try { const last = decodeURIComponent(new URL(url ?? "").pathname.split("/").pop() ?? ""); if (/\.\w{2,5}$/.test(last)) return last; } catch { }
    return "image.png";
}

export async function saveImage(img: HTMLImageElement, notify: (message: string, level?: "info" | "error") => void, resources: Fetcher): Promise<void> {
    const name = fileName(img.alt, originalOf(img));
    try {
        if (await saveFile(name, () => download(img, resources))) notify("Image saved");
    } catch (error) {
        notify(error instanceof Error ? error.message : String(error), "error");
    }
}

export default {
    id: "save-image", name: "Save Image", description: "Adds Save Image to the right-click menu of images in chat and in the image viewer, and to View Icons' avatar and banner viewer.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Media", "Utility"], enabledByDefault: false,
    start({ api, resources }) {
        api.contextMenu({
            id: "save-image", label: "Save Image", icon: "import", after: "Copy Image",
            selector: "[data-message-id] img, body > .fixed.inset-0 img.object-contain",
            matches: target => image(target) !== undefined, run: target => saveImage(image(target)!, api.notify, resources)
        });
    }
} satisfies Plugin;
