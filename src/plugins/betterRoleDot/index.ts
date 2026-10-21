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
import { copyText, roleFromElement } from "../../components/flackleRole";

const pill = "span.inline-flex.rounded-md.text-xs";
const dot = `${pill} > .rounded-full.shrink-0[aria-hidden="true"][style]`;
export default {
    id: "better-role-dot", name: "Better Role Dot", description: "Click the coloured dot on a role to copy its colour.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Roles", "Appearance"], enabledByDefault: false,
    async start({ resources, api }) {
        const click = (event: MouseEvent): void => {
            const target = event.target instanceof Element ? event.target.closest(dot) : null;
            const color = target ? roleFromElement(target)?.color : undefined;
            if (!color) return;
            event.preventDefault(); event.stopPropagation();
            copyText(color, api.notify, `Copied ${color}`);
        };
        document.addEventListener("click", click, true);
        resources.add(() => document.removeEventListener("click", click, true));
        api.observe(pill, element => {
            const role = roleFromElement(element);
            if (!role?.hasIcon || element.querySelector(":scope > .vackle-role-dot")) return;
            const added = document.createElement("span");
            added.className = "vackle-role-dot w-2.5 h-2.5 rounded-full shrink-0"; added.setAttribute("aria-hidden", "true");
            added.style.backgroundColor = role.color ?? "rgba(255,255,255,0.3)";
            element.prepend(added);
            return () => added.remove();
        });
        api.observe(dot, element => { element.title = "Copy role colour"; return () => element.removeAttribute("title"); });
        await resources.style(`${dot}{cursor:pointer;transition:box-shadow 150ms}${dot}:hover{box-shadow:0 0 0 2px rgba(255,255,255,.22)}.vackle-role-dot{order:0}.vackle-role-dot+*{order:2}.vackle-role-dot~.truncate{order:1}.vackle-role-dot~button{order:3}`);
    }
} satisfies Plugin;
