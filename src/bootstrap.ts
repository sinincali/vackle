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

import plugins from "virtual:plugins";
import type { BootstrapConfig, Bridge, RuntimeHandle } from "./api/types";
import { createSettingsPanel } from "./components/settingsPanel";
import { CustomCss } from "./core/customCss";
import { PluginManager } from "./core/pluginManager";
import { SettingsStore } from "./settings/settingsStore";
import { log } from "./utils/logger";
import { Extensions } from "./api/extensions";
import { Themes } from "./core/themes";
import { UpdatePrompt } from "./core/updates";

export type Call = <T = void>(method: string, payload: unknown, timeout?: number) => Promise<T>;
export function bootstrap(config: BootstrapConfig, send: (request: { id: number; method: string; payload: unknown }) => void, connect: (call: Call) => Bridge): void {
    if (window.__VACKLE__) return;
    const startedAt = performance.now();
    let startupMs: number | null = null;
    let sequence = 0;
    const pending = new Map<number, { resolve(result: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
    const call = <T = void>(method: string, payload: unknown, timeout = 10000): Promise<T> => new Promise<T>((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error("Vackle launcher is not responding")); }, timeout);
        pending.set(id, { resolve: result => resolve(result as T), reject, timer });
        try { send({ id, method, payload }); } catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
    });
    const bridge = connect(call);
    const store = new SettingsStore(config.settings, bridge);
    let extensions: Extensions | undefined;
    const manager = new PluginManager(store, bridge, (owner, resources) => {
        if (!extensions) throw new Error("Extension services are not initialized");
        return extensions.scope(owner, resources);
    });
    for (const plugin of plugins) {
        try { manager.register(plugin); } catch (error) { log("core", "Plugin registration failed", error); }
    }
    const customCss = new CustomCss(store, bridge);
    const themes = new Themes(store, bridge);
    let panel: Awaited<ReturnType<typeof createSettingsPanel>> | undefined;
    let updates: UpdatePrompt | undefined;
    let stopped = false;
    const handle: RuntimeHandle = {
        ready: false, version: config.version, hostVersion: config.hostVersion, session: config.session,
        plugins: () => manager.status(),
        metrics: () => ({ startupMs, dom: extensions?.metrics ?? null }),
        resolve(id, error, result) {
            const request = pending.get(id);
            if (!request) return;
            pending.delete(id);
            clearTimeout(request.timer);
            if (error) request.reject(new Error(error)); else request.resolve(result);
        },
        openSettings() { panel?.open(); },
        async shutdown() {
            stopped = true;
            await initialization.catch(error => log("core", "Stopping incomplete initialization", error));
            await manager.shutdown();
            await customCss.remove();
            await themes.dispose();
            await panel?.dispose();
            updates?.dispose();
            extensions?.dispose();
            window.removeEventListener("pagehide", pagehide);
            for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error("Vackle stopped")); }
            pending.clear();
            delete window.__VACKLE__;
            delete window.__VACKLE_CONFIG__;
        }
    };
    window.__VACKLE__ = handle;
    const pagehide = (): void => {
        handle.ready = false;
        void handle.shutdown().catch(error => log("core", "Shutdown failed", error));
    };
    window.addEventListener("pagehide", pagehide);
    const initialization = (async () => {
        if (!document.body) await new Promise<void>(resolve => document.addEventListener("DOMContentLoaded", () => resolve(), { once: true }));
        await themes.apply();
        await customCss.apply();
        if (!document.querySelector('button[aria-label="Settings"]')) await new Promise<void>((resolve, reject) => {
            const observer = new MutationObserver(() => {
                if (!document.querySelector('button[aria-label="Settings"]')) return;
                clearTimeout(timer); observer.disconnect(); resolve();
            });
            const timer = setTimeout(() => { observer.disconnect(); reject(new Error("Flackle navigation did not become available")); }, 45000);
            observer.observe(document.body, { childList: true, subtree: true });
        });
        if (stopped) return;
        extensions = new Extensions();
        await manager.initialize();
        panel = await createSettingsPanel(manager, store, customCss, themes, config, bridge, extensions);
        updates = new UpdatePrompt(bridge, extensions.notices);
        const prompt = updates;
        if (bridge.updateStatus) extensions.commands.register("vackle", { id: "check-updates", label: "Check for Vackle Updates", description: "See whether a newer Vackle is available.", run: () => prompt.check(true) });
        void prompt.check().catch(error => log("updates", "Update check failed", error));
        handle.ready = true;
        startupMs = performance.now() - startedAt;
        log("core", `Loaded ${config.version} in Flackle ${config.hostVersion}`);
    })();
    void initialization.catch(error => { log("core", "Initialization failed", error); });
}
