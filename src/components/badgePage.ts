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

import { badgeElement } from "./customBadge";
import { flackleMe, flackleStore } from "./flackleStores";
import { openExternal } from "./openExternal";
import { element, heading } from "./primitives";
import { submitMessage, type BadgeCatalog, type BadgeLook } from "../shared/badgeDesign";

const SERVER = "368164686014713856";
const INVITE = "https://flackle.com/invite/vackle";
const SIZE = 128;
const MAX_FILE = 10 * 1024 * 1024;
const MAX_OUTPUT = 50 * 1024;

async function shrink(file: File): Promise<{ base64: string; url: string }> {
    if (file.size > MAX_FILE) throw new Error("That image is bigger than 10 MB.");
    const bitmap = await createImageBitmap(file).catch(() => { throw new Error("That file isn't an image."); });
    const side = Math.min(bitmap.width, bitmap.height);
    if (side < SIZE) throw new Error(`The image must be at least ${SIZE} × ${SIZE}.`);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Couldn't prepare the image.");
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
    bitmap.close();
    for (const quality of [0.9, 0.8, 0.7, 0.6, 0.5]) {
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", quality));
        if (!blob || blob.type !== "image/webp" || blob.size > MAX_OUTPUT) continue;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let text = "";
        for (let index = 0; index < bytes.length; index += 0x8000) text += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
        const base64 = btoa(text);
        return { base64, url: `data:image/webp;base64,${base64}` };
    }
    throw new Error("The image is still too big after shrinking. Try a simpler one.");
}

export function badgePage(submit: ((request: { user: string; image: string }) => Promise<unknown>) | undefined, notify: (message: string) => void, current?: () => Promise<BadgeCatalog>): HTMLElement {
    const root = element("div", "vackle-page");
    root.append(heading("Custom Badge", ""));
    const section = element("section", "vackle-section vackle-sync-section");
    const status = element("span", "vackle-hint", "");
    const head = element("div", "vackle-sync-head"); head.append(element("h3", "vackle-section-title", "Your badge"), status);
    const stage = element("div", "vackle-badge-stage");
    const hint = element("p", "vackle-hint", "Lifters only. Your image is cropped to a square and shrunk to 128 × 128. An admin approves it first, then it shows within a minute for everyone using Vackle.");

    let own: BadgeLook | undefined, chosen: { base64: string; url: string } | undefined, access: "checking" | "join" | "lift" | "ok" = "checking", invite = INVITE;
    let disposers: (() => void)[] = [];
    const slot = (label: string, ...nodes: HTMLElement[]): HTMLElement => {
        const item = element("div", "vackle-badge-slot"), row = element("div", "vackle-badge-slot-row");
        row.append(...nodes); item.append(row, element("span", "vackle-hint", label));
        return item;
    };
    const draw = (look: BadgeLook, sizes: number[], title: string): HTMLElement[] => sizes.map(size => { const item = badgeElement(look, size, title); disposers.push(item.dispose); return item.element; });
    const segment = (label: string, action: () => void): HTMLButtonElement => {
        const node = element("button", "", label); node.type = "button"; node.addEventListener("click", action); return node;
    };
    const input = element("input"); input.type = "file"; input.accept = "image/*"; input.hidden = true;
    const choose = segment("Choose image", () => input.click());
    const join = segment("Join the server", () => openExternal(invite, notify));
    let sending = false;
    const send = segment("Send for approval", () => {
        const user = flackleMe()?.id;
        if (!chosen || access !== "ok") return;
        if (!user) { notify("Couldn't find your Flackle account."); return; }
        if (!submit) { notify("Sending a badge isn't available here. Run Vackle.exe and choose Repair."); return; }
        sending = true; show();
        submit({ user, image: chosen.base64 }).then(result => notify(submitMessage(result)), () => notify("Couldn't reach Vackle right now. Try again later.")).finally(() => { sending = false; show(); });
    });
    const actions = element("div", "vackle-sync-actions");
    input.addEventListener("change", () => {
        const file = input.files?.[0];
        input.value = "";
        if (!file) return;
        shrink(file).then(result => { chosen = result; show(); }, (error: unknown) => notify(error instanceof Error ? error.message : "Couldn't use that image."));
    });

    function show(): void {
        for (const dispose of disposers) dispose();
        disposers = [];
        const blocked = access === "join" || access === "lift";
        const slots: HTMLElement[] = [];
        if (access === "join") slots.push(element("span", "vackle-hint", "Join the Vackle server to get your own badge. Badges are for people who lift the server."));
        else if (access === "lift") slots.push(element("span", "vackle-hint", "Badges are for people who lift the Vackle server. Lift it to unlock your own."));
        else {
            if (own) slots.push(slot("Current", ...draw(own, [48], "Your badge")));
            if (chosen) slots.push(slot("New", ...draw({ image: chosen.url }, [16, 24, 48], "Your new badge")));
            if (!slots.length) slots.push(element("span", "vackle-hint", "You don't have a badge yet. Choose an image to get started."));
        }
        stage.replaceChildren(...slots);
        status.textContent = access === "join" ? "Not in the server" : access === "lift" ? "Lifters only" : access === "checking" ? "Checking…" : own ? "Active" : "None yet";
        choose.disabled = blocked;
        send.disabled = blocked || sending || !chosen;
        actions.replaceChildren(...access === "join" ? [join] : [choose, send, input]);
    }

    const user = flackleMe()?.id;
    const servers = flackleStore<{ servers?: { id: string }[] }>("setServerNotificationLevel")?.getState().servers;
    const inServer = !servers?.length || servers.some(server => server.id === SERVER);
    if (!inServer) access = "join";
    else if (current && user) {
        current().then(catalog => {
            own = catalog.badges.find(badge => badge.user === user);
            invite = catalog.perk.link?.url ?? INVITE;
            access = own ? "ok" : "lift";
            show();
        }, () => { access = "ok"; status.textContent = "Couldn't check"; show(); });
    } else access = "ok";
    section.append(head, stage, actions, hint);
    root.append(section);
    show();
    return root;
}
