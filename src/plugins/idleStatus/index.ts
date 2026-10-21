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

interface Socket { setIdle(idle: boolean): void; }
interface Presence { setSelfIsIdle(idle: boolean): void; currentUserPreferredStatus: string | null; }

export default {
    id: "idle-status", name: "Idle Status", description: "Adds Idle to your status menu so you can go idle by hand. You stay idle until you pick another status.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Utility", "Privacy"], enabledByDefault: false,
    settings: { idle: { label: "Stay idle", default: false } },
    async start({ settings, setSetting, resources, api }) {
        const socket = flackleStore<Socket>("setIdle");
        const presence = flackleStore<Presence>("setSelfIsIdle");
        if (!socket || !presence) throw new Error("Flackle's presence stores were not found");
        const idle = settings.idle === true;
        const fail = (error: unknown): void => api.notify(error instanceof Error ? error.message : String(error), "error");
        if (idle) {
            const setIdle = socket.getState().setIdle; const setSelfIsIdle = presence.getState().setSelfIsIdle;
            const stay: Socket = { setIdle: () => setIdle(true) }; const stayHere = { setSelfIsIdle: () => setSelfIsIdle(true) };
            socket.setState(stay); presence.setState(stayHere);
            setIdle(true); setSelfIsIdle(true);
            resources.add(() => {
                if (socket.getState().setIdle === stay.setIdle) socket.setState({ setIdle });
                if (presence.getState().setSelfIsIdle === stayHere.setSelfIsIdle) presence.setState({ setSelfIsIdle });
                setIdle(false); setSelfIsIdle(false);
            });
        }
        api.command({ id: "idle", label: "Toggle Idle", description: "Switch between idle and your normal status.", run: () => setSetting("idle", !idle).catch(fail) });
        api.observe("[data-status-picker] button", option => {
            const label = option.querySelector("img")?.getAttribute("alt");
            if (label !== "Online") {
                if (!idle) return;
                const leave = (): void => void setSetting("idle", false).catch(fail);
                option.addEventListener("click", leave);
                return () => option.removeEventListener("click", leave);
            }
            const choice = option.cloneNode(true) as HTMLButtonElement; choice.dataset.vackleRoot = "";
            let choosing = false;
            const icon = choice.querySelector("img")!; icon.src = "/assets/idle.svg"; icon.alt = "Idle"; icon.removeAttribute("srcset");
            choice.querySelector("span")!.textContent = "Idle";
            const plain = [...option.parentElement?.querySelectorAll<HTMLButtonElement>(":scope > button:not([data-vackle-root])") ?? []].map(button => button.className).find(name => name.includes("hover:"));
            if (idle && plain) { choice.className = option.className; option.className = plain; }
            else if (plain) choice.className = plain;
            choice.addEventListener("click", () => { choosing = true; option.click(); choosing = false; if (!idle) void setSetting("idle", true).catch(fail); });
            const leave = (): void => { if (idle && !choosing) void setSetting("idle", false).catch(fail); };
            option.addEventListener("click", leave);
            option.after(choice);
            return () => { option.removeEventListener("click", leave); choice.remove(); };
        });
    }
} satisfies Plugin;
