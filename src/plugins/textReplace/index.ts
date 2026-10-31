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
import { parseList } from "../../components/listSetting";
import { rewriteOutgoing } from "../../components/outgoing";

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const parseRules = (value: unknown): [string, string][] =>
    parseList(value).map(([from = "", to = ""]) => [from.trim(), to.trim()] as [string, string]).filter(([from]) => from);
export function replaceText(text: string, rules: readonly [string, string][]): string {
    for (const [from, to] of rules) text = text.replace(new RegExp(`(^|\\s)${escape(from)}(?=\\s|$)`, "gi"), (_, before: string) => before + to);
    return text;
}

export default {
    id: "text-replace", name: "Text Replace", description: "Swaps your own shortcuts for longer text when you send a message, like brb for be right back.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Chat", "Utility"], enabledByDefault: false,
    settings: {
        rules: { label: "Shortcuts", default: "[]", list: ["Shortcut", "Replace with"] }
    },
    start({ settings, resources }) {
        const rules = parseRules(settings.rules);
        if (rules.length) rewriteOutgoing(resources, text => replaceText(text, rules));
    }
} satisfies Plugin;
