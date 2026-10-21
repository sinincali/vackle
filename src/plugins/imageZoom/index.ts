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

const viewer = "body > .fixed.inset-0 img.object-contain";
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export default {
    id: "image-zoom", name: "Image Zoom", description: "Hold the mouse on an opened image to see a magnifying lens. Scroll to change the zoom, Shift + scroll to change the lens size.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Media", "Utility"], enabledByDefault: false,
    settings: {
        "save-zoom": { label: "Remember zoom and lens size", default: true },
        "invert-scroll": { label: "Invert scroll direction", default: true },
        "nearest-neighbour": { label: "Use nearest neighbour scaling (sharp pixels)", default: false },
        square: { label: "Use a square lens", default: false },
        zoom: { label: "Zoom", default: 2, min: 1, max: 50 },
        size: { label: "Lens size", default: 100, min: 50, max: 1000 },
        "zoom-speed": { label: "Scroll speed", default: 0.5, min: 0.1, max: 5 }
    },
    async start({ settings, setSetting, resources }) {
        let zoom = Number(settings.zoom); let size = Number(settings.size);
        const speed = Number(settings["zoom-speed"]); const invert = settings["invert-scroll"] !== false ? -1 : 1;
        const lens = Object.assign(document.createElement("div"), { className: "vackle-zoom-lens" });
        lens.toggleAttribute("data-square", settings.square === true); lens.toggleAttribute("data-pixelated", settings["nearest-neighbour"] === true);
        document.body.append(lens);
        let image: HTMLImageElement | null = null; let x = 0; let y = 0;
        const place = (): void => {
            if (!image) return;
            const box = image.getBoundingClientRect();
            Object.assign(lens.style, {
                width: `${size}px`, height: `${size}px`, left: `${x - size / 2}px`, top: `${y - size / 2}px`,
                backgroundImage: `url(${JSON.stringify(image.currentSrc || image.src)})`,
                backgroundSize: `${box.width * zoom}px ${box.height * zoom}px`,
                backgroundPosition: `${size / 2 - (x - box.left) * zoom}px ${size / 2 - (y - box.top) * zoom}px`
            });
        };
        const down = (event: MouseEvent): void => {
            const target = event.target instanceof HTMLImageElement && event.button === 0 ? event.target.closest<HTMLImageElement>(viewer) : null;
            if (!target) return;
            event.preventDefault();
            image = target; x = event.clientX; y = event.clientY; lens.hidden = false; image.classList.add("vackle-zooming"); place();
        };
        const move = (event: MouseEvent): void => { if (image) { x = event.clientX; y = event.clientY; place(); } };
        const up = (): void => {
            if (!image) return;
            image.classList.remove("vackle-zooming"); image = null; lens.hidden = true;
            if (settings["save-zoom"] !== false && (zoom !== settings.zoom || size !== settings.size))
                void setSetting("zoom", zoom).then(() => setSetting("size", size)).catch(() => undefined);
        };
        const wheel = (event: WheelEvent): void => {
            if (!image) return;
            event.preventDefault();
            const step = Math.sign(event.deltaY || event.deltaX) * invert;
            if (event.shiftKey) size = clamp(size + step * 20 * speed, 50, 1000);
            else zoom = clamp(Math.round((zoom + step * speed) * 100) / 100, 1, 50);
            place();
        };
        lens.hidden = true;
        document.addEventListener("mousedown", down, true); document.addEventListener("mousemove", move, true);
        document.addEventListener("mouseup", up, true); window.addEventListener("blur", up);
        document.addEventListener("wheel", wheel, { capture: true, passive: false });
        resources.add(() => {
            document.removeEventListener("mousedown", down, true); document.removeEventListener("mousemove", move, true);
            document.removeEventListener("mouseup", up, true); window.removeEventListener("blur", up);
            document.removeEventListener("wheel", wheel, { capture: true });
            image?.classList.remove("vackle-zooming"); lens.remove();
        });
        await resources.style(".vackle-zoom-lens{position:fixed;z-index:9999;pointer-events:none;border-radius:50%;border:2px solid rgb(255 255 255 / .6);box-shadow:0 4px 24px rgb(0 0 0 / .6);background-color:#000;background-repeat:no-repeat}.vackle-zoom-lens[hidden]{display:none}.vackle-zoom-lens[data-square]{border-radius:8px}.vackle-zoom-lens[data-pixelated]{image-rendering:pixelated}img.vackle-zooming{cursor:none}");
    }
} satisfies Plugin;
