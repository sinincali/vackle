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
import { flackleStore } from "../../components/flackleStores";
import { uiIcon } from "../../components/icons";
import { fiberProps } from "../../components/reactFiber";

interface Member { timed_out_until?: string | null; user?: { username?: string; display_name?: string | null }; nickname?: string | null; }
interface Members { byServer: Record<string, { membersById?: Record<string, Member> } | undefined>; }
export const timedOutUntil = (value?: string | null): number | undefined => { const time = Date.parse(value ?? ""); return time > Date.now() ? time : undefined; };
export function countdown(milliseconds: number): string {
    const total = Math.max(1, Math.ceil(milliseconds / 1000));
    const parts: [number, string][] = [[Math.floor(total / 86400), "d"], [Math.floor(total % 86400 / 3600), "h"], [Math.floor(total % 3600 / 60), "m"], [total % 60, "s"]];
    return parts.filter(([value], index) => value > 0 || index === 3 && total < 60).map(([value, unit]) => `${value}${unit}`).join(" ");
}
const senderOf = (row: Element): { serverId?: string | undefined; userId?: string | undefined } => {
    for (const props of fiberProps(row, 3)) if (props.message) {
        const sender = (props.message as { sender?: { id?: unknown } }).sender?.id;
        return { serverId: typeof props.guildServerId === "string" ? props.guildServerId : undefined, userId: typeof sender === "string" ? sender : undefined };
    }
    return {};
};

export default {
    id: "show-hidden-things", name: "Show Hidden Things", description: "Displays various hidden & moderator-only things regardless of permissions, like member timeouts and how long they have left.",
    version: "1.1.0", author: "Xrm0s and contributors", tags: ["Servers", "Utility"], enabledByDefault: false,
    settings: {
        "show-timeouts": { label: "Show member timeout icons in chat.", default: true },
        "timeout-duration": { label: "Show how long a timeout has left", default: "Next to the timeout icon", options: ["Off", "In the tooltip", "Next to the timeout icon"] }
    },
    async start({ settings, resources, api }) {
        const members = flackleStore<Members>("setMemberTimeout");
        if (!members) throw new Error("Flackle's member store was not found");
        const member = (row: Element): Member | undefined => { const { serverId, userId } = senderOf(row); return serverId && userId ? members.getState().byServer[serverId]?.membersById?.[userId] : undefined; };
        if (settings["show-timeouts"] !== false) {
            const headers = new Map<HTMLElement, () => void>();
            const sync = (author: HTMLElement): void => {
                const header = author.parentElement!;
                const until = timedOutUntil(member(author.closest("[data-message-id]")!)?.timed_out_until);
                const existing = header.querySelector<HTMLElement>(":scope > span[data-vackle-timeout]");
                if (!until || header.querySelector('span[aria-label="Timed out"]:not([data-vackle-timeout])')) { existing?.remove(); return; }
                if (existing) return;
                const icon = Object.assign(document.createElement("span"), { className: "inline-flex items-center shrink-0 text-amber-400/90", title: `Timed out until ${new Date(until).toLocaleString()}` });
                icon.dataset.vackleTimeout = ""; icon.setAttribute("aria-label", "Timed out");
                const svg = uiIcon("clock", 16); svg.classList.add("w-4", "h-4", "mb-0.5"); icon.append(svg);
                const stamp = header.querySelector(":scope > span.cursor-default"); if (stamp) stamp.before(icon); else header.append(icon);
            };
            api.observe("[data-message-id] .text-md.font-medium.text-white:is(button[data-user-card-trigger], span)", author => {
                if (!author.closest("[data-message-id]") || !author.parentElement) return undefined;
                const refresh = (): void => sync(author); headers.set(author, refresh); refresh();
                return () => { headers.delete(author); author.parentElement?.querySelector(":scope > span[data-vackle-timeout]")?.remove(); };
            });
            api.observe('[data-message-id] span[aria-label="Timed out"]:not([data-vackle-timeout])', native => { native.closest("[data-message-id]")?.querySelector("span[data-vackle-timeout]")?.remove(); });
            resources.add(members.subscribe(() => requestAnimationFrame(() => { for (const refresh of headers.values()) refresh(); })));
            resources.add(() => { for (const icon of document.querySelectorAll("span[data-vackle-timeout]")) icon.remove(); });
        }
        const style = String(settings["timeout-duration"] ?? "Next to the timeout icon");
        if (style === "Off") return;
        const inline = style !== "In the tooltip";
        const ticks = new Set<() => void>();
        const timer = setInterval(() => { for (const tick of ticks) tick(); }, 1000);
        resources.add(() => clearInterval(timer));
        api.observe('[data-message-id] span[aria-label="Timed out"]', icon => {
            const row = icon.closest<HTMLElement>("[data-message-id]")!;
            if (!senderOf(row).userId) return undefined;
            const label = Object.assign(document.createElement("span"), { className: "vackle-timeout-remaining" });
            const title = icon.title;
            const tick = (): void => {
                const who = member(row); const left = Date.parse(who?.timed_out_until ?? "") - Date.now();
                if (!(left > 0)) { label.remove(); icon.title = title; return; }
                const text = countdown(left);
                if (inline) { label.textContent = `${text} timeout remaining`; if (!label.isConnected) icon.after(label); }
                else icon.title = `${who?.nickname || who?.user?.display_name || who?.user?.username || "This user"}'s timeout ends in ${text}`;
            };
            ticks.add(tick); tick();
            return () => { ticks.delete(tick); label.remove(); icon.title = title; };
        });
        await resources.style(".vackle-timeout-remaining{flex-shrink:0;margin-bottom:2px;margin-left:4px;color:rgb(242 63 67 / .75);font-size:14px;line-height:18px;white-space:nowrap}");
    }
} satisfies Plugin;
