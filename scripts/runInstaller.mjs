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

import "./checkNodeVersion.js";

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

if (process.platform !== "win32") throw new Error("Vackle.exe only runs on Windows");
if (!existsSync("dist/Vackle.exe")) throw new Error("dist/Vackle.exe is missing. Run pnpm build first.");
const result = spawnSync("dist/Vackle.exe", process.argv.slice(2), { stdio: "inherit" });
process.exitCode = result.status ?? 1;
