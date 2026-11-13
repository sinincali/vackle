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

import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { build } from "esbuild";
import { buildOrWatchAll, commonOpts, define, header, IS_WATCH, pkg, rendererOpts, VERSION } from "./common.mjs";

const embed = `["https://www.youtube-nocookie.com","https://www.youtube.com"].includes(location.origin)&&location.pathname.startsWith("/embed/")`;
const insideFlackle = `(()=>{const a=location.ancestorOrigins;return(a&&a.length?a[a.length-1]:document.referrer?new URL(document.referrer).origin:"")==="https://flackle.com"})()`;
const manifest = JSON.parse(await readFile("src/extension/manifest.json", "utf8"));
await mkdir("dist/extension", { recursive: true });
await writeFile("dist/extension/manifest.json", JSON.stringify({ ...manifest, version: VERSION }, null, 2));
await copyFile("src/assets/vackle-128.png", "dist/extension/icon.png");
await writeFile("dist/extension/adblock.js", `if(${embed}&&${insideFlackle}){${await readFile("src/shared/adguard.js", "utf8")}\n}`);
await buildOrWatchAll([
    { ...rendererOpts, entryPoints: ["src/extension/page.ts"], outfile: "dist/extension/vackle.js" },
    { ...commonOpts, entryPoints: ["src/extension/content.ts"], outfile: "dist/extension/content.js", format: "iife", platform: "browser", target: "chrome120" },
    { ...commonOpts, entryPoints: ["src/extension/background.ts"], outfile: "dist/extension/background.js", format: "iife", platform: "browser", target: "chrome120" }
]);
if (!IS_WATCH) {
    const repository = pkg.vackle.repository;
    const release = `https://github.com/${repository}/releases/download/devbuild`;
    const meta = [
        "// ==UserScript==",
        "// @name         Vackle",
        "// @description  Flackle client mod, userscript version",
        `// @version      ${VERSION}`,
        `// @author       ${repository.split("/")[0]}`,
        `// @namespace    https://github.com/${repository}`,
        `// @homepageURL  https://github.com/${repository}`,
        `// @supportURL   https://github.com/${repository}/issues`,
        `// @icon         https://raw.githubusercontent.com/${repository}/main/src/assets/vackle-128.png`,
        "// @license      GPL-3.0-or-later",
        "// @match        https://flackle.com/*",
        "// @run-at       document-start",
        "// @noframes",
        "// @inject-into  page",
        "// @sandbox      JavaScript",
        "// @grant        GM_getValue",
        "// @grant        GM_setValue",
        "// @grant        GM_xmlhttpRequest",
        "// @grant        unsafeWindow",
        "// @connect      translate-pa.googleapis.com",
        "// @connect      sponsor.ajay.app",
        "// @connect      www.youtube.com",
        `// @updateURL    ${release}/Vackle.meta.js`,
        `// @downloadURL  ${release}/Vackle.user.js`,
        "// ==/UserScript==",
        ""
    ].join("\n");
    const bundle = async options => (await build({ ...options, banner: {}, write: false, define: { ...define, window: "unsafeWindow" } })).outputFiles[0].text;
    const [host, page] = await Promise.all([
        bundle({ ...commonOpts, entryPoints: ["src/extension/userscript.ts"], format: "iife", platform: "browser", target: "chrome120", inject: ["src/extension/gmFetch.ts"] }),
        bundle({ ...rendererOpts, entryPoints: ["src/extension/page.ts"] })
    ]);
    await writeFile("dist/Vackle.meta.js", meta);
    await writeFile("dist/Vackle.user.js", `${meta}\n${header}\n${host}${page}`);
    console.info("Wrote dist/Vackle.user.js");
}
if (!IS_WATCH && process.platform === "win32") {
    await rm("dist/extension.zip", { force: true });
    execFileSync(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe"), ["-a", "-c", "-f", "dist/extension.zip", "-C", "dist/extension", ...await readdir("dist/extension")], { stdio: "inherit" });
    console.info("Packed dist/extension.zip");
}
