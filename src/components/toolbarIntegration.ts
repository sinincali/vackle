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

import type { SettingsStore } from "../settings/settingsStore";

function pageZoom(): number {
    return innerWidth > 0 && outerWidth > 0 ? Math.round(outerWidth / innerWidth * 100) / 100 : 1;
}
export function mountToolbox(button: HTMLButtonElement, store: SettingsStore): () => void {
    const fit = (): void => {
        const zoom = ["titlebar", "fallback"].includes(button.dataset.placement ?? "") ? pageZoom() : 1;
        button.style.zoom = zoom === 1 ? "" : String(1 / zoom);
    };
    const place = (): void => {
        const location = store.value.toolbox;
        if (location === "hidden") { button.remove(); button.dataset.placement = "hidden"; return; }
        if (location === "panel") {
            const cog = [...document.querySelectorAll('button[aria-label="Settings"]')].find(entry => entry.parentElement?.parentElement?.querySelector('button:is([aria-label="Mute"],[aria-label="Unmute"])'))?.parentElement;
            if (cog && button.nextElementSibling !== cog) cog.before(button);
            button.dataset.placement = "panel";
            fit(); return;
        }
        if (location === "profile") {
            const status = document.querySelector('.bg-ui-bar:has(button[aria-label="Open public profile"]) > .relative');
            if (status && button.previousElementSibling !== status) status.after(button);
            if (!status) button.remove();
            button.dataset.placement = "profile";
            fit(); return;
        }
        const titlebar = [...document.querySelectorAll<HTMLElement>('[data-tauri-drag-region="true"]')].find(element => {
            const bounds = element.getBoundingClientRect();
            return bounds.top <= 4 && bounds.height >= 20 && bounds.height <= 40 && bounds.width > 240 &&
                [...element.children].some(child => child.getAttribute("aria-hidden") === "true");
        });
        const spacer = titlebar ? [...titlebar.children].find(child => child.getAttribute("aria-hidden") === "true") : undefined;
        if (titlebar && spacer) {
            if (button.parentElement !== titlebar || button.nextElementSibling !== spacer) titlebar.insertBefore(button, spacer);
            button.dataset.placement = "titlebar";
            fit();
            return;
        }
        const memberControl = document.querySelector<HTMLButtonElement>('button[aria-label="Hide member list"],button[aria-label="Show member list"]');
        const toolbar = memberControl?.parentElement?.parentElement;
        if (toolbar && toolbar.getBoundingClientRect().top < 100) {
            if (button.parentElement !== toolbar) toolbar.prepend(button);
            button.dataset.placement = "toolbar";
        } else {
            if (button.parentElement !== document.body) document.body.append(button);
            button.dataset.placement = "fallback";
        }
        fit();
    };
    let scheduled = false;
    const observer = new MutationObserver(() => {
        if (button.isConnected && button.dataset.placement !== "fallback") return;
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(() => { scheduled = false; if (active) place(); });
    });
    let active = true;
    place();
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", fit);
    const stopSettings = store.observeChanges(place);
    return () => { active = false; observer.disconnect(); stopSettings(); window.removeEventListener("resize", fit); button.remove(); };
}
