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

import type { Bridge } from "../api/types";
import type { SettingsStore } from "../settings/settingsStore";

export class CustomCss {
    constructor(private readonly store: SettingsStore, private readonly bridge: Bridge) {}
    apply(): Promise<void> {
        const css = this.store.value.css;
        return this.bridge.style("custom-css", css.enabled ? css.text : "");
    }
    async setEnabled(enabled: boolean): Promise<void> {
        await this.store.update(settings => { settings.css.enabled = enabled; });
        await this.apply();
    }
    async importFile(file: File): Promise<void> {
        if (!file.name.toLowerCase().endsWith(".css") || file.size > 524288) throw new Error("Choose a CSS file up to 512 KiB");
        const text = await file.text();
        await this.store.update(settings => { settings.css = { enabled: true, text, filename: file.name }; });
        await this.apply();
    }
    remove(): Promise<void> { return this.bridge.style("custom-css", ""); }
}
