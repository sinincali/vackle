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

import "../checkNodeVersion.js";

import { context, transform } from "esbuild";
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

export const header = (await readFile(new URL("../header-new.txt", import.meta.url), "utf8")).trim();
export const pkg = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
export const IS_WATCH = process.argv.includes("--watch");

const git = (...args) => { try { return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };
if (git("rev-parse", "--is-shallow-repository") === "true") throw new Error("Shallow clone: the build number comes from the commit count, so fetch the full history first");
const count = git("rev-list", "--count", "HEAD");
const [major, minor] = pkg.version.split(".");
export const VERSION = /^\d+$/.test(count) ? `${major}.${minor}.${count}` : pkg.version;
export const gitHash = process.env.VACKLE_COMMIT || git("rev-parse", "--short", "HEAD");
export const RUNTIME = `node-${process.versions.node}+sea-1`;
export const define = {
    VACKLE_VERSION: JSON.stringify(VERSION), VACKLE_RUNTIME: JSON.stringify(RUNTIME), VACKLE_COMMIT: JSON.stringify(gitHash),
    VACKLE_REPOSITORY: JSON.stringify(pkg.vackle?.repository ?? ""), VACKLE_PUBLIC_KEY: JSON.stringify(pkg.vackle?.publicKey ?? "")
};
export const commonOpts = { bundle: true, minify: true, legalComments: "none", banner: { js: header }, logLevel: "info", charset: "utf8" };

export const pluginsPlugin = {
    name: "vackle-plugins",
    setup(builder) {
        builder.onResolve({ filter: /^virtual:plugins$/ }, () => ({ path: "plugins", namespace: "vackle" }));
        builder.onLoad({ filter: /.*/, namespace: "vackle" }, async () => {
            const directory = resolve("src/plugins");
            const entries = (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
            const paths = entries.map(entry => resolve(directory, entry.name, "index.ts"));
            return {
                contents: paths.map((path, index) => `import p${index} from ${JSON.stringify(path)};`).join("\n") +
                    `\nexport default [${paths.map((_, index) => `p${index}`).join(",")}];`,
                loader: "ts", resolveDir: directory, watchDirs: [directory], watchFiles: paths
            };
        });
    }
};
export const stylePlugin = {
    name: "vackle-styles",
    setup(builder) {
        builder.onLoad({ filter: /\.css$/ }, async args => {
            const source = await readFile(args.path, "utf8");
            const output = await transform(source, { loader: "css", minify: true, legalComments: "none", target: "chrome120" });
            return { contents: output.code, loader: "text", watchFiles: [args.path] };
        });
    }
};
export const rendererOpts = { ...commonOpts, format: "iife", platform: "browser", target: "chrome120", loader: { ".png": "dataurl" }, plugins: [pluginsPlugin, stylePlugin] };

export async function buildOrWatchAll(configs) {
    const contexts = await Promise.all(configs.map(config => context(config)));
    if (IS_WATCH) { await Promise.all(contexts.map(ctx => ctx.watch())); return; }
    try { await Promise.all(contexts.map(ctx => ctx.rebuild())); }
    finally { await Promise.all(contexts.map(ctx => ctx.dispose())); }
}
