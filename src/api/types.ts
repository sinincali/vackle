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

import type { IconName } from "../components/icons";
import type { PopupMenuItem } from "../components/popupMenu";

export type SettingValue = string | number | boolean;
export interface PluginSettings {
    enabled: boolean;
    values: Record<string, SettingValue>;
}
export interface Settings {
    schema: 1;
    plugins: Record<string, PluginSettings>;
    css: { enabled: boolean; text: string; filename: string };
    themes: { id: string; name: string; enabled: boolean; css: string }[];
    toolbox: ToolboxLocation;
}
export type ToolboxLocation = "titlebar" | "panel" | "profile" | "hidden";
export interface Bridge {
    save(settings: Settings): Promise<void>;
    style(id: string, text: string): Promise<void>;
    restart?(): Promise<void>;
    motion?(reduce: boolean): Promise<void>;
    branding?(videoId: string): Promise<unknown>;
    openUri?(uri: string): Promise<void>;
    translate?(request: { text: string; from: string; to: string }): Promise<unknown>;
    updateStatus?(force: boolean): Promise<unknown>;
    updateInstall?(): Promise<unknown>;
    updateSkip?(version: string): Promise<void>;
}
export interface SettingDefinition {
    label: string;
    default: SettingValue;
    min?: number;
    max?: number;
    options?: readonly string[];
}
export interface PluginContext {
    settings: Readonly<Record<string, SettingValue>>;
    setSetting(key: string, value: SettingValue): Promise<void>;
    resources: ResourceScope;
    log(message: string, error?: unknown): void;
    api: PluginApi;
}
export interface ResourceScope {
    add(cleanup: () => void | Promise<void>): void;
    listen(target: EventTarget, event: string, listener: EventListener): void;
    style(text: string): Promise<void>;
    reduceMotion(): Promise<void>;
    branding(videoId: string): Promise<Branding>;
    openUri(uri: string): Promise<void>;
    translate(text: string, from: string, to: string): Promise<Translation>;
    dispose(): Promise<void>;
}
export interface Branding { title: string | null; thumbnail: number | null; }
export interface Translation { sourceLanguage: string; text: string; }
export interface Plugin {
    id: string;
    name: string;
    description: string;
    version: string;
    author: string;
    enabledByDefault?: boolean;
    requiresRestart?: boolean;
    dependencies?: string[];
    tags?: string[];
    settings?: Record<string, SettingDefinition>;
    start(context: PluginContext): void | Promise<void>;
}
export interface Command {
    id: string;
    label: string;
    description: string;
    run(): void | Promise<void>;
}
export interface ContextAction {
    id: string;
    label: string;
    after?: string;
    selector?: string;
    icon?: IconName;
    matches(target: HTMLElement): boolean;
    run?(target: HTMLElement): void | Promise<void>;
    submenu?(target: HTMLElement): PopupMenuItem[];
}
export interface NoticeOptions { avatar?: { url: string; before: string }; duration?: number; }
export interface PluginApi {
    notify(message: string, level?: "info" | "error", options?: NoticeOptions): void;
    command(command: Command): void;
    contextMenu(action: ContextAction): void;
    observe(selector: string, attach: (element: HTMLElement) => void | (() => void)): void;
    onRoute(listener: (path: string) => void): void;
    patch(target: object, key: PropertyKey, wrap: (original: (...args: unknown[]) => unknown) => (...args: unknown[]) => unknown): void;
}
export interface BootstrapConfig {
    version: string;
    hostVersion: string;
    session: string;
    binding: string;
    settings: Settings;
}
export interface RuntimeHandle {
    ready: boolean;
    version: string;
    hostVersion: string;
    session: string;
    plugins: () => PluginStatus[];
    metrics(): { startupMs: number | null; dom: Readonly<{ batches: number; queries: number; attachments: number }> | null };
    shutdown(): Promise<void>;
    resolve(id: number, error: string | null, result?: unknown): void;
    openSettings(): void;
}
export interface PluginStatus {
    id: string;
    enabled: boolean;
    active: boolean;
    pendingRestart: boolean;
    error: string | null;
}
declare global {
    interface Window {
        __VACKLE_CONFIG__?: BootstrapConfig;
        __VACKLE__?: RuntimeHandle;
        __TAURI_INTERNALS__?: unknown;
    }
}
