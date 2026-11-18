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

import type { Command } from "./types";
import type { Notifications } from "./notifications";
import { identifier } from "../settings/schema";
import { log } from "../utils/logger";
import { uiIcon } from "../components/icons";

export class Commands {
    private readonly registry = new Map<string, Command>();
    private palette: HTMLDialogElement | undefined;
    private search: HTMLInputElement | undefined;
    private list: HTMLElement | undefined;
    private clear: HTMLButtonElement | undefined;
    private tally: HTMLElement | undefined;
    private readonly keyboard: (event: KeyboardEvent) => void;
    constructor(private readonly notices: Notifications) {
        this.keyboard = event => { if (event.ctrlKey && event.shiftKey && event.code === "KeyP") { event.preventDefault(); this.open(); } };
        window.addEventListener("keydown", this.keyboard);
    }
    private create(): void {
        if (this.palette) return;
        const palette = document.createElement("dialog"); palette.id = "vackle-command-palette"; palette.dataset.vackleRoot = ""; palette.setAttribute("aria-label", "Vackle commands");
        const search = document.createElement("input"); search.type = "search"; search.placeholder = "Search commands…"; search.setAttribute("aria-label", "Search Vackle commands");
        const list = document.createElement("div"); list.className = "vackle-command-list";
        const clear = document.createElement("button"); clear.type = "button"; clear.className = "vackle-search-clear"; clear.setAttribute("aria-label", "Clear search");
        clear.append(uiIcon("close", 14));
        clear.addEventListener("click", () => { search.value = ""; this.render(); search.focus(); });
        const magnifier = uiIcon("search", 18); magnifier.classList.add("vackle-palette-icon");
        const box = document.createElement("div"); box.className = "vackle-search-box"; box.append(magnifier, search, clear);
        const hint = (keys: string[], label: string): HTMLElement => { const item = document.createElement("span"); for (const key of keys) item.append(Object.assign(document.createElement("kbd"), { textContent: key })); item.append(label); return item; };
        const hints = document.createElement("div"); hints.className = "vackle-palette-hints"; hints.append(hint(["↑", "↓"], "Navigate"), hint(["↵"], "Run"), hint(["Esc"], "Close"));
        const tally = document.createElement("span");
        const foot = document.createElement("div"); foot.className = "vackle-palette-foot"; foot.append(hints, tally);
        search.addEventListener("input", () => this.render());
        search.addEventListener("keydown", event => {
            if (event.key === "ArrowDown") { event.preventDefault(); list.querySelector<HTMLButtonElement>("button")?.focus(); }
            if (event.key === "Enter") { event.preventDefault(); list.querySelector<HTMLButtonElement>("button")?.click(); }
        });
        list.addEventListener("keydown", event => {
            const entries = [...list.querySelectorAll<HTMLButtonElement>("button")];
            const index = entries.indexOf(document.activeElement as HTMLButtonElement);
            if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); entries[(index + (event.key === "ArrowDown" ? 1 : -1) + entries.length) % entries.length]?.focus(); }
        });
        palette.addEventListener("click", event => { if (event.target === palette) palette.close(); });
        palette.append(box, list, foot); document.body.append(palette);
        this.palette = palette; this.search = search; this.list = list; this.clear = clear; this.tally = tally;
    }
    register(owner: string, command: Command): () => void {
        const key = `${owner}:${command.id}`;
        if (!identifier(command.id) || this.registry.has(key) || !command.label || typeof command.run !== "function") throw new Error("Invalid or duplicate command");
        this.registry.set(key, command);
        return () => { this.registry.delete(key); if (this.palette?.open) this.render(); };
    }
    get count(): number { return this.registry.size; }
    open(): void { this.create(); this.search!.value = ""; this.render(); if (!this.palette!.open) this.palette!.showModal(); this.search!.focus(); }
    private render(): void {
        if (!this.list || !this.search) return;
        this.list.replaceChildren();
        if (this.clear) this.clear.hidden = !this.search.value;
        const query = this.search.value.toLowerCase();
        for (const command of this.registry.values()) {
            if (!`${command.label} ${command.description}`.toLowerCase().includes(query)) continue;
            const button = document.createElement("button");
            const icon = uiIcon(command.icon ?? "commands", 32); icon.classList.add("vackle-command-icon");
            const text = document.createElement("span"); text.className = "vackle-command-text";
            const title = document.createElement("strong"); title.textContent = command.label;
            const description = document.createElement("small"); description.textContent = command.description;
            text.append(title, description);
            button.append(icon, text, Object.assign(document.createElement("kbd"), { textContent: "↵" }));
            button.addEventListener("click", () => {
                this.palette!.close();
                Promise.resolve().then(() => command.run()).catch(error => { log("commands", "Command failed", error); this.notices.notify(error instanceof Error ? error.message : String(error), "error"); });
            });
            this.list.append(button);
        }
        if (this.tally) this.tally.textContent = `${this.list.children.length} ${this.list.children.length === 1 ? "command" : "commands"}`;
        if (!this.list.children.length) { const empty = document.createElement("p"); empty.textContent = "No matching commands"; this.list.append(empty); }
    }
    dispose(): void { window.removeEventListener("keydown", this.keyboard); this.palette?.close(); this.palette?.remove(); this.registry.clear(); }
}
