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

import { button, element } from "./primitives";

export const modalHost = (): Element => [...document.querySelectorAll('[role="dialog"]')].find(dialog => !dialog.closest("[data-vackle-root]") && dialog.getBoundingClientRect().width > 0) ?? document.body;
export function openModal(host: Element, title: string, body: HTMLElement, closed: () => void = () => {}): () => void {
    const opener = document.activeElement as HTMLElement | null;
    const backdrop = element("div", "vackle-modal-backdrop"); backdrop.dataset.vackleRoot = "";
    const modal = element("div", "vackle-modal"); modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true");
    const header = element("header", "vackle-modal-header");
    const heading = element("h2", "", title); heading.id = `vackle-modal-${Date.now()}`; modal.setAttribute("aria-labelledby", heading.id);
    const dismiss = button("", () => close(), "vackle-icon-button", "close"); dismiss.setAttribute("aria-label", "Close"); dismiss.title = "Close";
    header.append(heading, dismiss); body.classList.add("vackle-modal-body"); modal.append(header, body); backdrop.append(modal);
    const escape = (event: KeyboardEvent): void => { if (event.key === "Escape" && backdrop.isConnected) { event.preventDefault(); event.stopPropagation(); close(); } };
    const shield = (event: Event): void => {
        if (!backdrop.contains(event.target as Node)) return;
        event.stopPropagation();
        if (event.type === "pointerdown" && event.target === backdrop) close();
    };
    let open = true;
    const close = (): void => {
        if (!open) return;
        open = false; window.removeEventListener("keydown", escape, true); backdrop.remove(); closed();
        for (const type of ["pointerdown", "mousedown"]) window.removeEventListener(type, shield, true);
        if (opener?.isConnected) opener.focus();
    };
    window.addEventListener("keydown", escape, true);
    for (const type of ["pointerdown", "mousedown"]) window.addEventListener(type, shield, true);
    host.append(backdrop);
    (body.querySelector<HTMLElement>("input, button, textarea, select") ?? dismiss).focus();
    return close;
}
