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

import type { Branding, Bridge, ResourceScope, Translation } from "../api/types";
import { log } from "../utils/logger";

export class Resources implements ResourceScope {
    private cleanups: (() => void | Promise<void>)[] = [];
    private disposed = false;
    constructor(private readonly id: string, private readonly bridge: Bridge) {}
    add(cleanup: () => void | Promise<void>): void {
        if (this.disposed) throw new Error("Resource scope is already disposed");
        this.cleanups.push(cleanup);
    }
    listen(target: EventTarget, event: string, listener: EventListener): void {
        this.add(() => target.removeEventListener(event, listener));
        target.addEventListener(event, listener);
    }
    async style(text: string): Promise<void> {
        const id = `${this.id}-${this.cleanups.length}`;
        this.add(() => this.bridge.style(id, ""));
        await this.bridge.style(id, text);
    }
    async reduceMotion(): Promise<void> {
        if (!this.bridge.motion) throw new Error("Motion emulation is unavailable");
        this.add(() => this.bridge.motion?.(false));
        await this.bridge.motion(true);
    }
    async branding(videoId: string): Promise<Branding> {
        if (!this.bridge.branding) throw new Error("DeArrow lookups are unavailable; run Vackle.exe and choose Repair");
        if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error("Invalid YouTube video ID");
        const result = await this.bridge.branding(videoId) as Partial<Branding> | null;
        return { title: typeof result?.title === "string" ? result.title : null,
            thumbnail: typeof result?.thumbnail === "number" && Number.isFinite(result.thumbnail) && result.thumbnail >= 0 ? result.thumbnail : null };
    }
    async openUri(uri: string): Promise<void> {
        if (!this.bridge.openUri) throw new Error("Opening apps is unavailable; run Vackle.exe and choose Repair");
        await this.bridge.openUri(uri);
    }
    async translate(text: string, from: string, to: string): Promise<Translation> {
        if (!this.bridge.translate) throw new Error("Translation is unavailable; run Vackle.exe and choose Repair");
        const result = await this.bridge.translate({ text, from, to }) as Partial<Translation> | null;
        if (typeof result?.text !== "string" || typeof result.sourceLanguage !== "string") throw new Error("Translation failed");
        return { sourceLanguage: result.sourceLanguage, text: result.text };
    }
    async dispose(): Promise<void> {
        this.disposed = true;
        for (const cleanup of this.cleanups.reverse()) {
            try { await cleanup(); } catch (error) { log(this.id, "Cleanup failed", error); }
        }
        this.cleanups = [];
    }
}
