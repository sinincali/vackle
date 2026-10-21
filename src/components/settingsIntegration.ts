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

import { disposeView } from "./primitives";
import { brandGlyph, uiIcon, type IconName } from "./icons";

interface SettingsNavigation {
    id: string;
    label: string;
}
export class SettingsIntegration {
    private readonly observer: MutationObserver;
    private dialog: HTMLElement | undefined;
    private navigation: HTMLElement | undefined;
    private panel: HTMLElement | undefined;
    private nativeContent: HTMLElement | undefined;
    private header: HTMLElement | undefined;
    private headerIcon: Element | undefined;
    private nativeHeaderIcon: Element | undefined;
    private originalHeading = "";
    private hidden = new Map<HTMLElement, HTMLElement["hidden"]>();
    private selected = new Map<HTMLElement, string | null>();
    private active: string | undefined;
    private activation = 0;
    private openRequest = 0;
    private readonly scrollPositions = new Map<string, number>();
    private readonly click: (event: MouseEvent) => void;
    constructor(private readonly sections: SettingsNavigation[], private readonly render: (section: string) => HTMLElement) {
        this.click = event => {
            const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[role="tab"]') : null;
            if (target && !target.closest("[data-vackle-navigation]") && this.dialog?.contains(target)) this.deactivate();
        };
        document.addEventListener("click", this.click, true);
        let scheduled = false;
        this.observer = new MutationObserver(records => {
            if (this.dialog?.isConnected && this.navigation?.isConnected) return;
            if (!this.dialog && !records.some(record => [...record.addedNodes].some(node => node instanceof Element &&
                (node.matches('[role="dialog"][aria-label="Settings"]') || node.querySelector('[role="dialog"][aria-label="Settings"]'))))) return;
            if (scheduled) return;
            scheduled = true;
            queueMicrotask(() => { scheduled = false; this.attach(); });
        });
        this.observer.observe(document.body, { childList: true, subtree: true });
        this.attach();
    }
    private attach(): void {
        const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Settings"]');
        if (!dialog) { this.deactivate(); this.navigation?.remove(); this.dialog = undefined; return; }
        if (this.dialog === dialog && this.navigation?.isConnected) return;
        this.deactivate();
        this.navigation?.remove();
        const nav = dialog.querySelector<HTMLElement>('.settings-sidebar-nav[role="tablist"]');
        const content = dialog.querySelector<HTMLElement>(".settings-scroll .simplebar-content");
        const template = nav?.querySelector<HTMLButtonElement>('[role="tab"][class*="variantGhost"]') ?? nav?.querySelector<HTMLButtonElement>('[role="tab"]');
        if (!nav || !content || !template) return;
        this.dialog = dialog;
        this.nativeContent = content;
        this.header = dialog.querySelector<HTMLElement>("h2") ?? undefined;
        const group = document.createElement("div");
        group.dataset.vackleNavigation = "";
        group.className = "vackle-native-navigation";
        const nativeHeading = nav.querySelector<HTMLElement>('[class*="select-none"][class*="text-xs"]');
        const title = nativeHeading?.cloneNode(false) as HTMLElement | undefined ?? document.createElement("p");
        title.textContent = "Vackle";
        title.classList.add("vackle-nav-heading");
        group.append(title);
        for (const section of this.sections) {
            const entry = template.cloneNode(true) as HTMLButtonElement;
            entry.removeAttribute("style");
            entry.style.setProperty("--v2-button-radius", "8px");
            entry.style.width = "100%";
            entry.setAttribute("aria-selected", "false");
            entry.setAttribute("aria-controls", "vackle-native-panel");
            entry.id = `vackle-tab-${section.id}`;
            const label = entry.querySelector<HTMLElement>('[class*="labelText"]');
            if (label) label.textContent = section.label; else entry.textContent = section.label;
            const iconWrapper = entry.querySelector('[class*="iconWrapper"]');
            iconWrapper?.replaceChildren(section.id === "overview" ? brandGlyph("vackle-nav-glyph") : uiIcon(section.id as IconName, 20));
            entry.addEventListener("click", () => this.activate(section.id));
            entry.addEventListener("keydown", event => {
                if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
                event.preventDefault();
                const buttons = [...group.querySelectorAll<HTMLButtonElement>("button")];
                const next = buttons[(buttons.indexOf(entry) + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length];
                next?.focus(); next?.click();
            });
            group.append(entry);
        }
        const footer = [...nav.children].find(child => child.querySelector('button[aria-label="Log out"]'));
        nav.insertBefore(group, footer ?? null);
        this.navigation = group;
    }
    activate(section: string): void {
        if (!this.nativeContent || !this.header || !this.navigation) throw new Error("Flackle settings structure is unsupported");
        this.activation++;
        if (!this.active) {
            this.originalHeading = this.header.textContent ?? "";
            for (const child of this.nativeContent.children) {
                if (!(child instanceof HTMLElement)) continue;
                this.hidden.set(child, child.hidden);
                child.classList.add("vackle-host-hidden");
            }
            for (const tab of this.dialog!.querySelectorAll<HTMLElement>('[role="tab"]')) this.selected.set(tab, tab.getAttribute("aria-selected"));
        }
        const viewport = this.panel?.closest<HTMLElement>(".simplebar-content-wrapper");
        if (this.active && viewport) this.scrollPositions.set(this.active, viewport.scrollTop);
        if (this.panel) { disposeView(this.panel); this.panel.remove(); }
        this.active = section;
        for (const tab of this.dialog!.querySelectorAll<HTMLElement>('[role="tab"]')) tab.setAttribute("aria-selected", String(tab.id === `vackle-tab-${section}`));
        this.header.textContent = this.sections.find(entry => entry.id === section)?.label ?? "Vackle";
        this.headerIcon?.remove();
        const nativeIcon = this.nativeHeaderIcon ?? this.header.previousElementSibling;
        const icon = this.navigation.querySelector(`#vackle-tab-${section} [class*="iconWrapper"] > *`)?.cloneNode(true);
        if (nativeIcon?.localName === "svg" && icon instanceof Element) {
            this.nativeHeaderIcon = nativeIcon; nativeIcon.classList.add("vackle-host-hidden");
            icon.classList.add("vackle-header-icon"); this.header.before(icon); this.headerIcon = icon;
        }
        this.panel = this.render(section);
        this.panel.id = "vackle-native-panel";
        this.panel.dataset.vackleRoot = "";
        this.panel.setAttribute("role", "tabpanel");
        this.panel.setAttribute("aria-labelledby", `vackle-tab-${section}`);
        this.nativeContent.append(this.panel);
        const scroll = this.panel.closest<HTMLElement>(".simplebar-content-wrapper");
        if (scroll) scroll.scrollTop = this.scrollPositions.get(section) ?? 0;
        const navigationViewport = this.navigation.closest<HTMLElement>(".simplebar-content-wrapper");
        if (navigationViewport) {
            const bounds = this.navigation.getBoundingClientRect();
            const viewportBounds = navigationViewport.getBoundingClientRect();
            if (bounds.height <= viewportBounds.height) navigationViewport.scrollTop += bounds.bottom > viewportBounds.bottom ? bounds.bottom - viewportBounds.bottom : bounds.top < viewportBounds.top ? bounds.top - viewportBounds.top : 0;
        }
    }
    async open(section = "overview"): Promise<void> {
        const request = ++this.openRequest;
        const activation = this.activation;
        if (!document.querySelector('[role="dialog"][aria-label="Settings"]')) document.querySelector<HTMLButtonElement>('button[aria-label="Settings"]')?.click();
        for (let index = 0; index < 20; index++) {
            if (request !== this.openRequest) return;
            this.attach();
            if (this.dialog && this.navigation) { if (activation === this.activation) this.activate(section); return; }
            await new Promise<void>(resolve => setTimeout(resolve, 50));
        }
        throw new Error("Native Flackle settings are unavailable on this page");
    }
    refresh(): void {
        if (!this.active) return;
        const scroll = this.panel?.closest<HTMLElement>(".simplebar-content-wrapper")?.scrollTop ?? 0;
        this.activate(this.active);
        const viewport = this.panel?.closest<HTMLElement>(".simplebar-content-wrapper");
        if (viewport) viewport.scrollTop = scroll;
    }
    private deactivate(): void {
        if (this.panel) { disposeView(this.panel); this.panel.remove(); } this.panel = undefined;
        if (this.active && this.header?.isConnected) this.header.textContent = this.originalHeading;
        this.headerIcon?.remove(); this.nativeHeaderIcon?.classList.remove("vackle-host-hidden"); this.headerIcon = this.nativeHeaderIcon = undefined;
        for (const [child, wasHidden] of this.hidden) { child.classList.remove("vackle-host-hidden"); child.hidden = wasHidden; }
        for (const [tab, selected] of this.selected) { if (selected === null) tab.removeAttribute("aria-selected"); else tab.setAttribute("aria-selected", selected); }
        this.hidden.clear(); this.selected.clear(); this.active = undefined;
    }
    dispose(): void { this.observer.disconnect(); document.removeEventListener("click", this.click, true); this.deactivate(); this.navigation?.remove(); }
}
