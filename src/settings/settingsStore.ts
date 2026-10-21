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

import type { Bridge, PluginSettings, Settings } from "../api/types";
import { validateSettings } from "./schema";
import { log } from "../utils/logger";

export class SettingsStore {
    private state: Settings;
    private pending: Promise<void> = Promise.resolve();
    private readonly listeners = new Set<() => void>();
    constructor(initial: unknown, private readonly bridge: Bridge) {
        this.state = validateSettings(initial);
    }
    get value(): Settings { return structuredClone(this.state); }
    observeChanges(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
    plugin(id: string): PluginSettings | undefined {
        const value = this.state.plugins[id]; return value ? structuredClone(value) : undefined;
    }
    update(change: (settings: Settings) => void): Promise<void> {
        const operation = this.pending.then(async () => {
            const next = this.value;
            change(next);
            const validated = validateSettings(next);
            if (JSON.stringify(validated) === JSON.stringify(this.state)) return;
            await this.bridge.save(validated);
            this.state = validated;
            for (const listener of this.listeners) { try { listener(); } catch (error) { log("settings", "View update failed", error); } }
        });
        this.pending = operation.catch(() => undefined);
        return operation;
    }
}
