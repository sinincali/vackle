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

export class Commands {
    private readonly registry = new Map<string, Command>();
    private palette: HTMLDialogElement | undefined;
    private search: HTMLInputElement | undefined;
    private list: HTMLElement | undefined;
    private readonly keyboard: (event: KeyboardEvent) => void;
    constructor(private readonly notices: Notifications) {
        this.keyboard = event => { if (event.ctrlKey && event.shiftKey && event.code === "KeyP") { event.preventDefault(); this.open(); } };
        window.addEventListener("keydown", this.keyboard);
    }
    private create(): void {
        if (this.palette) return;
        const palette = document.createElement("dialog"); palette.id = "vackle-command-palette"; palette.dataset.vackleRoot = ""; palette.setAttribute("aria-label", "Vackle commands");
        const search = document.createElement("input"); search.type = "search"; search.placeholder = "Search commands…"; search.setAttribute("aria-label", "Search Vackle commands");
        const list = document.createElement("div");
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
        palette.append(search, list); document.body.append(palette);
        this.palette = palette; this.search = search; this.list = list;
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
        const query = this.search.value.toLowerCase();
        for (const command of this.registry.values()) {
            if (!`${command.label} ${command.description}`.toLowerCase().includes(query)) continue;
            const button = document.createElement("button");
            const title = document.createElement("strong"); title.textContent = command.label;
            const description = document.createElement("span"); description.textContent = command.description;
            button.append(title, description);
            button.addEventListener("click", () => {
                this.palette!.close();
                Promise.resolve().then(() => command.run()).catch(error => { log("commands", "Command failed", error); this.notices.notify(error instanceof Error ? error.message : String(error), "error"); });
            });
            this.list.append(button);
        }
        if (!this.list.children.length) { const empty = document.createElement("p"); empty.textContent = "No matching commands"; this.list.append(empty); }
    }
    dispose(): void { window.removeEventListener("keydown", this.keyboard); this.palette?.close(); this.palette?.remove(); this.registry.clear(); }
}
