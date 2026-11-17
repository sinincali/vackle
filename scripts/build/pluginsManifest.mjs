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

// Writes dist/plugins.json, the plugin list that api.vackle.dev serves at /v1/plugins.
// The line parser mirrors the one in the Vackle API (clients/github.rs, parse_plugin),
// so the API returns exactly what it used to scrape from each index.ts.
import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function string(line, key) {
    const needle = `${key}: "`;
    let at = line.indexOf(needle);
    while (at !== -1 && at !== 0 && /[A-Za-z0-9]/.test(line[at - 1])) at = line.indexOf(needle, at + 1);
    if (at === -1) return null;
    let out = "";
    for (let i = at + needle.length; i < line.length; i++) {
        if (line[i] === '"') return out;
        if (line[i] === "\\") { if (++i >= line.length) return null; }
        out += line[i];
    }
    return null;
}

export function parsePlugin(source) {
    const lines = source.split(/\r?\n/);
    const at = lines.findIndex(line => ["id", "name", "description"].every(key => string(line, key) !== null));
    if (at === -1) return null;
    const meta = lines[at + 1] ?? "";
    const list = meta.split("tags: [")[1]?.split("]")[0];
    return {
        id: string(lines[at], "id"),
        name: string(lines[at], "name"),
        description: string(lines[at], "description"),
        version: string(meta, "version"),
        author: string(meta, "author"),
        tags: list === undefined ? [] : list.split(",").map(tag => tag.trim().replace(/^"+|"+$/g, "")).filter(Boolean)
    };
}

export async function buildManifest(directory, commit) {
    const plugins = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const plugin = parsePlugin(await readFile(resolve(directory, entry.name, "index.ts"), "utf8"));
        if (plugin) plugins.push(plugin);
        else console.warn(`plugin ${entry.name} has no readable id/name/description line`);
    }
    if (!plugins.length) throw new Error("No plugins could be read, refusing to write an empty plugins.json");
    plugins.sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0));
    return { schema: 1, commit, plugins };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const git = (...args) => { try { return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };
    const manifest = await buildManifest(resolve("src/plugins"), process.env.VACKLE_COMMIT || git("rev-parse", "--short", "HEAD") || null);
    await mkdir("dist", { recursive: true });
    await writeFile("dist/plugins.json", JSON.stringify(manifest));
    console.info(`Wrote dist/plugins.json with ${manifest.plugins.length} plugins`);
}
