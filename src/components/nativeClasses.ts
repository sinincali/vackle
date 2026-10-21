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

import { log } from "../utils/logger";

let cached: Map<string, string> | undefined;
export function nativeClass(name: string): string {
    if (!cached) {
        cached = new Map();
        const collect = (rules: CSSRuleList): void => {
            for (const rule of rules) {
                if ("selectorText" in rule && typeof rule.selectorText === "string")
                    for (const match of rule.selectorText.matchAll(/\b(V2(?:Button|Switch|TextInput)_[a-zA-Z]+__[a-zA-Z0-9_]+)\b/g)) {
                        const value = match[1]!; cached!.set(value.split("__")[0]!, value);
                    }
                if ("cssRules" in rule) collect((rule as CSSGroupingRule).cssRules);
            }
        };
        for (const sheet of document.styleSheets) {
            try { collect(sheet.cssRules); } catch (error) { log("ui", "Could not inspect a native stylesheet", error); }
        }
    }
    return cached.get(name) ?? "";
}
