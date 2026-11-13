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
import { flackleStore } from "../../components/flackleStores";
import { openPopupMenu } from "../../components/popupMenu";
import { fiberProps } from "../../components/reactFiber";

type Messages = { toggleReaction(conversationId: string, messageId: string, emoji: string): void };
const joiner = String.fromCodePoint(0x200d), variation = String.fromCodePoint(0xfe0f);
const emojiUrl = (emoji: string): string => `/emoji/${[...emoji.includes(joiner) ? emoji : emoji.replaceAll(variation, "")].map(char => char.codePointAt(0)!.toString(16)).join("-")}.svg`;
function recentEmoji(count: number): string[] {
    try {
        const state = JSON.parse(localStorage.getItem("flackle-emoji") ?? "null")?.state;
        const usage: unknown = state?.reactionUsage ?? state?.usage;
        const recent: unknown = Array.isArray(state?.recent) ? state.recent : usage && typeof usage === "object"
            ? Object.entries(usage as Record<string, { score?: number }>).sort(([, a], [, b]) => (b?.score ?? 0) - (a?.score ?? 0)).map(([emoji]) => emoji) : [];
        return Array.isArray(recent) ? recent.filter((emoji): emoji is string => typeof emoji === "string").slice(0, count) : [];
    } catch { return []; }
}

const graphemes = (text: string): string[] => [...new Intl.Segmenter().segment(text)].map(part => part.segment).filter(part => part.trim());
const cornerReaction = 'button.context-menu-corner-action[aria-label^="React with "]';
function reactionTarget(row: HTMLElement): { conversationId: string, messageId: string } | undefined {
    let conversationId: unknown;
    for (const props of fiberProps(row, 3)) if (typeof props.conversationId === "string" && props.canAddReactions !== false) conversationId = props.conversationId;
    const messageId = row.dataset.messageId;
    return typeof conversationId === "string" && messageId ? { conversationId, messageId } : undefined;
}
const emojiButton = "[data-vackle-quick] button, button:has(> img[src^=\"/emoji/\"]):not([data-message-id] *)";

export default {
    id: "more-quick-reactions", name: "More Quick Reactions", description: "Adds your favorite and most used emoji to the message hover bar for one-click reactions. Right-click an emoji in the picker to favorite it.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Chat", "Shortcuts"], enabledByDefault: false,
    settings: {
        favorites: { label: "Favorite emoji (always shown first)", default: "" },
        "context-menu": { label: "Show your quick reactions on the right-click menu instead of Flackle's", default: false }
    },
    async start({ settings, setSetting, resources, api }) {
        const favorites = [...new Set(graphemes(String(settings.favorites ?? "")))];
        const quick = (): string[] => [...new Set([...favorites, ...recentEmoji(16)])];
        let closeMenu: (() => void) | undefined, clickedRow: HTMLElement | null = null;
        const menu = (event: MouseEvent): void => {
            clickedRow = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-message-id]") : null;
            const button = event.target instanceof Element ? event.target.closest(emojiButton) : null;
            const emoji = button?.querySelector<HTMLImageElement>('img[src^="/emoji/"]')?.alt;
            if (!emoji) return;
            event.preventDefault(); event.stopPropagation();
            const favorite = favorites.includes(emoji);
            const next = favorite ? favorites.filter(item => item !== emoji) : [...favorites, emoji];
            closeMenu?.();
            closeMenu = openPopupMenu(event.clientX, event.clientY, [{ label: favorite ? "Remove from Quick Reactions" : "Add to Quick Reactions", icon: "bookmark",
                run: () => void setSetting("favorites", next.join(" ")).then(() => api.notify(favorite ? `Removed ${emoji} from quick reactions` : `Added ${emoji} to quick reactions`)).catch(error => api.notify(error instanceof Error ? error.message : String(error), "error")) }],
                button!.closest('[role="dialog"]') ?? document.body);
        };
        document.addEventListener("contextmenu", menu, true);
        resources.add(() => { document.removeEventListener("contextmenu", menu, true); closeMenu?.(); });
        const messages = flackleStore<Messages>("toggleReaction");
        if (!messages) throw new Error("Flackle's message store was not found");
        api.observe('[data-message-id] div[class~="-top-3"] > span.inline-flex > button[aria-label="Add reaction"]', add => {
            const row = add.closest<HTMLElement>("[data-message-id]"); const anchor = add.parentElement;
            if (add.closest("[data-vackle-quick]")) return;
            const target = row && reactionTarget(row);
            if (!target || !anchor) return;
            const { conversationId: conversation, messageId } = target;
            const bar = anchor.parentElement;
            const native = new Set([...bar?.querySelectorAll<HTMLImageElement>(':scope > button img[src^="/emoji/"]') ?? []].map(image => image.alt.replaceAll(variation, "")));
            const buttons = quick().filter(emoji => !native.has(emoji.replaceAll(variation, ""))).slice(0, Math.max(3, favorites.length)).map(emoji => {
                const wrapper = anchor.cloneNode(true) as HTMLElement; const button = wrapper.querySelector("button")!; wrapper.dataset.vackleQuick = "";
                button.setAttribute("aria-label", `React with ${emoji}`); button.title = `React with ${emoji}`;
                const image = Object.assign(document.createElement("img"), { src: emojiUrl(emoji), alt: emoji, className: "vackle-quick-reaction", draggable: false });
                image.addEventListener("error", () => image.replaceWith(Object.assign(document.createElement("span"), { className: "vackle-quick-reaction", textContent: emoji })), { once: true });
                button.querySelector("[class*=iconWrapper]")?.replaceChildren(image);
                button.addEventListener("click", event => { event.stopPropagation(); messages.getState().toggleReaction(conversation, messageId, emoji); });
                return wrapper;
            });
            anchor.before(...buttons);
            const fit = (): void => {
                for (const button of buttons) button.style.display = "";
                for (let i = buttons.length - 1; bar && i >= 0 && bar.offsetWidth > row.offsetWidth / 2; i--) buttons[i]!.style.display = "none";
            };
            const resize = new ResizeObserver(fit); resize.observe(row); fit();
            return () => { resize.disconnect(); for (const button of buttons) button.remove(); };
        });
        if (settings["context-menu"]) api.observe(cornerReaction, button => {
            const emoji = quick()[[...document.querySelectorAll(cornerReaction)].indexOf(button)];
            const target = clickedRow && reactionTarget(clickedRow); const image = button.querySelector("img");
            if (!emoji || !target || !image) return;
            image.addEventListener("error", () => image.replaceWith(Object.assign(document.createElement("span"), { className: "vackle-quick-reaction", textContent: emoji })), { once: true });
            image.src = emojiUrl(emoji); image.alt = emoji; button.title = `React with ${emoji}`; button.setAttribute("aria-label", button.title);
            button.addEventListener("click", event => {
                event.stopPropagation();
                messages.getState().toggleReaction(target.conversationId, target.messageId, emoji);
                document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
            }, true);
        });
        await resources.style(".vackle-quick-reaction{width:18px;height:18px;color:#fff;font-size:16px;line-height:1}");
    }
} satisfies Plugin;
