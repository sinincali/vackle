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

import type { PluginApi, ResourceScope } from "../api/types";
import { createSpring, rubberBanded } from "../components/motion";

const phone = "(pointer: coarse) and (max-width: 779px)";
const left = ".relative.flex.shrink-0.h-full.bg-ui-rail";
const rail = `${left} > .select-none.flex.flex-col.items-center`;
const right = "div.w-68.shrink-0.h-full";
const header = ".flex.flex-col.h-full > .relative.z-10.shrink-0.h-13";
const typing = "input, textarea, select, [contenteditable=''], [contenteditable='true']";
const menuIcon = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M3 6.75A.75.75 0 0 1 3.75 6h16.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 6.75ZM3 12a.75.75 0 0 1 .75-.75h16.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 12Zm0 5.25a.75.75 0 0 1 .75-.75h16.5a.75.75 0 0 1 0 1.5H3.75a.75.75 0 0 1-.75-.75Z" clip-rule="evenodd"/></svg>';
const backIcon = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M7.72 12.53a.75.75 0 0 1 0-1.06l7.5-7.5a.75.75 0 1 1 1.06 1.06L9.31 12l6.97 6.97a.75.75 0 1 1-1.06 1.06l-7.5-7.5Z" clip-rule="evenodd"/></svg>';
const settings = '[role="dialog"][aria-label="Settings"]';
const peopleIcon ='<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.5 6.375a4.125 4.125 0 1 1 8.25 0 4.125 4.125 0 0 1-8.25 0ZM14.25 8.625a3.375 3.375 0 1 1 6.75 0 3.375 3.375 0 0 1-6.75 0ZM1.5 19.125a7.125 7.125 0 0 1 14.25 0v.003l-.001.119a.75.75 0 0 1-.363.63 13.067 13.067 0 0 1-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 0 1-.364-.63l-.001-.122ZM17.25 19.128l-.001.144a2.25 2.25 0 0 1-.233.96 10.088 10.088 0 0 0 5.06-1.01.75.75 0 0 0 .42-.643 4.875 4.875 0 0 0-6.957-4.611 8.586 8.586 0 0 1 1.71 5.157v.003Z"/></svg>';
const css = `html.vackle-mobile, html.vackle-mobile body { overflow: hidden !important; overscroll-behavior: none; }
html.vackle-mobile { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
html.vackle-mobile :is(input, textarea, select) { font-size: 16px !important; }
html.vackle-mobile body { position: fixed !important; left: 0; right: 0; top: var(--vackle-mobile-top, 0px); height: var(--vackle-mobile-height, 100dvh); }
html.vackle-mobile :is(body > div[data-simplebar].w-full, .relative.flex.h-screen.w-screen) { height: calc(var(--vackle-mobile-height, 100dvh) - var(--titlebar-h, 0px)) !important; }
html.vackle-mobile [aria-label="Flackle Mobile coming soon"] { display: none !important; }
html.vackle-mobile ${left} { position: fixed !important; top: var(--titlebar-h, 0px); bottom: 0; left: 0; height: auto !important; z-index: 60; transform: translateX(-100%); will-change: transform; contain: layout paint; }
html.vackle-mobile ${left} .w-72 { width: min(288px, calc(100vw - 126px)) !important; }
html.vackle-mobile ${right} { position: fixed !important; top: var(--titlebar-h, 0px); bottom: 0; right: 0; height: auto !important; z-index: 60; width: min(320px, calc(100vw - 56px)) !important; transform: translateX(100%); will-change: transform; contain: layout paint; }
html.vackle-mobile ${right} > div > .shrink-0.h-13 { display: none !important; }
html.vackle-mobile .vackle-mobile-scrim { display: block; position: fixed; inset: 0; z-index: 59; background: #000; opacity: 0; pointer-events: none; will-change: opacity; }
html.vackle-mobile.vackle-mobile-open .vackle-mobile-scrim { pointer-events: auto; }
html.vackle-mobile ${header} { z-index: 1 !important; margin-right: 0 !important; padding-left: 8px !important; padding-right: 8px !important; gap: 6px !important; }
html.vackle-mobile ${header} h1 { font-size: 17px !important; }
html.vackle-mobile ${header} :is(:has(> form[role="search"]), form[role="search"], button[aria-label$="member list"], button[aria-label="Bulk delete messages"]) { display: none !important; }
html.vackle-mobile ${header}:not(:has(button[aria-label$="member list"])) .vackle-mobile-button[aria-label="Open members"] { display: none !important; }
html.vackle-mobile #vackle-toolbox-button:is([data-placement="fallback"], [data-placement="toolbar"]) { display: none !important; }
html.vackle-mobile [role="tooltip"] { display: none !important; }
html.vackle-mobile .absolute.top-0.right-0.z-20.h-9.bg-ui-accent { display: none !important; }
html.vackle-mobile ${left} [data-self-card-trigger] > .relative.shrink-0.overflow-visible,
html.vackle-mobile ${left} [data-self-card-trigger] > .relative.shrink-0.overflow-visible > .absolute.overflow-visible { width: 40px !important; height: 40px !important; }
html.vackle-mobile ${left} [data-self-card-trigger] > .relative.shrink-0.overflow-visible > .absolute.overflow-visible { bottom: 0 !important; left: 0 !important; }
html.vackle-mobile [data-chat-compose] { padding-bottom: calc(8px + env(safe-area-inset-bottom)) !important; }
html.vackle-mobile [data-message-id], html.vackle-mobile [data-sidebar-context-owner], html.vackle-mobile [data-user-card-trigger] { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
html.vackle-mobile [data-chat-compose] .rich-composer-input + div > span > span:first-child { display: none; }
html.vackle-mobile .simplebar-content-wrapper { overflow-x: hidden !important; }
html.vackle-mobile [data-message-content] :is(img, video, iframe, button, a, div) { max-width: 100%; }
html.vackle-mobile [data-message-content] button.block[style*="aspect-ratio"] { height: auto !important; }
html.vackle-mobile [data-chat-compose] .absolute.inset-0.flex.items-end.pb-2 { padding-bottom: 3px !important; }
html.vackle-mobile [data-chat-compose] .flex.items-center:has(> .flex.items-center.text-sm.font-medium.min-w-0) { flex: 1 1 0; min-width: 0; overflow: hidden; }
html.vackle-mobile [data-chat-compose] .flex.items-center.text-sm.font-medium.min-w-0 { max-width: 100%; gap: 4px !important; font-size: 12px !important; line-height: 16px; white-space: nowrap; overflow: hidden; }
html.vackle-mobile [data-chat-compose] .flex.items-center.text-sm.font-medium.min-w-0 > :first-child { flex-shrink: 0; transform: scale(.8); }
html.vackle-mobile [data-chat-compose] .flex.items-center.text-sm.font-medium.min-w-0 { display: block !important; text-overflow: ellipsis; }
html.vackle-mobile [data-chat-compose] .flex.items-center.text-sm.font-medium.min-w-0 > :first-child { display: inline-flex; vertical-align: middle; margin-right: 4px; }
html.vackle-mobile [data-chat-compose] .flex.items-center.text-sm.font-medium.min-w-0 :is(> span:not(:has(~ .vackle-typing-line)), .vackle-typing-line, .vackle-typing-line > strong) { display: inline !important; }
html.vackle-mobile [data-chat-compose] .flex.items-center.text-sm.font-medium.min-w-0 .vackle-typing-line img { display: inline-block !important; width: 14px !important; height: 14px !important; margin: 0 4px 0 0 !important; vertical-align: -2px; }
html.vackle-mobile ${settings} { top: var(--titlebar-h, 0px) !important; }
html.vackle-mobile ${settings} > .relative { height: 100%; padding: 0 !important; }
html.vackle-mobile ${settings} > .relative > .pointer-events-auto { max-width: none !important; height: 100% !important; gap: 0 !important; }
html.vackle-mobile ${settings} .pointer-events-auto > .shrink-0.rounded-2xl { padding: 8px 12px 8px 4px !important; border-width: 0 0 1px !important; border-radius: 0 !important; }
html.vackle-mobile ${settings} .pointer-events-auto > .shrink-0.rounded-2xl > div { gap: 4px !important; }
html.vackle-mobile ${settings} .pointer-events-auto > .flex-1.rounded-t-2xl { padding: 0 !important; gap: 0 !important; border: 0 !important; border-radius: 0 !important; }
html.vackle-mobile ${settings} .w-56.shrink-0 { width: 100% !important; padding: 12px; }
html.vackle-mobile ${settings} .settings-scroll .p-12 { padding: 16px 16px calc(24px + env(safe-area-inset-bottom)) !important; }
html.vackle-mobile ${settings} .absolute.inset-x-4.bottom-0.translate-y-full { display: none !important; }
html.vackle-mobile ${settings}[data-vackle-view="list"] .settings-scroll, html.vackle-mobile ${settings}[data-vackle-view="detail"] .w-56.shrink-0 { display: none !important; }
html.vackle-mobile ${settings}[data-vackle-view="list"] .vackle-mobile-back { display: none !important; }
html.vackle-mobile ${settings}[data-vackle-view="list"] .shrink-0.rounded-2xl h2 { font-size: 0 !important; }
html.vackle-mobile ${settings}[data-vackle-view="list"] .shrink-0.rounded-2xl h2::before { content: "Settings"; font-size: 18px; }
html.vackle-mobile ${settings}[data-vackle-view="list"] .shrink-0.rounded-2xl h2 ~ *, html.vackle-mobile ${settings}[data-vackle-view="list"] .shrink-0.rounded-2xl > div > svg { display: none; }
html.vackle-mobile ${settings}[data-vackle-view="list"] .shrink-0.rounded-2xl > div { padding-left: 12px; }
.vackle-mobile-button, .vackle-mobile-scrim { display: none; }
html.vackle-mobile .vackle-mobile-button { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 36px; height: 36px; padding: 0; border: 0; border-radius: 8px; background: none; color: rgb(255 255 255 / .6); cursor: pointer; }
html.vackle-mobile .vackle-mobile-button svg { width: 22px; height: 22px; }`;

