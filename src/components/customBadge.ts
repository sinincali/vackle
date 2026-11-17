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

import { isImage, type BadgeIcon, type BadgeLook, type BadgeShape } from "../shared/badgeDesign";

const svgNamespace = "http://www.w3.org/2000/svg";
export const shapePaths: Record<BadgeShape, string> = {
    circle: "M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20z",
    rounded: "M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5z",
    shield: "M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5z",
    hexagon: "M12 2l8.66 5v10L12 22l-8.66-5V7z"
};
export const iconPaths: Record<BadgeIcon, string> = {
    heart: "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
    star: "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z",
    bolt: "M13 2L3 14h7l-1 8 10-12h-7l1-8z",
    crown: "M3 18h18v2H3zM3 7l4.5 4L12 4l4.5 7L21 7l-2 9H5z",
    moon: "M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z",
    diamond: "M12 2l8 7-8 13L4 9z",
    sparkle: "M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z",
    check: "M9 16.2l-3.5-3.5L4 14.2l5 5 11-11-1.5-1.5z"
};

let counter = 0;
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string>): SVGElementTagNameMap[K] {
    const node = document.createElementNS(svgNamespace, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    return node;
}

export function badgeElement(look: BadgeLook, size: number, title: string, open?: () => void): { element: HTMLElement; dispose(): void } {
    const element = document.createElement("span");
    element.className = "vackle-custom-badge"; element.dataset.vackleRoot = "";
    element.style.cssText = `display:inline-flex;flex:none;width:${size}px;height:${size}px${open ? ";cursor:pointer" : ""}`;
    element.setAttribute("role", open ? "button" : "img"); element.setAttribute("aria-label", title);
    if (isImage(look)) {
        const image = Object.assign(document.createElement("img"), { src: look.image, alt: "", draggable: false, decoding: "async", referrerPolicy: "no-referrer" });
        image.style.cssText = "width:100%;height:100%;object-fit:contain";
        image.addEventListener("error", () => element.remove());
        element.append(image);
    } else {
        const id = `vackle-badge-${++counter}`;
        const picture = svg("svg", { viewBox: "0 0 24 24", width: "100%", height: "100%", "aria-hidden": "true" });
        const gradient = svg("linearGradient", { id, x1: "0", y1: "0", x2: "1", y2: "1" });
        gradient.append(svg("stop", { offset: "0", "stop-color": look.colors[0] }), svg("stop", { offset: "1", "stop-color": look.colors[1] }));
        const defs = svg("defs", {}); defs.append(gradient);
        const glyph = svg("g", { transform: "translate(12 12) scale(0.5) translate(-12 -12)" });
        glyph.append(svg("path", { d: iconPaths[look.icon], fill: "#fff", "fill-opacity": "0.95" }));
        picture.append(defs, svg("path", { d: shapePaths[look.shape], fill: `url(#${id})` }), glyph);
        element.append(picture);
    }
    if (open) {
        element.tabIndex = 0;
        element.addEventListener("click", event => { event.stopPropagation(); open(); });
        element.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); open(); } });
    }
    return { element, dispose: () => element.remove() };
}
