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
import { copyText, roleFromElement, type FlackleRole } from "../../components/flackleRole";
import { openModal } from "../../components/modal";
import { openPopupMenu, type PopupMenuItem } from "../../components/popupMenu";
import { button, element } from "../../components/primitives";
import { download, saveImage } from "../saveImage";

type Notify = (message: string, level?: "info" | "error") => void;
async function copyImage(image: HTMLImageElement, notify: Notify): Promise<void> {
    try {
        const canvas = Object.assign(document.createElement("canvas"), { width: image.naturalWidth, height: image.naturalHeight });
        canvas.getContext("2d")!.drawImage(await createImageBitmap(await download(image)), 0, 0);
        const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Couldn't read the icon")), "image/png"));
        await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
        notify("Icon copied");
    } catch (error) { notify(`Couldn't copy: ${error instanceof Error ? error.message : String(error)}`, "error"); }
}
function viewIcon(role: FlackleRole & { iconUrl: string }, host: Element, notify: Notify): void {
    const body = element("div", "vackle-role-icon");
    const image = element("img"); image.src = role.iconUrl; image.alt = `${role.name} role icon`; image.width = image.height = 128;
    const actions = element("div", "vackle-role-icon-actions");
    actions.append(button("Copy", () => void copyImage(image, notify)), button("Download", () => void saveImage(image, notify), "", "import"));
    body.append(image, actions); openModal(host, role.name, body);
}
export default {
    id: "better-role-context", name: "Better Role Context", description: "Right-click a role to copy its colour or ID, or view its icon.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Roles", "Utility"], enabledByDefault: false,
    async start({ resources, api }) {
        let close: (() => void) | undefined;
        const open = (event: MouseEvent): void => {
            const target = event.target instanceof Element ? event.target : null;
            const role = target && !target.closest("[data-vackle-root]") ? roleFromElement(target) : undefined;
            if (!target || !role) return;
            event.preventDefault(); event.stopPropagation();
            const host = target.closest('[role="dialog"]') ?? document.body;
            const items: PopupMenuItem[] = [];
            if (role.color) { const color = role.color; items.push({ label: "Copy Role Color", icon: "color", run: () => copyText(color, api.notify) }); }
            if (role.iconUrl) { const iconRole = { ...role, iconUrl: role.iconUrl }; items.push({ label: "View Role Icon", icon: "image", run: () => viewIcon(iconRole, host, api.notify) }); }
            items.push({ label: "Copy Role ID", icon: "id", run: () => copyText(role.id, api.notify), separatorBefore: items.length > 0 });
            close?.(); close = openPopupMenu(event.clientX, event.clientY, items, host);
        };
        document.addEventListener("contextmenu", open, true);
        resources.add(() => { document.removeEventListener("contextmenu", open, true); close?.(); });
        await resources.style(".vackle-role-icon{align-items:center}.vackle-role-icon img{display:block;width:128px;height:128px;object-fit:contain}.vackle-role-icon-actions{display:flex;gap:8px;margin-top:12px}");
    }
} satisfies Plugin;
