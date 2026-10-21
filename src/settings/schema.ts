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

import type { Settings, SettingValue } from "../api/types";

export function defaults(): Settings {
    return { schema: 1, plugins: {}, css: { enabled: false, text: "", filename: "" }, themes: [], toolbox: "titlebar" };
}
export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function identifier(value: unknown): value is string {
    return typeof value === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(value);
}
export function validateSettings(value: unknown): Settings {
    if (!isRecord(value) || value.schema !== 1 || !isRecord(value.plugins) || !isRecord(value.css))
        throw new Error("Invalid Vackle settings schema");
    const css = value.css;
    if (typeof css.enabled !== "boolean" || typeof css.text !== "string" || css.text.length > 524288 ||
        typeof css.filename !== "string" || css.filename.length > 256)
        throw new Error("Invalid custom CSS settings (limit: 512 KiB)");
    const plugins: Settings["plugins"] = Object.create(null) as Settings["plugins"];
    if (Object.keys(value.plugins).length > 128) throw new Error("Too many plugin configurations");
    for (const [id, state] of Object.entries(value.plugins)) {
        if (!identifier(id) || !isRecord(state) || typeof state.enabled !== "boolean" || !isRecord(state.values))
            throw new Error(`Invalid plugin configuration: ${id}`);
        const values: Record<string, SettingValue> = Object.create(null) as Record<string, SettingValue>;
        for (const [key, entry] of Object.entries(state.values)) {
            if (!identifier(key) || !(typeof entry === "boolean" || typeof entry === "number" && Number.isFinite(entry) ||
                typeof entry === "string" && entry.length <= 4096)) throw new Error(`Invalid setting: ${id}.${key}`);
            values[key] = entry;
        }
        plugins[id] = { enabled: state.enabled, values };
    }
    const themes: Settings["themes"] = [];
    const themeIds = new Set<string>();
    let themeBytes = 0;
    if (value.themes !== undefined) {
        if (!Array.isArray(value.themes) || value.themes.length > 24) throw new Error("Invalid theme list");
        for (const theme of value.themes) {
            if (!isRecord(theme) || !identifier(theme.id) || themeIds.has(theme.id) || typeof theme.name !== "string" ||
                theme.name.length > 256 || typeof theme.enabled !== "boolean" || typeof theme.css !== "string") throw new Error("Invalid theme");
            themeBytes += theme.css.length;
            if (themeBytes > 524288) throw new Error("Themes exceed 512 KiB total");
            themeIds.add(theme.id);
            themes.push({ id: theme.id, name: theme.name, enabled: theme.enabled, css: theme.css });
        }
    }
    const toolbox = value.toolbox ?? "titlebar";
    if (!["titlebar", "panel", "profile", "hidden"].includes(toolbox as string)) throw new Error("Invalid toolbox location");
    return { schema: 1, plugins, css: { enabled: css.enabled, text: css.text, filename: css.filename }, themes, toolbox: toolbox as Settings["toolbox"] };
}
