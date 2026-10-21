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

import type { Plugin } from "../../api/types";
import { flackleStore } from "../../components/flackleStores";

const levels: Record<string, string> = { "All messages": "all", "Only mentions": "mentions", Nothing: "nothing" };
interface Servers { servers: { id: string }[]; fetched: boolean; settingsByServer: Record<string, { notification_level?: string; muted_until?: string | null } | undefined>; muteServer(id: string, until: string): Promise<boolean>; setServerNotificationLevel(id: string, level: string): Promise<boolean>; }

export default {
    id: "new-guild-settings", name: "New Guild Settings", description: "Applies your chosen mute and notification settings to servers you join.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Servers", "Notifications"], enabledByDefault: false,
    settings: { mute: { label: "Mute new servers", default: true }, notifications: { label: "Notifications for new servers", default: "Only mentions", options: ["All messages", "Only mentions", "Nothing"] } },
    start({ settings, resources, log, api }) {
        const store = flackleStore<Servers>("setServerNotificationLevel");
        if (!store) throw new Error("Flackle's server store was not found");
        let known = store.getState().fetched ? new Set(store.getState().servers.map(server => server.id)) : undefined;
        resources.add(store.subscribe(state => {
            if (!state.fetched) return;
            const ids = state.servers.map(server => server.id);
            const joined = known ? ids.filter(id => !known!.has(id)) : [];
            known = new Set(ids);
            const level = levels[String(settings.notifications)] ?? "mentions", mute = settings.mute !== false;
            const apply = async (id: string): Promise<void> => {
                if (mute && !await state.muteServer(id, "9999-12-31T23:59:59.000Z")) api.notify("Couldn't mute the new server", "error");
                if (!await state.setServerNotificationLevel(id, level)) api.notify("Couldn't change the new server's notifications", "error");
            };
            const kept = (id: string): boolean => { const current = store.getState().settingsByServer[id]; return current?.notification_level === level && (!mute || Date.parse(current.muted_until ?? "") > Date.now()); };
            for (const id of joined) void (async () => {
                await apply(id);
                await new Promise(resolve => setTimeout(resolve, 4000));
                if (!kept(id)) await apply(id);
            })().catch(error => log("New server settings failed", error));
        }));
    }
} satisfies Plugin;
