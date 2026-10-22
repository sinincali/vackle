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
import { flackleAuth } from "../../components/flackleStores";

export default {
    id: "character-counter", name: "Character Counter", description: "Shows how many characters you have typed and the message limit under the message box.",
    version: "1.1.0", author: "Xrm0s and contributors", tags: ["Chat", "Utility"], enabledByDefault: false,
    settings: { "color-effects": { label: "Turn the counter yellow, orange and red as you near the limit", default: true } },
    async start({ settings, resources, api }) {
        const colors = settings["color-effects"] !== false;
        const auth = flackleAuth<{ limits?: { message_length?: number } }>();
        const counters = new Map<HTMLTextAreaElement, HTMLElement>();
        const update = (input: HTMLTextAreaElement, counter: HTMLElement): void => {
            const limit = auth?.getState().user?.limits?.message_length || (input.maxLength > 0 ? input.maxLength : 2000); const used = input.value.length;
            counter.textContent = `${used}/${limit}`;
            counter.dataset.level = !colors ? "" : used > limit ? "full" : used >= limit * .9 ? "high" : used >= limit * .75 ? "warn" : "";
        };
        const sync = (): void => { for (const [input, counter] of counters) update(input, counter); };
        api.observe("textarea.rich-composer-input", input => {
            const box = input.closest<HTMLElement>(".rounded-2xl");
            if (!(input instanceof HTMLTextAreaElement) || !box || input.closest("[data-message-id]")) return;
            const counter = Object.assign(document.createElement("span"), { className: "vackle-character-counter" });
            box.append(counter); counters.set(input, counter); update(input, counter);
            return () => { counters.delete(input); counter.remove(); };
        });
        for (const type of ["input", "keyup", "focusin"]) resources.listen(document, type, sync);
        await resources.style(".vackle-character-counter{position:absolute;right:12px;bottom:1px;color:rgb(255 255 255 / .35);font-size:10px;line-height:1;pointer-events:none;font-variant-numeric:tabular-nums}.vackle-character-counter[data-level=warn]{color:#facc15}.vackle-character-counter[data-level=high]{color:#fb923c}.vackle-character-counter[data-level=full]{color:#f87171}");
    }
} satisfies Plugin;
