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
import { flackleExport, flackleMe, flackleStore } from "../../components/flackleStores";

interface Sender { id?: string; username?: string; display_name?: string | null; avatar_url?: string | null; }
export interface Message { id: string; type?: string; content?: string; attachments?: unknown[]; sender?: Sender; reply_to?: { sender_id?: string } | null; mention_ids?: string[]; mention_everyone?: boolean; }
interface Messages { addMessage(key: string, message: Message): void; fetchMessageTarget(key: string, id: string): Promise<boolean | null>; }
interface Levels { notification_level?: string; muted_until?: string | null; }
interface ServerSettings { settingsByServer: Record<string, Levels | undefined>; getChannelSetting(server: string, channel: string): Levels | undefined; }
type Allowed = (levels: Record<string, unknown>, mentioned: boolean) => boolean;
type Notify = (notice: Record<string, unknown>) => void;

export function replyIn(key: string, message: Message | undefined, me: string | undefined): { server: string; channel: string } | undefined {
    const [, server, channel] = /^g:(\d+):(\d+)$/.exec(key) ?? [];
    if (!server || !channel || !me || !message?.id || message.type === "system" || message.sender?.id === me || message.reply_to?.sender_id !== me) return undefined;
    return { server, channel };
}
export function alert(message: Message, me: string, notifies: (mentioned: boolean) => boolean): "none" | "toast" | "ping" {
    if (!notifies(true)) return "none";
    return notifies(message.mention_everyone === true || message.mention_ids?.includes(me) === true) ? "toast" : "ping";
}

export default {
    id: "reply-notifier", name: "Reply Notifier", description: "Pings you like a DM when someone replies to you in a server, and shows where with a link to the message.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Notifications", "Chat"], enabledByDefault: false,
    start({ resources, api, log }) {
        const messages = flackleStore<Messages>("pendingDeletes");
        const levels = flackleStore<ServerSettings>("settingsByServer");
        const notify = flackleExport<Notify>("notifyIncomingCall:", (value, name) => name === "notify" && typeof value === "function");
        const allowed = flackleExport<Allowed>("channelNotificationLevel", value => typeof value === "function" && String(value).includes("channelMutedUntil"));
        if (!messages || !levels || !notify || !allowed) throw new Error("Flackle's message or notification code was not found");
        const servers = flackleStore<{ servers: { id: string; name?: string }[] }>("removeServer");
        const channels = flackleStore<{ byServer: Record<string, { channels: { id: string; name?: string }[] } | undefined> }>("applyChannelCreated");
        const social = flackleStore<{ blockedUsers: { id: string }[] }>("removeFriendBySnowflake");
        const jumps = flackleStore<{ requestJump(scope: string, id: string): void }>("requestJump");
        const router = (): { push(path: string, options?: object): void } | undefined => (window as { next?: { router?: { push(path: string, options?: object): void } } }).next?.router;
        const seen = new Set<string>();
        const jump = async (key: string, server: string, channel: string, id: string): Promise<void> => {
            const found = await messages.getState().fetchMessageTarget(key, id);
            if (found === null) return;
            if (!found) { api.notify("That message is no longer available", "error"); return; }
            jumps?.getState().requestJump(`channel/${server}/${channel}`, id);
            router()?.push(`/app/channels/${server}/${channel}#message-${id}`, { scroll: false });
        };
        const check = (key: string, message: Message): void => {
            const me = flackleMe()?.id;
            const place = replyIn(key, message, me);
            if (!me || !place || seen.has(message.id) || social?.getState().blockedUsers.some(user => user.id === message.sender?.id)) return;
            seen.add(message.id);
            if (seen.size > 500) seen.delete(seen.values().next().value!);
            const { server, channel } = place;
            const state = levels.getState();
            const serverLevels = state.settingsByServer[server]; const channelLevels = state.getChannelSetting(server, channel);
            const kind = alert(message, me, mentioned => allowed({ serverNotificationLevel: serverLevels?.notification_level, serverMutedUntil: serverLevels?.muted_until,
                channelNotificationLevel: channelLevels?.notification_level, channelMutedUntil: channelLevels?.muted_until }, mentioned));
            if (kind === "none") return;
            const serverName = servers?.getState().servers.find(entry => entry.id === server)?.name ?? "a server";
            const channelName = channels?.getState().byServer[server]?.channels.find(entry => entry.id === channel)?.name;
            const where = channelName ? `${serverName} #${channelName}` : serverName;
            const name = message.sender?.display_name || message.sender?.username || "Someone";
            const content = message.content?.trim() || (message.attachments?.length ? "has sent an attachment" : "");
            if (kind === "ping") notify({ conversationId: key, conversationType: "guild", conversationName: where, senderDisplayName: name, messageContent: content });
            if (document.hasFocus() && location.pathname === `/app/channels/${server}/${channel}`) return;
            const avatar = message.sender?.avatar_url;
            api.notify(`${name} replied to you in ${where}`, "info", { duration: 8000, ...avatar ? { avatar: { url: avatar, before: name } } : {},
                action: { label: "Jump", run: () => void jump(key, server, channel, message.id).catch(error => api.notify(error instanceof Error ? error.message : String(error), "error")) } });
        };
        const original = messages.getState().addMessage;
        const addMessage: Messages["addMessage"] = (key, message) => {
            original(key, message);
            try { check(key, message); } catch (error) { log("Reply check failed", error); }
        };
        messages.setState({ addMessage });
        resources.add(() => { if (messages.getState().addMessage === addMessage) messages.setState({ addMessage: original }); });
    }
} satisfies Plugin;
