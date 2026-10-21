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

import type { PluginApi, ResourceScope } from "./types";
import { Commands } from "./commands";
import { ContextMenus } from "./contextMenu";
import { DomObserver } from "./dom";
import { Notifications } from "./notifications";
import { Patcher } from "./patcher";
import { log } from "../utils/logger";

export class Extensions {
    readonly notices = new Notifications();
    readonly commands = new Commands(this.notices);
    private readonly contexts = new ContextMenus(this.notices);
    private readonly dom = new DomObserver();
    private readonly patcher = new Patcher();
    private readonly routes = new Set<(path: string) => void>();
    private readonly navigation: EventTarget | undefined = Reflect.get(window, "navigation") instanceof EventTarget ? Reflect.get(window, "navigation") as EventTarget : undefined;
    private path = location.pathname;
    private readonly route = (): void => {
        if (location.pathname === this.path) return;
        this.path = location.pathname;
        for (const listener of this.routes) { try { listener(this.path); } catch (error) { log("routes", "Route listener failed", error); } }
    };
    private observeRoute(listener: (path: string) => void): () => void {
        if (!this.routes.size) {
            window.addEventListener("popstate", this.route); window.addEventListener("hashchange", this.route);
            this.navigation?.addEventListener("navigatesuccess", this.route);
        }
        this.routes.add(listener);
        return () => {
            this.routes.delete(listener);
            if (!this.routes.size) {
                window.removeEventListener("popstate", this.route); window.removeEventListener("hashchange", this.route);
                this.navigation?.removeEventListener("navigatesuccess", this.route);
            }
        };
    }
    get metrics(): Readonly<{ batches: number; queries: number; attachments: number }> { return { ...this.dom.metrics }; }
    scope(owner: string, resources: ResourceScope): PluginApi {
        return {
            notify: (message, level, options) => this.notices.notify(message, level, options),
            command: command => resources.add(this.commands.register(owner, command)),
            contextMenu: action => resources.add(this.contexts.register(owner, action)),
            observe: (selector, attach) => resources.add(this.dom.observe(selector, attach)),
            onRoute: listener => resources.add(this.observeRoute(listener)),
            patch: (target, key, wrap) => resources.add(this.patcher.patch(target, key, wrap))
        };
    }
    dispose(): void {
        window.removeEventListener("popstate", this.route); window.removeEventListener("hashchange", this.route);
        this.navigation?.removeEventListener("navigatesuccess", this.route); this.routes.clear();
        this.commands.dispose(); this.contexts.dispose(); this.dom.dispose(); this.notices.dispose();
    }
}
