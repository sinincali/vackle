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
import vackleTheme from "../themes/vackleTheme.css";

export const presets = [{ id: "preset-liquid-glass", name: "Vackle's Theme", css: vackleTheme }];

export class Themes {
    constructor(private readonly store: SettingsStore, private readonly bridge: Bridge) {}
    async apply(): Promise<void> {
        await this.bridge.style("themes", this.store.value.themes.filter(theme => theme.enabled).map(theme => presets.find(preset => preset.id === theme.id)?.css ?? theme.css).join("\n"));
    }
    async importFile(file: File): Promise<void> {
        if (!file.name.toLowerCase().endsWith(".css") || file.size > 524288) throw new Error("Choose a CSS theme up to 512 KiB");
        const css = await file.text();
        await this.store.update(settings => { settings.themes.push({ id: `theme-${crypto.randomUUID()}`, name: file.name, enabled: true, css }); });
        await this.apply();
    }
    async addPreset(id: string): Promise<void> {
        const preset = presets.find(entry => entry.id === id); if (!preset) throw new Error("Preset not found");
        await this.store.update(settings => { if (!settings.themes.some(theme => theme.id === id)) settings.themes.push({ ...preset, enabled: true }); });
        await this.apply();
    }
    async setEnabled(id: string, enabled: boolean): Promise<void> {
        await this.store.update(settings => { const theme = settings.themes.find(entry => entry.id === id); if (!theme) throw new Error("Theme not found"); theme.enabled = enabled; });
        await this.apply();
    }
    async remove(id: string): Promise<void> { await this.store.update(settings => { settings.themes = settings.themes.filter(theme => theme.id !== id); }); await this.apply(); }
    dispose(): Promise<void> { return this.bridge.style("themes", ""); }
}
