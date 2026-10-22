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

import type { Bridge, Plugin, PluginApi, PluginStatus, ResourceScope, SettingValue } from "../api/types";
import { identifier } from "../settings/schema";
import { SettingsStore } from "../settings/settingsStore";
import { log } from "../utils/logger";
import { Resources } from "./resources";

export class PluginManager {
    private readonly registry = new Map<string, Plugin>();
    private readonly active = new Map<string, Resources>();
    private readonly errors = new Map<string, string>();
    private readonly applied = new Map<string, { enabled: boolean; values: string }>();
    private readonly deferred = new Set<string>();
    private pending: Promise<void> = Promise.resolve();
    private readonly listeners = new Set<() => void>();
    constructor(private readonly store: SettingsStore, private readonly bridge: Bridge,
        private readonly extensionFactory: (owner: string, resources: ResourceScope) => PluginApi) {}
    register(plugin: Plugin): void {
        if (!identifier(plugin.id) || this.registry.has(plugin.id) || typeof plugin.start !== "function" ||
            [plugin.name, plugin.description, plugin.version, plugin.author].some(value => typeof value !== "string" || !value))
            throw new Error("Invalid or duplicate plugin");
        if (plugin.dependencies?.some(id => !identifier(id))) throw new Error("Invalid dependency identifier");
        if (plugin.requiresRestart !== undefined && typeof plugin.requiresRestart !== "boolean") throw new Error("Invalid restart requirement");
        for (const [id, definition] of Object.entries(plugin.settings ?? {})) {
            if (!identifier(id) || typeof definition.label !== "string" ||
                !["string", "number", "boolean"].includes(typeof definition.default) ||
                typeof definition.default === "number" && !Number.isFinite(definition.default) ||
                definition.options !== undefined && !definition.options.includes(String(definition.default)))
                throw new Error(`Invalid plugin setting: ${id}`);
        }
        this.registry.set(plugin.id, plugin);
        this.applied.set(plugin.id, { enabled: this.enabled(plugin.id), values: this.valuesKey(plugin.id) });
    }
    get plugins(): Plugin[] { return [...this.registry.values()]; }
    private enabled(id: string): boolean { return this.store.plugin(id)?.enabled ?? this.registry.get(id)?.enabledByDefault ?? false; }
    private valuesKey(id: string): string {
        const values = this.store.plugin(id)?.values ?? {};
        return JSON.stringify(Object.entries(this.registry.get(id)?.settings ?? {}).sort(([a], [b]) => a.localeCompare(b))
            .map(([key, definition]) => [key, values[key] ?? definition.default]));
    }
    private dependencyOrder(id: string, ancestry: string[] = []): string[] {
        if (ancestry.includes(id)) throw new Error(`Dependency cycle: ${[...ancestry, id].join(" -> ")}`);
        const plugin = this.registry.get(id);
        if (!plugin) throw new Error(`Missing dependency: ${id}`);
        return [...new Set([...(plugin.dependencies ?? []).flatMap(key => this.dependencyOrder(key, [...ancestry, id])), id])];
    }
    private mustDefer(ids: string[]): boolean {
        return ids.some(id => this.registry.get(id)?.requiresRestart || this.deferred.has(id));
    }
    private discardRevertedChanges(): void {
        const changed = [...this.deferred].filter(id => {
            const applied = this.applied.get(id)!;
            return this.enabled(id) !== applied.enabled || applied.enabled && this.valuesKey(id) !== applied.values;
        });
        for (const id of this.deferred) if (!changed.some(key => key === id || this.dependsOn(id, key))) this.deferred.delete(id);
    }
    status(): PluginStatus[] {
        const states = this.plugins.map(plugin => {
            const applied = this.applied.get(plugin.id)!;
            const enabled = this.enabled(plugin.id);
            return { id: plugin.id, enabled, active: this.active.has(plugin.id), error: this.errors.get(plugin.id) ?? null,
                pendingRestart: this.deferred.has(plugin.id) && (enabled !== applied.enabled || applied.enabled && this.valuesKey(plugin.id) !== applied.values) };
        });
        return states.map(state => ({ ...state, pendingRestart: state.pendingRestart || this.deferred.has(state.id) &&
            states.some(dependency => dependency.pendingRestart && this.dependsOn(state.id, dependency.id)) }));
    }
    get pendingRestart(): boolean { return this.status().some(state => state.pendingRestart); }
    observeChanges(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
    private enqueue(action: () => Promise<void>): Promise<void> {
        const result = this.pending.then(action).finally(() => {
            for (const listener of this.listeners) { try { listener(); } catch (error) { log("plugins", "View update failed", error); } }
        });
        this.pending = result.catch(() => undefined);
        return result;
    }
    initialize(): Promise<void> {
        return this.enqueue(async () => {
            for (const plugin of this.plugins) {
                if (this.enabled(plugin.id)) {
                    const before = new Set(this.active.keys());
                    try {
                        const dependencies = this.dependencyOrder(plugin.id).filter(id => id !== plugin.id && !this.enabled(id));
                        await this.start(plugin.id, []);
                        if (dependencies.length) await this.store.update(settings => {
                            for (const id of dependencies) settings.plugins[id] = { enabled: true, values: settings.plugins[id]?.values ?? {} };
                        });
                    } catch (error) {
                        for (const key of [...this.active.keys()].reverse()) if (!before.has(key)) await this.stop(key);
                        log(plugin.id, "Initialization failed", error);
                    }
                }
            }
        });
    }
    setSetting(id: string, key: string, value: SettingValue): Promise<void> {
        return this.enqueue(async () => {
            const definition = this.registry.get(id)?.settings?.[key];
            if (!definition || typeof value !== typeof definition.default || typeof value === "number" &&
                (!Number.isFinite(value) || definition.min !== undefined && value < definition.min || definition.max !== undefined && value > definition.max) ||
                definition.options !== undefined && !definition.options.includes(String(value)))
                throw new Error(`Invalid setting value: ${id}.${key}`);
            const restart = [...this.active.keys()].filter(candidate => candidate === id || this.dependsOn(candidate, id));
            const defer = this.mustDefer([...restart, ...this.dependencyOrder(id)]);
            await this.store.update(settings => {
                const state = settings.plugins[id] ?? { enabled: this.active.has(id), values: {} };
                state.values[key] = value;
                settings.plugins[id] = state;
            });
            if (defer) { for (const candidate of restart) this.deferred.add(candidate); this.discardRevertedChanges(); return; }
            for (const candidate of [...restart].reverse()) await this.stop(candidate);
            for (const candidate of restart) await this.start(candidate, []);
        });
    }
    private dependsOn(id: string, dependency: string, visited = new Set<string>()): boolean {
        if (visited.has(id)) return false;
        visited.add(id);
        return (this.registry.get(id)?.dependencies ?? []).some(candidate => candidate === dependency || this.dependsOn(candidate, dependency, visited));
    }
    setEnabled(id: string, enabled: boolean): Promise<void> {
        return this.enqueue(async () => {
            const plugin = this.registry.get(id);
            if (!plugin) throw new Error(`Unknown plugin: ${id}`);
            const order = this.dependencyOrder(id);
            const dependents = this.plugins.filter(entry => this.dependsOn(entry.id, id));
            if (!enabled && dependents.some(entry => this.enabled(entry.id))) throw new Error("Disable dependent plugins first");
            const affected = enabled ? order : [id, ...dependents.filter(entry => this.active.has(entry.id)).map(entry => entry.id)];
            if (this.mustDefer([...affected, ...order])) {
                await this.store.update(settings => {
                    for (const key of enabled ? order : [id]) settings.plugins[key] = { enabled, values: settings.plugins[key]?.values ?? {} };
                });
                for (const key of affected) this.deferred.add(key);
                this.discardRevertedChanges();
                return;
            }
            if (this.active.has(id) === enabled && this.store.plugin(id)?.enabled === enabled) return;
            if (enabled) {
                const before = new Set(this.active.keys());
                try {
                    await this.start(id, []);
                    await this.store.update(settings => {
                        for (const key of this.active.keys()) settings.plugins[key] = {
                            enabled: true, values: settings.plugins[key]?.values ?? {}
                        };
                    });
                } catch (error) {
                    for (const key of [...this.active.keys()].reverse()) if (!before.has(key)) await this.stop(key);
                    throw error;
                }
            } else {
                await this.store.update(settings => {
                    settings.plugins[id] = { enabled: false, values: settings.plugins[id]?.values ?? {} };
                });
                await this.stop(id);
            }
        });
    }
    private async start(id: string, ancestry: string[]): Promise<void> {
        if (this.active.has(id)) return;
        if (ancestry.includes(id)) throw new Error(`Dependency cycle: ${[...ancestry, id].join(" -> ")}`);
        const plugin = this.registry.get(id);
        if (!plugin) throw new Error(`Missing dependency: ${id}`);
        try {
            for (const dependency of plugin.dependencies ?? []) await this.start(dependency, [...ancestry, id]);
            const resources = new Resources(id, this.bridge);
            const values = this.store.plugin(id)?.values ?? {};
            const settings = Object.fromEntries(Object.entries(plugin.settings ?? {}).map(([key, definition]) => {
                const value = values[key];
                if (value !== undefined && typeof value !== typeof definition.default) throw new Error(`Invalid setting type: ${id}.${key}`);
                return [key, value ?? definition.default];
            }));
            try {
                await plugin.start({ settings: Object.freeze(settings), setSetting: (key, value) => this.setSetting(id, key, value), resources, api: this.extensionFactory(id, resources), log: (message, error) => log(id, message, error) });
                this.active.set(id, resources);
                this.applied.set(id, { enabled: true, values: this.valuesKey(id) });
                this.deferred.delete(id);
                this.errors.delete(id);
            } catch (error) { await resources.dispose(); throw error; }
        } catch (error) {
            this.errors.set(id, error instanceof Error ? error.message : String(error));
            throw error;
        }
    }
    private async stop(id: string): Promise<void> {
        const scope = this.active.get(id);
        if (!scope) return;
        await scope.dispose();
        this.active.delete(id);
        this.applied.set(id, { enabled: false, values: this.valuesKey(id) });
        this.deferred.delete(id);
    }
    shutdown(): Promise<void> {
        return this.enqueue(async () => {
            for (const id of [...this.active.keys()].reverse()) await this.stop(id);
        });
    }
}
