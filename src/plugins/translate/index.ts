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

import type { Plugin, Translation } from "../../api/types";
import { flackleStore } from "../../components/flackleStores";
import { uiIcon } from "../../components/icons";
import { fiberProps } from "../../components/reactFiber";

interface Socket {
    sendMessage(conversationId: string, content: string, ...rest: unknown[]): void;
    sendGuildChannelMessage(serverId: string, channelId: string, content: string, ...rest: unknown[]): void;
}
const codes = "af sq am ar hy as ay az bm eu be bn bho bs bg ca ceb ny zh-CN zh-TW co hr cs da dv doi nl en eo et ee tl fi fr fy gl ka de el gn gu ht ha haw he hi hmn hu is ig ilo id ga it ja jv kn kk km rw gom ko kri ku ckb ky lo la lv ln lt lg lb mk mai mg ms ml mt mi mr mni-Mtei lus mn my ne no or om ps fa pl pt pa qu ro ru sm sa gd nso sr st sn sd si sk sl so es su sw sv tg ta tt te th ti ts tr tk ak uk ur ug uz vi cy xh yi yo zu".split(" ");
const names = new Intl.DisplayNames(["en"], { type: "language" });
export const languageName = (code: string): string => { try { return names.of(code) ?? code; } catch { return code; } };
const byName = new Map(codes.map(code => [languageName(code), code]));
const options = ["Detect language", ...[...byName.keys()].sort((a, b) => a.localeCompare(b))];
const targets = options.slice(1);
export const languageCode = (name: unknown): string => name === "Detect language" ? "auto" : byName.get(String(name)) ?? "en";
const contentOf = (row: Element): { id: string; content: string } | undefined => {
    for (const props of fiberProps(row, 3)) {
        const message = props.message as { id?: unknown; content?: unknown } | undefined;
        if (typeof message?.id === "string") return typeof message.content === "string" && message.content.trim() ? { id: message.id, content: message.content } : undefined;
    }
    return undefined;
};
const iconMarkup = (active: boolean): string => `<svg width="14" height="14" class="text-white/40 group-hover:text-white/70 transition-colors"${active ? ' style="color:var(--ui-text-accent,#ef5252)"' : ""} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${uiIcon("translate").innerHTML}</svg>`;

