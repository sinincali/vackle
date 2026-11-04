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

import type { Bridge, Plugin } from "../../api/types";
import { uiIcon } from "../../components/icons";
import { button, element } from "../../components/primitives";
import { saveFile } from "../../components/saveFile";

export const sounds = [
    ["new_notification", "New message", "Messages"],
    ["call_incoming", "Incoming call", "Calls"], ["call_outgoing", "Outgoing call", "Calls"],
    ["join_vc", "Join voice", "Voice"], ["leave_vc", "Leave voice", "Voice"], ["user_moved", "Moved to another channel", "Voice"],
    ["mute", "Mute", "Voice"], ["unmute", "Unmute", "Voice"], ["deafen", "Deafen", "Voice"], ["undeafen", "Undeafen", "Voice"],
    ["push_to_talk_activate", "Push to talk on", "Voice"], ["push_to_talk_deactivate", "Push to talk off", "Voice"], ["vc_connection_error", "Connection error", "Voice"],
    ["screenshare_create", "Start sharing your screen", "Screen share"], ["screenshare_stop", "Stop sharing your screen", "Screen share"],
    ["screenshare_join", "Join a stream", "Screen share"], ["screenshare_leave", "Leave a stream", "Screen share"],
    ["viewer_screenshare_join", "Someone watches your stream", "Screen share"], ["viewer_screenshare_leave", "Someone stops watching", "Screen share"]
] as const;
type Mode = "default" | "off" | "custom";
export interface Sound { mode: Mode; volume: number; file?: string; }
const ids = new Set<string>(sounds.map(([id]) => id));
const maxBytes = 1024 * 1024;

export function parseConfig(value: unknown): Record<string, Sound> {
    let raw: unknown;
    try { raw = typeof value === "string" ? JSON.parse(value) : value; } catch { raw = undefined; }
    const source = raw && typeof raw === "object" ? raw as Record<string, Partial<Sound> | undefined> : {};
    return Object.fromEntries(sounds.map(([id]) => {
        const entry = source[id];
        const mode: Mode = entry?.mode === "off" || entry?.mode === "custom" ? entry.mode : "default";
        const volume = typeof entry?.volume === "number" && Number.isFinite(entry.volume) ? Math.min(100, Math.max(0, Math.round(entry.volume))) : 100;
        return [id, { mode, volume, ...typeof entry?.file === "string" && entry.file ? { file: entry.file.slice(0, 80) } : {} }];
    }));
}
export const serialize = (config: Record<string, Sound>): string =>
    JSON.stringify(Object.fromEntries(Object.entries(config).filter(([, sound]) => sound.mode !== "default" || sound.volume !== 100 || sound.file)));

function files<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
        const open = indexedDB.open("vackle-sounds", 1);
        open.onupgradeneeded = () => open.result.createObjectStore("files");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
            const db = open.result, tx = db.transaction("files", mode), request = run(tx.objectStore("files"));
            tx.oncomplete = () => { db.close(); resolve(request ? request.result : undefined); };
            tx.onerror = () => { db.close(); reject(tx.error); };
        };
    });
}
const readFile = (id: string): Promise<Blob | undefined> => files<Blob>("readonly", store => store.get(id) as IDBRequest<Blob>);
const writeFile = (id: string, blob: Blob): Promise<unknown> => files("readwrite", store => { store.put(blob, id); });
const removeFile = (id: string): Promise<unknown> => files("readwrite", store => { store.delete(id); });
const dataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
});
export function dataBlob(data: string): Blob | undefined {
    const match = /^data:(audio\/[\w.+-]+)(?:;[\w=-]+)*;base64,([A-Za-z0-9+/=\s]+)$/.exec(data);
    if (!match) return undefined;
    try { return new Blob([Uint8Array.from(atob(match[2]!.replace(/\s/g, "")), char => char.charCodeAt(0))], { type: match[1]! }); } catch { return undefined; }
}
const audioFile = (blob: Blob): string | undefined => !blob.type.startsWith("audio/") ? "That isn't an audio file" : blob.size > maxBytes ? "Sounds must be 1 MB or smaller" : undefined;

