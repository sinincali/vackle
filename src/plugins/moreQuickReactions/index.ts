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
        const recent: unknown = JSON.parse(localStorage.getItem("flackle-emoji") ?? "null")?.state?.recent;
        return Array.isArray(recent) ? recent.filter((emoji): emoji is string => typeof emoji === "string").slice(0, count) : [];
    } catch { return []; }
}

const graphemes = (text: string): string[] => [...new Intl.Segmenter().segment(text)].map(part => part.segment).filter(part => part.trim());
const emojiButton = "[data-vackle-quick] button, button:has(> img[src^=\"/emoji/\"]):not([data-message-id] *)";

export default {
    id: "more-quick-reactions", name: "More Quick Reactions", description: "Adds your favorite and most used emoji to the message hover bar for one-click reactions. Right-click an emoji in the picker to favorite it.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Chat", "Shortcuts"], enabledByDefault: false,
    settings: { favorites: { label: "Favorite emoji (always shown first)", default: "" } },
    async start({ settings, setSetting, resources, api }) {
        const favorites = [...new Set(graphemes(String(settings.favorites ?? "")))];
        let closeMenu: (() => void) | undefined;
        const menu = (event: MouseEvent): void => {
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
            let conversationId: unknown;
            for (const props of row ? fiberProps(row, 3) : []) if (typeof props.conversationId === "string" && props.canAddReactions !== false) conversationId = props.conversationId;
            const messageId = row?.dataset.messageId;
            if (typeof conversationId !== "string" || !messageId || !anchor) return;
            const conversation = conversationId;
            const buttons = [...new Set([...favorites, ...recentEmoji(16)])].slice(0, Math.max(3, favorites.length)).map(emoji => {
                const wrapper = anchor.cloneNode(true) as HTMLElement; const button = wrapper.querySelector("button")!; wrapper.dataset.vackleQuick = "";
                button.setAttribute("aria-label", `React with ${emoji}`); button.title = `React with ${emoji}`;
                const image = Object.assign(document.createElement("img"), { src: emojiUrl(emoji), alt: emoji, className: "vackle-quick-reaction", draggable: false });
                image.addEventListener("error", () => image.replaceWith(Object.assign(document.createElement("span"), { className: "vackle-quick-reaction", textContent: emoji })), { once: true });
                button.querySelector("[class*=iconWrapper]")?.replaceChildren(image);
                button.addEventListener("click", event => { event.stopPropagation(); messages.getState().toggleReaction(conversation, messageId, emoji); });
                return wrapper;
            });
            anchor.before(...buttons);
            return () => { for (const button of buttons) button.remove(); };
        });
        await resources.style(".vackle-quick-reaction{width:18px;height:18px;color:#fff;font-size:16px;line-height:1}");
    }
} satisfies Plugin;
