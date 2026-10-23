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

declare const VACKLE_VERSION: string | undefined;
declare const VACKLE_REPOSITORY: string | undefined;
declare const VACKLE_PUBLIC_KEY: string | undefined;
declare const VACKLE_RUNTIME: string | undefined;
declare const VACKLE_COMMIT: string | undefined;

export const version = typeof VACKLE_VERSION === "string" ? VACKLE_VERSION : "0.0.0";
export const repository = typeof VACKLE_REPOSITORY === "string" ? VACKLE_REPOSITORY : "";
export const publicKey = typeof VACKLE_PUBLIC_KEY === "string" ? VACKLE_PUBLIC_KEY : "";
export const runtime = typeof VACKLE_RUNTIME === "string" ? VACKLE_RUNTIME : "dev";
export const commit = typeof VACKLE_COMMIT === "string" ? VACKLE_COMMIT : "";
