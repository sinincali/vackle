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

const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
export function anonymise(name: string, method: string, length: number, consistent: string): string {
    const dot = name.lastIndexOf(".");
    const extension = dot > 0 ? name.slice(dot) : "";
    const base = method === "Consistent" ? consistent : method === "Timestamp" ? String(Date.now())
        : Array.from(crypto.getRandomValues(new Uint32Array(length)), value => chars[value % chars.length]).join("");
    return base + extension;
}
const own = (target: EventTarget | null): boolean => target instanceof Element && Boolean(target.closest("[data-vackle-root]"));

export default {
    id: "anonymise-file-names", name: "Anonymise File Names", description: "Renames files you upload so their original names are never sent.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Privacy", "Media"], enabledByDefault: false,
    settings: {
        method: { label: "Anonymising method", default: "Random", options: ["Random", "Consistent", "Timestamp"] },
        "random-length": { label: "Random characters length", default: 7, min: 1, max: 64 },
        consistent: { label: "Consistent file name", default: "image" }
    },
    start({ settings, resources }) {
        const rename = (name: string): string => anonymise(name, String(settings.method), Number(settings["random-length"]), String(settings.consistent) || "image");
        const renamed = (files: FileList): DataTransfer => {
            const transfer = new DataTransfer();
            for (const file of files) transfer.items.add(new File([file], rename(file.name), { type: file.type, lastModified: file.lastModified }));
            return transfer;
        };
        const change = (event: Event): void => {
            const input = event.target;
            if (input instanceof HTMLInputElement && input.type === "file" && input.files?.length && !own(input)) input.files = renamed(input.files).files;
        };
        let replaying = false;
        const replay = (event: Event): void => {
            const data = event instanceof DragEvent ? event.dataTransfer : event instanceof ClipboardEvent ? event.clipboardData : null;
            if (replaying || !data?.files.length || !event.target || own(event.target)) return;
            const transfer = renamed(data.files);
            for (const type of data.types) if (type !== "Files") transfer.setData(type, data.getData(type));
            event.stopImmediatePropagation();
            const init = { bubbles: true, cancelable: true, composed: true };
            const copy = event instanceof DragEvent
                ? new DragEvent(event.type, { ...init, clientX: event.clientX, clientY: event.clientY, screenX: event.screenX, screenY: event.screenY, dataTransfer: transfer })
                : new ClipboardEvent(event.type, { ...init, clipboardData: transfer });
            replaying = true;
            try { event.target.dispatchEvent(copy); } finally { replaying = false; }
            if (copy.defaultPrevented) event.preventDefault();
        };
        window.addEventListener("change", change, true);
        for (const type of ["drop", "paste"]) window.addEventListener(type, replay, true);
        resources.add(() => { window.removeEventListener("change", change, true); for (const type of ["drop", "paste"]) window.removeEventListener(type, replay, true); });
    }
} satisfies Plugin;
