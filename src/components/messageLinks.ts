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

import { flackleStore } from "./flackleStores";

export function placeName(server: string, channel: string): string {
    const serverName = flackleStore<{ servers: { id: string; name?: string }[] }>("removeServer")?.getState().servers.find(entry => entry.id === server)?.name ?? "a server";
    const channelName = flackleStore<{ byServer: Record<string, { channels: { id: string; name?: string }[] } | undefined> }>("applyChannelCreated")?.getState().byServer[server]?.channels.find(entry => entry.id === channel)?.name;
    return channelName ? `${serverName} #${channelName}` : serverName;
}
export async function jumpToMessage(key: string, server: string, channel: string, id: string): Promise<boolean> {
    const found = await flackleStore<{ fetchMessageTarget(key: string, id: string): Promise<boolean | null> }>("pendingDeletes")?.getState().fetchMessageTarget(key, id);
    if (found === null) return true;
    if (!found) return false;
    flackleStore<{ requestJump(scope: string, id: string): void }>("requestJump")?.getState().requestJump(`channel/${server}/${channel}`, id);
    (window as { next?: { router?: { push(path: string, options?: object): void } } }).next?.router?.push(`/app/channels/${server}/${channel}#message-${id}`, { scroll: false });
    return true;
}
