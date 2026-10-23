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

import type { NoticeOptions } from "./types";
import { brandGlyph, uiIcon } from "../components/icons";

export interface Notice { time: string; message: string; level: "info" | "error"; }
const surface = "vackle-toast flex items-center gap-3 overflow-hidden rounded-2xl border-[0.5px] border-white/[0.06] bg-[var(--toast-surface,var(--ui-layer-chip))] pl-3 pr-2 py-2 text-sm";
const dismiss = "shrink-0 transition-colors cursor-pointer p-2 rounded-lg hover:bg-ui-bar-elevated text-ui-muted hover:text-ui-secondary focus-visible:outline-2 focus-visible:outline-ui-primary";
export class Notifications {
    private readonly root = document.createElement("div");
    private readonly history: Notice[] = [];
    private readonly stack: { element: HTMLElement; duration: number }[] = [];
    private timer: ReturnType<typeof setTimeout> | undefined;
    private paused = false;
    constructor() {
        this.root.id = "vackle-notifications";
        this.root.dataset.vackleRoot = "";
        this.root.setAttribute("aria-live", "polite");
        const pause = (paused: boolean): void => { this.paused = paused; this.schedule(); };
        this.root.addEventListener("pointerenter", () => pause(true));
        this.root.addEventListener("pointerleave", () => pause(false));
        this.root.addEventListener("focusin", () => pause(true));
        this.root.addEventListener("focusout", event => { if (!this.root.contains(event.relatedTarget as Node | null)) pause(false); });
        document.body.append(this.root);
    }
    get entries(): readonly Notice[] { return this.history.map(entry => ({ ...entry })); }
    notify(message: string, level: "info" | "error" = "info", options: NoticeOptions = {}): void {
        const text = message.slice(0, 1024);
        const notice = { time: new Date().toISOString(), message: level === "error" ? text.charAt(0).toUpperCase() + text.slice(1) : text, level };
        this.history.push(notice);
        if (this.history.length > 100) this.history.shift();
        const toast = document.createElement("div");
        toast.className = surface;
        toast.dataset.level = level;
        if (level === "error") toast.setAttribute("role", "alert");
        const body = document.createElement("p");
        body.className = "min-w-0 flex-1 break-words text-ui-secondary";
        body.textContent = notice.message;
        const { url, before } = options.avatar ?? {};
        const shown = notice.message;
        const at = !url || !before || !/^https:\/\//.test(url) ? -1 : shown.endsWith(before) && !shown.startsWith(before) ? shown.length - before.length : shown.indexOf(before);
        if (at >= 0) {
            const avatar = document.createElement("img"); avatar.className = "vackle-toast-avatar"; avatar.src = url!; avatar.alt = "";
            const name = document.createElement("span"); name.className = "vackle-toast-name";
            name.append(avatar, before!);
            body.replaceChildren(shown.slice(0, at), name, shown.slice(at + before!.length));
        }
        const close = document.createElement("button");
        close.type = "button"; close.className = dismiss; close.setAttribute("aria-label", "Dismiss notification");
        close.append(uiIcon("close", 16));
        close.addEventListener("click", () => this.remove(toast));
        toast.append(level === "error" ? uiIcon("error", 24) : brandGlyph(), body);
        if (options.action) {
            const { label, run } = options.action;
            const action = document.createElement("button");
            action.type = "button"; action.className = "vackle-toast-action"; action.textContent = label;
            action.addEventListener("click", () => { this.remove(toast); run(); });
            toast.append(action);
        }
        toast.append(close);
        this.stack.unshift({ element: toast, duration: options.duration ?? (level === "error" ? 6000 : 2500) });
        this.root.append(toast);
        for (const stale of this.stack.splice(3)) stale.element.remove();
        this.layout(); this.schedule();
    }
    private remove(toast: HTMLElement): void {
        const index = this.stack.findIndex(entry => entry.element === toast);
        if (index < 0) return;
        this.stack.splice(index, 1);
        toast.classList.add("vackle-toast-leaving");
        toast.setAttribute("aria-hidden", "true");
        setTimeout(() => toast.remove(), 200);
        this.layout(); this.schedule();
    }
    private layout(): void {
        this.stack.forEach((entry, depth) => {
            entry.element.style.setProperty("--depth", String(depth));
            entry.element.toggleAttribute("inert", depth > 0);
        });
    }
    private schedule(): void {
        if (this.timer) clearTimeout(this.timer);
        this.timer = undefined;
        const top = this.stack[0];
        if (top && !this.paused) this.timer = setTimeout(() => this.remove(top.element), top.duration);
    }
    dispose(): void { if (this.timer) clearTimeout(this.timer); this.root.remove(); }
}
