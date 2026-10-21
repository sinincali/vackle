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

const key = "vackle-last-channel";
const channel = /^\/app\/(channels|conversations)\/\d+(\/\d+)?$/;

export default {
    id: "keep-current-channel", name: "Keep Current Channel", description: "Reopens the channel or DM you were in when Flackle starts.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Utility", "Organisation"], enabledByDefault: false,
    start({ api }) {
        let saved: string | null = null;
        try { saved = localStorage.getItem(key); } catch { }
        const landing = new URL(performance.getEntriesByType("navigation")[0]?.name ?? location.href).pathname;
        let pending = saved !== null && channel.test(saved) && [landing, "/app", "/app/friends"].includes(location.pathname) && saved !== location.pathname;
        const save = (path: string): void => { if (channel.test(path)) try { localStorage.setItem(key, path); } catch { } };
        if (!pending) save(location.pathname);
        api.observe("a[data-rail-icon]", () => {
            if (!pending) return;
            pending = false;
            (window as { next?: { router?: { replace(path: string): void } } }).next?.router?.replace(saved!);
        });
        api.onRoute(save);
    }
} satisfies Plugin;
