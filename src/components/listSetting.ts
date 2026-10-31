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

import { uiIcon } from "./icons";
import { button, element } from "./primitives";
import { saveFile } from "./saveFile";

export function parseList(value: unknown): string[][] {
    let rows: unknown;
    try { rows = typeof value === "string" ? JSON.parse(value) : value; } catch { return []; }
    return Array.isArray(rows) ? rows.map(row => (Array.isArray(row) ? row : [row]).map(cell => String(cell ?? ""))) : [];
}
const limit = 4096;
const fits = (rows: readonly string[][]): boolean => JSON.stringify(rows).length <= limit;
export function mergeLists(current: readonly string[][], incoming: readonly string[][]): { rows: string[][]; added: number; full: number } {
    const seen = new Set(current.map(row => row[0]!.trim().toLowerCase()));
    const rows = [...current]; let added = 0, full = 0;
    for (const row of incoming) {
        const key = row[0]?.trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        if (fits([...rows, row])) { rows.push(row); added++; } else full++;
    }
    return { rows, added, full };
}

export function listSetting(label: string, columns: readonly string[], value: unknown, fileName: string, save: (next: string) => void, notify: (message: string) => void): HTMLElement {
    const root = element("div", "vackle-list-setting");
    const single = columns.length === 1;
    const body = element("div", "vackle-list-chips");
    const count = element("span", "vackle-list-count");
    let rows = parseList(value).map(row => columns.map((_, column) => (row[column] ?? "").trim())).filter(row => row[0]);
    const commit = (): void => save(JSON.stringify(rows));
    const remover = (index: number, name: string): HTMLButtonElement => {
        const remove = element("button", "vackle-list-remove"); remove.type = "button"; remove.setAttribute("aria-label", `Remove ${name}`); remove.title = "Remove";
        remove.append(uiIcon("close", 12)); remove.addEventListener("click", () => { rows.splice(index, 1); render(); commit(); });
        return remove;
    };
    const render = (): void => {
        body.replaceChildren(...rows.map((row, index) => {
            const item = element("div", "vackle-list-chip");
            if (single) item.append(element("span", "", row[0]));
            else item.append(element("span", "vackle-list-key", row[0]), element("span", "vackle-list-arrow", "→"), element("span", "vackle-list-value", row.slice(1).join(" ")));
            item.title = row.join(" → ");
            item.append(remover(index, row[0]!));
            return item;
        }));
        if (!rows.length) body.append(element("p", "vackle-list-empty", "Nothing added yet."));
        count.textContent = rows.length === 1 ? "1 entry" : `${rows.length} entries`;
    };
    const inputs = columns.map(name => { const input = element("input", "vackle-input"); input.placeholder = name; input.setAttribute("aria-label", name); return input; });
    const add = (): void => {
        const entry = inputs.map(input => input.value.trim());
        if (!entry[0] || (!single && !entry[1])) { inputs.find(input => !input.value.trim())?.focus(); return; }
        if (rows.some(row => row[0]!.toLowerCase() === entry[0]!.toLowerCase())) { notify(`"${entry[0]}" is already added`); inputs[0]!.select(); return; }
        if (!fits([...rows, entry])) { notify("This list is full. Remove something to add more"); return; }
        rows.push(entry); inputs.forEach(input => { input.value = ""; }); inputs[0]!.focus();
        render(); commit(); body.scrollTop = body.scrollHeight;
    };
    inputs.forEach(input => input.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); add(); } }));
    const form = element("div", "vackle-list-form");
    inputs.forEach((input, index) => { if (index) form.append(element("span", "vackle-list-arrow", "→")); form.append(input); });
    form.append(button("Add", add, "vackle-primary"));
    const file = element("input"); file.type = "file"; file.accept = ".json,application/json"; file.hidden = true;
    file.addEventListener("change", () => {
        const selected = file.files?.[0]; file.value = "";
        if (!selected) return;
        void selected.text().then(text => {
            const incoming = parseList(text);
            if (!incoming.length) { notify("That file has nothing to import"); return; }
            const merged = mergeLists(rows, incoming.map(row => columns.map((_, column) => (row[column] ?? "").trim())).filter(row => single || row[1]));
            rows = merged.rows;
            render(); commit(); notify(`Imported ${merged.added} new${merged.full ? `, ${merged.full} didn't fit because the list is full` : ""}`);
        });
    });
    const footer = element("div", "vackle-list-footer");
    const actions = element("div", "vackle-actions");
    actions.append(
        button("Import", () => file.click(), "vackle-ghost", "import"),
        button("Export", () => void saveFile(fileName, async () => new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }))
            .then(saved => { if (saved) notify("Exported"); }, error => notify(error instanceof Error ? error.message : String(error))), "vackle-ghost"),
        file);
    footer.append(count, actions);
    root.append(element("span", "vackle-setting-label", label), form, body, footer);
    render();
    return root;
}
