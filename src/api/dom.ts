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

import { log } from "../utils/logger";

interface Subscription {
    selector: string;
    attach(element: HTMLElement): void | (() => void);
    attached: Map<HTMLElement, () => void>;
}
export class DomObserver {
    private readonly subscriptions = new Set<Subscription>();
    private readonly observer: MutationObserver;
    private readonly added = new Set<HTMLElement>();
    private removed = false;
    private scheduled = false;
    readonly metrics = { batches: 0, queries: 0, attachments: 0 };
    constructor() {
        this.observer = new MutationObserver(records => {
            for (const record of records) {
                if (record.type === "attributes" && record.target instanceof HTMLElement) {
                    for (const subscription of this.subscriptions) {
                        const cleanup = subscription.attached.get(record.target);
                        if (cleanup) { this.cleanup(cleanup); subscription.attached.delete(record.target); }
                    }
                    this.added.add(record.target);
                }
                if ([...record.removedNodes].some(node => node instanceof Element)) this.removed = true;
                for (const node of record.addedNodes) if (node instanceof HTMLElement && !node.closest("[data-vackle-root],#vackle-toolbox-menu")) this.added.add(node);
            }
            if (this.scheduled || !this.added.size && !this.removed) return;
            this.scheduled = true;
            queueMicrotask(() => {
                this.scheduled = false;
                this.metrics.batches++;
                for (const subscription of this.subscriptions) {
                    if (this.removed) for (const [element, cleanup] of subscription.attached) {
                        if (!element.isConnected) { this.cleanup(cleanup); subscription.attached.delete(element); }
                    }
                    for (const node of this.added) if (node.isConnected) {
                        let parent = node.parentElement;
                        while (parent && !this.added.has(parent)) parent = parent.parentElement;
                        if (!parent) this.scan(subscription, node);
                    }
                }
                this.added.clear(); this.removed = false;
            });
        });
    }
    observe(selector: string, attach: (element: HTMLElement) => void | (() => void)): () => void {
        document.querySelector(selector);
        const subscription = { selector, attach, attached: new Map<HTMLElement, () => void>() };
        if (!this.subscriptions.size) this.observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
        this.subscriptions.add(subscription);
        this.scan(subscription, document.body);
        return () => {
            this.subscriptions.delete(subscription);
            for (const cleanup of subscription.attached.values()) this.cleanup(cleanup);
            subscription.attached.clear();
            if (!this.subscriptions.size) { this.observer.disconnect(); this.added.clear(); }
        };
    }
    private cleanup(cleanup: () => void): void { try { cleanup(); } catch (error) { log("DOM", "Extension cleanup failed", error); } }
    private scan(subscription: Subscription, root: HTMLElement): void {
        if (root.childElementCount) this.metrics.queries++;
        const elements = root.childElementCount ? [...root.querySelectorAll<HTMLElement>(subscription.selector)] : [];
        if (root.matches(subscription.selector)) elements.unshift(root);
        for (const element of elements) {
            if (subscription.attached.has(element) || element.closest("[data-vackle-root],#vackle-toolbox-menu")) continue;
            try { subscription.attached.set(element, subscription.attach(element) ?? (() => {})); this.metrics.attachments++; }
            catch (error) { log("DOM", "Extension failed", error); subscription.attached.set(element, () => {}); }
        }
    }
    dispose(): void {
        this.observer.disconnect();
        for (const subscription of this.subscriptions) for (const cleanup of subscription.attached.values()) this.cleanup(cleanup);
        this.subscriptions.clear(); this.added.clear();
    }
}
