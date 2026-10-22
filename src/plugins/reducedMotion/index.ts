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

const css = `html[data-vackle-reduced-motion],html[data-vackle-reduced-motion] *,html[data-vackle-reduced-motion] ::before,html[data-vackle-reduced-motion] ::after{scroll-behavior:auto!important;transition-duration:0s!important;transition-delay:0s!important;animation-duration:.01ms!important;animation-delay:0s!important;animation-iteration-count:1!important}`;

export default {
    id: "reduced-motion", name: "Reduced Motion", description: "Turns off every animation and transition in Flackle, including smooth scrolling. Changes happen instantly.",
    version: "1.2.0", author: "Xrm0s and contributors", tags: ["Accessibility", "Appearance"], enabledByDefault: false,
    async start({ resources, log }) {
        document.documentElement.dataset.vackleReducedMotion = "";
        resources.add(() => { delete document.documentElement.dataset.vackleReducedMotion; });
        await resources.style(css);
        await resources.reduceMotion().catch(error => log("Launcher cannot emulate reduced motion. CSS reductions remain active.", error));
    }
} satisfies Plugin;
