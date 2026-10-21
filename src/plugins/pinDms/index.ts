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
import { uiIcon } from "../../components/icons";
import { openPopupMenu, type PopupMenuItem } from "../../components/popupMenu";
import { fiberProps } from "../../components/reactFiber";

interface Category { id: string; name: string; collapsed: boolean; dms: string[]; }
const key = "vackle-pinned-dms", dmsKey = "vackle-dms-collapsed", direct = "direct-messages";
const item = 'div[role="button"][aria-label^="Open conversation with"]';
const ids = (value: unknown): string[] => Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && /^\d+$/.test(id)) : [];
export function parseCategories(text: string | null): Category[] {
    try {
        const saved: unknown = JSON.parse(text ?? "[]");
        if (!Array.isArray(saved)) return [];
        if (saved.every(entry => typeof entry === "string")) { const dms = ids(saved); return dms.length ? [{ id: "pinned", name: "Pinned", collapsed: false, dms }] : []; }
        return saved.flatMap(entry => {
            const category = entry as Partial<Category> | null;
            return typeof category?.id === "string" && typeof category.name === "string" ? [{ id: category.id, name: category.name, collapsed: category.collapsed === true, dms: ids(category.dms) }] : [];
        });
    } catch { return []; }
}
const read = (name: string): string | null => { try { return localStorage.getItem(name); } catch { return null; } };
const write = (name: string, value: string): void => { try { localStorage.setItem(name, value); } catch { } };
function conversationOf(element: Element): string | undefined {
    for (const props of fiberProps(element, 3)) { const id = (props.conversation as { id?: unknown } | undefined)?.id; if (typeof id === "string") return id; }
    return undefined;
}

