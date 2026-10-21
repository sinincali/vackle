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
import { fiberProps } from "../../components/reactFiber";

const ignored = "a,button,img,video,audio,input,textarea,[role=button],[contenteditable=true]";
const rowOf = (event: MouseEvent): HTMLElement | null => {
    const target = event.target instanceof Element ? event.target : null;
    const row = target?.closest<HTMLElement>("[data-message-id]");
    return row && !target!.closest(ignored) && !row.dataset.messageId!.startsWith("vackle-") ? row : null;
};
const isOwn = (row: Element): boolean => { for (const props of fiberProps(row, 3)) if (typeof props.isOwn === "boolean") return props.isOwn; return false; };
const isReplyTarget = (row: Element): boolean => { for (const props of fiberProps(row, 3)) if (props.isReplyTarget === true) return true; return false; };
function holdComplete(button: Element): (() => void) | undefined {
    for (const props of fiberProps(button, 3)) if (props.isHoldToConfirm === true && typeof props.onHoldComplete === "function") return props.onHoldComplete as () => void;
    return undefined;
}

export default {
    id: "message-click-actions", name: "Message Click Actions", description: "Double-click a message to reply, or your own message to edit it. Double-click it again to cancel the reply. Hold Backspace and click a message to delete it.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Chat", "Shortcuts"], enabledByDefault: false,
    settings: {
        "double-click-edit": { label: "Double-click your own messages to edit them", default: true },
        "double-click-reply": { label: "Double-click other messages to reply", default: true },
        "require-modifier": { label: "Only double-click actions while holding Shift", default: false },
        "delete-on-click": { label: "Hold Backspace and click a message to delete it", default: true }
    },
    start({ settings, resources, log }) {
        let backspace = false;
        const key = (event: KeyboardEvent): void => { if (event.key === "Backspace") backspace = event.type === "keydown"; };
        const reset = (): void => { backspace = false; };
        const press = (row: Element, label: string): boolean => {
            const button = row.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
            button?.click();
            return Boolean(button);
        };
        const click = (event: MouseEvent): void => {
            const row = backspace && settings["delete-on-click"] !== false && event.button === 0 ? rowOf(event) : null;
            const button = row?.querySelector('button[aria-label="Delete message"]');
            const complete = button ? holdComplete(button) : undefined;
            if (!complete) return;
            event.preventDefault(); event.stopPropagation();
            try { complete(); } catch (error) { log("Delete failed", error); }
        };
        const double = (event: MouseEvent): void => {
            if (settings["require-modifier"] === true && !event.shiftKey) return;
            const row = rowOf(event);
            if (!row || row.querySelector("textarea")) return;
            const cancel = isReplyTarget(row) ? document.querySelector<HTMLButtonElement>('button[aria-label="Cancel reply"]') : null;
            if (cancel) { cancel.click(); getSelection()?.removeAllRanges(); event.preventDefault(); return; }
            const own = isOwn(row);
            const done = own && settings["double-click-edit"] !== false ? press(row, "Edit message")
                : settings["double-click-reply"] !== false && press(row, "Reply");
            if (done) { getSelection()?.removeAllRanges(); event.preventDefault(); }
        };
        document.addEventListener("keydown", key, true); document.addEventListener("keyup", key, true); window.addEventListener("blur", reset);
        document.addEventListener("click", click, true); document.addEventListener("dblclick", double, true);
        resources.add(() => {
            document.removeEventListener("keydown", key, true); document.removeEventListener("keyup", key, true); window.removeEventListener("blur", reset);
            document.removeEventListener("click", click, true); document.removeEventListener("dblclick", double, true);
        });
    }
} satisfies Plugin;
