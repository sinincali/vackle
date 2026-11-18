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
import { tooltip } from "../../components/tooltip";

const icon = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="3" fill="currentColor" opacity=".4"/><rect x="11.5" y="11.5" width="8.5" height="6.5" rx="1.75" fill="currentColor"/></svg>';
const size = 36;
const margin = 10;

const isLive = (video: HTMLVideoElement): boolean => video.videoWidth > 0 && video.srcObject instanceof MediaStream && video.srcObject.getVideoTracks().some(track => track.readyState === "live" && !track.muted);
const area = (video: HTMLVideoElement): number => video.videoWidth * video.videoHeight;
const shown = (video: HTMLVideoElement): boolean => { const box = video.getBoundingClientRect(); return box.width > 0 && box.height > 0; };
const allowPip = (video: HTMLVideoElement): void => { video.removeAttribute("disablepictureinpicture"); video.disablePictureInPicture = false; };
const guardPip = (video: HTMLVideoElement): (() => void) => {
    allowPip(video);
    const guard = new MutationObserver(() => { if (video.disablePictureInPicture) allowPip(video); });
    guard.observe(video, { attributes: true, attributeFilter: ["disablepictureinpicture"] });
    return () => guard.disconnect();
};

export default {
    id: "screenshare-pip", name: "Screenshare PiP", description: "Pop a screenshare out into a floating picture-in-picture window. Hover a screenshare and click the button, or press Alt+P.",
    version: "1.1.0", author: "moon", tags: ["Voice"], enabledByDefault: false,
    async start({ resources, api, log }) {
        const button = Object.assign(document.createElement("button"), { type: "button", className: "vackle-screenshare-pip", innerHTML: icon });
        button.dataset.vackleRoot = "";
        document.body.append(button);
        let current: HTMLVideoElement | undefined;
        let frame = 0;
        let pointer = { x: 0, y: 0 };

        const active = (): boolean => Boolean(current && document.pictureInPictureElement === current);
        const label = (): string => active() ? "Exit picture in picture" : "Picture in picture";
        const refresh = (): void => { button.setAttribute("aria-label", label()); button.classList.toggle("vackle-screenshare-pip-on", active()); };
        const hide = (): void => { button.style.display = "none"; current = undefined; };
        const show = (video: HTMLVideoElement): void => {
            current = video; refresh();
            const box = video.getBoundingClientRect();
            button.style.display = "grid";
            button.style.top = `${Math.max(box.top, 0) + margin}px`;
            button.style.left = `${Math.max(Math.min(box.right, innerWidth) - size - margin, margin)}px`;
        };
        const request = async (video: HTMLVideoElement): Promise<void> => {
            allowPip(video);
            if (video.readyState < HTMLMediaElement.HAVE_METADATA) await new Promise<void>(resolve => { video.addEventListener("loadedmetadata", () => resolve(), { once: true }); window.setTimeout(resolve, 1500); });
            await video.requestPictureInPicture();
        };
        const toggle = async (video: HTMLVideoElement): Promise<void> => {
            try {
                if (document.pictureInPictureElement === video) await document.exitPictureInPicture();
                else await request(video);
            } catch (error) {
                log("Could not toggle picture in picture", error);
                api.notify(`Picture in picture failed: ${error instanceof Error ? error.message : String(error)}`, "error");
            }
            refresh();
        };
        const resolve = (): HTMLVideoElement | undefined => {
            const box = button.getBoundingClientRect();
            const under = document.elementsFromPoint(box.x + box.width / 2, box.y + box.height / 2).find((element): element is HTMLVideoElement => element instanceof HTMLVideoElement && isLive(element));
            return under ?? (current?.isConnected ? current : undefined) ?? largest();
        };
        const largest = (): HTMLVideoElement | undefined => [...document.querySelectorAll("video")].filter(video => isLive(video) && shown(video)).sort((a, b) => area(b) - area(a))[0];
        const update = (): void => {
            frame = 0;
            const elements = document.elementsFromPoint(pointer.x, pointer.y);
            if (elements.includes(button) || button.matches(":active")) return;
            const video = elements.find((element): element is HTMLVideoElement => element instanceof HTMLVideoElement && isLive(element));
            if (video) show(video); else hide();
        };
        const schedule = (): void => { if (!frame) frame = requestAnimationFrame(update); };
        const onMove = (event: MouseEvent): void => { pointer = { x: event.clientX, y: event.clientY }; schedule(); };
        const onKey = (event: KeyboardEvent): void => {
            if (!event.altKey || event.ctrlKey || event.shiftKey || event.code !== "KeyP") return;
            const target = current?.isConnected ? current : largest();
            if (!target) return;
            event.preventDefault();
            void toggle(target);
        };
        const onClick = (event: MouseEvent): void => { event.preventDefault(); event.stopPropagation(); const target = resolve(); if (target) void toggle(target); };

        resources.add(tooltip(button, label, true));
        document.addEventListener("mousemove", onMove, true);
        document.addEventListener("scroll", schedule, true);
        window.addEventListener("resize", schedule);
        document.addEventListener("keydown", onKey, true);
        document.addEventListener("enterpictureinpicture", refresh, true);
        document.addEventListener("leavepictureinpicture", refresh, true);
        document.documentElement.addEventListener("mouseleave", hide);
        button.addEventListener("click", onClick);
        api.observe("video", video => guardPip(video as HTMLVideoElement));

        resources.add(() => {
            if (frame) cancelAnimationFrame(frame);
            document.removeEventListener("mousemove", onMove, true);
            document.removeEventListener("scroll", schedule, true);
            window.removeEventListener("resize", schedule);
            document.removeEventListener("keydown", onKey, true);
            document.removeEventListener("enterpictureinpicture", refresh, true);
            document.removeEventListener("leavepictureinpicture", refresh, true);
            document.documentElement.removeEventListener("mouseleave", hide);
            if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => undefined);
            button.remove();
        });
        refresh();
        await resources.style(`.vackle-screenshare-pip{position:fixed;z-index:2147483646;display:none;place-items:center;box-sizing:border-box;width:${size}px;height:${size}px;padding:0;border:0;border-radius:10px;background:rgb(0 0 0 / .6);backdrop-filter:blur(8px);color:rgb(255 255 255 / .9);box-shadow:inset 0 0 0 1px rgb(255 255 255 / .1);cursor:pointer}.vackle-screenshare-pip:is(:hover,:focus-visible){background:rgb(0 0 0 / .8);color:#fff;outline:none}.vackle-screenshare-pip-on{background:var(--ui-text-accent,#ef5252);color:#fff}.vackle-screenshare-pip-on:is(:hover,:focus-visible){background:var(--ui-text-accent,#ef5252)}`);
    }
} satisfies Plugin;
