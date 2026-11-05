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
import { dropdown } from "../../components/dropdown";
import { flackleStore } from "../../components/flackleStores";
import { element, settingRow } from "../../components/primitives";

interface GifState { folders: { id: string; name: string; pending?: boolean }[]; load?(): Promise<void>; }
const picker = '[role="tablist"][aria-label="Picker"]';
const label = "Open the GIF picker in";
const icon = '<span class="block pointer-events-none"><svg viewBox="1.5 3.75 21 16.5" fill="currentColor" class="h-4 w-auto" aria-hidden="true"><path fill-rule="evenodd" d="M4.5 3.75a3 3 0 0 0-3 3v10.5a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3V6.75a3 3 0 0 0-3-3h-15Zm9 4.5a.75.75 0 0 0-1.5 0v7.5a.75.75 0 0 0 1.5 0v-7.5Zm1.5 0a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 0 1.5H16.5v2.25H18a.75.75 0 0 1 0 1.5h-1.5v3a.75.75 0 0 1-1.5 0v-7.5ZM6.636 9.78c.404-.575.867-.78 1.25-.78s.846.205 1.25.78a.75.75 0 0 0 1.228-.863C9.738 8.027 8.853 7.5 7.886 7.5c-.966 0-1.852.527-2.478 1.417-.62.882-.908 2-.908 3.083 0 1.083.288 2.201.909 3.083.625.89 1.51 1.417 2.477 1.417.967 0 1.852-.527 2.478-1.417a.75.75 0 0 0 .136-.431V12a.75.75 0 0 0-.75-.75h-1.5a.75.75 0 0 0 0 1.5H9v1.648c-.37.44-.774.602-1.114.602-.383 0-.846-.205-1.25-.78C6.226 13.638 6 12.837 6 12c0-.837.226-1.638.636-2.22Z" clip-rule="evenodd"/></svg></span>';
const tabs = (): HTMLButtonElement[] => [...document.querySelectorAll<HTMLButtonElement>(`${picker} [role="tab"]`)];
const pick = (name: string): void => tabs().find(tab => tab.textContent?.trim() === name)?.click();
const gifStore = () => flackleStore<GifState>("setSaved");
const choices = (): [string, string][] => [["trending", "Trending"], ["favourites", "Favourites"],
    ...(gifStore()?.getState().folders ?? []).filter(folder => !folder.pending).map(folder => [folder.id, folder.name] as [string, string])];

function collectionSetting(value: unknown, save: (next: string) => void): HTMLElement {
    let current = String(value).toLowerCase() === "favourites" ? "favourites" : String(value);
    const slot = element("div");
    const build = (): void => {
        const list = choices();
        const select = dropdown(label, [{ options: list.map(([, name]) => name) }], list.find(([id]) => id === current)?.[1] ?? "Trending", name => {
            current = list.find(([, option]) => option === name)?.[0] ?? "trending";
            save(current);
        });
        select.root.querySelector<HTMLElement>(".vackle-dropdown-list")!.style.maxHeight = "168px";
        slot.replaceChildren(select.root);
    };
    build();
    void gifStore()?.getState().load?.().then(build, () => undefined);
    return settingRow(label, "Pick Trending, Favourites or one of your GIF folders.", slot);
}

export default {
    id: "gif-button", name: "GIF Button", description: "Adds a GIF button next to the emoji button in the message box that opens the GIF picker directly.",
    version: "1.1.0", author: "Xrm0s and contributors", tags: ["Chat"], enabledByDefault: false,
    settings: { collection: { label, default: "trending", render: (value, save) => collectionSetting(value, save) } },
    start({ settings, api, resources }) {
        const target = (): string | undefined => {
            const value = String(settings.collection ?? "trending");
            return choices().find(([id]) => id === value.toLowerCase() || id === value)?.[1];
        };
        let wanted: string | undefined, pressed: string | undefined, until = 0;
        let covered: HTMLButtonElement | undefined;
        const under = (event: PointerEvent): HTMLButtonElement | undefined => [...document.querySelectorAll<HTMLButtonElement>('button[aria-label="Open GIF picker"]')].find(button => {
            const box = button.getBoundingClientRect();
            return event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
        });
        const press = (event: PointerEvent): void => {
            const button = under(event);
            covered = undefined;
            if (!button) return;
            pressed = document.querySelector(picker) ? tabs().find(tab => tab.getAttribute("aria-selected") === "true")?.textContent?.trim() ?? "" : undefined;
            if (pressed !== undefined && !(event.target instanceof Node && button.contains(event.target))) covered = button;
        };
        const release = (event: PointerEvent): void => { const button = covered; covered = undefined; if (button && under(event) === button) button.click(); };
        window.addEventListener("pointerdown", press, true);
        window.addEventListener("pointerup", release, true);
        resources.add(() => { window.removeEventListener("pointerdown", press, true); window.removeEventListener("pointerup", release, true); });
        const gifs = (): void => { until = Date.now() + 3000; pick("GIFs"); };
        api.observe(picker, () => { if (wanted === "GIFs") gifs(); else if (wanted) pick(wanted); wanted = undefined; });
        api.observe('nav[aria-label="GIF collections"] button', button => {
            if (Date.now() > until || button.getAttribute("aria-label") !== target()) return;
            until = 0;
            if (button.getAttribute("aria-current") !== "true") button.click();
        });
        api.observe('button[aria-label="Open emoji picker"]', emoji => {
            const button = emoji.cloneNode(false) as HTMLButtonElement;
            button.setAttribute("aria-label", "Open GIF picker"); button.removeAttribute("aria-expanded"); button.title = "GIFs"; button.innerHTML = icon; button.style.marginRight = "-0.5rem";
            button.addEventListener("mousedown", event => event.preventDefault());
            button.addEventListener("click", () => {
                const was = pressed; pressed = undefined;
                const act = (): void => {
                    const open = Boolean(document.querySelector(picker));
                    if (was === "GIFs") { if (open) emoji.click(); }
                    else if (open) gifs();
                    else { wanted = "GIFs"; until = Date.now() + 3000; emoji.click(); }
                };
                const end = Date.now() + 600;
                const settle = (): void => { if (was !== undefined && document.querySelector(picker) && Date.now() < end) requestAnimationFrame(settle); else act(); };
                settle();
            });
            const onEmoji = (event: MouseEvent): void => { if (event.isTrusted && !document.querySelector(picker)) wanted = "Emoji"; };
            emoji.addEventListener("click", onEmoji, true);
            emoji.before(button);
            return () => { emoji.removeEventListener("click", onEmoji, true); button.remove(); };
        });
    }
} satisfies Plugin;
