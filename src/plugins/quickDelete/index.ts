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
import { holdComplete } from "../../components/reactFiber";

const remove = 'button[aria-label="Delete message"]';
const css = `html[data-vackle-quick-delete] ${remove}{--v2-button-ghost-text:rgb(248 113 113)!important;background-color:rgb(239 68 68 / .2)!important}`;
const target = (event: Event): HTMLButtonElement | null => event.target instanceof Element ? event.target.closest<HTMLButtonElement>(remove) : null;

export default {
    id: "quick-delete", name: "Quick Delete", description: "Click Delete on a message to delete it instantly instead of holding the button. Optionally require Shift.",
    version: "1.1.0", author: "Xrm0s and contributors", tags: ["Utility", "Shortcuts"], enabledByDefault: false,
    settings: { "shift-only": { label: "Only delete instantly while holding Shift", default: false } },
    async start({ settings, resources, log }) {
        const shiftOnly = settings["shift-only"] === true;
        const tip = shiftOnly ? "Shift-click to delete" : "Click to delete";
        const root = document.documentElement;
        const armed = (event: MouseEvent): boolean => !shiftOnly || event.shiftKey;
        const shift = (event: KeyboardEvent): void => { if (event.key === "Shift") root.toggleAttribute("data-vackle-quick-delete", event.type === "keydown"); };
        const reset = (): void => root.removeAttribute("data-vackle-quick-delete");
        const press = (event: PointerEvent): void => {
            const button = armed(event) && event.button === 0 ? target(event) : null;
            const complete = button && !button.disabled ? holdComplete(button) : undefined;
            if (!complete) return;
            event.preventDefault(); event.stopPropagation();
            try { complete(); } catch (error) { log("Quick delete failed", error); }
        };
        const swallow = (event: MouseEvent): void => { if (armed(event) && target(event)) { event.preventDefault(); event.stopPropagation(); } };
        const relabel = (node: Node): void => {
            if (!node.textContent?.includes("Hold to delete")) return;
            const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
            for (let text = walker.currentNode.nodeType === Node.TEXT_NODE ? walker.currentNode : walker.nextNode(); text; text = walker.nextNode())
                if (text.textContent?.trim() === "Hold to delete") text.textContent = tip;
        };
        const tips = new MutationObserver(records => { for (const record of records) record.type === "characterData" ? relabel(record.target) : record.addedNodes.forEach(relabel); });
        tips.observe(document.body, { childList: true, characterData: true, subtree: true }); relabel(document.body);
        document.addEventListener("pointerdown", press, true);
        for (const type of ["pointerup", "click"] as const) document.addEventListener(type, swallow, true);
        if (shiftOnly) { document.addEventListener("keydown", shift, true); document.addEventListener("keyup", shift, true); window.addEventListener("blur", reset); }
        resources.add(() => {
            tips.disconnect();
            document.removeEventListener("pointerdown", press, true);
            for (const type of ["pointerup", "click"] as const) document.removeEventListener(type, swallow, true);
            document.removeEventListener("keydown", shift, true); document.removeEventListener("keyup", shift, true); window.removeEventListener("blur", reset);
            reset();
        });
        if (shiftOnly) await resources.style(css);
    }
} satisfies Plugin;
