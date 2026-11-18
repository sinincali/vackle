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

import type { CustomCss } from "../core/customCss";
import { presets, type Themes } from "../core/themes";
import type { SettingsStore } from "../settings/settingsStore";
import { openQuickCss } from "./quickCssWindow";
import { button, element, heading, onDispose, settingRow, syncToggle, toggle, type RunAction } from "./primitives";

function importer(label: string, accept: (file: File) => void): HTMLInputElement {
    const file = element("input"); file.type = "file"; file.accept = ".css,text/css"; file.setAttribute("aria-label", label); file.hidden = true;
    file.addEventListener("change", () => { const selected = file.files?.[0]; if (selected) accept(selected); file.value = ""; });
    return file;
}
export function themePage(section: "themes" | "css", themes: Themes, customCss: CustomCss, store: SettingsStore,
    run: RunAction, external?: () => Promise<void>): HTMLElement {
    const root = element("div", "vackle-page");
    root.append(heading(section === "themes" ? "Themes" : "QuickCSS", section === "themes" ? "Import local CSS themes. Each theme can be enabled independently." : "Edit CSS without changing Flackle's files. Saved in Vackle's data directory."));
    if (section === "themes") {
        const file = importer("Import theme", selected => void run(() => themes.importFile(selected)));
        const actions = element("div", "vackle-actions"); actions.append(button("Import theme", () => file.click(), "", "import"), file);
        for (const preset of presets) if (!store.value.themes.some(theme => theme.id === preset.id))
            actions.append(button(`Add ${preset.name}`, () => void run(() => themes.addPreset(preset.id)), "vackle-ghost"));
        const list = element("section", "vackle-section"); list.append(actions);
        for (const theme of store.value.themes) {
            const name = presets.find(preset => preset.id === theme.id)?.name ?? theme.name;
            list.append(settingRow(name, theme.enabled ? "Active" : "Inactive", button("Remove", () => void run(() => themes.remove(theme.id)), "vackle-ghost"),
                toggle(`Enable theme ${name}`, theme.enabled, enabled => void run(() => themes.setEnabled(theme.id, enabled)))));
        }
        if (!store.value.themes.length) {
            const empty = element("div", "vackle-empty");
            empty.append(element("p", "vackle-empty-title", "No themes installed"), element("p", "", "Import a .css file to add your first theme."));
            list.append(empty);
        }
        root.append(list);
    } else {
        const control = toggle("Enable custom CSS", store.value.css.enabled, enabled => {
            const input = control.querySelector("input")!; input.disabled = true;
            void run(() => customCss.setEnabled(enabled), false).then(success => {
                if (!success) { input.checked = store.value.css.enabled; syncToggle(input); }
                input.disabled = false;
            });
        });
        control.querySelector("input")!.id = "vackle-css-enabled";
        onDispose(root, store.observeChanges(() => { const input = control.querySelector("input")!; input.checked = store.value.css.enabled; syncToggle(input); }));
        const file = importer("Import CSS file", selected => void run(() => customCss.importFile(selected)));
        const switchSection = element("section", "vackle-section"); switchSection.append(settingRow("Custom CSS", "Apply these styles to Flackle.", control));
        const actions = element("div", "vackle-actions");
        if (external) actions.append(button("Open editor", () => void run(external, false), "vackle-primary", "external"), button("Edit inside Flackle", () => openQuickCss(store, customCss), "vackle-ghost", "css"));
        else actions.append(button("Open editor", () => openQuickCss(store, customCss), "vackle-primary", "css"));
        actions.append(button("Import CSS", () => file.click(), "vackle-ghost", "import"), file);
        const editSection = element("section", "vackle-section vackle-section-tight");
        editSection.append(actions, element("p", "vackle-hint", "Open editor uses VS Code or Notepad and applies changes when you save. QuickCSS loads after themes. Max 512 KiB."));
        root.append(switchSection, editSection);
    }
    return root;
}
