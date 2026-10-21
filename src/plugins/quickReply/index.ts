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

import type { Plugin } from "../../api/types";
import { fiberProps } from "../../components/reactFiber";

interface Row { element: HTMLElement; id: string; own: boolean; }
function rows(): Row[] {
    return [...document.querySelectorAll<HTMLElement>("[data-message-id]")].flatMap(element => {
        let own: unknown;
        for (const props of fiberProps(element, 3)) own ??= props.isOwn;
        const id = element.dataset.messageId;
        return id && !id.startsWith("ephemeral-") && element.querySelector('button[aria-label="Reply"]') ? [{ element, id, own: own === true }] : [];
    }).sort((a, b) => a.element.getBoundingClientRect().top - b.element.getBoundingClientRect().top);
}
export function nextId(ids: string[], current: string | null, up: boolean): string | null {
    if (current === null) return ids.at(-1) ?? null;
    const index = ids.indexOf(current);
    if (index === -1) return ids.at(-1) ?? null;
    return ids[up ? index - 1 : index + 1] ?? null;
}

export default {
    id: "quick-reply", name: "Quick Reply", description: "Reply to (Ctrl + Up/Down) and edit (Ctrl + Shift + Up/Down) messages with keyboard shortcuts.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Chat", "Shortcuts"], enabledByDefault: false,
    start({ resources, api }) {
        let replying: string | null = null; let editing: string | null = null;
        api.onRoute(() => { replying = null; editing = null; });
        const press = (row: Row, label: string): void => row.element.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)?.click();
        const reveal = (row: Row): void => {
            const box = row.element.getBoundingClientRect();
            if (box.bottom < 150 || box.top - innerHeight >= -150) row.element.scrollIntoView({ block: "center" });
        };
        const wait = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 30));
        const steps: (() => Promise<void>)[] = []; let running = false;
        const enqueue = (step: () => Promise<void>): void => {
            steps.push(step);
            if (running) return;
            running = true;
            void (async () => { while (steps.length) await steps.shift()!().catch(() => undefined); running = false; })();
        };
        const closeEditors = async (): Promise<void> => {
            for (let attempt = 0; attempt < 10; attempt++) {
                const editors = [...document.querySelectorAll<HTMLTextAreaElement>("[data-message-id] textarea")];
                if (!editors.length) return;
                for (const editor of editors) editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
                await wait();
            }
        };
        const edit = async (up: boolean): Promise<void> => {
            if (!document.querySelector("[data-message-id] textarea")) editing = null;
            await closeEditors();
            const own = rows().filter(row => row.own);
            editing = nextId(own.map(row => row.id), editing, up);
            const row = own.find(entry => entry.id === editing);
            if (!row) return;
            press(row, "Edit message"); reveal(row);
            await wait();
        };
        const reply = async (up: boolean): Promise<void> => {
            if (!document.querySelector('button[aria-label="Cancel reply"]')) replying = null;
            const list = rows();
            replying = nextId(list.map(row => row.id), replying, up);
            const row = list.find(entry => entry.id === replying);
            if (!row) { document.querySelector<HTMLButtonElement>('button[aria-label="Cancel reply"]')?.click(); return; }
            press(row, "Reply"); reveal(row);
            document.querySelector<HTMLTextAreaElement>("textarea.rich-composer-input")?.focus({ preventScroll: true });
            await wait();
        };
        const keydown = (event: KeyboardEvent): void => {
            const up = event.key === "ArrowUp";
            if (!up && event.key !== "ArrowDown" || !event.ctrlKey || event.altKey || event.metaKey) return;
            if (!rows().length) return;
            event.preventDefault();
            enqueue(() => event.shiftKey ? edit(up) : reply(up));
        };
        document.addEventListener("keydown", keydown, true);
        resources.add(() => document.removeEventListener("keydown", keydown, true));
    }
} satisfies Plugin;
