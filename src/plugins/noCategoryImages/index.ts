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

export default {
    id: "no-category-images", name: "No Category Images", description: "Hides the banner images servers put behind their channel categories.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Appearance", "Servers"], enabledByDefault: false,
    async start({ resources }) { await resources.style(".server-sidebar-content .group:has(> img.object-cover)>img.object-cover{display:none!important}.server-sidebar-content .group:has(> img.object-cover) .bg-ui-shell{background:transparent!important}"); }
} satisfies Plugin;
