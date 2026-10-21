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

import { randomUUID } from "node:crypto";
import type { BootstrapConfig } from "../api/types";
import { identifier, isRecord, validateSettings } from "../settings/schema";
import { Cdp, type ProtocolEvent } from "./cdp";
import { fetchBranding } from "./dearrow";
import { openUri } from "./openUri";
import { translateText } from "./translate";
import { loadSettings, saveSettings } from "./settingsFile";
import { adblockEnabled, attachFrame } from "./youtubeAdblock";
import type { Updates } from "./updater";
import { version } from "./version";

export class RendererSession {
    private readonly sheets = new Map<string, string>();
    private readonly navigations = new Map<string, string>();
    private readonly binding = `vackle_${randomUUID().replaceAll("-", "")}`;
    private scriptId: string | undefined;
    private config: BootstrapConfig | undefined;
    private requestQueue = Promise.resolve();
    private removeListener: (() => void) | undefined;
    constructor(readonly cdp: Cdp, private readonly root: string, private readonly source: string,
        private readonly session: string, private readonly hostVersion: string, private readonly onRestart?: () => void,
        private readonly updates?: Updates, private readonly onHandoff?: (staged: string) => void) {}
    private sourceText(): string {
        return `if(location.origin==="https://flackle.com"&&window.top===window){window.__VACKLE_CONFIG__=${JSON.stringify(this.config)};${this.source}\n}`;
    }
    async initialize(): Promise<void> {
        const native = await this.cdp.evaluate("location.origin==='https://flackle.com' && window.top===window && Boolean(window.__TAURI_INTERNALS__)");
        if (!native) throw new Error("Target is not the confirmed Flackle Tauri renderer");
        this.config = { version, hostVersion: this.hostVersion, session: this.session, binding: this.binding, settings: await loadSettings(this.root) };
        await this.cdp.send("Runtime.enable");
        await this.cdp.send("Page.enable");
        await this.cdp.send("DOM.enable");
        await this.cdp.send("CSS.enable");
        await this.cdp.send("Runtime.addBinding", { name: this.binding });
        this.removeListener = this.cdp.on(event => this.onEvent(event));
        await this.replaceScript();
        await this.ensure();
    }
    private autoAttach(): Promise<Record<string, unknown>> {
        const enabled = adblockEnabled(this.config?.settings);
        return this.cdp.send("Target.setAutoAttach", { autoAttach: enabled, waitForDebuggerOnStart: enabled, flatten: true });
    }
    private async replaceScript(): Promise<void> {
        if (this.scriptId) await this.cdp.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: this.scriptId });
        const result = await this.cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: this.sourceText() });
        if (typeof result.identifier !== "string") throw new Error("Document bootstrap registration failed");
        this.scriptId = result.identifier;
        await this.autoAttach();
    }
    private onEvent(event: ProtocolEvent): void {
        if (event.sessionId) return;
        if (event.method === "Page.frameStartedNavigating" && typeof event.params.frameId === "string" && typeof event.params.url === "string" && this.navigations.size < 256)
            this.navigations.set(event.params.frameId, event.params.url);
        if (event.method === "Target.attachedToTarget") {
            attachFrame(this.cdp, event.params, adblockEnabled(this.config?.settings), this.navigations)
                .catch(error => console.error("[Vackle:adblock] Frame attach failed:", error instanceof Error ? error.message : String(error)));
            return;
        }
        if (event.method === "Runtime.executionContextsCleared") { this.sheets.clear(); this.navigations.clear(); }
        if (event.method !== "Runtime.bindingCalled" || event.params.name !== this.binding || typeof event.params.payload !== "string" ||
            typeof event.params.executionContextId !== "number") return;
        const payload = event.params.payload;
        const context = event.params.executionContextId;
        this.requestQueue = this.requestQueue.then(() => this.request(payload, context)).catch(error => {
            console.error("[Vackle:bridge] Request failed:", error instanceof Error ? error.message : String(error));
        });
    }
    private async request(raw: string, context: number): Promise<void> {
        if (raw.length > 3300000) throw new Error("Bridge request too large");
        const trusted = await this.cdp.evaluate("location.origin==='https://flackle.com' && window.top===window && Boolean(window.__TAURI_INTERNALS__)", context);
        if (!trusted) throw new Error("Bridge request from untrusted context");
        const request: unknown = JSON.parse(raw);
        if (!isRecord(request) || !Number.isSafeInteger(request.id) || typeof request.id !== "number" || request.id <= 0)
            throw new Error("Invalid bridge request");
        const payload = request.payload;
        const updates = this.updates;
        let staged: string | undefined;
        const lookup = request.method === "branding" && typeof payload === "string" ? () => fetchBranding(payload) : request.method === "translate" ? () => translateText(payload)
            : request.method === "update-status" && updates ? () => updates.status(payload === true)
            : request.method === "update-install" && updates && this.onHandoff ? async () => { staged = await updates.stage(); return null; } : undefined;
        if (lookup) {
            const id = request.id;
            void lookup().then(result => [null, result] as const, (error: unknown) => [error instanceof Error ? error.message : String(error), null] as const)
                .then(([error, result]) => this.cdp.evaluate(`window.__VACKLE__?.resolve(${id},${JSON.stringify(error)},${JSON.stringify(result)})`, context))
                .then(() => { if (staged) this.onHandoff?.(staged); })
                .catch(error => console.error("[Vackle:bridge] Lookup reply failed:", error instanceof Error ? error.message : String(error)));
            return;
        }
        let failure: string | null = null;
        let restart = false;
        try {
            if (request.method === "save") {
                const settings = validateSettings(request.payload);
                await saveSettings(this.root, settings);
                if (this.config) this.config.settings = settings;
                await this.replaceScript();
            } else if (request.method === "style") {
                const payload = request.payload;
                if (!isRecord(payload) || !identifier(payload.id) || typeof payload.text !== "string" || payload.text.length > 524288)
                    throw new Error("Invalid stylesheet operation");
                let sheet = this.sheets.get(payload.id);
                if (!sheet) {
                    if (this.sheets.size >= 256) throw new Error("Too many stylesheets");
                    const tree = await this.cdp.send("Page.getFrameTree");
                    if (!isRecord(tree.frameTree) || !isRecord(tree.frameTree.frame) || typeof tree.frameTree.frame.id !== "string")
                        throw new Error("Cannot identify the main frame");
                    const result = await this.cdp.send("CSS.createStyleSheet", { frameId: tree.frameTree.frame.id, force: true });
                    if (typeof result.styleSheetId !== "string") throw new Error("Cannot create inspector stylesheet");
                    sheet = result.styleSheetId;
                    this.sheets.set(payload.id, sheet);
                }
                if (sheet) await this.cdp.send("CSS.setStyleSheetText", { styleSheetId: sheet, text: payload.text });
            } else if (request.method === "uri" && typeof request.payload === "string") {
                openUri(request.payload);
            } else if (request.method === "motion" && typeof request.payload === "boolean") {
                await this.cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: request.payload ? "reduce" : "" }] });
            } else if (request.method === "update-skip" && typeof request.payload === "string" && this.updates) {
                await this.updates.skip(request.payload);
            } else if (request.method === "restart" && request.payload === null && this.onRestart) {
                await loadSettings(this.root);
                restart = true;
            } else throw new Error("Unknown bridge operation");
        } catch (error) { failure = error instanceof Error ? error.message : String(error); console.error(`[Vackle:bridge] ${failure}`); }
        await this.cdp.evaluate(`window.__VACKLE__?.resolve(${request.id},${JSON.stringify(failure)})`, context);
        if (restart && !failure) this.onRestart?.();
    }
    async ensure(): Promise<unknown> {
        const state = await this.cdp.evaluate("({origin:location.origin,native:Boolean(window.__TAURI_INTERNALS__),loaded:Boolean(window.__VACKLE__),ready:Boolean(window.__VACKLE__?.ready),session:window.__VACKLE__?.session,version:window.__VACKLE__?.version,hostVersion:window.__VACKLE__?.hostVersion,plugins:window.__VACKLE__?.plugins()})");
        if (isRecord(state) && state.origin === "https://flackle.com" && state.native && !state.loaded)
            await this.cdp.evaluate(this.sourceText(), undefined, false);
        return state;
    }
    async dispose(): Promise<void> {
        if (this.cdp.connected) {
            if (this.scriptId) await this.cdp.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: this.scriptId });
            await this.cdp.evaluate("window.__VACKLE__?.shutdown()") ;
            await this.requestQueue;
            for (const sheet of this.sheets.values()) await this.cdp.send("CSS.setStyleSheetText", { styleSheetId: sheet, text: "" });
            await this.cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "" }] });
            await this.cdp.send("Runtime.removeBinding", { name: this.binding });
            await this.cdp.send("Target.setAutoAttach", { autoAttach: false, waitForDebuggerOnStart: false, flatten: true });
        }
        this.removeListener?.();
        this.cdp.close();
    }
}
