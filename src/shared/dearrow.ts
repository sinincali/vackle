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

import type { Branding } from "../api/types";
import { isRecord } from "../settings/schema";

export function pickBranding(response: unknown): Branding {
    const first = (key: string): Record<string, unknown> | undefined => {
        const list = isRecord(response) ? response[key] : undefined;
        const entry: unknown = Array.isArray(list) ? list[0] : undefined;
        return isRecord(entry) && entry.original !== true && (entry.locked === true || typeof entry.votes === "number" && entry.votes >= 0) ? entry : undefined;
    };
    const title = first("titles")?.title;
    const random = isRecord(response) && typeof response.randomTime === "number" && typeof response.videoDuration === "number" ? response.randomTime * response.videoDuration : null;
    const time = first("thumbnails")?.timestamp ?? random;
    return {
        title: typeof title === "string" && title.trim() ? title.replace(/(^|\s)>(\S)/g, "$1$2").slice(0, 300) : null,
        thumbnail: typeof time === "number" && Number.isFinite(time) && time >= 0 ? time : null
    };
}
export async function fetchBranding(videoId: string): Promise<Branding> {
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error("Invalid YouTube video ID");
    const response = await fetch(`https://sponsor.ajay.app/api/branding?videoID=${videoId}`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok && response.status !== 404) throw new Error(`DeArrow returned ${response.status}`);
    const data: unknown = await response.json();
    const branding = pickBranding(data);
    if (branding.thumbnail !== null || !isRecord(data) || typeof data.videoDuration === "number") return branding;
    return { ...branding, thumbnail: pickBranding({ ...data, videoDuration: await videoLength(videoId).catch(() => null) }).thumbnail };
}
async function videoLength(videoId: string): Promise<number | null> {
    const response = await fetch("https://www.youtube.com/youtubei/v1/player", { method: "POST", signal: AbortSignal.timeout(5000), headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, context: { client: { clientName: "WEB", clientVersion: "2.20240101.00.00" } } }) });
    const data: unknown = response.ok ? await response.json() : null;
    const seconds = Number(isRecord(data) && isRecord(data.videoDetails) ? data.videoDetails.lengthSeconds : NaN);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}
