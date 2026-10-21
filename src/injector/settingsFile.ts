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

import { join } from "node:path";
import type { Settings } from "../api/types";
import { defaults, validateSettings } from "../settings/schema";
import { atomicWrite, exists, readJson, safeTree } from "./files";

export async function loadSettings(root: string): Promise<Settings> {
    const path = join(root, "settings.json");
    await safeTree(root, path);
    return await exists(path) ? validateSettings(await readJson(path)) : defaults();
}
export async function saveSettings(root: string, value: unknown): Promise<void> {
    const path = join(root, "settings.json");
    await safeTree(root, path);
    await atomicWrite(path, JSON.stringify(validateSettings(value), null, 2));
}
