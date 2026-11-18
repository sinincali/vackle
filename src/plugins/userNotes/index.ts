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
import { flackleMe, flackleStore } from "../../components/flackleStores";
import { fiberProps } from "../../components/reactFiber";

const STORAGE_KEY = "vackle-user-notes";
const MAX_NOTE = 1000;
const SAVE_DELAY = 400;
const css = ".vackle-note{margin-top:12px;text-align:left}.vackle-note-label{display:block;font-size:12px;line-height:16px;font-weight:500;color:rgb(255 255 255/.5)}" +
    ".vackle-note-input{box-sizing:border-box;display:block;margin-top:8px;width:100%;min-height:36px;max-height:140px;padding:8px 10px;border:0;border-radius:8px;background:rgb(255 255 255/.05);color:rgb(255 255 255/.8);font-family:inherit;font-size:14px;line-height:20px;resize:none;outline:none;overflow-y:auto;field-sizing:content;scrollbar-width:thin;scrollbar-color:rgb(255 255 255/.2) transparent}" +
    ".vackle-note-input::placeholder{color:rgb(255 255 255/.3)}.vackle-note-input:focus{background:rgb(255 255 255/.07)}";

export function cleanNotes(value: unknown): Record<string, string> {
    const notes: Record<string, string> = Object.create(null) as Record<string, string>;
    if (typeof value !== "object" || value === null || Array.isArray(value)) return notes;
    for (const [id, note] of Object.entries(value)) {
        if (id === "__proto__" || !/^[\w-]{1,64}$/.test(id) || typeof note !== "string") continue;
        const text = note.slice(0, MAX_NOTE);
        if (text.trim()) notes[id] = text;
    }
    return notes;
}

export function createNote(initial: string, commit: (note: string) => void): { element: HTMLElement; flush(): void } {
    const element = Object.assign(document.createElement("div"), { className: "vackle-note" });
    element.dataset["vackleRoot"] = "";
    element.style.fontFamily = getComputedStyle(document.body).fontFamily;
    const label = Object.assign(document.createElement("label"), { className: "vackle-note-label", textContent: "Note" });
    const input = Object.assign(document.createElement("textarea"), { className: "vackle-note-input", rows: 1, maxLength: MAX_NOTE, value: initial, placeholder: "Click to add a note" });
    input.setAttribute("spellcheck", "false");
    label.append(input);
    element.append(label);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dirty = false;
    const autoSizes = typeof CSS !== "undefined" && CSS.supports("field-sizing", "content");
    const resize = (): void => {
        if (autoSizes) return;
        const scrolled: [Element, number][] = [];
        for (let node = element.parentElement; node; node = node.parentElement) if (node.scrollTop) scrolled.push([node, node.scrollTop]);
        input.style.height = "auto"; input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
        for (const [node, top] of scrolled) node.scrollTop = top;
    };
    const flush = (): void => { clearTimeout(timer); if (dirty) { dirty = false; commit(input.value); } };
    input.addEventListener("input", () => { dirty = true; resize(); clearTimeout(timer); timer = setTimeout(flush, SAVE_DELAY); });
    input.addEventListener("blur", flush);
    input.addEventListener("keydown", event => { if (event.key !== "Escape") event.stopPropagation(); });
    requestAnimationFrame(resize);
    return { element, flush };
}

export default {
    id: "user-notes", name: "User Notes", description: "Adds a private note to anyone's profile.",
    version: "1.0.0", author: "moon and contributors", tags: ["Social", "Profiles"], enabledByDefault: false,
    settings: {
        popover: { label: "Show on profile popups", default: true },
        profile: { label: "Show on full profiles", default: true }
    },
    async start({ settings, resources, api, log }) {
        let notes = (() => { try { return cleanNotes(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")); } catch { return cleanNotes({}); } })();
        const persist = (): void => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(notes)); } catch (error) { log("Could not save notes", error); } };
        const profiles = flackleStore<{ target?: { user?: { id?: string } } | null }>("openProfileModal");

        const attach = (host: HTMLElement | null, userId: unknown): (() => void) | undefined => {
            if (!host || typeof userId !== "string" || !/^[\w-]{1,64}$/.test(userId) || userId === flackleMe()?.id) return undefined;
            const { element, flush } = createNote(notes[userId] ?? "", note => {
                if (note.trim()) notes[userId] = note.slice(0, MAX_NOTE); else delete notes[userId];
                persist();
            });
            host.append(element);
            return () => { flush(); element.remove(); };
        };
        if (settings.popover !== false) api.observe('div.fixed button[aria-label$="full profile"]', avatar => {
            let userId: unknown;
            for (const props of fiberProps(avatar.querySelector("span") ?? avatar, 2)) userId ??= (props.user as { id?: unknown } | undefined)?.id ?? props.userId;
            return attach(avatar.parentElement, userId);
        });
        if (settings.profile !== false) api.observe('[role="dialog"] div.w-30.h-30.rounded-full', frame => attach(frame.parentElement?.parentElement ?? null, profiles?.getState().target?.user?.id));

        api.command({ id: "export-notes", label: "Copy notes", description: "Copy all your notes to the clipboard.", icon: "bookmark",
            run: () => navigator.clipboard.writeText(JSON.stringify(notes)).then(() => api.notify("Notes copied"), () => api.notify("Couldn't copy notes", "error")) });
        api.command({ id: "import-notes", label: "Import notes", description: "Add notes you copied earlier.", icon: "import",
            run: async () => {
                try {
                    const incoming = cleanNotes(JSON.parse(await navigator.clipboard.readText()));
                    const count = Object.keys(incoming).length;
                    if (!count) { api.notify("No notes on the clipboard", "error"); return; }
                    notes = Object.assign(cleanNotes({}), notes, incoming);
                    persist();
                    api.notify(`Imported ${count} ${count === 1 ? "note" : "notes"}`);
                } catch { api.notify("Couldn't read notes from the clipboard", "error"); }
            } });
        await resources.style(css);
    }
} satisfies Plugin;
