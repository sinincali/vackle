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
import { copyText } from "../../components/flackleRole";
import { flackleStore, flackleUser } from "../../components/flackleStores";
import { uiIcon } from "../../components/icons";
import { modalHost, openModal } from "../../components/modal";
import { button, element } from "../../components/primitives";
import { fiberProps } from "../../components/reactFiber";

interface Channels { byServer: Record<string, { channels?: { id: string }[] } | undefined>; }
export function rawJson(data: unknown, sort: boolean, strip: boolean): string {
    const clean = (value: unknown): unknown => {
        if (typeof value === "bigint") return value.toString();
        if (Array.isArray(value)) return value.map(clean);
        if (value === null || typeof value !== "object") return typeof value === "function" ? undefined : value;
        const entries = Object.entries(value).filter(([key]) => !(strip && ["email", "phone", "billing"].includes(key)));
        if (sort) entries.sort(([a], [b]) => a.localeCompare(b));
        return Object.fromEntries(entries.map(([key, entry]) => [key, clean(entry)]));
    };
    return JSON.stringify(clean(data), null, 4);
}
const messageOf = (row: Element): Record<string, unknown> | undefined => {
    for (const props of fiberProps(row, 3)) if (props.message && typeof props.message === "object") return props.message as Record<string, unknown>;
    return undefined;
};

export default {
    id: "view-raw", name: "View Raw", description: "Copy and view the raw content/data of any message, channel, server or user.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Developers", "Utility"], enabledByDefault: false,
    settings: {
        "click-method": { label: "Change the button to view the raw content/data of any message.", default: "Left Click to view the raw content.", options: ["Left Click to view the raw content.", "Right click to view the raw content."] },
        "message-context-menu": { label: "Show in message context menu", default: false },
        "sort-keys": { label: "Alphabetically sort the keys of the raw data.", default: true },
        "strip-sensitive-data": { label: "Remove sensitive data from the raw data, such as your email and phone number.", default: true }
    },
    async start({ settings, resources, api }) {
        const servers = flackleStore<{ servers: { id: string }[] }>("removeServer"), channels = flackleStore<Channels>("fetchServerChannels");
        if (!servers || !channels) throw new Error("Flackle's server or channel store was not found");
        let close: (() => void) | undefined;
        resources.add(() => close?.());
        const json = (data: unknown): string => rawJson(data, settings["sort-keys"] !== false, settings["strip-sensitive-data"] !== false);
        const block = (text: string): HTMLElement => element("pre", "vackle-raw-code", text);
        const view = (type: string, data: unknown, content?: string): void => {
            const text = json(data);
            const body = element("div", "vackle-raw");
            if (content) body.append(element("h3", "vackle-raw-heading", "Message Content"), block(content), element("h3", "vackle-raw-heading", "Message Data"));
            const actions = element("div", "vackle-actions");
            actions.append(button(`Copy ${type} Data`, () => copyText(text, api.notify), "vackle-ghost"));
            if (content) actions.append(button("Copy Raw Content", () => copyText(content, api.notify), "vackle-ghost"));
            body.append(block(text), actions);
            close?.(); close = openModal(modalHost(), `Raw ${type} Data`, body, () => { close = undefined; });
            body.parentElement!.classList.add("vackle-raw-modal");
        };
        const viewMessage = (row: Element): void => { const message = messageOf(row); if (message) view("Message", message, typeof message.content === "string" ? message.content : undefined); };
        const copyContent = (row: Element): void => { const content = messageOf(row)?.content; if (typeof content === "string") copyText(content, api.notify); };
        const user = (target: HTMLElement) => { const id = target.dataset.userCardTrigger; return id ? flackleUser(id) : undefined; };
        const server = (target: HTMLElement) => servers.getState().servers.find(entry => entry.id === target.dataset.railIcon);
        const channel = (target: HTMLElement) => {
            const [, serverId, channelId] = /^\/app\/channels\/(\d+)\/(\d+)$/.exec(target.getAttribute("href") ?? "") ?? [];
            return serverId ? channels.getState().byServer[serverId]?.channels?.find(entry => entry.id === channelId) : undefined;
        };
        api.contextMenu({ id: "view-user-raw", label: "View Raw", icon: "css", after: "Copy ID", selector: "[data-user-card-trigger]", matches: target => user(target) !== undefined, run: target => view("User", user(target)) });
        api.contextMenu({ id: "view-server-raw", label: "View Raw", icon: "css", after: "Copy Server ID", selector: "a[data-rail-icon]", matches: target => server(target) !== undefined, run: target => view("Server", server(target)) });
        api.contextMenu({ id: "view-channel-raw", label: "View Raw", icon: "css", selector: 'a[data-sidebar-context-owner][href^="/app/channels/"]', matches: target => channel(target) !== undefined, run: target => view("Channel", channel(target)) });
        if (settings["message-context-menu"] === true)
            api.contextMenu({ id: "view-message-raw", label: "View Raw", icon: "css", after: "Copy Message ID", selector: "[data-message-id]", matches: row => messageOf(row) !== undefined && !row.querySelector("[data-user-card-trigger]:hover"), run: viewMessage });
        const leftViews = settings["click-method"] !== "Right click to view the raw content.";
        api.observe('[data-message-id] div[class~="-top-3"] > span.inline-flex > button[aria-label="Reply"]', reply => {
            const row = reply.closest<HTMLElement>("[data-message-id]")!;
            if (!messageOf(row)) return undefined;
            const wrapper = reply.parentElement!.cloneNode(true) as HTMLElement; wrapper.dataset.vackleQuick = "";
            const control = wrapper.querySelector("button")!;
            const label = leftViews ? "View Raw (right-click to copy raw content)" : "Copy Raw Content (right-click to view raw)";
            control.setAttribute("aria-label", "View Raw"); control.title = label;
            control.querySelector("[class*=iconWrapper]")?.replaceChildren(uiIcon("css", 16));
            control.addEventListener("click", event => { event.stopPropagation(); if (leftViews) viewMessage(row); else copyContent(row); });
            control.addEventListener("contextmenu", event => { event.preventDefault(); event.stopPropagation(); if (leftViews) copyContent(row); else viewMessage(row); });
            reply.parentElement!.before(wrapper);
            return () => wrapper.remove();
        });
        await resources.style(".vackle-modal.vackle-raw-modal{width:min(800px,100%);max-height:min(820px,calc(100vh - 32px))}.vackle-raw{gap:8px}.vackle-raw-heading{margin:4px 0 0!important;font-size:13px;font-weight:600;color:rgb(255 255 255 / .8)}.vackle-raw-code{margin:0;max-height:50vh;overflow:auto;padding:10px 12px;border-radius:8px;background:rgb(0 0 0 / .35);color:rgb(255 255 255 / .9);font:12px/1.5 ui-monospace,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;scrollbar-width:thin}");
    }
} satisfies Plugin;
