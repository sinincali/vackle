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

import type { BootstrapConfig } from "../api/types";
import type { CustomCss } from "../core/customCss";
import type { PluginManager } from "../core/pluginManager";
import type { SettingsStore } from "../settings/settingsStore";
import { button, element, keys, onDispose, settingRow, syncToggle, toggle, type RunAction } from "./primitives";
import { brandIcon } from "./icons";
import { dropdown } from "./dropdown";
import type { ToolboxLocation } from "../api/types";

const locations: Record<ToolboxLocation, string> = { titlebar: "Title bar", panel: "Next to settings cog", profile: "Profile menu", hidden: "Hidden" };

interface OverviewActions { navigate(section: string): void; commands(): void; run: RunAction; }
export function overviewPage(manager: PluginManager, store: SettingsStore, customCss: CustomCss,
    config: Pick<BootstrapConfig, "version" | "hostVersion">, actions: OverviewActions): HTMLElement {
    const root = element("div", "vackle-page vackle-overview");
    const header = element("section", "vackle-section vackle-identity");
    const brand = element("div", "vackle-brand");
    const name = element("div");
    name.append(element("h3", "", "Vackle"), element("p", "vackle-version", `Version ${config.version} · Flackle ${config.hostVersion}`));
    brand.append(brandIcon(48, "vackle-brand-mark"), name);
    const summary = element("p", "vackle-summary");
    const actionsRow = element("div", "vackle-actions");
    const tools = element("div", "vackle-actions vackle-tools");
    const links = [
        ["plugins", "Plugins", ""], ["themes", "Themes", ""], ["css", "QuickCSS", ""],
        ["commands", "Commands", "vackle-ghost"], ["notifications", "Notification log", "vackle-ghost"], ["diagnostics", "Developer", "vackle-ghost"]
    ] as const;
    for (const [section, label, variant] of links) {
        const action = button(label, () => section === "commands" ? actions.commands() : actions.navigate(section), `vackle-quick-action ${variant}`, section);
        action.dataset.vackleAction = section;
        (variant ? tools : actionsRow).append(action);
    }
    const top = element("div", "vackle-identity-top"); top.append(brand, tools);
    header.append(top, summary, actionsRow); root.append(header);
    const settings = element("section", "vackle-section");
    const setting = (id: string, label: string, description: string, value: boolean, save: (checked: boolean) => Promise<void>): HTMLInputElement => {
        const control = toggle(label, value, checked => {
            input.disabled = true;
            void actions.run(() => save(checked), false).then(() => { update(); input.disabled = false; });
        });
        const input = control.querySelector("input")!; input.id = `vackle-overview-${id}`;
        settings.append(settingRow(label, description, control)); return input;
    };
    const css = setting("css", "Custom CSS", "Apply your saved QuickCSS styles.", store.value.css.enabled, checked => customCss.setEnabled(checked));
    const motion = setting("motion", "Reduced motion", "Turn off every animation and transition throughout Flackle.",
        manager.status().some(plugin => plugin.id === "reduced-motion" && plugin.active), checked => manager.setEnabled("reduced-motion", checked));
    const location = dropdown("Toolbox location", [{ options: Object.values(locations) }], locations[store.value.toolbox], label => {
        const value = (Object.keys(locations) as ToolboxLocation[]).find(key => locations[key] === label)!;
        void actions.run(() => store.update(settings => { settings.toolbox = value; }), false);
    });
    settings.append(settingRow("Toolbox location", "Where the Vackle button appears. When hidden, open Vackle from Flackle settings or Ctrl+Shift+V.", location.root));
    root.append(settings);
    const shortcuts = element("section", "vackle-section vackle-shortcuts");
    shortcuts.append(element("h3", "vackle-section-title", "Keyboard shortcuts"));
    for (const [label, combination] of [["Open Vackle settings", ["Ctrl", "Shift", "V"]], ["Open command palette", ["Ctrl", "Shift", "P"]]] as const)
        shortcuts.append(settingRow(label, "", keys(combination)));
    root.append(shortcuts);
    const update = (): void => {
        const states = manager.status(); const saved = store.value;
        const themes = saved.themes.filter(theme => theme.enabled).length;
        summary.textContent = `${states.filter(state => state.active).length} of ${manager.plugins.length} ${manager.plugins.length === 1 ? "plugin" : "plugins"} enabled · ${themes ? `${themes} ${themes === 1 ? "theme" : "themes"} active` : "No themes active"}`;
        css.checked = saved.css.enabled; syncToggle(css);
        motion.checked = states.some(state => state.id === "reduced-motion" && state.active); syncToggle(motion);
        location.value = locations[saved.toolbox];
    };
    const stopPlugins = manager.observeChanges(update); const stopSettings = store.observeChanges(update);
    onDispose(root, () => { stopPlugins(); stopSettings(); location.dispose(); }); update(); return root;
}
