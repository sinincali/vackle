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

interface Message { id: string; content?: string; is_deleted?: boolean; edited_at?: string; sender?: { id?: string } }
interface Messages {
    cache: Record<string, { messages: Message[] } | undefined>;
    pendingDeletes: object;
    updateMessage(conversation: string, id: string, patch: Partial<Message>): void;
    removeMessage(conversation: string, id: string): void;
}

export default {
    id: "message-logger", name: "Message Logger", description: "Keeps deleted messages visible and shows the earlier versions of edited messages. Logs last until Flackle restarts.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Chat", "Utility"], enabledByDefault: false,
    settings: {
        "log-deletes": { label: "Keep deleted messages", default: true },
        "log-edits": { label: "Keep edit history", default: true },
        "ignore-self": { label: "Ignore your own messages", default: false },
        "delete-style": { label: "Deleted message style", default: "Red text", options: ["Red text", "Faded"] }
    },
    async start({ settings, resources, api }) {
        const store = flackleStore<Messages>("pendingDeletes");
        const auth = flackleAuth();
        if (!store || !auth) throw new Error("Flackle's message or account store was not found");
        const deleted = new Map<string, string>();
        const edits = new Map<string, string[]>();
        const decorate = (row: HTMLElement): void => {
            const id = row.dataset.messageId!;
            row.classList.toggle("vackle-deleted", deleted.has(id));
            row.querySelector(".vackle-edit-history")?.remove();
            const content = row.querySelector("[data-message-content]");
            const history = edits.get(id);
            if (!content || !history) return;
            const box = Object.assign(document.createElement("div"), { className: "vackle-edit-history" });
            for (const text of history) {
                const line = Object.assign(document.createElement("div"), { textContent: text });
                line.append(Object.assign(document.createElement("span"), { textContent: "(edited)" }));
                box.append(line);
            }
            content.append(box);
        };
        const refresh = (id: string): void => document.querySelectorAll<HTMLElement>(`[data-message-id="${CSS.escape(id)}"]`).forEach(decorate);
        const original = store.getState().updateMessage;
        const update: Messages["updateMessage"] = (conversation, id, patch) => {
            const message = store.getState().cache[conversation]?.messages.find(entry => entry.id === id);
            const logged = message && !message.is_deleted && !(settings["ignore-self"] === true && message.sender?.id === auth.getState().user?.id);
            if (logged && patch.is_deleted === true && settings["log-deletes"] !== false) { deleted.set(id, conversation); refresh(id); return; }
            if (logged && settings["log-edits"] !== false && typeof patch.content === "string" && patch.edited_at && message.content && patch.content !== message.content)
                edits.set(id, [...edits.get(id) ?? [], message.content]);
            original(conversation, id, patch);
            if (edits.has(id)) refresh(id);
        };
        store.setState({ updateMessage: update });
        resources.add(() => {
            if (store.getState().updateMessage === update) store.setState({ updateMessage: original });
            for (const [id, conversation] of deleted) original(conversation, id, { is_deleted: true, content: "" });
        });
        api.observe("[data-message-id]", row => { decorate(row); return () => { row.classList.remove("vackle-deleted"); row.querySelector(".vackle-edit-history")?.remove(); }; });
        api.contextMenu({
            id: "remove-message-history", label: "Remove Message History", icon: "close", selector: "[data-message-id]",
            matches: target => deleted.has(target.dataset.messageId!) || edits.has(target.dataset.messageId!),
            run: target => {
                const id = target.dataset.messageId!; const conversation = deleted.get(id);
                edits.delete(id); deleted.delete(id);
                if (conversation) store.getState().removeMessage(conversation, id); else refresh(id);
            }
        });
        document.documentElement.dataset.vackleDeleteStyle = settings["delete-style"] === "Faded" ? "faded" : "red";
        resources.add(() => { delete document.documentElement.dataset.vackleDeleteStyle; });
        await resources.style("html[data-vackle-delete-style=red] .vackle-deleted [data-message-content]>:not(.vackle-edit-history){color:#f87171!important}html[data-vackle-delete-style=faded] .vackle-deleted{opacity:.45}.vackle-edit-history{color:rgb(255 255 255 / .45);font-size:.9rem;white-space:pre-wrap;overflow-wrap:anywhere}.vackle-edit-history span{margin-left:6px;font-size:.65rem;opacity:.8}");
    }
} satisfies Plugin;
