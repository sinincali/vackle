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

import { isRecord } from "../settings/schema";

export const shapes = ["circle", "rounded", "shield", "hexagon"] as const;
export const icons = ["heart", "star", "bolt", "crown", "moon", "diamond", "sparkle", "check"] as const;
export type BadgeShape = typeof shapes[number];
export type BadgeIcon = typeof icons[number];
export interface BadgeDesign { shape: BadgeShape; colors: [string, string]; icon: BadgeIcon; }
export interface BadgeImage { image: string; }
export type BadgeLook = BadgeDesign | BadgeImage;
export type CustomBadge = { user: string; username?: string } & BadgeLook;
export interface Perk { title: string; description: string; link?: { label: string; url: string }; }
export interface BadgeCatalog { perk: Perk; badges: CustomBadge[]; }

const imagePrefix = "https://cdn.vackle.dev/badges/";
const linkHosts = ["flackle.com", "vackle.dev"];
const color = /^#[0-9a-f]{6}$/;
const plain = (text: string): boolean => !/\p{Cc}/u.test(text);

export const isImage = (look: BadgeLook): look is BadgeImage => "image" in look;

export function problem(design: BadgeDesign): string | undefined {
    if (!shapes.includes(design.shape) || !icons.includes(design.icon) || !design.colors.every(value => color.test(value))) return "Pick a shape, an icon and two colors.";
    return undefined;
}

function validImage(url: string): boolean {
    const file = url.startsWith(imagePrefix) ? url.slice(imagePrefix.length) : "";
    return url.length <= 200 && /^[a-z0-9_-][a-z0-9_.-]*\.(webp|png)$/.test(file) && !file.includes("..");
}

export function parseBadge(value: unknown): CustomBadge | undefined {
    if (!isRecord(value) || typeof value.user !== "string" || !/^\d{1,24}$/.test(value.user)) return undefined;
    const username = typeof value.username === "string" && /^[^\s@]{1,64}$/.test(value.username) ? { username: value.username } : {};
    if (typeof value.image === "string") return validImage(value.image) ? { user: value.user, ...username, image: value.image } : undefined;
    if (typeof value.shape !== "string" || typeof value.icon !== "string" || !Array.isArray(value.colors) || value.colors.length !== 2 || value.colors.some(item => typeof item !== "string")) return undefined;
    const design: BadgeDesign = { shape: value.shape as BadgeShape, icon: value.icon as BadgeIcon, colors: [value.colors[0] as string, value.colors[1] as string] };
    return problem(design) === undefined ? { user: value.user, ...username, ...design } : undefined;
}

export function parsePerk(value: unknown): Perk | undefined {
    if (!isRecord(value) || typeof value.title !== "string" || typeof value.description !== "string") return undefined;
    const title = value.title.trim(), description = value.description.trim();
    if (!title || title.length > 24 || !plain(title) || !description || description.length > 300 || !plain(description)) return undefined;
    const link = value.link;
    if (link === undefined || link === null) return { title, description };
    if (!isRecord(link) || typeof link.label !== "string" || typeof link.url !== "string" || !link.label.trim() || link.label.length > 24 || !plain(link.label)) return undefined;
    const host = /^https:\/\/([^/]+)(\/|$)/.exec(link.url)?.[1];
    return host && linkHosts.includes(host) ? { title, description, link: { label: link.label.trim(), url: link.url } } : undefined;
}

export function badgeCatalog(response: unknown): BadgeCatalog {
    const data: unknown = isRecord(response) ? response.data : undefined;
    const perk = isRecord(data) ? parsePerk(data.perk) : undefined;
    if (!isRecord(data) || !perk || !Array.isArray(data.badges)) throw new Error("The badge list was not understood");
    const seen = new Set<string>();
    const badges = data.badges.slice(0, 5000).flatMap(item => {
        const badge = parseBadge(item);
        if (!badge || seen.has(badge.user)) return [];
        seen.add(badge.user);
        return [badge];
    });
    return { perk, badges };
}

export function submitMessage(result: unknown): string {
    const status = isRecord(result) ? result.status : undefined;
    if (status === 200) return "Sent. An admin will look at it soon.";
    if (status === 403) return "Only lifters of the Vackle server can send a badge.";
    if (status === 429) return "You can send one badge request per hour. Try again later.";
    if (status === 400 || status === 413) return "That image couldn't be used. Try a different one.";
    return "Couldn't send it right now. Try again later.";
}

export async function submitBadge(request: unknown): Promise<unknown> {
    const response = await fetch("https://api.vackle.dev/v1/badges/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal: AbortSignal.timeout(30000) });
    return { status: response.status, body: await response.json().catch(() => null) };
}

export async function fetchBadges(): Promise<unknown> {
    const response = await fetch("https://api.vackle.dev/v1/badges", { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`The badge list returned ${response.status}`);
    return response.json();
}