export default {
    id: "translate", name: "Translate", description: "Translate messages with Google Translate.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Chat", "Utility"], enabledByDefault: false,
    settings: {
        "received-input": { label: "Language incoming messages are translated from", default: "Detect language", options },
        "received-output": { label: "Language incoming messages are translated to", default: "English", options: targets },
        "sent-input": { label: "Language your messages are translated from", default: "Detect language", options },
        "sent-output": { label: "Language your messages are translated to", default: "English", options: targets },
        "auto-translate": { label: "Automatically translate your messages before sending. You can also click the translate button in the chat bar to toggle this", default: false }
    },
    async start({ settings, setSetting, resources, api }) {
        const socket = flackleStore<Socket>("sendGuildChannelMessage");
        const messages = flackleStore<{ cache: Record<string, { messages: { nonce?: unknown; content?: string }[] } | undefined> }>("addOptimisticMessage");
        if (!socket || !messages) throw new Error("Flackle's connection or message store was not found");
        const rewrite = (nonce: unknown, content: string): void => {
            if (typeof nonce !== "string" || !nonce) return;
            const cache = messages.getState().cache;
            for (const [key, entry] of Object.entries(cache)) if (entry?.messages.some(message => message.nonce === nonce))
                messages.setState({ cache: { ...cache, [key]: { ...entry, messages: entry.messages.map(message => message.nonce === nonce ? { ...message, content } : message) } } });
        };
        const translations = new Map<string, Translation>(), views = new Map<string, Set<() => void>>();
        const fail = (error: unknown): void => api.notify(error instanceof Error ? error.message : String(error), "error");
        const translate = (kind: "received" | "sent", text: string): Promise<Translation> => resources.translate(text, languageCode(settings[`${kind}-input`]), languageCode(settings[`${kind}-output`]));
        const show = (row: Element): void => {
            const message = contentOf(row);
            if (!message) return;
            void translate("received", message.content).then(result => { translations.set(message.id, result); for (const view of views.get(message.id) ?? []) view(); }, fail);
        };
        api.contextMenu({ id: "translate", label: "Translate", icon: "translate", after: "Copy Text", selector: "[data-message-id]", matches: row => contentOf(row) !== undefined, run: show });
        api.observe("[data-message-id] [data-message-content]", content => {
            const row = content.closest<HTMLElement>("[data-message-id]")!; const id = row.dataset.messageId!;
            const box = Object.assign(document.createElement("div"), { className: "vackle-translation" });
            const render = (): void => {
                const result = translations.get(id);
                if (!result) { box.remove(); return; }
                const text = Object.assign(document.createElement("p"), { className: content.firstElementChild?.className ?? "", textContent: result.text });
                const meta = Object.assign(document.createElement("p"), { className: "vackle-translation-meta" });
                const dismiss = Object.assign(document.createElement("button"), { type: "button", textContent: "Dismiss" });
                dismiss.addEventListener("click", () => { translations.delete(id); for (const view of views.get(id) ?? []) view(); });
                const icon = uiIcon("translate", 14);
                meta.append(icon, `translated from ${languageName(result.sourceLanguage)} · `, dismiss);
                box.replaceChildren(text, meta);
                if (!box.isConnected) content.append(box);
            };
            const set = views.get(id) ?? new Set(); set.add(render); views.set(id, set); render();
            return () => { set.delete(render); if (!set.size) views.delete(id); box.remove(); };
        });
        api.observe('[data-message-id] div[class~="-top-3"] > span.inline-flex > button[aria-label="Reply"]', reply => {
            const row = reply.closest<HTMLElement>("[data-message-id]")!;
            if (!contentOf(row)) return undefined;
            const wrapper = reply.parentElement!.cloneNode(true) as HTMLElement; wrapper.dataset.vackleQuick = "";
            const button = wrapper.querySelector("button")!;
            button.setAttribute("aria-label", "Translate"); button.title = "Translate";
            button.querySelector("[class*=iconWrapper]")?.replaceChildren(uiIcon("translate", 16));
            button.addEventListener("click", event => { event.stopPropagation(); show(row); });
            reply.parentElement!.before(wrapper);
            return () => wrapper.remove();
        });
        const auto = settings["auto-translate"] === true;
        api.observe('button[aria-label="Chat Settings"]', anchor => {
            const wrapper = anchor.parentElement!.cloneNode(false) as HTMLElement;
            const button = anchor.cloneNode(false) as HTMLButtonElement;
            const label = auto ? "Disable Auto-Translate" : "Enable Auto-Translate";
            button.setAttribute("aria-label", label); button.title = label; button.setAttribute("aria-pressed", String(auto)); button.innerHTML = iconMarkup(auto);
            button.addEventListener("mousedown", event => event.preventDefault());
            button.addEventListener("click", () => void setSetting("auto-translate", !auto).then(() => api.notify(auto ? "Auto-Translate disabled" : "Auto-Translate enabled"), fail));
            wrapper.append(button); anchor.parentElement!.after(wrapper);
            return () => wrapper.remove();
        });
        await resources.style(".vackle-translation{margin-top:4px;color:rgb(255 255 255 / .9)}.vackle-translation p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.vackle-translation-meta{display:flex;align-items:center;gap:4px;margin-top:2px!important;color:rgb(255 255 255 / .45);font-size:12px}.vackle-translation-meta svg{flex-shrink:0}.vackle-translation-meta button{padding:0;border:0;background:none;color:var(--ui-text-link,#66a3ff);font:inherit;cursor:pointer}.vackle-translation-meta button:hover{text-decoration:underline}");
        if (!auto) return;
        const original = socket.getState();
        const send = <A extends unknown[]>(forward: (...args: A) => void, index: number) => (...args: A): void => {
            const content = args[index];
            if (typeof content !== "string" || !content.trim()) { forward(...args); return; }
            void translate("sent", content).then(result => { const next = [...args] as A; next[index] = result.text; rewrite(args[index + 1], result.text); forward(...next); }, error => { fail(error); forward(...args); });
        };
        const patched: Pick<Socket, keyof Socket> = { sendMessage: send(original.sendMessage, 1), sendGuildChannelMessage: send(original.sendGuildChannelMessage, 2) };
        socket.setState(patched);
        resources.add(() => {
            const now = socket.getState();
            if (now.sendMessage === patched.sendMessage && now.sendGuildChannelMessage === patched.sendGuildChannelMessage)
                socket.setState({ sendMessage: original.sendMessage, sendGuildChannelMessage: original.sendGuildChannelMessage });
        });
    }
} satisfies Plugin;
