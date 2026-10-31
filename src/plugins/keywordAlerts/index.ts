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
import { parseList } from "../../components/listSetting";
import { jumpToMessage, placeName } from "../../components/messageLinks";

interface Message { id: string; type?: string; content?: string; sender?: { id?: string; username?: string; display_name?: string | null; avatar_url?: string | null }; mention_ids?: string[]; mention_everyone?: boolean; }
interface Levels { notification_level?: string; muted_until?: string | null; }
interface ServerSettings { settingsByServer: Record<string, Levels | undefined>; getChannelSetting(server: string, channel: string): Levels | undefined; }
type Allowed = (levels: Record<string, unknown>, mentioned: boolean) => boolean;
type Notify = (notice: Record<string, unknown>) => void;

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const parseKeywords = (value: unknown): string[] => [...new Set(parseList(value).map(([word = ""]) => word.trim().toLowerCase()).filter(Boolean))];
export function matchKeyword(content: string, keywords: readonly string[]): string | undefined {
    return keywords.find(word => new RegExp(`(^|[^\\p{L}\\p{N}_])${escape(word)}(?=$|[^\\p{L}\\p{N}_])`, "iu").test(content));
}

export default {
    id: "keyword-alerts", name: "Keyword Alerts", description: "Notifies you when someone says one of your keywords in a server, like your name or a game.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Notifications", "Chat"], enabledByDefault: false,
    settings: {
        keywords: { label: "Keywords", default: "[]", list: ["Add a keyword"] },
        "include-muted": { label: "Also alert in muted servers and channels", default: false }
    },
    start({ settings, resources, api, log }) {
        const keywords = parseKeywords(settings.keywords);
        if (!keywords.length) return;
        const messages = flackleStore<{ addMessage(key: string, message: Message): void }>("pendingDeletes");
        const levels = flackleStore<ServerSettings>("settingsByServer");
        const notify = flackleExport<Notify>("notifyIncomingCall:", (value, name) => name === "notify" && typeof value === "function");
        const allowed = flackleExport<Allowed>("channelNotificationLevel", value => typeof value === "function" && String(value).includes("channelMutedUntil"));
        if (!messages || !levels || !notify || !allowed) throw new Error("Flackle's message or notification code was not found");
        const social = flackleStore<{ blockedUsers: { id: string }[] }>("removeFriendBySnowflake");
        const includeMuted = settings["include-muted"] === true;
        const seen = new Set<string>();
        let active = true;
        const check = (key: string, message: Message): void => {
            const [, server, channel] = /^g:(\d+):(\d+)$/.exec(key) ?? [];
            const me = flackleMe()?.id;
            if (!server || !channel || !me || !message?.id || !message.content || message.type === "system" || message.sender?.id === me || seen.has(message.id)) return;
            if (message.mention_everyone || message.mention_ids?.includes(me) || social?.getState().blockedUsers.some(user => user.id === message.sender?.id)) return;
            const word = matchKeyword(message.content, keywords);
            if (!word) return;
            seen.add(message.id);
            if (seen.size > 500) seen.delete(seen.values().next().value!);
            if (!includeMuted) {
                const state = levels.getState(); const serverLevels = state.settingsByServer[server]; const channelLevels = state.getChannelSetting(server, channel);
                if (!allowed({ serverNotificationLevel: serverLevels?.notification_level, serverMutedUntil: serverLevels?.muted_until,
                    channelNotificationLevel: channelLevels?.notification_level, channelMutedUntil: channelLevels?.muted_until }, true)) return;
            }
            if (document.hasFocus() && location.pathname === `/app/channels/${server}/${channel}`) return;
            const where = placeName(server, channel);
            const name = message.sender?.display_name || message.sender?.username || "Someone";
            notify({ conversationId: key, conversationType: "guild", conversationName: where, senderDisplayName: name, messageContent: message.content });
            const avatar = message.sender?.avatar_url;
            api.notify(`${name} said "${word}" in ${where}`, "info", { duration: 8000, ...avatar ? { avatar: { url: avatar, before: name } } : {},
                action: { label: "Jump", run: () => void jumpToMessage(key, server, channel, message.id).then(found => { if (!found) api.notify("That message is no longer available", "error"); },
                    error => api.notify(error instanceof Error ? error.message : String(error), "error")) } });
        };
        const original = messages.getState().addMessage;
        const addMessage = (key: string, message: Message): void => {
            original(key, message);
            if (active) try { check(key, message); } catch (error) { log("Keyword check failed", error); }
        };
        messages.setState({ addMessage });
        resources.add(() => { active = false; if (messages.getState().addMessage === addMessage) messages.setState({ addMessage: original }); });
    }
} satisfies Plugin;
