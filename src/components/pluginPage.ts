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

import type { PluginManager } from "../core/pluginManager";
import type { SettingsStore } from "../settings/settingsStore";
import { dropdown } from "./dropdown";
import { button, element, heading, onDispose, settingRow, settingsCog, syncToggle, toggle, type RunAction } from "./primitives";

interface PluginPageState { query: string; filter: string; tags: string[]; }
export function pluginPage(manager: PluginManager, run: RunAction, openSettings: (id: string) => void, state: PluginPageState, restart?: () => Promise<void>): HTMLElement {
    const root = element("div", "vackle-page");
    root.append(heading("Plugins", "Client enhancements. Some changes require a restart."));
    const pending = element("section", "vackle-restart"); pending.setAttribute("role", "status");
    pending.append(element("p", "", "Restart Flackle to apply your plugin changes."));
    if (restart) {
        const action = button("Restart Flackle", () => { action.disabled = true; void run(restart, false).then(() => { action.disabled = false; }); });
        pending.append(action);
    }
    pending.hidden = !manager.pendingRestart; root.append(pending);
    const search = element("input", "vackle-input");
    search.type = "search"; search.placeholder = "Search plugins…"; search.setAttribute("aria-label", "Search plugins");
    search.value = state.query;
    const filter = dropdown("Filter plugins", [{ options: ["All", "Enabled", "Disabled"] }], state.filter, value => { state.filter = value; applyFilters(); });
    const tools = element("div", "vackle-search-row"); tools.append(search, filter.root);
    const chips = element("div", "vackle-chips"); chips.setAttribute("role", "group"); chips.setAttribute("aria-label", "Filter by tag");
    const syncChips = (): void => { for (const chip of chips.children) chip.setAttribute("aria-pressed", String(state.tags.includes(chip.textContent ?? ""))); };
    for (const tag of [...new Set(manager.plugins.flatMap(plugin => plugin.tags ?? []))].sort()) {
        const chip = element("button", "vackle-chip", tag); chip.type = "button";
        chip.addEventListener("click", () => { state.tags = state.tags.includes(tag) ? state.tags.filter(entry => entry !== tag) : [...state.tags, tag]; syncChips(); applyFilters(); });
        chips.append(chip);
    }
    syncChips();
    const list = element("div", "vackle-plugin-list");
    const plugins = manager.plugins.sort((a, b) => a.name.localeCompare(b.name));
    const cards = new Map<string, HTMLElement>();
    const inputs = new Map<string, HTMLInputElement>();
    const errors = new Map<string, HTMLElement>();
    const notices = new Map<string, HTMLElement>();
    const status = new Map(manager.status().map(state => [state.id, state]));
    const applyFilters = (): void => {
        const query = search.value.trim().toLowerCase();
        let count = 0;
        for (const plugin of plugins) {
            const active = status.get(plugin.id)?.enabled ?? false;
            const visible = `${plugin.name} ${plugin.description} ${(plugin.tags ?? []).join(" ")}`.toLowerCase().includes(query) &&
                (filter.value === "All" || filter.value === "Enabled" && active || filter.value === "Disabled" && !active) &&
                (!state.tags.length || state.tags.some(tag => plugin.tags?.includes(tag)));
            const card = cards.get(plugin.id)!; card.hidden = !visible;
            if (visible) count++;
        }
        empty.hidden = count > 0;
    };
    for (const plugin of plugins) {
        const control = toggle(`Enable ${plugin.name}`, status.get(plugin.id)?.enabled ?? false, checked => {
            const input = control.querySelector("input")!; input.style.pointerEvents = "none";
            const slow = setTimeout(() => { input.disabled = true; }, 400);
            void run(() => manager.setEnabled(plugin.id, checked), false).then(() => {
                clearTimeout(slow); input.disabled = false; input.style.removeProperty("pointer-events");
                applyFilters();
            });
        }, "Md");
        const card = element("section", "vackle-plugin-card"); card.dataset.plugin = plugin.id;
        const head = element("div", "vackle-plugin-head"); const controls = element("div", "vackle-plugin-controls");
        if (plugin.settings && Object.keys(plugin.settings).length) controls.append(settingsCog(`Settings for ${plugin.name}`, () => openSettings(plugin.id)));
        controls.append(control); head.append(element("h3", "", plugin.name), controls);
        card.append(head, element("p", "vackle-plugin-description", plugin.description));
        if (plugin.tags?.length) card.append(element("p", "vackle-plugin-tags", plugin.tags.join(" · ")));
        const error = element("p", "vackle-error", status.get(plugin.id)?.error ?? "");
        card.append(error);
        const notice = element("p", "vackle-hint"); notice.hidden = true; card.append(notice); notices.set(plugin.id, notice);
        inputs.set(plugin.id, control.querySelector("input")!); errors.set(plugin.id, error);
        cards.set(plugin.id, card); list.append(card);
    }
    const empty = element("div", "vackle-empty", "No plugins match your search.");
    empty.append(button("Clear filters", () => { state.query = search.value = ""; state.filter = filter.value = "All"; state.tags = []; syncChips(); applyFilters(); }));
    list.append(empty);
    search.addEventListener("input", () => { state.query = search.value; applyFilters(); });
    const update = (): void => {
        for (const entry of manager.status()) {
            status.set(entry.id, entry);
            const input = inputs.get(entry.id);
            if (input) { input.checked = entry.enabled; syncToggle(input); }
            const error = errors.get(entry.id); if (error) error.textContent = entry.error ?? "";
            const notice = notices.get(entry.id);
            if (notice) { notice.hidden = !entry.pendingRestart; notice.textContent = entry.enabled ? "Changes apply after restart" : "Disabled after restart"; }
        }
        pending.hidden = !manager.pendingRestart;
        applyFilters();
    };
    const stop = manager.observeChanges(update);
    onDispose(root, () => { stop(); filter.dispose(); });
    root.append(tools, chips, list); update(); return root;
}
export function pluginSettings(manager: PluginManager, store: SettingsStore, id: string, run: RunAction): HTMLElement {
    const plugin = manager.plugins.find(entry => entry.id === id);
    if (!plugin?.settings) throw new Error("Plugin has no configurable settings");
    const root = element("div", "vackle-plugin-settings");
    root.append(element("p", "vackle-plugin-summary", plugin.description), element("p", "vackle-plugin-meta", `Version ${plugin.version} · ${plugin.author}`));
    for (const [key, definition] of Object.entries(plugin.settings)) {
        const value = store.plugin(id)?.values[key] ?? definition.default;
        const save = (next: string | number | boolean, input: HTMLInputElement): void => {
            input.disabled = true;
            void run(() => manager.setSetting(id, key, next), false).then(success => {
                if (!success) { if (typeof value === "boolean") input.checked = Boolean(store.plugin(id)?.values[key] ?? value); else input.value = String(store.plugin(id)?.values[key] ?? value); }
                syncToggle(input);
                input.disabled = false; message.textContent = success ? manager.pendingRestart ? "Saved. Restart Flackle to apply changes." : "Saved" : "Unable to save. Check the notification log.";
            });
        };
        let control: HTMLElement;
        if (definition.options) {
            const select = dropdown(definition.label, [{ options: definition.options }], String(value), next => {
                void run(() => manager.setSetting(id, key, next), false).then(success => {
                    if (!success) select.value = String(store.plugin(id)?.values[key] ?? value);
                    message.textContent = success ? manager.pendingRestart ? "Saved. Restart Flackle to apply changes." : "Saved" : "Unable to save. Check the notification log.";
                });
            });
            control = select.root;
        } else if (typeof value === "boolean") {
            const switchControl = toggle(definition.label, value, checked => save(checked, switchControl.querySelector("input")!));
            switchControl.querySelector("input")!.id = `vackle-setting-${id}-${key}`;
            control = switchControl;
        } else {
            const input = element("input", "vackle-input"); input.type = typeof value === "number" ? "number" : "text"; input.value = String(value);
            input.id = `vackle-setting-${id}-${key}`; input.setAttribute("aria-label", definition.label);
            if (definition.min !== undefined) input.min = String(definition.min);
            if (definition.max !== undefined) input.max = String(definition.max);
            input.addEventListener("change", () => save(input.type === "number" ? input.valueAsNumber : input.value, input));
            control = input;
        }
        root.append(settingRow(definition.label, "", control));
    }
    const message = element("p", "vackle-muted"); message.setAttribute("role", "status"); root.append(message); return root;
}
