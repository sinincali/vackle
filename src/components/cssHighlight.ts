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

const tokens = /\/\*[\s\S]*?(?:\*\/|$)|"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|[{}:;]|\s+|[^\s{}:;]+/g;
const escapes: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
const escape = (text: string): string => text.replace(/[&<>]/g, char => escapes[char] ?? char);

function valueKind(word: string): string {
    if (/^!important$/i.test(word)) return "kw";
    if (/^#[0-9a-f]{3,8}$/i.test(word) || /^[-+]?\d*\.?\d+[a-z%]*$/i.test(word)) return "num";
    if (word.startsWith("--")) return "var";
    if (word.includes("(")) return "fn";
    return "val";
}

function classify(parts: string[], kinds: string[], from: number, to: number, rule: boolean): void {
    let colon = false, first = true, atRule = false;
    for (let index = from; index < to; index++) {
        const part = parts[index]!;
        if (/^\s+$/.test(part)) continue;
        if (part.startsWith("/*")) { kinds[index] = "comment"; continue; }
        if (part.startsWith('"') || part.startsWith("'")) { kinds[index] = "string"; continue; }
        if (part === ":") {
            kinds[index] = "punct";
            if (!rule) colon = true;
            continue;
        }
        if (rule) {
            if (first) atRule = part.startsWith("@");
            kinds[index] = atRule ? (first ? "at" : "val") : "sel";
        }
        else if (!colon) kinds[index] = part.startsWith("--") ? "var" : "prop";
        else kinds[index] = valueKind(part);
        first = false;
    }
}

export function highlightCss(text: string): string {
    const parts = text.match(tokens) ?? [];
    const kinds = new Array<string>(parts.length).fill("");
    let start = 0;
    for (let index = 0; index <= parts.length; index++) {
        const part = parts[index];
        if (part !== undefined && part !== "{" && part !== "}" && part !== ";") continue;
        classify(parts, kinds, start, index, part === "{");
        if (part !== undefined) kinds[index] = "punct";
        start = index + 1;
    }
    return parts.map((part, index) => kinds[index] ? `<span class="vk-${kinds[index]}">${escape(part)}</span>` : escape(part)).join("");
}
