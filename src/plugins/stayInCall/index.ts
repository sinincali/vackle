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
import { flackleStore, type FlackleStore } from "../../components/flackleStores";

interface Scope { [key: string]: unknown; }
interface Voice { connection?: { scope: Scope } | null; join(scope: Scope, options?: { ring?: boolean }): Promise<unknown>; }
interface Message { id: string; content?: string; isEphemeral?: boolean; }
interface Messages { cache: Record<string, { messages: Message[] } | undefined>; }

const NOTICE = /alone in this call/i;
const NOTICE_WINDOW = 10_000;

export const isIdleNotice = (message: Message): boolean => message.isEphemeral === true && typeof message.content === "string" && NOTICE.test(message.content);

function added(state: Messages, previous: Messages): Message[] {
    const fresh: Message[] = [];
    for (const [conversation, entry] of Object.entries(state.cache)) {
        const before = previous.cache[conversation];
        if (!entry || entry === before) continue;
        const known = new Set(before?.messages.map(message => message.id));
        fresh.push(...entry.messages.filter(message => !known.has(message.id)));
    }
    return fresh;
}

export interface Options {
    delay?: number;
    retries?: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    onRejoin(): void;
    onGiveUp(): void;
}

export function stayInCall(voice: FlackleStore<Voice>, messages: FlackleStore<Messages>, options: Options): () => void {
    const { delay = 1000, retries = 3, now = Date.now, sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)) } = options;
    let pending: { scope: Scope; at: number } | undefined;
    let stopped = false;

    async function rejoin(scope: Scope): Promise<void> {
        for (let attempt = 0; attempt < retries && !stopped; attempt++) {
            await sleep(attempt === 0 ? delay : 2000);
            if (stopped || voice.getState().connection) return;
            try { await voice.getState().join(scope, { ring: false }); } catch { continue; }
            if (voice.getState().connection) { options.onRejoin(); return; }
        }
        if (!stopped) options.onGiveUp();
    }

    const stopMessages = messages.subscribe((state, previous) => {
        const scope = voice.getState().connection?.scope;
        if (scope && added(state, previous).some(isIdleNotice)) pending = { scope, at: now() };
    });
    const stopVoice = voice.subscribe((state, previous) => {
        if (!previous.connection || state.connection) return;
        const idle = pending && now() - pending.at < NOTICE_WINDOW ? pending.scope : undefined;
        pending = undefined;
        if (idle) void rejoin(idle);
    });
    return () => { stopped = true; stopMessages(); stopVoice(); };
}

export default {
    id: "stay-in-call", name: "Stay In Call", description: "Rejoins your call when Flackle disconnects you for being alone in it.",
    version: "1.1.0", author: "moon and contributors", tags: ["Voice", "Utility"], enabledByDefault: false,
    settings: {
        notify: { label: "Show a message when you're rejoined", default: true }
    },
    start({ settings, resources, api }) {
        const voice = flackleStore<Voice>("applyForceDisconnect");
        const messages = flackleStore<Messages>("addMessage");
        if (!voice || !messages) throw new Error("Flackle's voice or message store was not found");
        resources.add(stayInCall(voice, messages, {
            onRejoin: () => { if (settings.notify !== false) api.notify("Rejoined your call"); },
            onGiveUp: () => api.notify("Couldn't rejoin your call", "error")
        }));
    }
} satisfies Plugin;
