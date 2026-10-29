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

import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createPublicKey, randomUUID, sign, verify, type KeyObject } from "node:crypto";
import { join } from "node:path";
import { hash } from "./detection";
import { atomicWrite, exists, readJson, safeTree } from "./files";
import { isRecord } from "../settings/schema";

export const runtimeFiles = ["Vackle.exe", "injector.cjs", "renderer.js"] as const;
export type RuntimeFile = typeof runtimeFiles[number];
export interface ReleaseFile { sha256: string; size: number; }
export interface Release { version: string; runtime: string; notes: string; files: Record<RuntimeFile, ReleaseFile>; commit?: string; }
export interface Reusable { runtime: string; exe: string; }
export interface SignedRelease { manifest: string; signature: string; }
export interface Feed { latest(): Promise<{ document: unknown; assets: Record<string, string> }>; download(url: string): Promise<Uint8Array>; changes?(from: string, to: string): Promise<string>; }
export interface UpdateStatus { current: string; available: { version: string; notes: string } | null; updated: { from: string; to: string } | null; error: string | null; }
interface UpdateState { schema: 1; skipped: string | null; failed: string[]; updated: { from: string; to: string } | null; }
const sizeLimits: Record<RuntimeFile, number> = { "Vackle.exe": 256 * 1024 * 1024, "injector.cjs": 8 * 1024 * 1024, "renderer.js": 16 * 1024 * 1024 };
const semver = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;
const sha = /^[0-9a-f]{7,40}$/;

export function compareVersions(a: string, b: string): number {
    const left = semver.exec(a); const right = semver.exec(b);
    if (!left || !right) throw new Error(`Invalid version: ${left ? b : a}`);
    for (let index = 1; index <= 3; index++) { const difference = Number(left[index]) - Number(right[index]); if (difference) return Math.sign(difference); }
    return 0;
}
export function signRelease(release: Release, privateKey: KeyObject): SignedRelease {
    const manifest = JSON.stringify({ schema: 1, ...release });
    return { manifest, signature: sign(null, Buffer.from(manifest, "utf8"), privateKey).toString("base64") };
}
export function verifyRelease(document: unknown, key: string): Release {
    if (!key) throw new Error("This build has no release signing key, so updates are disabled");
    if (!isRecord(document) || typeof document.manifest !== "string" || typeof document.signature !== "string" || document.manifest.length > 65536)
        throw new Error("Release manifest is malformed");
    const publicKey = createPublicKey({ key: Buffer.from(key, "base64"), format: "der", type: "spki" });
    if (!verify(null, Buffer.from(document.manifest, "utf8"), publicKey, Buffer.from(document.signature, "base64")))
        throw new Error("Release signature is invalid");
    const value: unknown = JSON.parse(document.manifest);
    if (!isRecord(value) || value.schema !== 1 || typeof value.version !== "string" || !semver.test(value.version) ||
        typeof value.runtime !== "string" || !/^[\w.+-]{1,64}$/.test(value.runtime) ||
        typeof value.notes !== "string" || value.notes.length > 20000 || value.commit !== undefined && (typeof value.commit !== "string" || !sha.test(value.commit)) || !isRecord(value.files) ||
        Object.keys(value.files).sort().join(",") !== [...runtimeFiles].sort().join(","))
        throw new Error("Release manifest has an unexpected shape");
    for (const name of runtimeFiles) {
        const file = value.files[name];
        if (!isRecord(file) || typeof file.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(file.sha256) ||
            !Number.isSafeInteger(file.size) || (file.size as number) < 1 || (file.size as number) > sizeLimits[name])
            throw new Error(`Release entry for ${name} is invalid`);
    }
    return { version: value.version, runtime: value.runtime, notes: value.notes, files: value.files as Release["files"], ...typeof value.commit === "string" ? { commit: value.commit } : {} };
}

