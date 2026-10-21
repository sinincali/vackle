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
import { copyText } from "../../components/flackleRole";
import { flackleUser } from "../../components/flackleStores";

const trigger = "[data-user-card-trigger]";
const userId = (target: HTMLElement): string | undefined => {
    const id = target.dataset.userCardTrigger;
    return id && /^\d+$/.test(id) ? id : undefined;
};

export default {
    id: "copy-user-urls", name: "Copy User URLs", description: "Adds Copy User URL to the user right-click menu, next to Open Full Profile.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Utility", "Shortcuts"], enabledByDefault: false,
    start({ api }) {
        api.contextMenu({
            id: "copy-user-url", label: "Copy User URL", icon: "link", after: "Open Full Profile", selector: trigger,
            matches: target => userId(target) !== undefined,
            run: target => {
                const username = flackleUser(userId(target)!)?.username;
                if (username) copyText(`${location.origin}/u/${username}`, api.notify);
                else api.notify("Couldn't find that user's username", "error");
            }
        });
    }
} satisfies Plugin;
