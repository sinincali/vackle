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

import { bootstrap } from "./bootstrap";

const config = window.__VACKLE_CONFIG__;
if (config && location.origin === "https://flackle.com" && window.__TAURI_INTERNALS__ && window.top === window) bootstrap(config, request => {
    const binding: unknown = Reflect.get(window, config.binding);
    if (typeof binding !== "function") throw new Error("Vackle native bridge is unavailable");
    binding(JSON.stringify(request));
}, call => ({ save: settings => call("save", settings), style: (id, text) => call("style", { id, text }), restart: () => call("restart", null), motion: reduce => call("motion", reduce),
    branding: videoId => call<unknown>("branding", videoId), openUri: uri => call("uri", uri), translate: request => call<unknown>("translate", request),
    updateStatus: force => call<unknown>("update-status", force, 30000), updateInstall: () => call<unknown>("update-install", null, 600000), updateSkip: version => call("update-skip", version) }));