export function settle(position: number, velocity: number, from: number, min: number, max: number): number {
    const projected = position + velocity * 0.2;
    const stops = from === 0 ? [min, 0, max] : [from, 0];
    return stops.reduce((best, stop) => Math.abs(stop - projected) < Math.abs(best - projected) ? stop : best);
}
function sidewaysScroller(target: Element | null): Element | undefined {
    for (let element = target; element && element !== document.body; element = element.parentElement) {
        if (element.scrollWidth > element.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(element).overflowX)) return element;
    }
    return undefined;
}
const canScroll = (element: Element, dx: number): boolean => dx > 0 ? element.scrollLeft > 0 : element.scrollLeft + element.clientWidth < element.scrollWidth - 1;

export async function mobileMode(api: PluginApi, resources: ResourceScope): Promise<void> {
    const media = matchMedia(phone);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    const root = document.documentElement;
    const width = { left: 0, right: 0 };
    const measure = (): void => {
        width.left = document.querySelector<HTMLElement>(left)?.offsetWidth ?? 0;
        width.right = document.querySelector<HTMLElement>(right)?.offsetWidth ?? 0;
    };
    const scrim = Object.assign(document.createElement("div"), { className: "vackle-mobile-scrim" });
    const paint = (x: number): void => {
        const drawerLeft = document.querySelector<HTMLElement>(left), drawerRight = document.querySelector<HTMLElement>(right);
        if (drawerLeft) drawerLeft.style.transform = x > 0 ? `translate3d(${x - width.left}px, 0, 0)` : "";
        if (drawerRight) drawerRight.style.transform = x < 0 ? `translate3d(${width.right + x}px, 0, 0)` : "";
        scrim.style.opacity = String(Math.min(Math.abs(x) / Math.max(x > 0 ? width.left : width.right, 1), 1) * .5);
    };
    const spring = createSpring(0, paint);
    api.observe(left, drawer => { drawer.after(scrim); paint(spring.value); });
    resources.add(() => { scrim.remove(); for (const element of document.querySelectorAll<HTMLElement>(`${left}, ${right}`)) element.style.transform = ""; });
    api.observe(".fixed", popup => {
        if (!media.matches) return;
        requestAnimationFrame(() => {
            if (!popup.isConnected || popup.getBoundingClientRect().width >= innerWidth) return;
            if (popup.getBoundingClientRect().width > innerWidth - 16) popup.style.maxWidth = `${innerWidth - 16}px`;
            const box = popup.getBoundingClientRect();
            const shift = box.right > innerWidth - 8 ? innerWidth - 8 - box.right : box.left < 8 ? 8 - box.left : 0;
            if (shift) popup.style.marginLeft = `${shift}px`;
        });
    });
    let rest = 0;
    const go = (stop: number, velocity?: number): void => {
        rest = stop;
        root.classList.toggle("vackle-mobile-open", stop !== 0);
        if (reduce.matches) spring.set(stop); else spring.to(stop, velocity);
    };
    const open = (side: "left" | "right"): void => { measure(); go(side === "left" ? width.left : -width.right); };
    const close = (): void => go(0);
    const sync = (): void => {
        root.classList.toggle("vackle-mobile", media.matches);
        if (!media.matches) { rest = 0; root.classList.remove("vackle-mobile-open"); spring.set(0); }
    };
    sync();
    resources.listen(media, "change", sync);
    const viewport = window.visualViewport;
    const setVar = (name: string, value: string): void => { if (root.style.getPropertyValue(name) !== value) root.style.setProperty(name, value); };
    const fit = (): void => {
        if (!viewport || !media.matches) { root.style.removeProperty("--vackle-mobile-height"); root.style.removeProperty("--vackle-mobile-top"); return; }
        setVar("--vackle-mobile-height", `${Math.round(viewport.height)}px`);
        setVar("--vackle-mobile-top", `${Math.round(viewport.offsetTop)}px`);
    };
    api.observe('[data-message-content] button.block[style*="width"]', image => {
        const width = parseFloat(image.style.width), height = parseFloat(image.style.height);
        if (width > 0 && height > 0) image.style.aspectRatio = `${width} / ${height}`;
    });
    fit();
    if (viewport) { resources.listen(viewport, "resize", fit); resources.listen(viewport, "scroll", fit); }
    resources.listen(media, "change", fit);
    resources.add(() => { root.style.removeProperty("--vackle-mobile-height"); root.style.removeProperty("--vackle-mobile-top"); });
    let routedAt = -Infinity, touchedComposer = -Infinity;
    resources.listen(document, "focusin", event => {
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (!media.matches || !target?.matches(".rich-composer-input")) return;
        if (performance.now() - routedAt < 1500 && performance.now() - touchedComposer > 1000) target.blur();
    });
    const tapOutside = (event: Event): void => {
        const target = event.target instanceof Element ? event.target : null;
        if (!media.matches || rest === 0 || !target || target.closest(`${left}, ${right}, [role="dialog"], [role="menu"], .fixed`)) return;
        event.preventDefault(); event.stopPropagation(); close();
    };
    document.addEventListener("click", tapOutside, true);
    resources.add(() => {
        document.removeEventListener("click", tapOutside, true);
        spring.stop();
        root.classList.remove("vackle-mobile", "vackle-mobile-open");
    });

    let fromList = false;
    resources.listen(document, "click", event => {
        const target = event.target instanceof Element ? event.target : null;
        fromList = media.matches && rest > 0 && Boolean(target?.closest(left)) && !target?.closest(rail) && !target?.closest("[data-self-card-trigger], button[aria-label]");
    });
    api.onRoute(() => {
        routedAt = performance.now();
        if (media.matches && document.activeElement instanceof HTMLElement && document.activeElement.matches(".rich-composer-input")) document.activeElement.blur();
        if (fromList) close();
        fromList = false;
    });

    const button = (label: string, icon: string, run: () => void): HTMLButtonElement => {
        const element = Object.assign(document.createElement("button"), { type: "button", className: "vackle-mobile-button", title: label, innerHTML: icon });
        element.setAttribute("aria-label", label);
        element.addEventListener("click", run);
        return element;
    };
    api.observe(settings, dialog => {
        dialog.dataset.vackleView = "list";
        const back = button("Back to settings", backIcon, () => { dialog.dataset.vackleView = "list"; });
        back.classList.add("vackle-mobile-back");
        dialog.querySelector(".pointer-events-auto > .shrink-0 > div")?.prepend(back);
        const pick = (event: Event): void => {
            const target = event.target instanceof Element ? event.target : null;
            if (target?.closest('.settings-sidebar-nav button[role="tab"], .w-56 > button')) dialog.dataset.vackleView = "detail";
        };
        dialog.addEventListener("click", pick);
        return () => { dialog.removeEventListener("click", pick); back.remove(); delete dialog.dataset.vackleView; };
    });
    api.observe(header, bar => {
        const menu = button("Open channels", menuIcon, () => open("left"));
        const people = button("Open members", peopleIcon, () => {
            if (!document.querySelector(right)) document.querySelector<HTMLButtonElement>(`${header} button[aria-label="Show member list"]`)?.click();
            requestAnimationFrame(() => requestAnimationFrame(() => open("right")));
        });
        bar.firstElementChild?.prepend(menu);
        bar.lastElementChild?.prepend(people);
        return () => { menu.remove(); people.remove(); };
    });

    let drag: { x: number; y: number; from: number; active: boolean; scroller: Element | undefined; samples: { x: number; t: number }[] } | undefined;
    let press: ReturnType<typeof setTimeout> | undefined, nativeMenu = false, swallowClick = false, start = { x: 0, y: 0 };
    const cancelPress = (): void => { clearTimeout(press); press = undefined; };
    resources.listen(document, "touchstart", event => {
        const touch = (event as TouchEvent).touches[0];
        const target = event.target instanceof Element ? event.target : null;
        drag = undefined; cancelPress(); swallowClick = false;
        if (target?.closest("[data-chat-compose]")) touchedComposer = performance.now();
        if (!media.matches || !touch || (event as TouchEvent).touches.length > 1 || target?.closest(typing)) return;
        nativeMenu = false; start = { x: touch.clientX, y: touch.clientY };
        press = setTimeout(() => {
            press = undefined;
            if (nativeMenu || drag?.active || !target?.isConnected) return;
            swallowClick = true;
            target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: touch.clientX, clientY: touch.clientY, button: 2 }));
        }, 500);
        if (target?.closest('[role="dialog"], [role="menu"]')) return;
        measure();
        drag = { x: touch.clientX, y: touch.clientY, from: rest, active: false, scroller: sidewaysScroller(target), samples: [{ x: touch.clientX, t: event.timeStamp }] };
    });
    const move = (event: TouchEvent): void => {
        const touch = event.touches[0];
        if (!touch) return;
        const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
        if (press && Math.hypot(dx, dy) > 10) cancelPress();
        if (!drag) return;
        if (!drag.active) {
            if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.3) {
                if (drag.scroller && canScroll(drag.scroller, dx)) { drag = undefined; return; }
                drag.active = true; cancelPress();
            }
            else if (Math.abs(dy) > 10) { drag = undefined; return; }
            else return;
        }
        event.preventDefault();
        const min = drag.from > 0 ? 0 : -width.right, max = drag.from < 0 ? 0 : width.left;
        const raw = drag.from + dx;
        spring.set(rubberBanded(raw, min, max, raw > 0 ? width.left || width.right : width.right || width.left));
        drag.samples = [...drag.samples, { x: touch.clientX, t: event.timeStamp }].filter(sample => event.timeStamp - sample.t <= 100);
    };
    document.addEventListener("touchmove", move, { passive: false });
    resources.add(() => document.removeEventListener("touchmove", move));
    const release = (): void => {
        cancelPress();
        const ended = drag; drag = undefined;
        if (!ended?.active) return;
        const first = ended.samples[0]!, last = ended.samples.at(-1)!;
        const velocity = last.t > first.t ? (last.x - first.x) / ((last.t - first.t) / 1000) : 0;
        const min = ended.from > 0 ? 0 : -width.right, max = ended.from < 0 ? 0 : width.left;
        go(settle(spring.value, velocity, ended.from, min, max), velocity);
    };
    resources.listen(document, "touchend", release);
    resources.listen(document, "touchcancel", release);
    resources.listen(document, "contextmenu", event => { if (event.isTrusted) { nativeMenu = true; cancelPress(); } });
    const swallow = (event: Event): void => { if (swallowClick) { swallowClick = false; event.preventDefault(); event.stopPropagation(); } };
    document.addEventListener("click", swallow, true);
    resources.add(() => document.removeEventListener("click", swallow, true));
    await resources.style(css);
}
