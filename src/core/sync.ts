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

import type { Bridge, Settings } from "../api/types";
import { isRecord, validateSettings } from "../settings/schema";
import type { SettingsStore } from "../settings/settingsStore";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const keyLength = 32;
const maxPlain = 4 * 1024 * 1024;
const maxBlob = 350_000;
const encoder = new TextEncoder();

export function newKey(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(keyLength));
    return Array.from(bytes, byte => alphabet[byte % 32]).join("").replace(/(.{4})(?=.)/g, "$1-");
}
export function normalizeKey(input: string): string {
    const text = input.toUpperCase().replace(/[\s-]/g, "");
    if (text.length !== keyLength || [...text].some(char => !alphabet.includes(char))) throw new Error("That recovery key isn't valid. It has 32 letters and numbers, such as ABCD-EFGH-…");
    return text.replace(/(.{4})(?=.)/g, "$1-");
}
const hex = (bytes: ArrayBuffer): string => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
const base64 = (bytes: Uint8Array): string => {
    let text = "";
    for (let index = 0; index < bytes.length; index += 0x8000) text += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    return btoa(text);
};

export interface Derived { id: string; token: string; aes: CryptoKey; }
export async function derive(key: string): Promise<Derived> {
    const root = await crypto.subtle.importKey("raw", encoder.encode(normalizeKey(key)), "HKDF", false, ["deriveBits", "deriveKey"]);
    const params = (info: string): HkdfParams => ({ name: "HKDF", hash: "SHA-256", salt: encoder.encode("vackle-sync-v1"), info: encoder.encode(info) });
    return {
        id: hex(await crypto.subtle.deriveBits(params("id"), root, 256)),
        token: hex(await crypto.subtle.deriveBits(params("token"), root, 256)),
        aes: await crypto.subtle.deriveKey(params("encrypt"), root, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"])
    };
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit = Infinity): Promise<Uint8Array> {
    const writer = stream.writable.getWriter();
    void writer.write(bytes as Uint8Array<ArrayBuffer>).then(() => writer.close()).catch(() => undefined);
    const chunks: Uint8Array[] = []; let size = 0;
    for (const reader = stream.readable.getReader(); ;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > limit) { void reader.cancel(); throw new Error("The synced data is too large"); }
        chunks.push(value);
    }
    const out = new Uint8Array(size); let at = 0;
    for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
    return out;
}
export async function seal(settings: Settings, aes: CryptoKey): Promise<string> {
    const plain = await pipe(encoder.encode(JSON.stringify(settings)), new CompressionStream("gzip"));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, plain as Uint8Array<ArrayBuffer>));
    const out = new Uint8Array(12 + cipher.length); out.set(iv); out.set(cipher, 12);
    return base64(out);
}
export async function open(blob: string, aes: CryptoKey): Promise<Settings> {
    let bytes: Uint8Array;
    try { bytes = Uint8Array.from(atob(blob), char => char.charCodeAt(0)); } catch { throw new Error("The synced data is damaged"); }
    let plain: Uint8Array;
    try { plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, aes, bytes.slice(12)).then(buffer => new Uint8Array(buffer)); }
    catch { throw new Error("Couldn't decrypt the synced data. Was it made with a different recovery key?"); }
    const value: unknown = JSON.parse(new TextDecoder().decode(await pipe(plain, new DecompressionStream("gzip"), maxPlain)));
    if (isRecord(value) && typeof value.schema === "number" && value.schema > 1) throw new Error("These settings were saved by a newer Vackle. Update Vackle on this device first.");
    return validateSettings(value);
}

interface Saved { key: string; version: number; }
type Reply = { status: number; body: unknown };
export class SyncConflict extends Error { constructor(readonly version: number) { super("The cloud copy has changes this device doesn't have yet."); } }

export class CloudSync {
    constructor(private readonly bridge: Pick<Required<Bridge>, "sync">, private readonly store: SettingsStore) {}

