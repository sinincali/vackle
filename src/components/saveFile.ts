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

type Picker = (options: { suggestedName: string }) => Promise<{ createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }> }>;

export async function saveFile(name: string, data: () => Promise<Blob>): Promise<boolean> {
    const picker = (window as { showSaveFilePicker?: Picker }).showSaveFilePicker;
    try {
        if (picker) {
            const handle = await picker({ suggestedName: name });
            const blob = await data();
            const writable = await handle.createWritable(); await writable.write(blob); await writable.close();
        } else {
            const url = URL.createObjectURL(await data());
            Object.assign(document.createElement("a"), { href: url, download: name }).click();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        }
        return true;
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return false;
        throw error;
    }
}
