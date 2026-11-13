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

import type { Settings } from "../api/types";
import { fetchBranding } from "../shared/dearrow";
import { translateText } from "../shared/translate";
import { defaults, validateSettings } from "../settings/schema";

export type Handler = (method: unknown, payload: unknown) => Promise<unknown>;
export function createHandler(load: () => Promise<unknown>, store: (settings: Settings) => Promise<void>, sync: (settings: Settings) => Promise<void> = async () => {}): Handler {
    return async (method, payload) => {
        if (method === "settings") {
            const stored = await load();
            const settings = stored === undefined ? defaults() : validateSettings(stored);
            await sync(settings);
            return settings;
        }
        if (method === "save") {
            const settings = validateSettings(payload);
            await store(settings);
            await sync(settings);
            return null;
        }
        if (method === "translate") return translateText(payload);
        if (method === "branding" && typeof payload === "string") return fetchBranding(payload);
        throw new Error("Unknown bridge operation");
    };
}
