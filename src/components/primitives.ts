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

import { nativeClass } from "./nativeClasses";
import { uiIcon, type IconName } from "./icons";

const disposers = new WeakMap<HTMLElement, () => void>();
export function onDispose(root: HTMLElement, cleanup: () => void): void { disposers.set(root, cleanup); }
export function disposeView(root: HTMLElement): void { disposers.get(root)?.(); disposers.delete(root); }
export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
}
export function button(label: string, action: () => void, className = "", icon?: IconName): HTMLButtonElement {
    const modifiers = className.split(" ");
    const variant = modifiers.includes("vackle-primary") ? "variantBrand" : modifiers.some(value => ["vackle-icon-button", "vackle-ghost"].includes(value)) ? "variantGhost" : "variantSecondary";
    const native = ["root", "base", "sizeSm", variant, "pressable", ...modifiers.includes("vackle-icon-button") ? ["iconOnly"] : []].map(key => nativeClass(`V2Button_${key}`)).filter(Boolean);
    const node = element("button", `vackle-button ${className} ${native.join(" ")}`);
    if (native.length) {
        node.dataset.vackleNative = "button";
        const content = element("span", nativeClass("V2Button_contentWrapper"));
        if (icon) content.append(uiIcon(icon));
        if (label) content.append(element("span", nativeClass("V2Button_labelText"), label));
        node.append(content);
    } else {
        if (icon) node.append(uiIcon(icon));
        if (label) node.append(label);
    }
    node.type = "button";
    node.addEventListener("click", action);
    return node;
}
export function toggle(label: string, checked: boolean, action: (checked: boolean) => void, size: "Md" | "Lg" = "Lg"): HTMLLabelElement {
    const root = element("label", "vackle-switch");
    root.dataset.size = size;
    const input = element("input");
    input.type = "checkbox";
    input.checked = checked;
    input.setAttribute("role", "switch");
    input.setAttribute("aria-label", label);
    input.addEventListener("change", () => action(input.checked));
    if (nativeClass("V2Switch_root")) {
        root.dataset.vackleNative = "switch";
        const native = element("div", nativeClass("V2Switch_root"));
        const wrapper = element("div", `${nativeClass("V2Switch_switchWrapper")} ${nativeClass(`V2Switch_wrapper${size}`)}`);
        input.className = `${nativeClass("V2Switch_input")} ${nativeClass(`V2Switch_wrapper${size}`)}`;
        const track = element("div"); track.setAttribute("aria-hidden", "true"); track.append(element("div"));
        wrapper.append(input, track); native.append(wrapper); root.append(native);
        input.addEventListener("change", () => syncToggle(input)); syncToggle(input);
    } else root.append(input, element("span", "vackle-switch-track"));
    return root;
}
export function syncToggle(input: HTMLInputElement): void {
    const root = input.closest<HTMLElement>('[data-vackle-native="switch"]');
    const track = input.nextElementSibling;
    if (!root || !track) return;
    const size = root.dataset.size ?? "Lg";
    track.className = ["track", `track${size}`, input.checked ? "trackOn" : "trackOff", "trackFocus"].map(name => nativeClass(`V2Switch_${name}`)).join(" ");
    if (track.firstElementChild) track.firstElementChild.className = ["thumb", input.checked ? `thumbOn${size}` : `thumbOff${size}`].map(name => nativeClass(`V2Switch_${name}`)).join(" ");
}
export function heading(title: string, description: string): HTMLElement {
    const root = element("header", "vackle-page-heading");
    root.append(element("h2", "", title), element("p", "", description));
    return root;
}
export function settingRow(label: string, description: string, ...controls: HTMLElement[]): HTMLElement {
    const row = element("div", "vackle-setting");
    const text = element("div", "vackle-setting-text");
    const input = controls.map(control => control.matches("input,select,textarea") ? control : control.querySelector("input")).find(Boolean);
    const name = element(input?.id ? "label" : "span", "vackle-setting-label", label);
    if (input?.id) name.setAttribute("for", input.id);
    text.append(name);
    if (description) text.append(element("p", "vackle-setting-description", description));
    const end = element("div", "vackle-setting-controls"); end.append(...controls);
    row.append(text, end);
    return row;
}
export function keys(combination: readonly string[]): HTMLElement {
    const root = element("span", "vackle-keys");
    for (const key of combination) root.append(element("kbd", "", key));
    return root;
}
export type RunAction = (operation: () => Promise<void>, refresh?: boolean) => Promise<boolean>;
export function settingsCog(label: string, action: () => void): HTMLButtonElement {
    const node = button("", action, "vackle-icon-button", "overview");
    node.setAttribute("aria-label", label);
    node.title = label;
    return node;
}
