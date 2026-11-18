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
import type { SettingsStore } from "../settings/settingsStore";
import { highlightCss } from "./cssHighlight";
import { uiIcon } from "./icons";
import { button, element, syncToggle, toggle } from "./primitives";

const limit = 524288;
const plainOver = 100000;
const indent = "    ";
const pairs: Record<string, string> = { "{": "}", "(": ")", "[": "]", '"': '"', "'": "'" };
const placement = { left: -1, top: 72, width: 760, height: 520 };
let current: { root: HTMLElement; input: HTMLTextAreaElement; dispose(): void } | undefined;

export function openQuickCss(store: SettingsStore, customCss: CustomCss): void {
    if (current) { current.input.focus(); return; }
    const root = element("div", "vackle-qc"); root.id = "vackle-quickcss"; root.dataset.vackleRoot = ""; root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "QuickCSS editor");
    const bar = element("header", "vackle-qc-bar"), title = element("span", "vackle-qc-title"), status = element("span", "vackle-qc-status");
    status.setAttribute("role", "status");
    title.append(uiIcon("css", 18), "QuickCSS");
    const enabled = toggle("Enable custom CSS", store.value.css.enabled, value => void customCss.setEnabled(value).then(() => say(value ? "Applied" : "QuickCSS is off"), () => say("Unable to change")));
    const file = element("input"); file.type = "file"; file.accept = ".css,text/css"; file.hidden = true; file.setAttribute("aria-label", "Import CSS file");
    const importButton = button("Import", () => file.click(), "vackle-ghost", "import");
    const closeButton = button("", () => dispose(), "vackle-icon-button", "close"); closeButton.setAttribute("aria-label", "Close QuickCSS");
    const enabledInput = enabled.querySelector("input")!;
    bar.append(title, status, element("span", "vackle-qc-switch", "Enabled"), enabled, importButton, file, closeButton);

    const gutter = element("div", "vackle-qc-gutter"), field = element("div", "vackle-qc-field"), highlight = element("pre", "vackle-qc-highlight");
    const input = element("textarea", "vackle-qc-input"); input.spellcheck = false; input.setAttribute("aria-label", "QuickCSS editor"); input.value = store.value.css.text;
    input.placeholder = ":root {\n    --ui-text-accent: #ef5252;\n}";
    highlight.setAttribute("aria-hidden", "true");
    field.append(highlight, input);
    const body = element("div", "vackle-qc-body"); body.append(gutter, field);
    const position = element("span"), size = element("span"), hint = element("span", "vackle-qc-hint", "Ctrl+S save · Ctrl+/ comment · Tab indent");
    const foot = element("footer", "vackle-qc-foot"); foot.append(position, size, hint);
    root.append(bar, body, foot);

    let timer = 0;
    function say(message: string): void { status.textContent = message; }
    const render = (): void => {
        const text = input.value, lines = text.split("\n").length;
        if (text.length > plainOver) highlight.textContent = `${text}\n`;
        else highlight.innerHTML = `${highlightCss(text)}\n`;
        gutter.textContent = Array.from({ length: lines }, (_, index) => index + 1).join("\n");
        size.textContent = `${lines} ${lines === 1 ? "line" : "lines"} · ${(text.length / 1024).toFixed(1)} KB of 512 KB`;
        size.classList.toggle("vackle-qc-over", text.length > limit);
    };
    const locate = (): void => {
        const before = input.value.slice(0, input.selectionStart);
        position.textContent = `Ln ${before.split("\n").length}, Col ${before.length - before.lastIndexOf("\n")}`;
    };
    const save = async (): Promise<void> => {
        window.clearTimeout(timer); timer = 0;
        if (input.value.length > limit) { say("Too large to save"); return; }
        try { await customCss.setText(input.value); say(store.value.css.enabled ? "Saved and applied" : "Saved. QuickCSS is off"); }
        catch { say("Unable to save"); }
    };
    const edit = (start: number, end: number, text: string, from: number, to = from): void => {
        input.setSelectionRange(start, end);
        if (!document.execCommand("insertText", false, text)) input.setRangeText(text, start, end, "end");
        input.setSelectionRange(from, to);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const lineRange = (): [number, number] => {
        const text = input.value, start = text.lastIndexOf("\n", input.selectionStart - 1) + 1;
        const stop = text.indexOf("\n", input.selectionEnd > input.selectionStart ? input.selectionEnd - 1 : input.selectionEnd);
        return [start, stop < 0 ? text.length : stop];
    };
    const shift = (outward: boolean): void => {
        const [start, stop] = lineRange(), lines = input.value.slice(start, stop).split("\n");
        const moved = lines.map(line => outward ? line.replace(/^( {1,4}|\t)/, "") : line ? indent + line : line).join("\n");
        edit(start, stop, moved, start, start + moved.length);
    };
    const comment = (): void => {
        const [start, stop] = lineRange(), lines = input.value.slice(start, stop).split("\n");
        const done = lines.filter(line => line.trim()).every(line => /^\s*\/\*.*\*\/\s*$/.test(line));
        const moved = lines.map(line => !line.trim() ? line : done ? line.replace(/^(\s*)\/\*\s?/, "$1").replace(/\s?\*\/\s*$/, "") : line.replace(/^(\s*)(.*?)\s*$/, "$1/* $2 */")).join("\n");
        edit(start, stop, moved, start, start + moved.length);
    };
    const key = (event: KeyboardEvent): void => {
        const text = input.value, from = input.selectionStart, to = input.selectionEnd, collapsed = from === to, next = text[to] ?? "", previous = text[from - 1] ?? "";
        if (event.ctrlKey && event.code === "KeyS") { event.preventDefault(); void save(); return; }
        if (event.ctrlKey && event.code === "Slash") { event.preventDefault(); comment(); return; }
        if (event.key === "Escape") { event.preventDefault(); dispose(); return; }
        if (event.ctrlKey || event.altKey || event.metaKey) return;
        if (event.key === "Tab") {
            event.preventDefault();
            if (collapsed && !event.shiftKey) edit(from, to, indent, from + indent.length);
            else shift(event.shiftKey);
            return;
        }
        if (event.key === "Enter") {
            event.preventDefault();
            const lead = /^[ \t]*/.exec(text.slice(text.lastIndexOf("\n", from - 1) + 1, from))![0], opens = text.slice(0, from).trimEnd().endsWith("{");
            if (opens && next === "}") edit(from, to, `\n${lead}${indent}\n${lead}`, from + 1 + lead.length + indent.length);
            else edit(from, to, `\n${lead}${opens ? indent : ""}`, from + 1 + lead.length + (opens ? indent.length : 0));
            return;
        }
        if (event.key === "Backspace" && collapsed && pairs[previous] === next && next) { event.preventDefault(); edit(from - 1, from + 1, "", from - 1); return; }
        if (collapsed && Object.values(pairs).includes(event.key) && next === event.key) { event.preventDefault(); input.setSelectionRange(from + 1, from + 1); return; }
        if (event.key === "}" && collapsed && /^[ \t]*$/.test(text.slice(text.lastIndexOf("\n", from - 1) + 1, from))) {
            event.preventDefault();
            const start = text.lastIndexOf("\n", from - 1) + 1, lead = text.slice(start, from), tail = /^\s*\}/.exec(text.slice(from));
            const aligned = lead.endsWith(indent) ? lead.slice(0, -indent.length) : lead.replace(/\t$/, "");
            edit(start, from + (tail ? tail[0].length : 0), `${aligned}}`, start + aligned.length + 1);
            return;
        }
        if (collapsed && pairs[event.key] && (!/[\w]/.test(next))) { event.preventDefault(); edit(from, to, event.key + pairs[event.key], from + 1); }
    };
    input.addEventListener("keydown", key);
    input.addEventListener("input", () => { render(); locate(); say("Editing…"); window.clearTimeout(timer); timer = window.setTimeout(() => void save(), 400); });
    for (const name of ["keyup", "click", "select"]) input.addEventListener(name, locate);
    input.addEventListener("scroll", () => { highlight.scrollTop = input.scrollTop; highlight.scrollLeft = input.scrollLeft; gutter.scrollTop = input.scrollTop; });
    file.addEventListener("change", () => {
        const selected = file.files?.[0]; file.value = "";
        if (selected) void customCss.importFile(selected).then(() => { input.value = store.value.css.text; render(); locate(); say("Imported"); }, error => say(error instanceof Error ? error.message : "Unable to import"));
    });

    let origin: { x: number; y: number; left: number; top: number } | undefined;
    const keep = (): void => {
        placement.left = Math.min(Math.max(placement.left, 8 - root.offsetWidth + 120), window.innerWidth - 120);
        placement.top = Math.min(Math.max(placement.top, 0), window.innerHeight - 48);
        root.style.left = `${placement.left}px`; root.style.top = `${placement.top}px`;
    };
    bar.addEventListener("pointerdown", event => {
        if ((event.target as HTMLElement).closest("button, label, input")) return;
        origin = { x: event.clientX, y: event.clientY, left: placement.left, top: placement.top };
        bar.setPointerCapture(event.pointerId); bar.classList.add("vackle-qc-dragging");
    });
    bar.addEventListener("pointermove", event => { if (origin) { placement.left = origin.left + event.clientX - origin.x; placement.top = origin.top + event.clientY - origin.y; keep(); } });
    const drop = (): void => { origin = undefined; bar.classList.remove("vackle-qc-dragging"); };
    bar.addEventListener("pointerup", drop); bar.addEventListener("pointercancel", drop);

    const unobserve = store.observeChanges(() => {
        enabledInput.checked = store.value.css.enabled; syncToggle(enabledInput);
        if (!timer && store.value.css.text !== input.value) { input.value = store.value.css.text; render(); locate(); }
    });
    function dispose(): void {
        unobserve();
        if (timer) void save();
        placement.width = root.offsetWidth; placement.height = root.offsetHeight;
        root.remove(); current = undefined;
    }
    if (placement.left < 0) placement.left = Math.max(window.innerWidth - placement.width - 32, 16);
    root.style.width = `${Math.min(placement.width, window.innerWidth - 16)}px`; root.style.height = `${Math.min(placement.height, window.innerHeight - 16)}px`;
    document.body.append(root);
    keep(); render(); locate(); input.focus();
    current = { root, input, dispose };
}

export function closeQuickCss(): void { current?.dispose(); }