function soundSettings(value: unknown, save: (next: string) => void, notify: (message: string) => void, tools: Pick<Bridge, "fetchSound">): HTMLElement {
    const config = parseConfig(value);
    const root = element("div", "vackle-sounds");
    const summary = element("p", "vackle-sounds-summary");
    let editing: string | undefined;
    const commit = (): void => { save(serialize(config)); draw(); };
    let playing: { audio: HTMLAudioElement; id: string; control: HTMLElement; watch: ReturnType<typeof setInterval> } | undefined;
    const showIcon = (control: HTMLElement, on: boolean): void => { control.classList.toggle("is-playing", on); control.replaceChildren(uiIcon(on ? "stop" : "play", 14)); control.title = on ? "Stop" : "Preview"; };
    const stop = (): void => { if (!playing) return; playing.audio.pause(); clearInterval(playing.watch); showIcon(playing.control, false); playing = undefined; };
    const preview = async (id: string, control: HTMLElement): Promise<void> => {
        const wasPlaying = playing?.id === id; stop();
        if (wasPlaying) return;
        const sound = config[id]!;
        const blob = sound.mode === "custom" ? await readFile(id) : undefined;
        stop();
        if (!root.isConnected) return;
        const url = blob ? URL.createObjectURL(blob) : `${location.origin}/audio/${id}.mp3`;
        const audio = new Audio(url); audio.volume = sound.volume / 100;
        playing = { audio, id, control, watch: setInterval(() => { if (!root.isConnected) stop(); }, 150) }; showIcon(control, true);
        audio.addEventListener("ended", () => { if (playing?.audio === audio) stop(); if (blob) URL.revokeObjectURL(url); });
        await audio.play().catch(() => { stop(); notify("Could not play that sound"); });
    };
    const useSound = async (id: string, blob: Blob, name: string): Promise<void> => {
        const problem = audioFile(blob);
        if (problem) { notify(problem); return; }
        await writeFile(id, blob);
        if (playing?.id === id) stop();
        config[id] = { ...config[id]!, mode: "custom", file: name.slice(0, 80) }; editing = undefined; commit();
    };
    const picker = element("input"); picker.type = "file"; picker.accept = "audio/*"; picker.hidden = true;
    let picking = "";
    picker.addEventListener("change", () => {
        const file = picker.files?.[0]; picker.value = "";
        if (file && picking) void useSound(picking, file, file.name).catch(() => notify("Could not save that sound"));
    });
    const useLink = async (id: string, link: string, control: HTMLButtonElement): Promise<void> => {
        if (!tools.fetchSound) { notify("Links only work in the desktop app. Choose a file instead"); return; }
        let url: URL;
        try { url = new URL(link.trim()); } catch { notify("Paste a full link that starts with https://"); return; }
        if (url.protocol !== "https:") { notify("Only https:// links are allowed"); return; }
        control.disabled = true; control.textContent = "Downloading…";
        try {
            const result = await tools.fetchSound(url.href) as { type?: unknown; data?: unknown } | null;
            const blob = typeof result?.type === "string" && typeof result.data === "string" ? dataBlob(`data:${result.type};base64,${result.data}`) : undefined;
            if (!blob) throw new Error("That link isn't an audio file");
            let name = url.pathname.split("/").pop() ?? "";
            try { name = decodeURIComponent(name); } catch { }
            await useSound(id, blob, name || url.hostname);
        } catch (error) { notify(error instanceof Error ? error.message : String(error)); control.disabled = false; control.textContent = "Use link"; }
    };
    const sourcePanel = (id: string): HTMLElement => {
        const panel = element("div", "vackle-sound-source");
        const input = element("input", "vackle-input"); input.type = "url"; input.placeholder = "Paste an https:// link to an mp3, ogg or wav"; input.setAttribute("aria-label", "Sound link"); input.maxLength = 2048;
        const use = button("Use link", () => void useLink(id, input.value, use), "vackle-primary");
        input.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); use.click(); } if (event.key === "Escape") { event.stopPropagation(); editing = undefined; draw(); } });
        const file = button("Choose file", () => { picking = id; picker.click(); }, "vackle-ghost", "import");
        const cancel = button("Cancel", () => { editing = undefined; draw(); }, "vackle-ghost");
        panel.append(input, use, file, cancel);
        setTimeout(() => input.focus());
        return panel;
    };
    const choose = (id: string): void => { editing = editing === id ? undefined : id; draw(); };
    const list = element("div", "vackle-sound-groups");
    const draw = (): void => {
        const custom = Object.values(config).filter(sound => sound.mode === "custom").length, off = Object.values(config).filter(sound => sound.mode === "off").length;
        summary.textContent = custom || off ? [custom && `${custom} custom`, off && `${off} muted`].filter(Boolean).join(" · ") : "Every sound is using Flackle's default";
        list.replaceChildren(...[...new Set(sounds.map(([, , group]) => group))].map(group => {
            const section = element("section", "vackle-sound-group");
            const rows = element("div", "vackle-sound-list");
            for (const [id, name] of sounds.filter(([, , entry]) => entry === group)) {
                const sound = config[id]!;
                const row = element("div", "vackle-sound"); row.dataset.mode = sound.mode;
                const play = element("button", "vackle-sound-play"); play.type = "button"; play.append(uiIcon("play", 14));
                play.setAttribute("aria-label", `Preview ${name}`); play.title = "Preview"; play.disabled = sound.mode === "off";
                play.addEventListener("click", () => void preview(id, play));
                if (playing?.id === id) { playing.control = play; showIcon(play, true); }
                const info = element("div", "vackle-sound-info");
                const detail = element("span", "vackle-sound-detail", sound.mode === "off" ? "Muted" : sound.mode === "custom" ? sound.file ?? "Custom sound" : "Flackle default");
                if (sound.mode === "custom") { const change = element("button", "vackle-sound-change", "Change"); change.type = "button"; change.addEventListener("click", () => choose(id)); detail.append(" · ", change); }
                info.append(element("span", "vackle-sound-name", name), detail);
                const volume = element("input", "vackle-sound-volume"); volume.type = "range"; volume.min = "0"; volume.max = "100"; volume.step = "5"; volume.value = String(sound.volume);
                volume.setAttribute("aria-label", `${name} volume`); volume.disabled = sound.mode === "off"; volume.style.setProperty("--level", `${sound.volume}%`);
                const level = element("span", "vackle-sound-level", `${sound.volume}%`);
                volume.addEventListener("input", () => { sound.volume = volume.valueAsNumber; level.textContent = `${sound.volume}%`; volume.style.setProperty("--level", `${sound.volume}%`); if (playing?.id === id) playing.audio.volume = sound.volume / 100; });
                volume.addEventListener("change", () => save(serialize(config)));
                const modes = element("div", "vackle-segmented"); modes.setAttribute("role", "radiogroup"); modes.setAttribute("aria-label", `${name} sound`);
                for (const [mode, label] of [["default", "Default"], ["off", "Off"], ["custom", "Custom"]] as const) {
                    const option = element("button", "", label); option.type = "button"; option.dataset.value = mode;
                    option.setAttribute("role", "radio"); option.setAttribute("aria-checked", String(sound.mode === mode));
                    option.addEventListener("click", () => {
                        if (mode === "custom" && !sound.file) { choose(id); return; }
                        if (playing?.id === id) stop();
                        config[id] = { ...sound, mode }; commit();
                    });
                    modes.append(option);
                }
                const controls = element("div", "vackle-sound-controls"); controls.append(volume, level, modes);
                row.append(play, info, controls); rows.append(row);
                if (editing === id) rows.append(sourcePanel(id));
            }
            section.append(element("h3", "", group), rows);
            return section;
        }));
    };
    const exportPack = async (): Promise<void> => {
        const pack: Record<string, Sound & { data?: string }> = {};
        for (const [id, sound] of Object.entries(config)) {
            const blob = sound.file ? await readFile(id) : undefined;
            pack[id] = { ...sound, ...blob ? { data: await dataUrl(blob) } : {} };
        }
        if (await saveFile("vackle-sounds.json", async () => new Blob([JSON.stringify({ vackle: "sounds", version: 1, sounds: pack })], { type: "application/json" }))) notify("Sound pack exported");
    };
    const importer = element("input"); importer.type = "file"; importer.accept = ".json,application/json"; importer.hidden = true;
    importer.addEventListener("change", () => {
        const file = importer.files?.[0]; importer.value = "";
        if (!file) return;
        void (async () => {
            const pack = JSON.parse(await file.text()) as { sounds?: Record<string, Partial<Sound> & { data?: unknown }> };
            if (!pack?.sounds || typeof pack.sounds !== "object") throw new Error("That isn't a Vackle sound pack");
            const incoming = parseConfig(pack.sounds);
            let count = 0;
            for (const [id, entry] of Object.entries(pack.sounds)) {
                if (!ids.has(id)) continue;
                const next = incoming[id]!;
                const blob = typeof entry?.data === "string" ? dataBlob(entry.data) : undefined;
                if (blob) {
                    if (audioFile(blob)) continue;
                    await writeFile(id, blob);
                } else if (next.mode === "custom") { next.mode = "default"; delete next.file; }
                config[id] = next; count++;
            }
            commit(); notify(`Imported ${count} sound${count === 1 ? "" : "s"}`);
        })().catch(error => notify(error instanceof SyntaxError ? "That isn't a Vackle sound pack" : error instanceof Error ? error.message : String(error)));
    });
    const reset = async (): Promise<void> => {
        stop();
        for (const [id] of sounds) { config[id] = { mode: "default", volume: 100 }; await removeFile(id).catch(() => undefined); }
        commit(); notify("All sounds reset");
    };
    const bar = element("div", "vackle-sounds-bar");
    const actions = element("div", "vackle-actions");
    actions.append(
        button("Import", () => importer.click(), "vackle-ghost", "import"),
        button("Export", () => void exportPack().catch(error => notify(error instanceof Error ? error.message : String(error))), "vackle-ghost"),
        button("Reset all", () => void reset(), "vackle-ghost"),
        picker, importer);
    bar.append(summary, actions);
    root.append(bar, list);
    draw();
    return root;
}

