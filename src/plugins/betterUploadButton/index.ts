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

const attach = 'button[aria-label="Add attachment"]';
function picker(target: EventTarget | null): { button: HTMLButtonElement; input: HTMLInputElement } | undefined {
    const button = target instanceof Element ? target.closest<HTMLButtonElement>(attach) : null;
    const input = button?.parentElement?.querySelector<HTMLInputElement>(':scope > input[type="file"]');
    return button && input ? { button, input } : undefined;
}
export default {
    id: "better-upload-button", name: "Better Upload Button", description: "Click the attachment button to pick files straight away. Right-click it for the original menu.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Utility", "Shortcuts"], enabledByDefault: false,
    start({ resources }) {
        let bypass = false;
        const click = (event: MouseEvent): void => {
            const found = bypass ? undefined : picker(event.target);
            if (!found) return;
            event.preventDefault(); event.stopPropagation();
            found.input.click();
        };
        const menu = (event: MouseEvent): void => {
            const found = picker(event.target);
            if (!found) return;
            event.preventDefault(); event.stopPropagation();
            bypass = true;
            try { found.button.click(); } finally { bypass = false; }
        };
        document.addEventListener("click", click, true); document.addEventListener("contextmenu", menu, true);
        resources.add(() => { document.removeEventListener("click", click, true); document.removeEventListener("contextmenu", menu, true); });
    }
} satisfies Plugin;
