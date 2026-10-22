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
import { flackleStore } from "../../components/flackleStores";
import { fiberProps } from "../../components/reactFiber";

const folder = "button[data-rail-icon][aria-expanded]";
const open = (): HTMLButtonElement[] => [...document.querySelectorAll<HTMLButtonElement>(`.nav-rail-scroll ${folder}[aria-expanded="true"]`)];
const press = (button: HTMLElement): void => {
    button.parentElement?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    queueMicrotask(() => button.click());
};
const unstick = (event: Event): void => {
    if (!(event.target instanceof Element) || !event.target.closest(".nav-rail-scroll, .vackle-folder-sidebar")) return;
    const dragging = [...document.querySelectorAll(".nav-rail-scroll style")].some(style => style.textContent?.includes("cursor: pointer !important"));
    const icon = dragging ? document.querySelector(".nav-rail-scroll [data-rail-icon]") : null;
    if (icon) ([...fiberProps(icon, 40)].find(props => typeof props.onDragCancel === "function")?.onDragCancel as (() => void) | undefined)?.();
};
const contents = (button: Element): Element | null | undefined => button.parentElement?.parentElement?.parentElement?.querySelector(":scope > [data-rail-clip]");

export default {
    id: "better-folders", name: "Better Folders", description: "Shows the servers of open folders in a separate sidebar, with options to close folders automatically.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Organisation", "Appearance"], enabledByDefault: false,
    settings: {
        sidebar: { label: "Show open folders in a separate sidebar", default: true },
        "close-others": { label: "Close other folders when opening a folder", default: false },
        "close-on-home": { label: "Close all folders when clicking the home button", default: false },
        "force-open": { label: "Open a server's folder when you switch to that server", default: false }
    },
    async start({ settings, resources, api }) {
        const click = (event: MouseEvent): void => {
            if (!(event.target instanceof Element) || event.target.closest("[data-vackle-root]")) return;
            const button = event.target.closest(folder);
            const home = event.target.closest('.bg-ui-rail a[href="/app/friends"]');
            const close = button && settings["close-others"] === true && button.getAttribute("aria-expanded") === "false" ? open()
                : home && settings["close-on-home"] === true ? open() : [];
            if (close.length) queueMicrotask(() => { for (const other of close) press(other); });
        };
        document.addEventListener("click", click, true);
        resources.add(() => document.removeEventListener("click", click, true));
        document.addEventListener("pointerdown", unstick, true);
        resources.add(() => document.removeEventListener("pointerdown", unstick, true));
        if (settings["force-open"] === true) {
            const servers = flackleStore<{ getServerRailLayout(): { folders: Record<string, string[]> } }>("getServerRailLayout");
            if (!servers) throw new Error("Flackle's server store was not found");
            const reveal = (path: string): void => {
                const server = /^\/app\/channels\/(\d+)/.exec(path)?.[1];
                const id = server && Object.entries(servers.getState().getServerRailLayout().folders).find(([, members]) => members.includes(server))?.[0];
                if (id) { const button = document.querySelector<HTMLButtonElement>(`${folder}[data-rail-icon="${CSS.escape(id)}"][aria-expanded="false"]`); if (button) press(button); }
            };
            api.onRoute(reveal); reveal(location.pathname);
        }
        if (settings.sidebar === false) return;
        api.observe(".nav-rail-scroll", rail => {
            const column = rail.closest('[class*="w-[78px]"]');
            if (!column) return;
            const sidebar = Object.assign(document.createElement("nav"), { className: "vackle-folder-sidebar", hidden: true });
            sidebar.dataset.vackleRoot = ""; sidebar.setAttribute("aria-label", "Open folders");
            column.after(sidebar);
            rail.removeAttribute("data-rail-clip");
            const originals = new Map<Element, HTMLElement>();
            let built = new Map<HTMLElement, HTMLElement>();
            const placed = new Map<HTMLElement, HTMLElement>();
            let frame = 0;
            const layer = Object.assign(document.createElement("div"), { className: "vackle-folder-pips" });
            sidebar.after(layer);
            const mirrors = new Map<HTMLElement, HTMLElement>();
            const release = (content: HTMLElement): void => {
                for (const property of ["position", "left", "top", "z-index", "margin"]) content.style.removeProperty(property);
                delete content.dataset.vackleFolderContent;
            };
            const place = (): void => {
                const edge = `${sidebar.getBoundingClientRect().left}px`, seen = new Set<HTMLElement>();
                for (const [content, slot] of placed) {
                    for (const pip of content.parentElement?.querySelectorAll<HTMLElement>(":scope > .w-1.rounded-r-full, :scope > .w-1 > .rounded-r-full") ?? []) {
                        seen.add(pip); pip.dataset.vackleFolderPip = "";
                        let mirror = mirrors.get(pip);
                        if (!mirror) { mirror = document.createElement("div"); mirrors.set(pip, mirror); layer.append(mirror); }
                        const box = pip.getBoundingClientRect(), look = getComputedStyle(pip);
                        Object.assign(mirror.style, { left: edge, top: `${box.top}px`, height: `${box.height}px`, opacity: look.opacity, background: look.backgroundColor });
                    }
                    slot.style.height = `${content.offsetHeight}px`;
                    const box = slot.getBoundingClientRect();
                    const left = box.left + (box.width - content.offsetWidth) / 2;
                    if (content.style.position !== "fixed") Object.assign(content.style, { position: "fixed", left: `${left}px`, top: `${box.top}px`, zIndex: "20", margin: "0" });
                    const now = content.getBoundingClientRect();
                    if (Math.abs(now.left - left) > .5) content.style.left = `${parseFloat(content.style.left) + left - now.left}px`;
                    if (Math.abs(now.top - box.top) > .5) content.style.top = `${parseFloat(content.style.top) + box.top - now.top}px`;
                }
                for (const [pip, mirror] of mirrors) if (!seen.has(pip)) { mirror.remove(); mirrors.delete(pip); delete pip.dataset.vackleFolderPip; }
                frame = placed.size ? requestAnimationFrame(place) : 0;
            };
            let queued = false;
            const render = (): void => {
                queued = false; originals.clear();
                const kept = built; built = new Map();
                const previous = new Set(placed.keys()); placed.clear();
                const groups = [...rail.querySelectorAll<HTMLButtonElement>(folder)].flatMap(button => {
                    const content = contents(button);
                    if (!(content instanceof HTMLElement)) return [];
                    let group = kept.get(button);
                    if (!group) {
                        group = Object.assign(document.createElement("div"), { className: "vackle-folder-group" });
                        group.append(button.cloneNode(true), Object.assign(document.createElement("div"), { className: "vackle-folder-slot" }));
                    }
                    const header = group.firstElementChild as HTMLElement, slot = group.lastElementChild as HTMLElement;
                    if (header.outerHTML !== button.outerHTML) {
                        for (const { name } of [...header.attributes]) header.removeAttribute(name);
                        for (const { name, value } of button.attributes) header.setAttribute(name, value);
                        header.innerHTML = button.innerHTML;
                    }
                    built.set(button, group); originals.set(header, button);
                    content.dataset.vackleFolderContent = ""; placed.set(content, slot); previous.delete(content);
                    return [group];
                });
                for (const content of previous) release(content);
                if (groups.length !== sidebar.children.length || groups.some((group, index) => sidebar.children[index] !== group)) sidebar.replaceChildren(...groups);
                sidebar.hidden = !groups.length;
                cancelAnimationFrame(frame); place();
            };
            const schedule = (): void => { if (!queued) { queued = true; requestAnimationFrame(render); } };
            const forward = (event: MouseEvent): void => {
                const clone = event.target instanceof Element ? event.target.closest("[data-rail-icon]") : null;
                const original = clone && originals.get(clone);
                if (!original) return;
                event.preventDefault(); event.stopPropagation();
                if (event.type === "click") press(original);
                else original.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: event.clientX, clientY: event.clientY, button: 2, buttons: 2 }));
            };
            sidebar.addEventListener("click", forward); sidebar.addEventListener("contextmenu", forward);
            const watcher = new MutationObserver(schedule);
            watcher.observe(rail, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["aria-expanded", "class", "src", "href"] });
            render();
            return () => {
                watcher.disconnect(); cancelAnimationFrame(frame);
                for (const content of placed.keys()) release(content);
                for (const pip of mirrors.keys()) delete pip.dataset.vackleFolderPip;
                rail.setAttribute("data-rail-clip", "true");
                sidebar.remove(); layer.remove();
            };
        });
        await resources.style("[data-vackle-folder-content]{background:none!important;box-shadow:none!important}[data-vackle-folder-pip]{visibility:hidden!important}.vackle-folder-pips{position:fixed;inset:0;pointer-events:none;z-index:21}.vackle-folder-pips>div{position:absolute;width:4px;border-radius:0 4px 4px 0}.vackle-folder-slot{width:48px;flex-shrink:0}.vackle-folder-sidebar{display:flex;flex-direction:column;align-items:center;gap:12px;width:72px;flex-shrink:0;padding:12px 0;overflow-y:auto;scrollbar-width:none;border-left:1px solid rgb(255 255 255 / .04)}.vackle-folder-sidebar[hidden]{display:none}.vackle-folder-group>[data-rail-icon] *{pointer-events:none}.vackle-folder-group{display:flex;flex-direction:column;align-items:center;gap:4px;padding:4px 4px 0;border-radius:20px;background:rgb(255 255 255 / .03)}");
    }
} satisfies Plugin;
