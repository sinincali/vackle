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
import { modalHost, openModal } from "../../components/modal";
import { uiIcon } from "../../components/icons";
import { button, element } from "../../components/primitives";
import { fiberProps } from "../../components/reactFiber";
import { createGif } from "./gif";

interface Kind { title: string; needle: string; width: number; height: number; crop: readonly [number, number]; round: boolean }
const kinds: Kind[] = [
    { title: "Crop Avatar", needle: "Avatar image is too large", width: 512, height: 512, crop: [240, 240], round: true },
    { title: "Crop Banner", needle: "Banner image is too large", width: 1520, height: 640, crop: [418, 176], round: false }
];
function kindOf(input: HTMLInputElement): Kind | undefined {
    for (const props of fiberProps(input, 1)) { const source = String(props.onChange); return kinds.find(kind => source.includes(kind.needle)); }
    return undefined;
}
const picture = (size: number): HTMLElement => { const icon = element("span", "vackle-crop-icon"); icon.append(uiIcon("image", size)); return icon; };
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
interface DecodedFrame { image: CanvasImageSource & { duration: number | null; close(): void } }
type Decoder = new (init: { data: ArrayBuffer; type: string }) => { tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null }; decode(options: { frameIndex: number }): Promise<DecodedFrame>; close(): void };
const gifDecoder = (): Decoder | undefined => (window as { ImageDecoder?: Decoder }).ImageDecoder;

