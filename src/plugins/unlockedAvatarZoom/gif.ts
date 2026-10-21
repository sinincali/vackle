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

const transparent = 255;

export function lzw(indices: Uint8Array, minCode = 8): number[] {
    const clear = 1 << minCode, end = clear + 1, out: number[] = [];
    let size = minCode + 1, next = end + 1, buffer = 0, bits = 0;
    let table = new Map<number, number>();
    const emit = (code: number): void => { buffer |= code << bits; bits += size; while (bits >= 8) { out.push(buffer & 255); buffer >>>= 8; bits -= 8; } };
    emit(clear);
    let prefix = indices[0] ?? 0;
    for (let index = 1; index < indices.length; index++) {
        const value = indices[index]!, key = prefix << 8 | value, found = table.get(key);
        if (found !== undefined) { prefix = found; continue; }
        emit(prefix);
        if (next === 4096) { emit(clear); table = new Map(); next = end + 1; size = minCode + 1; }
        else { if (next >= 1 << size) size++; table.set(key, next++); }
        prefix = value;
    }
    emit(prefix); emit(end);
    if (bits > 0) out.push(buffer & 255);
    return out;
}

export function createGif(width: number, height: number): { add(pixels: Uint8ClampedArray, delay: number): void; finish(): Uint8Array<ArrayBuffer> } {
    const parts: Uint8Array[] = []; let bytes: number[] = [];
    const flush = (): void => { parts.push(Uint8Array.from(bytes)); bytes = []; };
    const word = (value: number): void => { bytes.push(value & 255, value >> 8 & 255); };
    const text = (value: string): void => { for (const char of value) bytes.push(char.charCodeAt(0)); };
    text("GIF89a"); word(width); word(height); bytes.push(0xf7, 0, 0);
    for (let index = 0; index < 256; index++) {
        if (index >= 252) { bytes.push(0, 0, 0); continue; }
        bytes.push(Math.floor(index / 42) * 51, Math.round(Math.floor(index / 6) % 7 * 42.5), index % 6 * 51);
    }
    bytes.push(0x21, 0xff, 11); text("NETSCAPE2.0"); bytes.push(3, 1, 0, 0, 0);
    return {
        add(pixels, delay) {
            const indices = new Uint8Array(width * height);
            for (let pixel = 0, offset = 0; pixel < indices.length; pixel++, offset += 4)
                indices[pixel] = pixels[offset + 3]! < 128 ? transparent : Math.round(pixels[offset]! / 51) * 42 + Math.round(pixels[offset + 1]! / 42.5) * 6 + Math.round(pixels[offset + 2]! / 51);
            bytes.push(0x21, 0xf9, 4, 0x09); word(Math.max(2, Math.round(delay / 10))); bytes.push(transparent, 0);
            bytes.push(0x2c); word(0); word(0); word(width); word(height); bytes.push(0, 8);
            const data = lzw(indices);
            for (let start = 0; start < data.length; start += 255) { const chunk = data.slice(start, start + 255); bytes.push(chunk.length); for (const value of chunk) bytes.push(value); }
            bytes.push(0); flush();
        },
        finish() {
            bytes.push(0x3b); flush();
            const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
            let offset = 0; for (const part of parts) { out.set(part, offset); offset += part.length; }
            return out;
        }
    };
}