export default {
    id: "custom-sounds", name: "Custom Sounds", description: "Change, mute or set the volume of every sound Flackle makes. You can use your own audio files and share sound packs.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Customisation", "Notifications"], enabledByDefault: false,
    settings: {
        sounds: { label: "Sounds", default: "{}", render: (value, save, notify, tools) => soundSettings(value, save, notify, tools) }
    },
    async start({ settings, resources, api, log }) {
        const config = parseConfig(settings.sounds);
        const urls = new Map<string, string>();
        for (const [id, sound] of Object.entries(config)) {
            if (sound.mode !== "custom") continue;
            const blob = await readFile(id).catch(error => { log(`Could not load the custom ${id} sound`, error); return undefined; });
            if (blob) urls.set(id, URL.createObjectURL(blob));
        }
        const known = new Map<HTMLMediaElement, string>();
        api.patch(HTMLMediaElement.prototype, "play", original => function (this: HTMLMediaElement) {
            let id = known.get(this);
            if (!id) {
                const match = /^\/audio\/([a-z_]+)\.mp3$/.exec(this.getAttribute("src") ?? "");
                if (match && ids.has(match[1]!)) { id = match[1]!; known.set(this, id); this.dataset.vackleSound = id; }
            }
            if (id) {
                const sound = config[id]!;
                if (sound.mode === "off") return Promise.resolve();
                const source = (sound.mode === "custom" && urls.get(id)) || `/audio/${id}.mp3`;
                if (this.getAttribute("src") !== source) this.src = source;
                this.volume = sound.volume / 100;
            }
            return original.call(this);
        });
        resources.add(() => {
            for (const [audio, id] of known) { audio.src = `/audio/${id}.mp3`; audio.volume = 1; }
            for (const url of urls.values()) URL.revokeObjectURL(url);
        });
    }
} satisfies Plugin;
