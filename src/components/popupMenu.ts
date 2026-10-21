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

import { uiIcon, type IconName } from "./icons";
import { element } from "./primitives";

export interface PopupMenuItem { label: string; icon: IconName; image?: string; run(): void; separatorBefore?: boolean; }
const row = "w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors rounded-lg [&_svg]:text-inherit text-white/90 hover:bg-white/5 cursor-pointer justify-between";
export function openPopupMenu(x: number, y: number, items: readonly PopupMenuItem[], host: Element = document.body, flipX = x): () => void {
    const menu = element("div", "fixed py-2 px-2 min-w-[240px] rounded-xl overflow-hidden bg-ui-bar shadow-[0_0_4px_rgba(0,0,0,0.15)] z-[310]");
    menu.style.backgroundColor = "var(--ui-layer-chip)"; menu.setAttribute("role", "menu"); menu.dataset.vackleRoot = "";
    const leading = items.some(item => item.image);
    for (const item of items) {
        if (item.separatorBefore) {
            const separator = element("div", "flex items-center px-3"); separator.setAttribute("role", "separator"); separator.style.height = "18px";
            separator.append(element("div", "h-0.5 w-full rounded-full bg-white/5")); menu.append(separator);
        }
        const entry = element("button", row); entry.type = "button"; entry.setAttribute("role", "menuitem");
        const label = element("span", "flex-1 truncate", item.label);
        if (leading) {
            const image = element("img", "shrink-0 w-[18px] h-[18px] rounded"); image.alt = ""; image.referrerPolicy = "no-referrer";
            const fallback = (): void => { image.replaceWith(uiIcon(item.icon, 18)); };
            image.addEventListener("error", fallback, { once: true });
            entry.classList.remove("justify-between"); entry.append(image, label);
            if (item.image) image.src = item.image; else fallback();
        } else {
            const icon = element("span", "shrink-0 ml-2"); icon.append(uiIcon(item.icon, 14));
            entry.append(label, icon);
        }
        entry.addEventListener("click", () => { close(); item.run(); });
        menu.append(entry);
    }
    const outside = (event: Event): void => { if (!menu.contains(event.target as Node)) close(); };
    const shield = (event: Event): void => { if (menu.contains(event.target as Node)) event.stopPropagation(); };
    const keys = (event: KeyboardEvent): void => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
        if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
        event.preventDefault();
        const entries = [...menu.querySelectorAll<HTMLButtonElement>("button")];
        const index = entries.indexOf(document.activeElement as HTMLButtonElement);
        entries[(index + (event.key === "ArrowDown" ? 1 : -1) + entries.length) % entries.length]?.focus();
    };
    let open = true;
    const close = (): void => {
        if (!open) return;
        open = false; menu.remove();
        document.removeEventListener("pointerdown", outside, true); window.removeEventListener("keydown", keys, true);
        for (const type of ["pointerdown", "mousedown"]) window.removeEventListener(type, shield, true);
        window.removeEventListener("blur", close); window.removeEventListener("resize", close); document.removeEventListener("scroll", close, true);
    };
    host.append(menu);
    const width = menu.offsetWidth, height = menu.offsetHeight;
    menu.style.left = `${x + width > innerWidth - 16 ? Math.max(16, flipX - width) : x}px`;
    menu.style.top = `${Math.max(16, Math.min(y, innerHeight - height - 16))}px`;
    document.addEventListener("pointerdown", outside, true); window.addEventListener("keydown", keys, true);
    for (const type of ["pointerdown", "mousedown"]) window.addEventListener(type, shield, true);
    window.addEventListener("blur", close); window.addEventListener("resize", close); document.addEventListener("scroll", close, true);
    return close;
}
