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

import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { buildOrWatchAll, commonOpts, define, gitHash, IS_WATCH, pkg, rendererOpts, RUNTIME, VERSION } from "./common.mjs";

await buildOrWatchAll([
    { ...rendererOpts, entryPoints: ["src/index.ts"], outfile: "dist/renderer.js" },
    { ...commonOpts, entryPoints: ["src/injector/index.ts"], outfile: "dist/injector.cjs", format: "cjs", platform: "node", target: "node22", define }
]);
if (IS_WATCH) console.info("Watching sources. Run pnpm inject and relaunch Flackle to load rebuilt bundles.");
else {
    await writeFile("dist/sea.json", JSON.stringify({ main: "dist/injector.cjs", output: "dist/Vackle.exe", disableExperimentalSEAWarning: true, execArgvExtension: "none",
        assets: { "injector.cjs": "dist/injector.cjs", "renderer.js": "dist/renderer.js" } }, null, 2));
    await writeFile("dist/runtime.txt", RUNTIME);
    execFileSync(process.execPath, ["--build-sea", "dist/sea.json"], { stdio: "inherit" });
    if (process.env.VACKLE_SIGNING_KEY) await signRelease(process.env.VACKLE_SIGNING_KEY);
    console.info(`Built Vackle ${VERSION} (${gitHash || "no commit"})`);
}

async function signRelease(keyPath) {
    const privateKey = createPrivateKey(await readFile(keyPath));
    if (createPublicKey(privateKey).export({ format: "der", type: "spki" }).toString("base64") !== pkg.vackle?.publicKey)
        throw new Error("package.json publicKey does not match the signing key");
    const files = {};
    for (const name of ["Vackle.exe", "injector.cjs", "renderer.js"]) {
        const bytes = await readFile(`dist/${name}`);
        files[name] = { sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length };
    }
    const notes = process.env.VACKLE_NOTES_FILE ? await readFile(process.env.VACKLE_NOTES_FILE, "utf8") : `Vackle ${VERSION}`;
    const manifest = JSON.stringify({ schema: 1, version: VERSION, runtime: RUNTIME, notes: notes.trim().slice(0, 20000), ...gitHash ? { commit: gitHash } : {}, files });
    const signature = sign(null, Buffer.from(manifest, "utf8"), privateKey).toString("base64");
    if (!verify(null, Buffer.from(manifest, "utf8"), createPublicKey(privateKey), Buffer.from(signature, "base64"))) throw new Error("Signature self-check failed");
    await writeFile("dist/vackle-release.json", JSON.stringify({ manifest, signature }));
    console.info("Signed dist/vackle-release.json");
}
