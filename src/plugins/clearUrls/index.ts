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

import type { Plugin } from "../../api/types";
import { rewriteOutgoing } from "../../components/outgoing";

const everywhere = /^(utm_\w+|fbclid|gclid|dclid|gbraid|wbraid|msclkid|yclid|mc_cid|mc_eid|igshid|igsh|_hsenc|_hsmi|ref_src|ref_url)$/i;
const bySite: [RegExp, RegExp][] = [
    [/(^|\.)(youtube\.com|youtu\.be)$/i, /^(si|pp|feature)$/i],
    [/(^|\.)spotify\.com$/i, /^si$/i],
    [/(^|\.)(twitter\.com|x\.com)$/i, /^(s|t)$/i],
    [/(^|\.)tiktok\.com$/i, /^(_t|_r|is_from_webapp|sender_device|web_id)$/i],
    [/(^|\.)instagram\.com$/i, /^(igsh|img_index)$/i],
    [/(^|\.)reddit\.com$/i, /^(share_id|rdt)$/i]
];

export function cleanUrl(link: string): string {
    let host: string;
    try { host = new URL(link).hostname; } catch { return link; }
    const hash = link.indexOf("#"), end = hash < 0 ? link.length : hash;
    const query = link.indexOf("?");
    if (query < 0 || query > end) return link;
    const site = bySite.filter(([domain]) => domain.test(host)).map(([, params]) => params);
    const kept = link.slice(query + 1, end).split("&").filter(pair => {
        let name = pair.split("=")[0]!;
        try { name = decodeURIComponent(name); } catch { }
        return pair && !everywhere.test(name) && !site.some(params => params.test(name));
    });
    return link.slice(0, query) + (kept.length ? `?${kept.join("&")}` : "") + link.slice(end);
}
export const cleanUrls = (text: string): string => text.replace(/https?:\/\/[^\s<>]*[^\s<>.,!?;:)\]'"]/g, cleanUrl);

export default {
    id: "clear-urls", name: "Clear URLs", description: "Removes tracking junk like ?si= and utm_ from links before you send them.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Chat", "Privacy"], enabledByDefault: false,
    start({ resources }) {
        rewriteOutgoing(resources, cleanUrls);
    }
} satisfies Plugin;
