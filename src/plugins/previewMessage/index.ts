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
import { flackleAuth, flackleStore } from "../../components/flackleStores";
import { fiberProps } from "../../components/reactFiber";

interface User { id: string; username?: string; display_name?: string | null; avatar_url?: string | null; }
const prefix = "vackle-preview-";
const eyeIcon = '<svg class="w-[0.825rem] h-[0.825rem] text-white/40 group-hover:text-white/70 transition-colors" viewBox="1 1 22 22" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M12 5C5.648 5 1 12 1 12s4.648 7 11 7 11-7 11-7-4.648-7-11-7Zm0 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z"/><circle cx="12" cy="12" r="2"/></svg>';

export function conversationId(): string | undefined {
    for (const props of fiberProps(document.querySelector("[data-message-id]") ?? document.body, 3)) if (typeof props.conversationId === "string") return props.conversationId;
    const dm = /^\/app\/conversations\/(\d+)/.exec(location.pathname)?.[1];
    const channel = /^\/app\/channels\/(\d+)\/(\d+)/.exec(location.pathname);
    return dm ?? (channel ? `g:${channel[1]}:${channel[2]}` : undefined);
}

export default {
    id: "preview-message", name: "Preview Message", description: "Shows a live preview of your message as you type. Click the eye button next to the message box to turn it on or off.",
    version: "1.1.0", author: "Xrm0s and contributors", tags: ["Chat", "Utility"], enabledByDefault: false,
    async start({ resources, api }) {
        const messages = flackleStore<{ cache: Record<string, { messages: { id: string }[] } | undefined>; addMessage(conversationId: string, message: Record<string, unknown>): void }>("addMessage");
        const auth = flackleAuth<User>();
        if (!messages || !auth) throw new Error("Flackle's message or account store was not found");
        const store = messages;
        const dismiss = (id?: string): void => {
            const cache = store.getState().cache; const next = { ...cache };
            for (const [key, entry] of Object.entries(cache)) if (entry?.messages.some(message => message.id.startsWith(prefix) && (!id || message.id === id))) next[key] = { ...entry, messages: entry.messages.filter(message => !(message.id.startsWith(prefix) && (!id || message.id === id))) };
            store.setState({ cache: next });
        };
        resources.add(() => dismiss());
        const draft = (): string => document.querySelector<HTMLTextAreaElement>("textarea.rich-composer-input")?.value.trim() ?? "";
        const buttons = new Set<HTMLElement>();
        let live = false, previewId: string | undefined;
        const show = (): void => {
            const content = draft(); const conversation = conversationId(); const user = auth.getState().user;
            const entry = conversation ? store.getState().cache[conversation] : undefined;
            const existing = previewId && entry?.messages.some(message => message.id === previewId);
            if (!live || !content || !conversation || !user) { if (previewId) dismiss(previewId); previewId = undefined; return; }
            if (existing && entry) { store.setState({ cache: { ...store.getState().cache, [conversation]: { ...entry, messages: entry.messages.map(message => message.id === previewId ? { ...message, content } : message) } } }); return; }
            const now = new Date().toISOString();
            previewId = `${prefix}${Date.now()}`;
            store.getState().addMessage(conversation, { id: previewId, conversation_id: conversation, content, type: "text", is_deleted: false, created_at: now, updated_at: now,
                sender: { id: user.id, username: user.username, display_name: user.display_name, avatar_url: user.avatar_url }, isPending: true, attachments: [], embeds: [] });
        };
        const sync = (): void => {
            const empty = !draft();
            for (const button of buttons) { button.hidden = empty && !live; button.querySelector("button")?.setAttribute("aria-pressed", String(live)); }
            show();
        };
        api.onRoute(() => { dismiss(); previewId = undefined; });
        api.observe('button[aria-label="Insert mention"]', mention => {
            const anchor = mention.parentElement!; const wrapper = anchor.cloneNode(false) as HTMLElement;
            const button = mention.cloneNode(false) as HTMLButtonElement; button.disabled = false;
            button.setAttribute("aria-label", "Preview Message"); button.title = "Live preview"; button.innerHTML = eyeIcon;
            button.addEventListener("mousedown", event => event.preventDefault());
            button.addEventListener("click", () => { live = !live; sync(); });
            wrapper.append(button); anchor.after(wrapper); buttons.add(wrapper); sync();
            return () => { buttons.delete(wrapper); wrapper.remove(); };
        });
        api.observe(`[data-message-id^="${prefix}"] [data-message-content]`, content => {
            const id = content.closest<HTMLElement>("[data-message-id]")!.dataset.messageId!;
            const note = Object.assign(document.createElement("div"), { className: "vackle-preview-note" });
            note.innerHTML = eyeIcon;
            const close = Object.assign(document.createElement("button"), { type: "button", textContent: "Dismiss message" });
            close.addEventListener("click", () => { live = false; dismiss(id); previewId = undefined; sync(); });
            note.append("Only you can see this • ", close); content.append(note);
            return () => note.remove();
        });
        for (const type of ["input", "keyup", "focusin"]) resources.listen(document, type, sync);
        await resources.style(`[data-message-id^="${prefix}"]{opacity:1!important}.vackle-preview-note{display:flex;align-items:center;gap:4px;margin-top:4px;color:rgb(255 255 255 / .45);font-size:12px}.vackle-preview-note svg{width:14px;height:14px}button[aria-label="Chat Settings"] svg,button[aria-label="Insert mention"] svg,button[aria-label="Preview Message"] svg{width:.875rem;height:.875rem}button[aria-label="Preview Message"][aria-pressed=true] svg{color:var(--ui-text-link,#66a3ff)}div:has(> span > button[aria-label="Insert mention"]){margin-right:.125rem!important}.vackle-preview-note button{padding:0;border:0;background:none;color:var(--ui-text-link,#66a3ff);font:inherit;cursor:pointer}.vackle-preview-note button:hover{text-decoration:underline}`);
    }
} satisfies Plugin;
