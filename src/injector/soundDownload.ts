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

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const maxBytes = 1024 * 1024;

export function privateAddress(address: string): boolean {
    const ip = address.toLowerCase().replace(/^::ffff:(?=\d+\.)/, "");
    if (isIP(ip) === 4) {
        const [a = 0, b = 0] = ip.split(".").map(Number);
        return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b < 128) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19));
    }
    return ip === "::" || ip === "::1" || /^(fc|fd|fe[89ab])/.test(ip) || ip.startsWith("::ffff:") || ip.startsWith("64:ff9b:");
}
export function audioType(bytes: Uint8Array): string | undefined {
    const text = (start: number, end: number): string => String.fromCharCode(...bytes.subarray(start, end));
    if (text(0, 3) === "ID3" || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0)) return "audio/mpeg";
    if (text(0, 4) === "OggS") return "audio/ogg";
    if (text(0, 4) === "RIFF" && text(8, 12) === "WAVE") return "audio/wav";
    if (text(0, 4) === "fLaC") return "audio/flac";
    if (text(4, 8) === "ftyp") return "audio/mp4";
    return undefined;
}

export async function downloadSound(payload: unknown): Promise<{ type: string; data: string }> {
    if (typeof payload !== "string" || payload.length > 2048) throw new Error("That link is not valid");
    let url: URL;
    try { url = new URL(payload.trim()); } catch { throw new Error("That link is not valid"); }
    for (let hop = 0; hop < 4; hop++) {
        if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new Error("Only https:// links are allowed");
        const host = url.hostname.replace(/^\[|\]$/g, "");
        const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map(entry => entry.address);
        if (!addresses.length) throw new Error("That website could not be found");
        if (addresses.some(privateAddress)) throw new Error("Links to local or private addresses are not allowed");
        const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10000), headers: { accept: "audio/*" } });
        if (response.status >= 300 && response.status < 400) {
            const next = response.headers.get("location");
            await response.body?.cancel();
            if (!next) throw new Error("That link redirects nowhere");
            url = new URL(next, url); continue;
        }
        if (!response.ok) { await response.body?.cancel(); throw new Error(`That link returned an error (${response.status})`); }
        if (Number(response.headers.get("content-length")) > maxBytes) { await response.body?.cancel(); throw new Error("Sounds must be 1 MB or smaller"); }
        const chunks: Uint8Array[] = []; let size = 0;
        const reader = response.body?.getReader();
        if (!reader) throw new Error("That link returned nothing");
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > maxBytes) { await reader.cancel(); throw new Error("Sounds must be 1 MB or smaller"); }
            chunks.push(value);
        }
        const bytes = Buffer.concat(chunks);
        const type = audioType(bytes);
        if (!type) throw new Error("That link isn't an mp3, ogg, wav, flac or m4a file");
        return { type, data: bytes.toString("base64") };
    }
    throw new Error("That link redirects too many times");
}
