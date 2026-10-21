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

import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

export async function exists(path: string): Promise<boolean> {
    try { await lstat(path); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}
export async function safeTree(root: string, target = root): Promise<void> {
    const rel = relative(resolve(root), resolve(target));
    if (rel.startsWith(`..${sep}`) || rel === ".." || rel && resolve(root, rel) !== resolve(target)) throw new Error("Path escapes Vackle data directory");
    let current = resolve(root);
    for (const component of ["", ...rel.split(sep).filter(Boolean)]) {
        if (component) current = join(current, component);
        try { if ((await lstat(current)).isSymbolicLink()) throw new Error(`Refusing linked Vackle path: ${current}`); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
}
export async function atomicWrite(path: string, content: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
        await writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
        for (let attempt = 0; ; attempt++) {
            try { await rename(temporary, path); break; }
            catch (error) {
                const code = (error as NodeJS.ErrnoException).code;
                if (attempt >= 7 || !["EPERM", "EACCES", "EBUSY"].includes(code ?? "")) throw error;
                await delay(25 * 2 ** attempt);
            }
        }
    } finally { await rm(temporary, { force: true }); }
}
export async function renameRetry(from: string, to: string): Promise<void> {
    for (let attempt = 0; ; attempt++) {
        try { await rename(from, to); return; }
        catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (attempt >= 9 || !["EPERM", "EACCES", "EBUSY"].includes(code ?? "")) throw error;
            await delay(100 * 2 ** Math.min(attempt, 5));
        }
    }
}
export async function readJson(path: string): Promise<unknown> { return JSON.parse(await readFile(path, "utf8")) as unknown; }
