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

import type { Bridge } from "../api/types";
import type { CustomCss } from "../core/customCss";
import { isRecord } from "../settings/schema";
import type { SettingsStore } from "../settings/settingsStore";

const limit = 524288;
const interval = 1000;

function parse(value: unknown): { text?: string; stamp: string } | undefined {
    return isRecord(value) && typeof value.stamp === "string" ? { stamp: value.stamp, ...typeof value.text === "string" ? { text: value.text } : {} } : undefined;
}

export function createExternalQuickCss(bridge: Required<Pick<Bridge, "quickCss">>, store: SettingsStore, customCss: CustomCss): { open(): Promise<void>; dispose(): void } {
    let timer = 0, stamp = "", known = "";
    let unobserve: (() => void) | undefined;
    const poll = async (): Promise<void> => {
        const file = parse(await bridge.quickCss({ op: "read", stamp }).catch(() => undefined));
        if (!file || file.stamp === stamp) return;
        stamp = file.stamp;
        if (file.text === undefined || file.text === store.value.css.text || file.text.length > limit) return;
        known = file.text;
        await customCss.setText(file.text).catch(() => undefined);
    };
    const push = async (): Promise<void> => {
        const text = store.value.css.text;
        if (text === known) return;
        known = text;
        stamp = parse(await bridge.quickCss({ op: "write", text }).catch(() => undefined))?.stamp ?? stamp;
    };
    const stop = (): void => {
        window.clearInterval(timer); timer = 0;
        unobserve?.(); unobserve = undefined;
    };
    return {
        async open() {
            known = store.value.css.text;
            stamp = parse(await bridge.quickCss({ op: "open", text: known }))?.stamp ?? "";
            stop();
            timer = window.setInterval(() => void poll(), interval);
            unobserve = store.observeChanges(() => void push());
        },
        dispose: stop
    };
}
