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

import type { BootstrapConfig, Bridge } from "../api/types";
import type { Extensions } from "../api/extensions";
import type { CustomCss } from "../core/customCss";
import type { PluginManager } from "../core/pluginManager";
import type { Themes } from "../core/themes";
import type { SettingsStore } from "../settings/settingsStore";
import { log } from "../utils/logger";
import css from "../styles/settings.css";
import { createToolbox } from "./toolbox";
import { SettingsIntegration } from "./settingsIntegration";
import { openModal } from "./modal";
import { pluginPage, pluginSettings } from "./pluginPage";
import { overviewPage } from "./overviewPage";
import { themePage } from "./themePage";
import { button, element, heading, settingRow, type RunAction } from "./primitives";

export async function createSettingsPanel(manager: PluginManager, store: SettingsStore, customCss: CustomCss, themes: Themes,
    config: BootstrapConfig, bridge: Bridge, extensions: Extensions): Promise<{ open(): void; dispose(): Promise<void> }> {
    await bridge.style("settings-ui", css);
    const pluginFilters = { query: "", filter: "All", tags: [] as string[] };
    const run: RunAction = async (operation, refresh = true) => {
        try {
            await operation();
            if (refresh) integration.refresh();
            return true;
        } catch (error) {
            log("settings", "Change failed", error);
            extensions.notices.notify(error instanceof Error ? error.message : String(error), "error");
            if (refresh) integration.refresh();
            return false;
        }
    };
    const runtime = window.__TAURI_INTERNALS__ ? "Tauri / WebView2" : "Browser extension";
    const diagnostic = (): Record<string, unknown> => ({ vackle: config.version, flackle: config.hostVersion, runtime, origin: location.origin,
        plugins: manager.status(), commands: extensions.commands.count, performance: window.__VACKLE__?.metrics(), themes: store.value.themes.map(theme => ({ name: theme.name, enabled: theme.enabled })) });
    let closeModal: (() => void) | undefined;
    const openPluginSettings = (id: string): void => {
        const plugin = manager.plugins.find(entry => entry.id === id);
        if (!plugin) return;
        closeModal?.();
        closeModal = openModal(document.querySelector('[role="dialog"][aria-label="Settings"]') ?? document.body, plugin.name, pluginSettings(manager, store, id, run), () => { closeModal = undefined; });
    };
    const render = (section: string): HTMLElement => {
        closeModal?.();
        if (section === "plugins") return pluginPage(manager, run, openPluginSettings, pluginFilters, bridge.restart);
        if (section === "css" || section === "themes") return themePage(section, themes, customCss, store, run);
        if (section === "overview") return overviewPage(manager, store, customCss, config, { navigate: section => integration.activate(section), commands: () => extensions.commands.open(), run });
        const root = element("div", "vackle-page");
        if (section === "notifications") {
            root.append(heading("Notification Log", "Recent Vackle notifications for this session. Flackle notifications are untouched."));
            const list = element("section", "vackle-log");
            for (const notice of [...extensions.notices.entries].reverse()) {
                const row = element("div", "vackle-log-entry");
                row.dataset.level = notice.level;
                const time = element("time", "", new Date(notice.time).toLocaleTimeString()); time.dateTime = notice.time;
                row.append(element("p", "", notice.message), time); list.append(row);
            }
            if (!extensions.notices.entries.length) {
                const empty = element("div", "vackle-empty");
                empty.append(element("p", "vackle-empty-title", "No notifications yet"), element("p", "", "Messages from Vackle and its plugins will appear here."));
                list.append(empty);
            }
            root.append(list);
        } else if (section === "diagnostics") {
            root.append(heading("Developer", "Runtime health and compatibility information."));
            const copy = button("Copy diagnostics", () => void run(async () => {
                await navigator.clipboard.writeText(JSON.stringify(diagnostic(), null, 2));
                const label = copy.querySelector("[class*=labelText]") ?? copy;
                label.textContent = "Copied"; setTimeout(() => { label.textContent = "Copy diagnostics"; }, 2000);
            }, false));
            const actions = element("div", "vackle-actions");
            actions.append(copy,
                button("Command palette", () => extensions.commands.open(), "vackle-ghost", "commands"));
            const states = manager.status(); const metrics = window.__VACKLE__?.metrics();
            const values: [string, string][] = [
                ["Vackle", config.version], ["Flackle", config.hostVersion], ["Runtime", runtime], ["Origin", location.origin],
                ["Startup", metrics?.startupMs == null ? "—" : `${metrics.startupMs.toFixed(1)} ms`],
                ["Plugins", `${states.filter(state => state.active).length} active of ${states.length}`], ["Commands", String(extensions.commands.count)],
                ["Themes", `${store.value.themes.filter(theme => theme.enabled).length} active of ${store.value.themes.length}`],
                ["DOM observer", metrics?.dom ? `${metrics.dom.batches} batches · ${metrics.dom.queries} queries · ${metrics.dom.attachments} attachments` : "—"]
            ];
            const list = element("dl", "vackle-facts");
            for (const [label, value] of values) list.append(element("dt", "", label), element("dd", "", value));
            const failures = states.filter(state => state.error);
            root.append(actions, list);
            if (failures.length) {
                const errors = element("section", "vackle-section");
                errors.append(element("h3", "vackle-section-title", "Plugin errors"));
                for (const failure of failures) errors.append(settingRow(manager.plugins.find(plugin => plugin.id === failure.id)?.name ?? failure.id, failure.error ?? ""));
                root.append(errors);
            }
            root.append(element("p", "vackle-hint", "Run Vackle.exe status or Vackle.exe verify for native validation."));
        }
        return root;
    };
    const integration = new SettingsIntegration([
        { id: "overview", label: "Vackle" }, { id: "plugins", label: "Plugins" }, { id: "themes", label: "Themes" },
        { id: "css", label: "QuickCSS" }, { id: "notifications", label: "Notification Log" }, { id: "diagnostics", label: "Developer" }
    ], render);
    const open = (section = "overview"): void => { void integration.open(section).catch(error => { log("settings", "Native integration failed", error); extensions.notices.notify(String(error), "error"); }); };
    const toolbox = createToolbox(manager, store, customCss, themes, open, () => extensions.commands.open(), bridge.restart);
    const shortcut = (event: KeyboardEvent): void => { if (event.ctrlKey && event.shiftKey && event.code === "KeyV") { event.preventDefault(); open(); } };
    window.addEventListener("keydown", shortcut);
    const unregister = extensions.commands.register("core", { id: "open-settings", label: "Open Vackle settings", description: "Manage plugins, themes and QuickCSS", run: () => open() });
    return { open: () => open(), async dispose() { closeModal?.(); unregister(); window.removeEventListener("keydown", shortcut); toolbox.dispose(); integration.dispose(); await bridge.style("settings-ui", ""); } };
}
