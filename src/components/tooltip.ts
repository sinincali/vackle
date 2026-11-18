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

const arrow = '<div style="position:absolute;pointer-events:none;width:16px;height:6px;top:-6px;z-index:1"><svg width="16" height="7" viewBox="0 0 16 7" aria-hidden="true" style="position:absolute;top:0;left:0"><path d="M 1.771 5.75 L 6.304 1.565 Q 8 0 9.696 1.565 L 14.229 5.75 L 14.229 7 L 1.771 7 Z" fill="#23232C"/></svg></div>';

export function tooltip(target: HTMLElement, label: string | (() => string), below = false): () => void {
    let tip: HTMLElement | undefined;
    const hide = (): void => { tip?.remove(); tip = undefined; };
    target.addEventListener("mouseenter", () => {
        hide();
        const text = typeof label === "function" ? label() : label;
        tip = document.createElement("div");
        tip.setAttribute("role", "tooltip"); tip.dataset.vackleRoot = "";
        if (below) {
            const box = Object.assign(document.createElement("div"), { textContent: text });
            box.style.cssText = "position:relative;padding:8px 12px;border-radius:12px;background:#23232c;color:rgb(255 255 255 / .9);font-size:14px;line-height:20px;white-space:nowrap";
            box.insertAdjacentHTML("afterbegin", arrow);
            tip.style.cssText = "position:fixed;z-index:300;pointer-events:none;user-select:none";
            tip.append(box);
        } else {
            tip.textContent = text;
            tip.style.cssText = "position:fixed;z-index:300;pointer-events:none;padding:6px 10px;border-radius:8px;background:var(--ui-layer-tooltip-elevated,#28282f);color:rgb(255 255 255 / .9);font-size:13px;font-weight:500;white-space:nowrap;box-shadow:0 4px 12px rgb(0 0 0 / .35)";
        }
        document.body.append(tip);
        const anchor = target.getBoundingClientRect(), size = tip.getBoundingClientRect();
        const left = Math.max(4, anchor.left + anchor.width / 2 - size.width / 2);
        tip.style.left = `${left}px`;
        tip.style.top = below ? `${anchor.bottom + 12}px` : `${Math.max(4, anchor.top - size.height - 6)}px`;
        if (below) (tip.firstElementChild?.firstElementChild as HTMLElement).style.left = `${anchor.left + anchor.width / 2 - left - 8}px`;
    });
    target.addEventListener("mouseleave", hide);
    return hide;
}
