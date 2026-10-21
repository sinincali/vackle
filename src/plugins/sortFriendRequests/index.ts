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
import { fiberProps } from "../../components/reactFiber";

interface Request { id: string; created_at?: string; }
interface Social { incomingRequests: Request[]; outgoingRequests: Request[]; }
const time = (request: Request): number => Date.parse(request.created_at ?? "") || 0;
export const newestFirst = (requests: readonly Request[]): Request[] => [...requests].sort((a, b) => time(b) - time(a));
const sorted = (requests: readonly Request[]): boolean => requests.every((request, index) => index === 0 || time(requests[index - 1]!) >= time(request));
const formatter = new Intl.DateTimeFormat(undefined, { month: "numeric", day: "numeric", year: "numeric" });

export default {
    id: "sort-friend-requests", name: "Sort Friend Requests", description: "Sorts friend requests by date of receipt.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Friends", "Organisation"], enabledByDefault: false,
    settings: { "show-dates": { label: "Show dates on friend requests", default: true } },
    async start({ settings, resources, api }) {
        const social = flackleStore<Social>("removeFriendBySnowflake");
        if (!social) throw new Error("Flackle's friend store was not found");
        const sort = (state: Social): void => {
            if (sorted(state.incomingRequests) && sorted(state.outgoingRequests)) return;
            social.setState({ incomingRequests: newestFirst(state.incomingRequests), outgoingRequests: newestFirst(state.outgoingRequests) });
        };
        resources.add(social.subscribe(sort)); sort(social.getState());
        if (settings["show-dates"] === false) return;
        api.observe("div.space-y-1 > div[data-animate-on-hover]", row => {
            let request: Request | undefined;
            for (const props of fiberProps(row, 3)) if (typeof props.type === "string" && props.request) { request = props.request as Request; break; }
            const since = request ? new Date(time(request)) : undefined;
            if (!since?.getTime() || !row.lastElementChild) return;
            const date = Object.assign(document.createElement("span"), { className: "vackle-request-date", textContent: formatter.format(since), title: since.toLocaleString() });
            row.lastElementChild.before(date);
            return () => date.remove();
        });
        await resources.style(".vackle-request-date{flex-shrink:0;color:rgb(255 255 255 / .4);font-size:12px;font-variant-numeric:tabular-nums}");
    }
} satisfies Plugin;
