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

import type { ContextAction } from "./types";
import type { Notifications } from "./notifications";
import { identifier } from "../settings/schema";
import { log } from "../utils/logger";
import { uiIcon } from "../components/icons";
import { openPopupMenu } from "../components/popupMenu";

export class ContextMenus {
    private readonly actions = new Map<string, ContextAction>();
    private readonly nodes = new Set<HTMLElement>();
    private restorePosition: (() => void) | undefined;
    private closeSubmenu: (() => void) | undefined;
    private hover: AbortController | undefined;
    private pending: MutationObserver | undefined;
    private timeout: ReturnType<typeof setTimeout> | undefined;
    private readonly listener: (event: MouseEvent) => void;
    constructor(private readonly notices: Notifications) {
        this.listener = event => { setTimeout(() => this.open(event)); };
    }
    private open(event: MouseEvent): void {
        const source = event.target instanceof Element && !event.target.closest("[data-vackle-root]") ? event.target : null;
        if (!source) return;
        const matches = [...this.actions.values()].flatMap(action => {
            const target = source.closest<HTMLElement>(action.selector ?? "a,pre,code");
            try { return target && action.matches(target) ? [{ action, target }] : []; } catch (error) { log("context", "Matcher failed", error); return []; }
        });
        if (!matches.length) return;
        this.clear();
        const attach = (): boolean => {
            const menu = [...document.querySelectorAll<HTMLElement>('[data-context-submenu="true"]')].find(element => element.isConnected && element.getBoundingClientRect().width > 0);
            if (!menu) return false;
            this.pending?.disconnect(); this.pending = undefined;
            if (this.timeout) clearTimeout(this.timeout);
            this.timeout = undefined;
            const originals = [...menu.querySelectorAll<HTMLButtonElement>(":scope > button")];
            for (const { action, target } of matches) {
                const reference = [...menu.querySelectorAll<HTMLButtonElement>(":scope > button")].find(button => button.textContent?.trim() === (action.after ?? "Copy Text")) ?? originals[originals.length - 1];
                if (!reference) continue;
                const danger = (node: Element): boolean => /red|danger|destructive/.test(node.className);
                const template = originals.find(button => !button.disabled && !danger(button)) ?? originals.find(button => !button.disabled) ?? reference;
                const button = template.cloneNode(true) as HTMLButtonElement;
                button.disabled = false;
                if (danger(button)) { button.className = button.className.split(/\s+/).filter(name => !/red|danger|destructive/.test(name)).join(" "); button.classList.add("text-white/90"); }
                button.removeAttribute("id");
                button.dataset.vackleContextAction = action.id;
                button.setAttribute("role", "menuitem");
                const label = button.querySelector("span");
                const iconSlot = template.querySelector(":scope > span:last-child:not(:first-child)")?.className || "shrink-0 ml-2";
                if (label) { label.textContent = action.label; button.replaceChildren(label); } else button.textContent = action.label;
                const glyph = action.submenu ? "arrow" : action.icon;
                if (glyph) { const slot = document.createElement("span"); slot.className = iconSlot; const svg = uiIcon(glyph, 14); svg.classList.add("w-3.5", "h-3.5"); slot.append(svg); button.append(slot); }
                const submenu = action.submenu;
                let popup: Element | null = null, closing: ReturnType<typeof setTimeout> | undefined;
                const show = (): void => {
                    clearTimeout(closing); closing = undefined;
                    if (!submenu || popup?.isConnected) return;
                    this.closeSubmenu?.();
                    const escape = (): void => { this.clear(); document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); };
                    const items = submenu(target).map(item => ({ ...item, run: () => { escape(); item.run(); } }));
                    const bounds = button.getBoundingClientRect(), host = target.closest('[role="dialog"]') ?? document.body;
                    const close = openPopupMenu(bounds.right + 4, bounds.top - 8, items, host, bounds.left - 4);
                    popup = host.lastElementChild;
                    this.closeSubmenu = () => { clearTimeout(closing); closing = undefined; close(); popup = null; };
                };
                if (submenu) {
                    button.setAttribute("aria-haspopup", "menu");
                    this.hover ??= new AbortController();
                    document.addEventListener("pointermove", event => {
                        const over = event.target instanceof Element ? event.target : null;
                        if (!over) return;
                        if (button.contains(over)) { show(); return; }
                        if (popup?.contains(over)) { clearTimeout(closing); closing = undefined; return; }
                        if (popup?.isConnected && menu.contains(over) && over.closest("button")) {
                            const leaving = popup;
                            clearTimeout(closing);
                            closing = setTimeout(() => { closing = undefined; if (popup === leaving) this.closeSubmenu?.(); }, 250);
                        }
                    }, { signal: this.hover.signal });
                }
                let activated = false;
                const activate = (event: Event): void => {
                    if (submenu) { event.stopPropagation(); show(); return; }
                    if (activated) return;
                    activated = true;
                    event.stopPropagation();
                    this.clear();
                    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
                    Promise.resolve().then(() => action.run?.(target)).catch(error => {
                        log("context", "Action failed", error);
                        this.notices.notify(error instanceof Error ? error.message : String(error), "error");
                    });
                };
                button.addEventListener("pointerup", event => { if (event.button === 0) activate(event); });
                button.addEventListener("click", activate);
                reference.after(button);
                this.nodes.add(button);
            }
            const bounds = menu.getBoundingClientRect();
            if (bounds.bottom > innerHeight - 8) {
                const previous = menu.style.top;
                const top = `${Math.max(8, bounds.top - (bounds.bottom - innerHeight + 8))}px`;
                menu.style.top = top;
                this.restorePosition = () => { if (menu.style.top === top) menu.style.top = previous; };
            }
            return true;
        };
        this.pending = new MutationObserver(() => { attach(); });
        this.pending.observe(document.body, { childList: true, subtree: true });
        this.timeout = setTimeout(() => { this.pending?.disconnect(); this.pending = undefined; this.timeout = undefined; }, 250);
        queueMicrotask(attach);
    }
    register(owner: string, action: ContextAction): () => void {
        const key = `${owner}:${action.id}`;
        if (!identifier(action.id) || this.actions.has(key) || !action.label) throw new Error("Invalid context action");
        if (!this.actions.size) document.addEventListener("contextmenu", this.listener, true);
        this.actions.set(key, action);
        return () => {
            this.actions.delete(key); this.clear();
            if (!this.actions.size) document.removeEventListener("contextmenu", this.listener, true);
        };
    }
    private clear(): void {
        this.pending?.disconnect(); this.pending = undefined;
        if (this.timeout) clearTimeout(this.timeout); this.timeout = undefined;
        for (const node of this.nodes) node.remove(); this.nodes.clear();
        this.restorePosition?.(); this.restorePosition = undefined;
        this.closeSubmenu?.(); this.closeSubmenu = undefined;
        this.hover?.abort(); this.hover = undefined;
    }
    dispose(): void { document.removeEventListener("contextmenu", this.listener, true); this.clear(); this.actions.clear(); }
}
