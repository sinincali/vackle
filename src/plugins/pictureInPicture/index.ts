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

const pipIcon = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="3" fill="currentColor" opacity=".4"/><rect x="11.5" y="11.5" width="8.5" height="6.5" rx="1.75" fill="currentColor"/></svg>';

export function pictureInPicture(video: HTMLVideoElement, loop: boolean): void {
    const wasLooping = video.loop;
    video.loop = loop;
    video.addEventListener("leavepictureinpicture", () => { video.loop = wasLooping; }, { once: true });
    video.requestPictureInPicture().then(() => video.play()).catch((error: unknown) => {
        video.loop = wasLooping;
        console.error("[Vackle:PictureInPicture] Failed to enter Picture-in-Picture", error);
    });
}

export default {
    id: "picture-in-picture", name: "Picture in Picture", description: "Adds a picture-in-picture button to the corner of videos.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Media", "Utility"], enabledByDefault: false,
    settings: { loop: { label: "Loop picture-in-picture videos", default: true } },
    async start({ settings, resources, api }) {
        api.observe("[data-message-id] div.relative > video", video => {
            const player = video.parentElement;
            if (!player || !document.pictureInPictureEnabled) return;
            const button = Object.assign(document.createElement("button"), { type: "button", className: "vackle-pip-button", title: "Toggle Picture in Picture" });
            button.setAttribute("aria-label", "Toggle Picture in Picture"); button.innerHTML = pipIcon;
            button.addEventListener("click", event => { event.stopPropagation(); if (document.pictureInPictureElement) void document.exitPictureInPicture(); else pictureInPicture(video as HTMLVideoElement, settings.loop !== false); });
            player.append(button);
            return () => button.remove();
        });
        await resources.style(".vackle-pip-button{position:absolute;top:8px;right:8px;z-index:5;display:grid;place-items:center;width:32px;height:32px;padding:0;border:0;border-radius:8px;background:rgb(0 0 0 / .55);color:rgb(255 255 255 / .85);cursor:pointer;opacity:0;transition:opacity .15s}div:hover>.vackle-pip-button,.vackle-pip-button:focus-visible{opacity:1}.vackle-pip-button:hover{background:rgb(0 0 0 / .75);color:#fff}");
    }
} satisfies Plugin;
