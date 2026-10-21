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

export function tooltip(target: HTMLElement, text: string): () => void {
    let tip: HTMLElement | undefined;
    const hide = (): void => { tip?.remove(); tip = undefined; };
    target.addEventListener("mouseenter", () => {
        hide();
        tip = Object.assign(document.createElement("div"), { textContent: text });
        tip.setAttribute("role", "tooltip"); tip.dataset.vackleRoot = "";
        tip.style.cssText = "position:fixed;z-index:300;pointer-events:none;padding:6px 10px;border-radius:8px;background:var(--ui-layer-tooltip-elevated,#28282f);color:rgb(255 255 255 / .9);font-size:13px;font-weight:500;white-space:nowrap;box-shadow:0 4px 12px rgb(0 0 0 / .35)";
        document.body.append(tip);
        const anchor = target.getBoundingClientRect(), size = tip.getBoundingClientRect();
        tip.style.left = `${Math.max(4, anchor.left + anchor.width / 2 - size.width / 2)}px`;
        tip.style.top = `${Math.max(4, anchor.top - size.height - 6)}px`;
    });
    target.addEventListener("mouseleave", hide);
    return hide;
}
