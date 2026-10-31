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

import type { ResourceScope } from "../api/types";
import { flackleStore } from "./flackleStores";

type Send = (...args: unknown[]) => void;
interface Socket { sendMessage: Send; sendGuildChannelMessage: Send; }
interface Messages { cache: Record<string, { messages: { nonce?: unknown; content?: string }[] } | undefined>; }
type Transform = (text: string) => string;

const transforms = new Set<Transform>();
let unpatch: (() => void) | undefined;

function patch(): () => void {
    const socket = flackleStore<Socket>("sendGuildChannelMessage");
    const messages = flackleStore<Messages>("addOptimisticMessage");
    if (!socket || !messages) throw new Error("Flackle's connection or message store was not found");
    const rewrite = (nonce: unknown, content: string): void => {
        if (typeof nonce !== "string" || !nonce) return;
        const cache = messages.getState().cache;
        for (const [key, entry] of Object.entries(cache)) if (entry?.messages.some(message => message.nonce === nonce))
            messages.setState({ cache: { ...cache, [key]: { ...entry, messages: entry.messages.map(message => message.nonce === nonce ? { ...message, content } : message) } } });
    };
    const original = socket.getState();
    const wrap = (forward: Send, index: number): Send => (...args) => {
        const content = args[index];
        if (typeof content === "string" && content) {
            let next = content;
            for (const transform of transforms) { try { next = transform(next); } catch (error) { console.error("[Vackle] Outgoing rewrite failed", error); } }
            if (next !== content) { args = [...args]; args[index] = next; rewrite(args[index + 1], next); }
        }
        forward(...args);
    };
    const patched: Socket = { sendMessage: wrap(original.sendMessage, 1), sendGuildChannelMessage: wrap(original.sendGuildChannelMessage, 2) };
    socket.setState(patched);
    return () => {
        const now = socket.getState();
        if (now.sendMessage === patched.sendMessage && now.sendGuildChannelMessage === patched.sendGuildChannelMessage)
            socket.setState({ sendMessage: original.sendMessage, sendGuildChannelMessage: original.sendGuildChannelMessage });
    };
}

export function rewriteOutgoing(resources: ResourceScope, transform: Transform): void {
    unpatch ??= patch();
    transforms.add(transform);
    resources.add(() => {
        transforms.delete(transform);
        if (!transforms.size) { unpatch?.(); unpatch = undefined; }
    });
}