async function fetchBytes(url: string, accept: string): Promise<Uint8Array> {
    const response = await fetch(url, { headers: { "User-Agent": "Vackle-Updater", Accept: accept }, signal: AbortSignal.timeout(300000), redirect: "follow" });
    if (!response.ok) throw new Error(`Download failed (${response.status}) for ${new URL(url).pathname}`);
    return new Uint8Array(await response.arrayBuffer());
}
const text = async (url: string, accept: string): Promise<unknown> => JSON.parse(Buffer.from(await fetchBytes(url, accept)).toString("utf8"));
export function githubFeed(repository: string): Feed {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error("Update repository is not configured");
    return {
        async latest() {
            const release = await text(`https://api.github.com/repos/${repository}/releases/latest`, "application/vnd.github+json");
            if (!isRecord(release) || !Array.isArray(release.assets)) throw new Error("GitHub returned an unexpected release");
            const assets: Record<string, string> = {};
            for (const asset of release.assets) if (isRecord(asset) && typeof asset.name === "string" && typeof asset.browser_download_url === "string" &&
                asset.browser_download_url.startsWith("https://github.com/")) assets[asset.name] = asset.browser_download_url;
            if (!assets["vackle-release.json"]) throw new Error("The latest release has no vackle-release.json");
            return { document: await text(assets["vackle-release.json"], "application/octet-stream"), assets };
        },
        download: url => fetchBytes(url, "application/octet-stream"),
        async changes(from, to) {
            const compare = await text(`https://api.github.com/repos/${repository}/compare/${from}...${to}`, "application/vnd.github+json");
            if (!isRecord(compare) || !Array.isArray(compare.commits)) throw new Error("GitHub returned an unexpected comparison");
            return compare.commits.map(entry => isRecord(entry) && isRecord(entry.commit) && typeof entry.commit.message === "string" ? `- ${entry.commit.message.split("\n")[0]}` : "").filter(Boolean).reverse().join("\n");
        }
    };
}
export function directoryFeed(base: string): Feed {
    const url = (name: string): string => new URL(name, base.endsWith("/") ? base : `${base}/`).href;
    return {
        async latest() { return { document: await text(url("vackle-release.json"), "application/json"), assets: Object.fromEntries(runtimeFiles.map(name => [name, url(name)])) }; },
        download: target => fetchBytes(target, "application/octet-stream")
    };
}

async function readState(root: string): Promise<UpdateState> {
    const path = join(root, "updates.json"); await safeTree(root, path);
    const empty: UpdateState = { schema: 1, skipped: null, failed: [], updated: null };
    if (!await exists(path)) return empty;
    const value = await readJson(path).catch(() => undefined);
    if (!isRecord(value) || value.schema !== 1) return empty;
    return {
        schema: 1, skipped: typeof value.skipped === "string" ? value.skipped : null,
        failed: Array.isArray(value.failed) ? value.failed.filter((entry): entry is string => typeof entry === "string").slice(-32) : [],
        updated: isRecord(value.updated) && typeof value.updated.from === "string" && typeof value.updated.to === "string" ? { from: value.updated.from, to: value.updated.to } : null
    };
}
export async function updateState(root: string, change: (state: UpdateState) => void): Promise<void> {
    const state = await readState(root); change(state);
    await atomicWrite(join(root, "updates.json"), JSON.stringify(state, null, 2));
}

