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
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { buildOrWatchAll, gitHash, IS_WATCH, pkg, rendererOpts, VERSION } from "./common.mjs";

await buildOrWatchAll([{ ...rendererOpts, entryPoints: ["src/index.ts"], outfile: "dist/renderer.js" }]);
if (IS_WATCH) console.info("Watching sources. Run pnpm inject and relaunch Flackle to load rebuilt bundles.");
else {
    const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
    const launcher = process.env.VACKLE_LAUNCHER ?? "../Vackle Installer/bin/Release/net472/Vackle.exe";
    if (!existsSync(launcher)) throw new Error(`${launcher} is missing. Build the Vackle Installer repo first, or set VACKLE_LAUNCHER to its Vackle.exe.`);
    await copyFile(launcher, "dist/Vackle.exe");
    await writeFile("dist/injector.cjs", "throw new Error(\"Vackle runs natively now. Start Flackle with the Vackle shortcut.\");\n");
    const smoke = spawnSync("dist/Vackle.exe", ["build-smoke-test"], { encoding: "utf8", timeout: 30000 });
    if (!/Unknown command: build-smoke-test/.test(smoke.stderr)) throw new Error(`Vackle.exe failed its smoke test: ${smoke.stderr || smoke.error}`);
    const runtime = `native-${sha256(await readFile("dist/Vackle.exe")).slice(0, 12)}`;
    await writeFile("dist/vackle-local.json", JSON.stringify({ version: VERSION, runtime, ...gitHash ? { commit: gitHash } : {} }));
    if (process.env.VACKLE_SIGNING_KEY) await signRelease(process.env.VACKLE_SIGNING_KEY, runtime, sha256);
    console.info(`Built Vackle ${VERSION} (${gitHash || "no commit"}), launcher ${runtime}`);
}

async function signRelease(keyPath, runtime, sha256) {
    const privateKey = createPrivateKey(await readFile(keyPath));
    if (createPublicKey(privateKey).export({ format: "der", type: "spki" }).toString("base64") !== pkg.vackle?.publicKey)
        throw new Error("package.json publicKey does not match the signing key");
    const files = {};
    for (const name of ["Vackle.exe", "injector.cjs", "renderer.js"]) {
        const bytes = await readFile(`dist/${name}`);
        files[name] = { sha256: sha256(bytes), size: bytes.length };
    }
    const notes = process.env.VACKLE_NOTES_FILE ? await readFile(process.env.VACKLE_NOTES_FILE, "utf8") : `Vackle ${VERSION}`;
    const manifest = JSON.stringify({ schema: 1, version: VERSION, runtime, notes: notes.trim().slice(0, 20000), ...gitHash ? { commit: gitHash } : {}, files });
    const signature = sign(null, Buffer.from(manifest, "utf8"), privateKey).toString("base64");
    if (!verify(null, Buffer.from(manifest, "utf8"), createPublicKey(privateKey), Buffer.from(signature, "base64"))) throw new Error("Signature self-check failed");
    await writeFile("dist/vackle-release.json", JSON.stringify({ manifest, signature }));
    console.info("Signed dist/vackle-release.json");
}
