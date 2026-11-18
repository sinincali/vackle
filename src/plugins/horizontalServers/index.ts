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

const frame = ".relative.flex.h-screen.w-screen.overflow-hidden.bg-ui-frame";
const rail = `${frame} > .relative.flex.shrink-0.h-full.bg-ui-rail`;
const side = "366px";
const hidden = ":not(:has(> .bg-ui-rail > .w-72:not(.absolute)))";

const css = String.raw`
${frame} {
    display: grid !important;
    grid-template-columns: ${side} minmax(0, 1fr);
    grid-template-rows: 64px minmax(0, 1fr);
}
${rail} {
    display: contents !important;
}
${rail} > .w-\[78px\] {
    grid-column: 1 / -1;
    grid-row: 1;
    flex-direction: row !important;
    align-items: center !important;
    width: 100% !important;
    height: 64px !important;
    min-width: 0;
    padding: 0 12px !important;
    gap: 8px !important;
}
${rail} > :not(.w-\[78px\]):not(.absolute) {
    grid-column: 1;
    grid-row: 2;
    justify-self: stretch;
    width: 100% !important;
    max-width: none !important;
    height: 100% !important;
    min-height: 0;
}
${rail} > :not(.w-\[78px\]):not(.absolute) > * {
    width: 100% !important;
    max-width: none !important;
}
${rail} .w-72.h-full.bg-ui-shell {
    width: 100% !important;
}
${rail} > .absolute {
    right: auto !important;
    width: ${side};
}
${frame}:has(> .w-68) {
    grid-template-columns: ${side} minmax(0, 1fr) 272px;
}
${frame}${hidden} {
    grid-template-columns: 0px minmax(0, 1fr);
}
${frame}${hidden}:has(> .w-68) {
    grid-template-columns: 0px minmax(0, 1fr) 272px;
}
${frame} > .flex-1.min-w-0.h-full.flex.flex-col {
    grid-column: 2;
    grid-row: 2;
    height: 100% !important;
    min-height: 0;
}
${frame} > .w-68 {
    grid-column: 3;
    grid-row: 2;
    width: auto !important;
    height: 100% !important;
    min-height: 0;
}
${frame} > .vackle-mobile-scrim {
    grid-column: 2;
    grid-row: 2;
}
.bg-ui-rail.w-\[78px\] > * {
    flex-shrink: 0;
    width: auto !important;
    margin: 0 !important;
}
.bg-ui-rail.w-\[78px\] > .border-t {
    width: 1px !important;
    height: 32px;
    border-top: 0 !important;
    border-left: 1px solid var(--ui-chrome-border, rgb(255 255 255 / .06));
}
.bg-ui-rail.w-\[78px\] > [class*="max-h-"] {
    flex-direction: row !important;
    align-items: center;
    height: 48px !important;
    max-height: none !important;
    overflow: visible !important;
}
.bg-ui-rail.w-\[78px\] > .flex-1 {
    flex: 1 1 0;
    flex-direction: row !important;
    align-items: center;
    min-width: 0;
    height: 100%;
}
.nav-rail-scroll {
    width: 100% !important;
    height: 100% !important;
    overflow-x: auto !important;
    overflow-y: hidden !important;
}
.nav-rail-scroll .flex-col {
    flex-direction: row !important;
}
.nav-rail-scroll > .flex-col {
    align-items: center;
    width: max-content;
    min-width: 100%;
    height: 100%;
    padding: 0 !important;
}
.nav-rail-scroll > .flex-col > .inline-flex {
    flex-shrink: 0;
    margin-left: 8px;
}
.nav-rail-scroll [aria-busy] {
    align-items: center;
    width: auto !important;
}
.nav-rail-scroll .relative.w-full.shrink-0:not(.flex) {
    width: auto !important;
    height: auto !important;
}
.nav-rail-scroll .relative.w-full.shrink-0.flex.items-center.justify-center.overflow-x-clip {
    flex: 0 0 6px;
    width: 6px !important;
    height: 1px !important;
}
.nav-rail-scroll div[aria-roledescription="draggable"] {
    width: auto !important;
}
.nav-rail-scroll .relative.w-full.flex.flex-col.items-center:has(> [data-rail-clip="true"]) {
    align-items: center;
    width: auto !important;
    padding-right: 4px;
    border-radius: 16px;
    background: var(--ui-layer-chip);
}
.nav-rail-scroll .pointer-events-none.absolute.top-8 {
    display: none;
}
.nav-rail-scroll [data-rail-clip="true"] {
    width: auto !important;
    height: auto !important;
    overflow: visible !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
}
.nav-rail-scroll [data-rail-clip="true"] > .flex-col {
    width: auto !important;
}
.nav-rail-scroll .pointer-events-none.absolute.left-0.top-1\/2 {
    top: -8px !important;
    left: 50% !important;
    width: 24px !important;
    height: 4px !important;
    translate: -50% 0 !important;
    border-radius: 0 0 9999px 9999px !important;
}
.nav-rail-scroll .pointer-events-none.absolute.inset-y-0.left-0.z-10.w-1 {
    inset: -8px 0 auto 0 !important;
    width: auto !important;
    height: 4px !important;
}
.nav-rail-scroll .pointer-events-none.absolute.inset-y-0.left-0.z-10.w-1 > .absolute {
    top: 0 !important;
    left: 24px !important;
    width: 8px !important;
    height: 4px !important;
    translate: -50% 0 !important;
    border-radius: 0 0 9999px 9999px !important;
}
.nav-rail-scroll .pointer-events-none.absolute.left-0.w-1:has(~ .z-10 button) {
    display: none;
}
${rail}, ${rail} * {
    transition: none !important;
    animation: none !important;
}
${frame}:has(> .w-90) {
    grid-template-columns: ${side} minmax(0, 1fr) 360px !important;
    grid-template-rows: 64px minmax(0, 1fr) !important;
}
${frame}${hidden}:has(> .w-90) {
    grid-template-columns: 0px minmax(0, 1fr) 360px !important;
}
${frame} > .w-90 {
    grid-column: 3 !important;
    grid-row: 2 !important;
    width: 360px !important;
    min-width: 0 !important;
    height: 100% !important;
    min-height: 0 !important;
}
`;

export default {
    id: "horizontal-servers", name: "Horizontal Server List", description: "Moves the server list from the left side into a bar across the top of Flackle, with the channel list and chat below it.",
    version: "1.0.0", author: "moon", tags: ["Appearance", "Organisation"], enabledByDefault: false,
    async start({ resources }) { await resources.style(css); }
} satisfies Plugin;