interface Latest { at: number; release: Release; document: unknown; assets: Record<string, string>; }
export class Updates {
    private cached: Latest | undefined;
    private checking: Promise<Latest> | undefined;
    private readonly changelogs = new Map<string, string>();
    constructor(private readonly root: string, readonly current: string, private readonly feed: Feed | undefined, private readonly key: string, private readonly commit = "", private readonly maxAge = 10 * 60 * 1000) {}
    get enabled(): boolean { return Boolean(this.feed && this.key); }
    private latest(force = false): Promise<Latest> {
        if (!this.feed) return Promise.reject(new Error("Updates are not configured for this build"));
        if (!force && this.cached && Date.now() - this.cached.at < this.maxAge) return Promise.resolve(this.cached);
        this.checking ??= this.feed.latest().then(({ document, assets }) => {
            this.cached = { at: Date.now(), release: verifyRelease(document, this.key), document, assets };
            return this.cached;
        }).finally(() => { this.checking = undefined; });
        return this.checking;
    }
    async status(force = false): Promise<UpdateStatus> {
        const state = await readState(this.root);
        const result: UpdateStatus = { current: this.current, available: null, updated: state.updated, error: null };
        if (state.updated) await updateState(this.root, value => { value.updated = null; });
        if (!this.enabled) return result;
        try {
            const { release } = await this.latest(force);
            if (compareVersions(release.version, this.current) > 0 && state.skipped !== release.version && !state.failed.includes(release.version))
                result.available = { version: release.version, notes: await this.changes(release) };
        } catch (error) { result.error = error instanceof Error ? error.message : String(error); }
        return result;
    }
    private async changes(release: Release): Promise<string> {
        if (!this.commit || !release.commit || !this.feed?.changes) return release.notes;
        const known = this.changelogs.get(release.commit);
        if (known) return known;
        const listed = await this.feed.changes(this.commit, release.commit).catch(() => "");
        if (listed) this.changelogs.set(release.commit, listed);
        return listed || release.notes;
    }
    async skip(version: string): Promise<void> {
        if (!semver.test(version)) throw new Error("Invalid version");
        await updateState(this.root, state => { state.skipped = version; });
    }
    async stage(): Promise<string> {
        const { release, document, assets } = await this.latest(true);
        if (compareVersions(release.version, this.current) <= 0) throw new Error("No newer Vackle release is available");
        const directory = join(this.root, "updates", `${release.version}-${randomUUID()}`);
        await safeTree(this.root, directory); await mkdir(directory, { recursive: true });
        const reuse = await reusable(this.root);
        try {
            for (const name of runtimeFiles) {
                const expected = release.files[name];
                const installed = join(this.root, "installed", name);
                const target = join(directory, name);
                const sameRuntime = name === "Vackle.exe" && reuse?.runtime === release.runtime;
                if (await exists(installed) && (sameRuntime || (await stat(installed)).size === expected.size)) {
                    const current = await readFile(installed);
                    if (hash(current) === expected.sha256 || sameRuntime && hash(current) === reuse!.exe) { await writeFile(target, current, { flag: "wx" }); continue; }
                }
                const url = assets[name];
                if (!url) throw new Error(`The release is missing ${name}`);
                const bytes = await this.feed!.download(url);
                if (bytes.length !== expected.size || hash(bytes) !== expected.sha256) throw new Error(`Downloaded ${name} does not match the signed release`);
                await writeFile(target, bytes, { flag: "wx" });
            }
            await writeFile(join(directory, "vackle-release.json"), JSON.stringify(document), { flag: "wx" });
            return directory;
        } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
    }
}
export async function reusable(root: string): Promise<Reusable | undefined> {
    const manifest = await readJson(join(root, "installed", "manifest.json")).catch(() => undefined);
    return isRecord(manifest) && manifest.schema === 2 && typeof manifest.runtime === "string" && isRecord(manifest.files) && typeof manifest.files["Vackle.exe"] === "string"
        ? { runtime: manifest.runtime, exe: manifest.files["Vackle.exe"] } : undefined;
}
export async function readStaged(directory: string, key: string, reuse?: Reusable): Promise<{ release: Release; files: Record<RuntimeFile, Buffer> }> {
    const release = verifyRelease(await readJson(join(directory, "vackle-release.json")), key);
    const files = {} as Record<RuntimeFile, Buffer>;
    for (const name of runtimeFiles) {
        const bytes = await readFile(join(directory, name));
        const kept = name === "Vackle.exe" && reuse?.runtime === release.runtime && hash(bytes) === reuse.exe;
        if (!kept && (bytes.length !== release.files[name].size || hash(bytes) !== release.files[name].sha256)) throw new Error(`Staged ${name} does not match the signed release`);
        files[name] = bytes;
    }
    return { release, files };
}
export async function cleanStaged(root: string, keep?: string, olderThan = 10 * 60 * 1000): Promise<void> {
    const updates = join(root, "updates");
    await safeTree(root, updates);
    const leftovers = (await readdir(root).catch(() => [])).filter(name => /^(stage|backup|failed)-[0-9a-f-]{36}$/.test(name)).map(name => join(root, name));
    const staged = await exists(updates) ? (await readdir(updates)).map(name => join(updates, name)) : [];
    for (const path of [...leftovers, ...staged]) {
        if (keep && path.toLowerCase() === keep.toLowerCase()) continue;
        try { if (Date.now() - (await stat(path)).mtimeMs >= olderThan) await rm(path, { recursive: true }); } catch { }
    }
}