export default {
    id: "unlocked-avatar-zoom", name: "Unlocked Avatar Zoom", description: "Crop and zoom your avatar or banner before uploading, as far in as you like. Works with animated GIFs too.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Media", "Appearance"], enabledByDefault: false,
    settings: { "max-zoom": { label: "Maximum zoom", default: 10, min: 2, max: 100 } },
    async start({ settings, resources, log }) {
        const maxZoom = Number(settings["max-zoom"]);
        let closeOpen: (() => void) | undefined;
        resources.add(() => closeOpen?.());
        const crop = (file: File, kind: Kind): Promise<File | null> => new Promise(resolve => {
            const [width, height] = [456, kind.round ? 300 : 240];
            const [cropWidth, cropHeight] = kind.crop; const left = (width - cropWidth) / 2; const top = (height - cropHeight) / 2;
            const url = URL.createObjectURL(file);
            const image = Object.assign(new Image(), { src: url, draggable: false, className: "vackle-crop-image", alt: "" });
            const frame = element("div", kind.round ? "vackle-crop-frame vackle-crop-round" : "vackle-crop-frame");
            frame.style.width = `${width}px`; frame.style.height = `${height}px`;
            const outline = element("div", "vackle-crop-outline");
            Object.assign(outline.style, { left: `${left}px`, top: `${top}px`, width: `${cropWidth}px`, height: `${cropHeight}px` });
            frame.append(image, outline);
            const slider = Object.assign(element("input"), { type: "range", min: "1", max: String(maxZoom), step: "0.01", value: "1" });
            slider.setAttribute("aria-label", "Zoom");
            const zoomRow = element("div", "vackle-crop-zoom"); zoomRow.append(picture(14), slider, picture(24));
            let base = 1; let zoom = 1; let x = 0; let y = 0;
            const apply = (): void => {
                const scale = base * zoom;
                x = clamp(x, left + cropWidth - image.naturalWidth * scale, left); y = clamp(y, top + cropHeight - image.naturalHeight * scale, top);
                image.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
                slider.value = String(zoom); slider.style.setProperty("--fill", `${(zoom - 1) / (maxZoom - 1) * 100}%`);
            };
            const setZoom = (next: number, cx: number, cy: number): void => {
                next = clamp(next, 1, maxZoom); const ratio = next / zoom;
                x = cx - (cx - x) * ratio; y = cy - (cy - y) * ratio; zoom = next; apply();
            };
            image.addEventListener("load", () => {
                base = Math.max(cropWidth / image.naturalWidth, cropHeight / image.naturalHeight);
                x = (width - image.naturalWidth * base) / 2; y = (height - image.naturalHeight * base) / 2; apply();
            });
            slider.addEventListener("input", () => setZoom(Number(slider.value), left + cropWidth / 2, top + cropHeight / 2));
            frame.addEventListener("wheel", event => {
                event.preventDefault();
                const box = frame.getBoundingClientRect();
                setZoom(zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1), event.clientX - box.left, event.clientY - box.top);
            }, { passive: false });
            let drag: { px: number; py: number } | undefined;
            const down = (event: PointerEvent): void => { if (event.button === 0 && frame.contains(event.target as Node)) { drag = { px: event.clientX, py: event.clientY }; frame.classList.add("vackle-dragging"); } };
            const move = (event: PointerEvent): void => { if (drag) { x += event.clientX - drag.px; y += event.clientY - drag.py; drag = { px: event.clientX, py: event.clientY }; apply(); } };
            const up = (): void => { drag = undefined; frame.classList.remove("vackle-dragging"); };
            window.addEventListener("pointerdown", down, true); window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
            const render = async (): Promise<File> => {
                const canvas = Object.assign(document.createElement("canvas"), { width: kind.width, height: kind.height });
                const context = canvas.getContext("2d", { willReadFrequently: file.type === "image/gif" })!; context.imageSmoothingQuality = "high";
                const scale = base * zoom;
                const area = [(left - x) / scale, (top - y) / scale, cropWidth / scale, cropHeight / scale, 0, 0, kind.width, kind.height] as const;
                const Decoder = file.type === "image/gif" ? gifDecoder() : undefined;
                if (Decoder) {
                    const decoder = new Decoder({ data: await file.arrayBuffer(), type: "image/gif" });
                    try {
                        await decoder.tracks.ready;
                        const gif = createGif(kind.width, kind.height);
                        for (let index = 0; index < (decoder.tracks.selectedTrack?.frameCount ?? 1); index++) {
                            const { image: frame } = await decoder.decode({ frameIndex: index });
                            context.clearRect(0, 0, kind.width, kind.height); context.drawImage(frame, ...area);
                            gif.add(context.getImageData(0, 0, kind.width, kind.height).data, (frame.duration ?? 100_000) / 1000);
                            frame.close();
                        }
                        return new File([gif.finish()], file.name.replace(/(\.[^.]*)?$/, ".gif"), { type: "image/gif" });
                    } finally { decoder.close(); }
                }
                context.drawImage(image, ...area);
                const type = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
                const blob = await new Promise<Blob>((done, fail) => canvas.toBlob(result => result ? done(result) : fail(new Error("Could not encode the image")), type, .92));
                return new File([blob], file.name.replace(/(\.[^.]*)?$/, type === "image/jpeg" ? ".jpg" : ".png"), { type });
            };
            let result: File | null = null;
            const body = element("div", "vackle-crop");
            const actions = element("div", "vackle-actions vackle-crop-actions");
            actions.append(
                button("Cancel", () => closeOpen?.(), "vackle-ghost"),
                button("Use Original", () => { result = file; closeOpen?.(); }),
                button("Apply", () => void render().then(cropped => { result = cropped; closeOpen?.(); }).catch(error => log("Crop failed", error)), "vackle-primary")
            );
            body.append(frame, zoomRow, actions);
            closeOpen?.();
            closeOpen = openModal(modalHost(), kind.title, body, () => {
                window.removeEventListener("pointerdown", down, true); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
                URL.revokeObjectURL(url); closeOpen = undefined; resolve(result);
            });
        });
        let replaying = false;
        const change = (event: Event): void => {
            const input = event.target;
            if (replaying || !(input instanceof HTMLInputElement) || input.type !== "file") return;
            const file = input.files?.[0];
            const kind = file && file.type.startsWith("image/") && (file.type !== "image/gif" || gifDecoder()) ? kindOf(input) : undefined;
            if (!kind) return;
            event.stopImmediatePropagation();
            void crop(file!, kind).then(chosen => {
                if (!chosen || !input.isConnected) { input.value = ""; return; }
                const transfer = new DataTransfer(); transfer.items.add(chosen); input.files = transfer.files;
                replaying = true;
                try { input.dispatchEvent(new Event("change", { bubbles: true })); } finally { replaying = false; }
            });
        };
        window.addEventListener("change", change, true);
        resources.add(() => window.removeEventListener("change", change, true));
        await resources.style(".vackle-crop{align-items:center}.vackle-crop-frame{position:relative;flex-shrink:0;overflow:hidden;border-radius:12px;cursor:grab;touch-action:none;user-select:none}.vackle-crop-outline{position:absolute;box-sizing:border-box;border:3px solid #fff;border-radius:12px;box-shadow:0 0 0 9999px rgb(0 0 0 / .45);pointer-events:none}.vackle-crop-frame.vackle-dragging{cursor:grabbing}.vackle-crop-round .vackle-crop-outline{border-radius:50%}.vackle-crop-image{position:absolute;left:0;top:0;max-width:none;transform-origin:0 0;pointer-events:none}.vackle-crop-zoom{display:flex;align-items:center;gap:12px;width:240px}.vackle-crop-icon{display:flex;color:rgb(255 255 255 / .8)}.vackle-crop-zoom input{flex:1;height:4px;margin:0;border-radius:2px;appearance:none;-webkit-appearance:none;background:linear-gradient(to right,var(--ui-text-accent,#ef5252) var(--fill,0%),rgb(255 255 255 / .25) var(--fill,0%));cursor:pointer}.vackle-crop-zoom input::-webkit-slider-thumb{width:18px;height:18px;border:0;border-radius:50%;-webkit-appearance:none;background:#fff;box-shadow:0 1px 4px rgb(0 0 0 / .4)}.vackle-crop-actions{justify-content:flex-end;width:100%}");
    }
} satisfies Plugin;