    async saved(): Promise<Saved | null> {
        const text = await this.bridge.sync({ op: "load" });
        if (typeof text !== "string") return null;
        try {
            const value: unknown = JSON.parse(text);
            return isRecord(value) && typeof value.key === "string" && Number.isSafeInteger(value.version) ? { key: normalizeKey(value.key), version: value.version as number } : null;
        } catch { return null; }
    }
    private remember(saved: Saved): Promise<unknown> { return this.bridge.sync({ op: "store", value: JSON.stringify(saved) }); }
    private async call(derived: Derived, method: "GET" | "PUT" | "DELETE", body?: string): Promise<Reply> {
        const reply = await this.bridge.sync({ op: "http", method, id: derived.id, token: derived.token, ...body === undefined ? {} : { body } });
        if (!isRecord(reply) || typeof reply.status !== "number") throw new Error("The launcher sent an unexpected sync reply");
        return { status: reply.status, body: reply.body };
    }
    private static fail(reply: Reply): never {
        if (reply.status === 401) throw new Error("The cloud rejected this recovery key.");
        if (reply.status === 413) throw new Error("Your settings are too large to sync.");
        if (reply.status === 429) {
            const wait = isRecord(reply.body) && typeof reply.body.retry_after === "number" ? Math.ceil(reply.body.retry_after / 60) : 0;
            throw new Error(wait ? `Please wait ${wait} ${wait === 1 ? "minute" : "minutes"} before syncing again.` : "Too many requests. Try again in a minute.");
        }
        if (reply.status === 503) throw new Error("Cloud Sync isn't available yet.");
        throw new Error(`Cloud Sync failed (${reply.status}). Try again in a moment.`);
    }
    private async upload(derived: Derived, base: number): Promise<number> {
        const blob = await seal(this.store.value, derived.aes);
        if (blob.length > maxBlob) throw new Error("Your settings are too large to sync.");
        const reply = await this.call(derived, "PUT", JSON.stringify({ base, blob }));
        if (reply.status === 409 && isRecord(reply.body) && typeof reply.body.version === "number") throw new SyncConflict(reply.body.version);
        if (reply.status !== 200 || !isRecord(reply.body) || !isRecord(reply.body.data) || typeof reply.body.data.version !== "number") CloudSync.fail(reply);
        return (reply.body.data as { version: number }).version;
    }
    private async download(derived: Derived): Promise<{ settings: Settings; version: number }> {
        const reply = await this.call(derived, "GET");
        if (reply.status === 404) throw new Error("Nothing is synced under that recovery key yet.");
        const data = isRecord(reply.body) && isRecord(reply.body.data) ? reply.body.data : undefined;
        if (reply.status !== 200 || !data || typeof data.blob !== "string" || typeof data.version !== "number") CloudSync.fail(reply);
        return { settings: await open(data!.blob as string, derived.aes), version: data!.version as number };
    }
    private apply(settings: Settings): Promise<void> {
        return this.store.update(current => { current.plugins = settings.plugins; current.css = settings.css; current.themes = settings.themes; current.toolbox = settings.toolbox; });
    }

    async enable(): Promise<string> {
        const key = newKey(), derived = await derive(key);
        const version = await this.upload(derived, 0);
        try { await this.remember({ key, version }); }
        catch (error) { await this.call(derived, "DELETE").catch(() => undefined); throw error; }
        return key;
    }
    async join(input: string): Promise<void> {
        const key = normalizeKey(input);
        const { settings, version } = await this.download(await derive(key));
        await this.apply(settings);
        await this.remember({ key, version });
    }
    async push(base?: number): Promise<void> {
        const saved = await this.saved(); if (!saved) throw new Error("Cloud Sync is off.");
        await this.remember({ key: saved.key, version: await this.upload(await derive(saved.key), base ?? saved.version) });
    }
    async pull(): Promise<void> {
        const saved = await this.saved(); if (!saved) throw new Error("Cloud Sync is off.");
        const { settings, version } = await this.download(await derive(saved.key));
        await this.apply(settings);
        await this.remember({ key: saved.key, version });
    }
    async disable(): Promise<void> {
        const saved = await this.saved(); if (!saved) return;
        const reply = await this.call(await derive(saved.key), "DELETE");
        if (reply.status !== 200) CloudSync.fail(reply);
        await this.forget();
    }
    async forget(): Promise<void> { await this.bridge.sync({ op: "clear" }); }
}
