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

import { spawn } from "node:child_process";

const allowed = [
    /^spotify:(track|album|artist|playlist|user|episode|show):[A-Za-z0-9]{1,64}$/,
    /^steam:\/\/openurl\/https:\/\/(store\.steampowered\.com|steamcommunity\.com)\/[A-Za-z0-9\-._~/?=&%#+]{0,400}$/,
    /^com\.epicgames\.launcher:\/\/store\/p\/[A-Za-z0-9-]{1,100}$/,
    /^tidal:\/\/(track|album|artist|playlist|mix|video)\/[A-Za-z0-9-]{1,64}$/
];
export const isAppUri = (uri: string): boolean => allowed.some(pattern => pattern.test(uri));
export function openUri(uri: string): void {
    if (!isAppUri(uri)) throw new Error("Unsupported app link");
    spawn("explorer.exe", [uri], { detached: true, stdio: "ignore", windowsHide: true }).unref();
}
