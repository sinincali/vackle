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

import type { PluginApi } from "../../api/types";

const animated = /\.(gif|apng)\b|tenor|giphy|[?&]format=(gif|webp)/i;

export function pauseGifsWhileBlurred(api: Pick<PluginApi, "observe">): () => void {
    const frozen = new Map<HTMLElement, () => void>();
    let blurred = !document.hasFocus();

    const freezeVideo = (video: HTMLVideoElement): void => {
        if (video.srcObject || video.paused || !video.loop || !video.muted || document.pictureInPictureElement === video) return;
        video.pause();
        frozen.set(video, () => void video.play().catch(() => undefined));
    };
    const freezeImage = (image: HTMLImageElement): void => {
        if (!image.complete) { image.addEventListener("load", () => freeze(image), { once: true }); return; }
        if (!image.naturalWidth || !animated.test(image.currentSrc || image.src)) return;
        const still = Object.assign(document.createElement("canvas"), { width: image.naturalWidth, height: image.naturalHeight, className: image.className });
        still.dataset.vackleRoot = "";
        still.style.cssText = image.style.cssText;
        still.getContext("2d")?.drawImage(image, 0, 0);
        const display = image.style.display;
        image.after(still);
        image.style.display = "none";
        frozen.set(image, () => { still.remove(); image.style.display = display; });
    };
    const freeze = (element: HTMLElement): void => {
        if (!blurred || frozen.has(element)) return;
        if (element instanceof HTMLVideoElement) freezeVideo(element);
        else if (element instanceof HTMLImageElement) freezeImage(element);
    };
    const release = (element: HTMLElement): void => { frozen.get(element)?.(); frozen.delete(element); };
    const thawAll = (): void => { for (const element of [...frozen.keys()]) release(element); };
    const onBlur = (): void => { blurred = true; document.querySelectorAll<HTMLElement>("img, video").forEach(element => { if (!element.closest("[data-vackle-root]")) freeze(element); }); };
    const onFocus = (): void => { blurred = false; thawAll(); };
    const onVisibility = (): void => { if (document.hasFocus()) onFocus(); else onBlur(); };

    api.observe("img, video", element => { freeze(element); return () => release(element); });
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.removeEventListener("blur", onBlur); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVisibility); thawAll(); };
}
