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

import type { BadgeLook, Perk } from "../shared/badgeDesign";
import { badgeElement } from "./customBadge";
import { modalHost, openModal } from "./modal";
import { openExternal } from "./openExternal";
import { button, element } from "./primitives";

export function showPerk(look: BadgeLook, perk: Perk, notify: (message: string, level?: "info" | "error") => void): () => void {
    const body = element("div", "vackle-perk");
    const art = badgeElement(look, 96, perk.title), glow = element("div", "vackle-perk-art");
    glow.append(art.element);
    body.append(glow, element("p", "", perk.description));
    if (perk.link) {
        const link = perk.link;
        body.append(button(link.label, () => openExternal(link.url, notify), "vackle-primary", "external"));
    }
    return openModal(modalHost(), perk.title, body, art.dispose);
}
