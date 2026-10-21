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

import { isRecord } from "../settings/schema";

export interface ProtocolEvent { method: string; params: Record<string, unknown>; sessionId?: string; }
export class Cdp {
    private sequence = 0;
    private readonly pending = new Map<number, { resolve(value: Record<string, unknown>): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
    private readonly listeners = new Set<(event: ProtocolEvent) => void>();
    private constructor(private readonly socket: WebSocket) {
        socket.addEventListener("message", event => {
            try {
                const value: unknown = JSON.parse(String(event.data));
                if (!isRecord(value)) throw new Error("Malformed CDP message");
                if (typeof value.id === "number") {
                    const request = this.pending.get(value.id);
                    if (!request) return;
                    clearTimeout(request.timer);
                    this.pending.delete(value.id);
                    if (isRecord(value.error)) request.reject(new Error(String(value.error.message)));
                    else request.resolve(isRecord(value.result) ? value.result : {});
                } else if (typeof value.method === "string" && isRecord(value.params)) {
                    const event: ProtocolEvent = { method: value.method, params: value.params };
                    if (typeof value.sessionId === "string") event.sessionId = value.sessionId;
                    for (const listener of this.listeners) listener(event);
                }
            } catch (error) { console.error("[Vackle:CDP] Invalid message:", error); }
        });
        socket.addEventListener("close", () => {
            for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new Error("Flackle debugging connection closed")); }
            this.pending.clear();
        });
    }
    static async connect(url: string, port: number): Promise<Cdp> {
        const parsed = new URL(url);
        if (parsed.protocol !== "ws:" || !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) || Number(parsed.port) !== port)
            throw new Error("Refusing non-local CDP connection");
        const socket = new WebSocket(url);
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => { socket.close(); reject(new Error("CDP connection timed out")); }, 5000);
            socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
            socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("CDP connection failed")); }, { once: true });
        });
        return new Cdp(socket);
    }
    get connected(): boolean { return this.socket.readyState === WebSocket.OPEN; }
    on(listener: (event: ProtocolEvent) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<Record<string, unknown>> {
        if (!this.connected) return Promise.reject(new Error("CDP disconnected"));
        const id = ++this.sequence;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
            this.pending.set(id, { resolve, reject, timer });
            this.socket.send(JSON.stringify({ id, method, params, sessionId }));
        });
    }
    async evaluate(expression: string, contextId?: number, awaitPromise = true): Promise<unknown> {
        const params: Record<string, unknown> = { expression, returnByValue: true, awaitPromise };
        if (contextId !== undefined) params.contextId = contextId;
        const result = await this.send("Runtime.evaluate", params);
        if (result.exceptionDetails) throw new Error("Renderer evaluation failed");
        return isRecord(result.result) ? result.result.value : undefined;
    }
    close(): void { this.socket.close(); }
}
export interface Target { id: string; type: string; url: string; webSocketDebuggerUrl: string; }
export async function targets(port: number): Promise<Target[]> {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000), redirect: "error" });
    if (!response.ok) throw new Error(`WebView2 target discovery failed: ${response.status}`);
    const value: unknown = await response.json();
    if (!Array.isArray(value)) throw new Error("Invalid debugging target list");
    return value.filter((entry): entry is Target => isRecord(entry) && typeof entry.id === "string" && entry.type === "page" &&
        typeof entry.url === "string" && typeof entry.webSocketDebuggerUrl === "string");
}
export function flackleTarget(target: Target): boolean {
    try { return target.type === "page" && new URL(target.url).origin === "https://flackle.com"; }
    catch { return false; }
}
