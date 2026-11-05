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

import { serve } from "./host";

serve(async (method, payload) => {
    const response = await chrome.runtime.sendMessage({ method, payload });
    if (!Array.isArray(response)) throw new Error("Vackle's background script did not answer");
    if (typeof response[0] === "string") throw new Error(response[0]);
    return response[1];
}, chrome.runtime.getManifest().version);
