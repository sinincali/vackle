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

import { uiIcon } from "./icons";
import { element } from "./primitives";

interface DropdownGroup { label?: string; options: readonly string[]; }
interface Dropdown { readonly root: HTMLElement; value: string; dispose(): void; }
export function dropdown(label: string, groups: readonly DropdownGroup[], initial: string, change: (value: string) => void): Dropdown {
    const root = element("div", "vackle-dropdown");
    const trigger = element("button", "vackle-dropdown-trigger"); trigger.type = "button";
    trigger.setAttribute("aria-haspopup", "listbox"); trigger.setAttribute("aria-expanded", "false"); trigger.setAttribute("aria-label", label);
    const text = element("span", "vackle-dropdown-value"); trigger.append(text, uiIcon("arrow"));
    const list = element("div", "vackle-dropdown-list"); list.setAttribute("role", "listbox"); list.setAttribute("aria-label", label); list.hidden = true;
    const options: HTMLButtonElement[] = [];
    let current = initial;
    const set = (value: string): void => {
        current = value; text.textContent = value;
        for (const option of options) option.setAttribute("aria-selected", String(option.dataset.value === value));
    };
    const outside = (event: PointerEvent): void => { if (!root.contains(event.target as Node)) close(false); };
    const escape = (event: KeyboardEvent): void => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); } };
    const scrolled = (event: Event): void => { if (!list.contains(event.target as Node)) close(false); };
    const open = (): void => {
        const box = root.closest(".vackle-modal") ? trigger.getBoundingClientRect() : undefined;
        Object.assign(list.style, box ? { position: "fixed", top: `${box.bottom + 6}px`, right: `${innerWidth - box.right}px`, minWidth: `${box.width}px` } : { position: "", top: "", right: "", minWidth: "" });
        list.hidden = false; trigger.setAttribute("aria-expanded", "true");
        document.addEventListener("pointerdown", outside, true); window.addEventListener("keydown", escape, true); if (box) window.addEventListener("scroll", scrolled, true);
        (options.find(option => option.dataset.value === current) ?? options[0])?.focus();
    };
    const close = (focus: boolean): void => {
        if (list.hidden) return;
        list.hidden = true; trigger.setAttribute("aria-expanded", "false");
        document.removeEventListener("pointerdown", outside, true); window.removeEventListener("keydown", escape, true); window.removeEventListener("scroll", scrolled, true);
        if (focus) trigger.focus();
    };
    for (const group of groups) {
        if (group.label) list.append(element("div", "vackle-dropdown-heading", group.label));
        for (const value of group.options) {
            const option = element("button", "vackle-dropdown-option"); option.type = "button";
            option.setAttribute("role", "option"); option.dataset.value = value;
            option.append(element("span", "", value), uiIcon("check"));
            option.addEventListener("click", () => { close(true); if (value !== current) { set(value); change(value); } });
            options.push(option); list.append(option);
        }
    }
    trigger.addEventListener("click", () => { if (list.hidden) open(); else close(false); });
    trigger.addEventListener("keydown", event => { if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); open(); } });
    list.addEventListener("keydown", event => {
        if (event.key === "Tab") { close(false); return; }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const index = options.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
        options[next]?.focus();
    });
    root.append(trigger, list); set(initial);
    return { root, get value() { return current; }, set value(value: string) { set(value); }, dispose: () => close(false) };
}
