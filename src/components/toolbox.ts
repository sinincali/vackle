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

import type { CustomCss } from "../core/customCss";
import type { PluginManager } from "../core/pluginManager";
import type { Themes } from "../core/themes";
import type { SettingsStore } from "../settings/settingsStore";
import { log } from "../utils/logger";
import { brandGlyph, uiIcon, type IconName } from "./icons";
import { element, keys } from "./primitives";
import { mountToolbox } from "./toolbarIntegration";

type SettingsSection = "overview" | "plugins" | "themes" | "css" | "notifications" | "diagnostics";
interface Submenu { trigger: HTMLButtonElement; panel: HTMLElement; show(): void; }
interface MenuItem { icon?: IconName; checked?: boolean; meta?: string; keys?: readonly string[]; }
export function createToolbox(manager: PluginManager, store: SettingsStore, customCss: CustomCss, themes: Themes,
    openSettings: (section?: SettingsSection) => void, openCommands: () => void, restart?: () => Promise<void>): { button: HTMLButtonElement; dispose(): void } {
    const button = element("button"); button.id = "vackle-toolbox-button"; button.type = "button";
    button.title = "Vackle Toolbox"; button.setAttribute("aria-label", "Vackle Toolbox"); button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", "false"); button.setAttribute("aria-controls", "vackle-toolbox-menu"); button.append(brandGlyph(), element("span", "vackle-toolbox-label", "Vackle"), uiIcon("arrow", 14));
    const menu = element("div"); menu.id = "vackle-toolbox-menu"; menu.hidden = true;
    menu.setAttribute("role", "menu"); menu.setAttribute("aria-label", "Vackle Toolbox");
    const status = element("p", "vackle-menu-status"); status.setAttribute("role", "status");
    const unmount = mountToolbox(button, store); document.body.append(menu);
    let disposed = false;
    let hoverTimer: ReturnType<typeof setTimeout> | undefined;
    const submenus: Submenu[] = [];
    const cancelHover = (): void => { if (hoverTimer) clearTimeout(hoverTimer); hoverTimer = undefined; };
    const hideSubmenus = (): void => {
        cancelHover();
        for (const entry of submenus) { entry.panel.hidden = true; entry.trigger.setAttribute("aria-expanded", "false"); }
    };
    const positionSubmenu = (entry: Submenu): void => {
        if (entry.panel.hidden) return;
        const bounds = menu.getBoundingClientRect(); const trigger = entry.trigger.getBoundingClientRect();
        const width = entry.panel.offsetWidth;
        const left = bounds.left >= width + 14 ? bounds.left - width - 6 : bounds.right + 6;
        entry.panel.dataset.side = left < bounds.left ? "left" : "right";
        entry.panel.style.left = `${Math.max(8, Math.min(left, innerWidth - width - 8))}px`;
        entry.panel.style.top = `${Math.max(8, Math.min(trigger.top - 6, innerHeight - entry.panel.offsetHeight - 8))}px`;
    };
    const position = (): void => {
        if (menu.hidden) return;
        const bounds = button.getBoundingClientRect(); const width = menu.offsetWidth; const height = menu.offsetHeight;
        const beside = button.dataset.placement === "profile";
        const left = beside ? bounds.right + 12 : bounds.right - width;
        const above = !beside && bounds.bottom + 8 + height > innerHeight - 8;
        const top = beside ? bounds.top : above ? bounds.top - 8 - height : bounds.bottom + 8;
        const x = Math.max(8, Math.min(left, innerWidth - width - 8)); const y = Math.max(8, Math.min(top, innerHeight - height - 8));
        menu.style.left = `${x}px`; menu.style.top = `${y}px`;
        menu.dataset.side = beside ? "left" : above ? "bottom" : "top";
        const caret = beside ? bounds.top + bounds.height / 2 - y : bounds.left + bounds.width / 2 - x;
        menu.style.setProperty("--vk-caret", `${Math.max(14, Math.min(caret, (beside ? height : width) - 14))}px`);
        for (const entry of submenus) positionSubmenu(entry);
    };
    const close = (focus = false): void => { hideSubmenus(); menu.hidden = true; delete menu.dataset.settled; button.setAttribute("aria-expanded", "false"); if (focus) button.focus(); };
    const action = (operation: () => Promise<void>): void => {
        if (menu.dataset.busy === "true") return;
        const opened = submenus.find(entry => !entry.panel.hidden)?.panel.getAttribute("aria-label");
        const focused = menu.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.menuKey : undefined;
        const scrolled = menu.querySelector(".vackle-menu-scroll")?.scrollTop ?? 0;
        menu.dataset.busy = "true";
        const slow = setTimeout(() => { status.textContent = "Saving…"; for (const control of menu.querySelectorAll<HTMLButtonElement>("button")) control.disabled = true; position(); }, 400);
        Promise.resolve().then(operation).then(() => finish(), error => { log("toolbox", "Action failed", error); finish(error); });
        const finish = (error?: unknown): void => {
            clearTimeout(slow);
            if (disposed) return;
            delete menu.dataset.busy; menu.dataset.settled = ""; render();
            if (!menu.hidden) {
                submenus.find(entry => entry.panel.getAttribute("aria-label") === opened)?.show();
                const list = menu.querySelector(".vackle-menu-scroll"); if (list) list.scrollTop = scrolled;
                if (focused) [...menu.querySelectorAll<HTMLButtonElement>("button")].find(entry => entry.dataset.menuKey === focused)?.focus({ preventScroll: true });
                position();
            }
            if (error) { status.textContent = error instanceof Error ? error.message : String(error); position(); }
        };
    };
    const divider = (parent: HTMLElement): void => { const line = element("div", "vackle-menu-divider"); line.setAttribute("role", "separator"); parent.append(line); };
    const item = (parent: HTMLElement, label: string, handler: () => void, options: MenuItem = {}): HTMLButtonElement => {
        const entry = element("button"); entry.type = "button";
        entry.dataset.menuKey = `${parent.getAttribute("aria-label")}:${label}`;
        entry.setAttribute("aria-label", label); entry.setAttribute("role", options.checked === undefined ? "menuitem" : "menuitemcheckbox");
        if (options.icon) entry.append(uiIcon(options.icon));
        entry.append(element("span", "vackle-menu-label", label));
        if (options.meta) entry.append(element("span", "vackle-menu-meta", options.meta));
        if (options.keys) entry.append(keys(options.keys));
        if (options.checked !== undefined) {
            entry.setAttribute("aria-checked", String(options.checked));
            const check = element("span", "vackle-menu-check"); check.setAttribute("aria-hidden", "true");
            check.append(uiIcon("check", 12)); entry.append(check);
        }
        const leaveSubmenus = (): void => { if (parent === menu && !entry.hasAttribute("aria-haspopup")) hideSubmenus(); };
        entry.addEventListener("pointerenter", leaveSubmenus); entry.addEventListener("focus", leaveSubmenus);
        entry.addEventListener("click", () => { if (options.checked !== undefined) entry.focus({ preventScroll: true }); handler(); });
        parent.append(entry); return entry;
    };
    const submenu = (label: string, section: "plugins" | "themes", meta: string, populate: (container: HTMLElement) => void): void => {
        const wrapper = element("div", "vackle-submenu-wrap");
        const trigger = item(wrapper, label, () => { close(); openSettings(section); }, { icon: section, meta });
        trigger.dataset.menuKey = `Vackle Toolbox:${label}`;
        trigger.setAttribute("aria-haspopup", "menu"); trigger.setAttribute("aria-expanded", "false"); trigger.append(uiIcon("arrow", 14));
        const nested = element("div", "vackle-submenu"); nested.hidden = true;
        nested.setAttribute("role", "menu"); nested.setAttribute("aria-label", label);
        nested.append(element("div", "vackle-menu-heading", label));
        const entry: Submenu = { trigger, panel: nested, show() { hideSubmenus(); nested.hidden = false; trigger.setAttribute("aria-expanded", "true"); positionSubmenu(entry); } };
        const scheduleHide = (): void => { cancelHover(); hoverTimer = setTimeout(() => { nested.hidden = true; trigger.setAttribute("aria-expanded", "false"); hoverTimer = undefined; }, 140); };
        wrapper.addEventListener("pointerenter", () => entry.show()); wrapper.addEventListener("pointerleave", scheduleHide);
        nested.addEventListener("pointerenter", cancelHover); nested.addEventListener("pointerleave", scheduleHide);
        trigger.addEventListener("focus", () => entry.show());
        trigger.addEventListener("keydown", event => { if (event.key === "ArrowRight") { event.preventDefault(); event.stopPropagation(); entry.show(); nested.querySelector<HTMLButtonElement>("button")?.focus(); } });
        nested.addEventListener("keydown", event => { if (event.key === "ArrowLeft") { event.preventDefault(); event.stopPropagation(); trigger.focus(); hideSubmenus(); } });
        submenus.push(entry); populate(nested); wrapper.append(nested); menu.append(wrapper);
    };
    const render = (): void => {
        hideSubmenus(); submenus.length = 0; menu.replaceChildren();
        const states = manager.status(); const enabled = states.filter(state => state.active).length; const saved = store.value;
        const header = element("div", "vackle-menu-header"); header.append(brandGlyph(), element("span", "", "Vackle"));
        menu.append(header); divider(menu);
        item(menu, "Settings", () => { close(); openSettings(); }, { icon: "overview", keys: ["Ctrl", "Shift", "V"] });
        submenu("Plugins", "plugins", `${enabled} of ${manager.plugins.length}`, nested => {
            const list = element("div", "vackle-menu-scroll"); nested.append(list);
            for (const plugin of manager.plugins) item(list, plugin.name, () => action(() => manager.setEnabled(plugin.id, !manager.status().some(state => state.id === plugin.id && state.enabled))), { checked: states.some(state => state.id === plugin.id && state.enabled), ...(states.some(state => state.id === plugin.id && state.pendingRestart) ? { meta: "Restart" } : {}) });
            divider(nested); item(nested, "Manage plugins", () => { close(); openSettings("plugins"); }, { icon: "plugins" });
        });
        submenu("Themes", "themes", saved.themes.length ? `${saved.themes.filter(theme => theme.enabled).length} of ${saved.themes.length}` : "", nested => {
            for (const theme of saved.themes) item(nested, theme.name, () => action(() => themes.setEnabled(theme.id, !store.value.themes.find(entry => entry.id === theme.id)?.enabled)), { checked: theme.enabled });
            if (saved.themes.length) divider(nested);
            item(nested, "Custom CSS", () => action(() => customCss.setEnabled(!store.value.css.enabled)), { checked: saved.css.enabled });
            divider(nested); item(nested, "Manage themes", () => { close(); openSettings("themes"); }, { icon: "themes" });
        });
        divider(menu);
        item(menu, "Edit QuickCSS", () => { close(); openSettings("css"); }, { icon: "css" });
        item(menu, "Command Palette", () => { close(); openCommands(); }, { icon: "commands", keys: ["Ctrl", "Shift", "P"] });
        item(menu, "Notification Log", () => { close(); openSettings("notifications"); }, { icon: "notifications" });
        item(menu, "Developer", () => { close(); openSettings("diagnostics"); }, { icon: "diagnostics" });
        if (manager.pendingRestart && restart) { divider(menu); item(menu, "Restart Flackle", () => action(restart)); }
        status.textContent = ""; menu.append(status);
    };
    const open = (focus: boolean): void => { render(); menu.hidden = false; button.setAttribute("aria-expanded", "true"); position(); if (focus) menu.querySelector<HTMLButtonElement>("button")?.focus(); };
    button.addEventListener("click", event => { if (menu.hidden) open(event.detail === 0); else close(); });
    button.addEventListener("pointerdown", event => event.stopPropagation());
    for (const type of ["pointerdown", "mousedown"]) menu.addEventListener(type, event => event.stopPropagation());
    button.addEventListener("keydown", event => { if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); open(true); } });
    const outside = (event: PointerEvent): void => { if (!menu.contains(event.target as Node) && !button.contains(event.target as Node)) close(); };
    const keyboard = (event: KeyboardEvent): void => {
        if (menu.hidden) return;
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); return; }
        if (event.key === "Tab") close();
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || !menu.contains(document.activeElement)) return;
        event.preventDefault(); event.stopPropagation();
        const parent = document.activeElement?.closest('[role="menu"]') ?? menu;
        const entries = [...parent.querySelectorAll<HTMLButtonElement>(":scope > button,:scope > .vackle-submenu-wrap > button,:scope > .vackle-menu-scroll > button")].filter(entry => !entry.disabled);
        if (!entries.length) return;
        const current = entries.indexOf(document.activeElement as HTMLButtonElement);
        const index = event.key === "Home" ? 0 : event.key === "End" ? entries.length - 1 : (current + (event.key === "ArrowUp" ? -1 : 1) + entries.length) % entries.length;
        entries[index]?.focus();
    };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", keyboard, true);
    window.addEventListener("resize", position); menu.addEventListener("scroll", position, { passive: true });
    return { button, dispose() {
        disposed = true; cancelHover(); document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", keyboard, true);
        window.removeEventListener("resize", position); menu.removeEventListener("scroll", position); unmount(); menu.remove();
    } };
}
