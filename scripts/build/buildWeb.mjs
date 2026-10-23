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
import { buildOrWatchAll, commonOpts, IS_WATCH, rendererOpts, VERSION } from "./common.mjs";

const embed = `["https://www.youtube-nocookie.com","https://www.youtube.com"].includes(location.origin)&&location.pathname.startsWith("/embed/")`;
const insideFlackle = `(()=>{const a=location.ancestorOrigins;return(a&&a.length?a[a.length-1]:document.referrer?new URL(document.referrer).origin:"")==="https://flackle.com"})()`;
const manifest = JSON.parse(await readFile("src/extension/manifest.json", "utf8"));
await mkdir("dist/extension", { recursive: true });
await writeFile("dist/extension/manifest.json", JSON.stringify({ ...manifest, version: VERSION }, null, 2));
await copyFile("src/assets/vackle-128.png", "dist/extension/icon.png");
await writeFile("dist/extension/adblock.js", `if(${embed}&&${insideFlackle}){${await readFile("src/injector/adguard.js", "utf8")}\n}`);
await buildOrWatchAll([
    { ...rendererOpts, entryPoints: ["src/extension/page.ts"], outfile: "dist/extension/vackle.js" },
    { ...commonOpts, entryPoints: ["src/extension/content.ts"], outfile: "dist/extension/content.js", format: "iife", platform: "browser", target: "chrome120" },
    { ...commonOpts, entryPoints: ["src/extension/background.ts"], outfile: "dist/extension/background.js", format: "iife", platform: "browser", target: "chrome120" }
]);
if (!IS_WATCH && process.platform === "win32") {
    await rm("dist/extension.zip", { force: true });
    execFileSync(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe"), ["-a", "-c", "-f", "dist/extension.zip", "-C", "dist/extension", ...await readdir("dist/extension")], { stdio: "inherit" });
    console.info("Packed dist/extension.zip");
}