export default {
    id: "pin-dms", name: "Pin DMs", description: "Pin DMs into your own categories at the top of your DM list. Right-click a DM to pin it, and right-click a category to rename, move or delete it.",
    version: "1.1.0", author: "Xrm0s and contributors", tags: ["Friends", "Organisation"], enabledByDefault: false,
    async start({ resources, api }) {
        let categories = parseCategories(read(key));
        let directCollapsed = read(dmsKey) === "true";
        const rows = new Map<HTMLElement, string>();
        const headers = new Map<string, HTMLElement>();
        let closeMenu: (() => void) | undefined;
        const save = (): void => { write(key, JSON.stringify(categories)); write(dmsKey, String(directCollapsed)); layout(); };
        const rename = (id: string): void => {
            const header = headers.get(id); const category = categories.find(entry => entry.id === id);
            const label = header?.querySelector<HTMLElement>(".vackle-dm-category-name");
            if (!header || !category || !label) return;
            const input = Object.assign(document.createElement("input"), { className: "vackle-dm-category-input", value: category.name, maxLength: 40 });
            input.setAttribute("aria-label", "Category name");
            let done = false;
            const finish = (keep: boolean): void => {
                if (done) return;
                done = true;
                if (keep && input.value.trim()) category.name = input.value.trim();
                input.replaceWith(label); save();
            };
            input.addEventListener("keydown", event => { event.stopPropagation(); if (event.key === "Enter") finish(true); if (event.key === "Escape") finish(false); });
            input.addEventListener("blur", () => finish(true));
            input.addEventListener("click", event => event.stopPropagation());
            label.replaceWith(input); input.focus(); input.select();
        };
        const create = (dm?: string): void => {
            const id = `c${Date.now().toString(36)}`;
            for (const category of categories) category.dms = category.dms.filter(entry => entry !== dm);
            categories = [...categories, { id, name: "New Category", collapsed: false, dms: dm ? [dm] : [] }];
            save(); rename(id);
        };
        const move = (id: string, step: number): void => {
            const index = categories.findIndex(entry => entry.id === id), target = index + step;
            if (index < 0 || target < 0 || target >= categories.length) return;
            const next = [...categories]; [next[index], next[target]] = [next[target]!, next[index]!]; categories = next; save();
        };
        const headerMenu = (event: MouseEvent, id: string): void => {
            event.preventDefault(); event.stopPropagation();
            const index = categories.findIndex(entry => entry.id === id);
            const items: PopupMenuItem[] = id === direct ? [{ label: "New Category", icon: "bookmark", run: () => create() }] : [
                { label: "Rename Category", icon: "id", run: () => rename(id) },
                ...index > 0 ? [{ label: "Move Up", icon: "arrow", run: () => move(id, -1) } as PopupMenuItem] : [],
                ...index < categories.length - 1 ? [{ label: "Move Down", icon: "arrow", run: () => move(id, 1) } as PopupMenuItem] : [],
                { label: "New Category", icon: "bookmark", run: () => create() },
                { label: "Delete Category", icon: "close", separatorBefore: true, run: () => { categories = categories.filter(entry => entry.id !== id); save(); } }
            ];
            closeMenu?.(); closeMenu = openPopupMenu(event.clientX, event.clientY, items);
        };
        const header = (id: string, name: string, collapsed: boolean): HTMLElement => {
            let node = headers.get(id);
            if (!node) {
                const created = Object.assign(document.createElement("div"), { className: "vackle-dm-category", tabIndex: 0 }); created.setAttribute("role", "button");
                const label = Object.assign(document.createElement("span"), { className: "vackle-dm-category-name" });
                const chevron = uiIcon("arrow", 12); chevron.classList.add("vackle-dm-category-chevron");
                created.append(label, chevron);
                const toggle = (): void => {
                    if (id === direct) directCollapsed = !directCollapsed;
                    else { const category = categories.find(entry => entry.id === id); if (category) category.collapsed = !category.collapsed; }
                    save();
                };
                created.addEventListener("click", toggle);
                created.addEventListener("keydown", event => { if (event.target === created && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); toggle(); } });
                created.addEventListener("contextmenu", event => headerMenu(event, id));
                headers.set(id, created); node = created;
            }
            const label = node.querySelector(".vackle-dm-category-name");
            if (label) label.textContent = name;
            node.setAttribute("aria-expanded", String(!collapsed));
            return node;
        };
        function layout(): void {
            const list = [...rows.keys()].find(row => row.isConnected)?.parentElement?.parentElement;
            const placed = new Map<string, { order: number; collapsed: boolean }>();
            const wanted = new Set<HTMLElement>();
            let order = -10000;
            if (list && categories.length) {
                for (const category of categories) {
                    const node = header(category.id, category.name, category.collapsed); node.style.order = String(order++); wanted.add(node);
                    for (const dm of category.dms) placed.set(dm, { order: order++, collapsed: category.collapsed });
                }
                const node = header(direct, "Direct Messages", directCollapsed); node.style.order = String(order++); wanted.add(node);
                for (const node of [...wanted].reverse()) if (node.parentElement !== list) list.prepend(node);
            }
            for (const [id, node] of headers) if (!wanted.has(node)) { node.remove(); headers.delete(id); }
            for (const [row, id] of rows) {
                const slot = row.parentElement; const spot = placed.get(id);
                if (!slot) continue;
                slot.style.order = spot ? String(spot.order) : "";
                slot.style.display = (spot ? spot.collapsed : Boolean(list) && categories.length > 0 && directCollapsed) ? "none" : "";
            }
        }
        const pin = (dm: string, to: string): void => {
            for (const category of categories) category.dms = category.dms.filter(entry => entry !== dm);
            categories.find(entry => entry.id === to)?.dms.push(dm); save();
        };
        const owner = (dm: string): Category | undefined => categories.find(category => category.dms.includes(dm));
        api.observe(item, row => {
            const id = conversationOf(row);
            if (!id) return;
            rows.set(row, id); layout();
            return () => { rows.delete(row); if (row.parentElement) { row.parentElement.style.order = ""; row.parentElement.style.display = ""; } layout(); };
        });
        for (const pinned of [false, true]) api.contextMenu({
            id: pinned ? "move-dm" : "pin-dm", label: pinned ? "Move to Category" : "Pin DM", icon: "bookmark", after: "Mark as read", selector: item,
            matches: target => { const id = conversationOf(target); return Boolean(id) && Boolean(owner(id!)) === pinned; },
            submenu: target => {
                const id = conversationOf(target)!; const current = owner(id);
                return [
                    ...categories.filter(category => category !== current).map(category => ({ label: category.name, icon: "bookmark", run: () => pin(id, category.id) } as PopupMenuItem)),
                    { label: "New Category", icon: "bookmark", separatorBefore: categories.length > (current ? 1 : 0), run: () => create(id) }
                ];
            }
        });
        api.contextMenu({
            id: "unpin-dm", label: "Unpin DM", icon: "close", after: "Mark as read", selector: item,
            matches: target => { const id = conversationOf(target); return Boolean(id && owner(id)); },
            run: target => { const id = conversationOf(target); if (id) { for (const category of categories) category.dms = category.dms.filter(entry => entry !== id); save(); } }
        });
        resources.add(() => {
            closeMenu?.();
            for (const node of headers.values()) node.remove();
            for (const row of rows.keys()) if (row.parentElement) { row.parentElement.style.order = ""; row.parentElement.style.display = ""; }
        });
        await resources.style(".vackle-dm-category{display:flex;align-items:center;gap:4px;padding:12px 12px 4px 16px;color:rgb(255 255 255 / .45);font-size:12px;font-weight:600;letter-spacing:.02em;cursor:pointer;user-select:none;outline:none}.vackle-dm-category:is(:hover,:focus-visible){color:rgb(255 255 255 / .8)}.vackle-dm-category-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.vackle-dm-category-chevron{flex-shrink:0;transform:rotate(90deg);transition:transform .15s}.vackle-dm-category[aria-expanded=false] .vackle-dm-category-chevron{transform:none}.vackle-dm-category-input{flex:1;min-width:0;padding:2px 6px;border:1px solid rgb(255 255 255 / .15);border-radius:6px;background:rgb(0 0 0 / .3);color:#fff;font:inherit;outline:none}");
    }
} satisfies Plugin;
