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
import { pauseGifsWhileBlurred } from "./gifs";

const css = `html[data-vackle-reduced-motion],html[data-vackle-reduced-motion] *,html[data-vackle-reduced-motion] ::before,html[data-vackle-reduced-motion] ::after{scroll-behavior:auto!important;transition-duration:0s!important;transition-delay:0s!important;animation-duration:.01ms!important;animation-delay:0s!important;animation-iteration-count:1!important}html[data-vackle-reduced-motion] [role="dialog"][aria-label="Settings"]{transform:none!important}html[data-vackle-reduced-motion] [data-vackle-closing]{display:none!important}`;

const hideWhenClosing = (dialog: HTMLElement): (() => void) => {
    let last = Infinity;
    const watch = new MutationObserver(() => {
        const shift = Number(/translateY\((-?[\d.]+)%\)/.exec(dialog.style.transform)?.[1]);
        if (Number.isNaN(shift)) return;
        if (shift > 3 && shift > last) dialog.dataset.vackleClosing = "";
        last = shift;
    });
    watch.observe(dialog, { attributes: true, attributeFilter: ["style"] });
    return () => watch.disconnect();
};

export default {
    id: "reduced-motion", name: "Reduced Motion", description: "Turns off every animation and transition in Flackle, including smooth scrolling and the Settings slide-in. Changes happen instantly, and GIFs freeze while Flackle isn't focused.",
    version: "1.4.0", author: "Xrm0s and contributors", tags: ["Accessibility", "Appearance"], enabledByDefault: false,
    async start({ resources, log, api }) {
        api.patch(Element.prototype, "animate", animate => function (this: Element, ...args: unknown[]) {
            const animation = animate.apply(this, args) as Animation;
            try { animation.finish(); } catch { animation.cancel(); }
            return animation;
        });
        resources.add(pauseGifsWhileBlurred(api));
        api.observe('[role="dialog"][aria-label="Settings"]', hideWhenClosing);
        const instant = (args: unknown[]): unknown[] => args.map(arg => typeof arg === "object" && arg !== null && "behavior" in arg ? { ...arg, behavior: "instant" } : arg);
        for (const [target, name] of [[Element.prototype, "scrollTo"], [Element.prototype, "scrollBy"], [Element.prototype, "scrollIntoView"], [window, "scrollTo"], [window, "scrollBy"]] as const)
            api.patch(target, name, original => function (this: unknown, ...args: unknown[]) { return Reflect.apply(original, this, instant(args)); });
        document.documentElement.dataset.vackleReducedMotion = "";
        resources.add(() => { delete document.documentElement.dataset.vackleReducedMotion; });
        await resources.style(css);
        await resources.reduceMotion().catch(error => log("Launcher cannot emulate reduced motion. CSS reductions remain active.", error));
    }
} satisfies Plugin;
