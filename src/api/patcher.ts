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

type Wrap = (original: (...args: unknown[]) => unknown) => (...args: unknown[]) => unknown;
interface Chain { descriptor: PropertyDescriptor; original: (...args: unknown[]) => unknown; wraps: Wrap[]; current: unknown; }

export class Patcher {
    private readonly targets = new Map<object, Map<PropertyKey, Chain>>();
    patch(target: object, key: PropertyKey, wrap: Wrap): () => void {
        const keys = this.targets.get(target) ?? new Map<PropertyKey, Chain>();
        let chain = keys.get(key);
        if (chain && Reflect.get(target, key) !== chain.current) throw new Error("Patch changed externally; refusing to overwrite it");
        if (!chain) {
            const descriptor = Object.getOwnPropertyDescriptor(target, key);
            const original: unknown = Reflect.get(target, key);
            if (!descriptor || !("value" in descriptor) || descriptor.configurable === false || typeof original !== "function") throw new Error("Patch target must be an owned configurable function");
            chain = { descriptor, original: original as (...args: unknown[]) => unknown, wraps: [], current: original };
        }
        const active = chain;
        this.build(target, key, active, [...active.wraps, wrap]);
        keys.set(key, active);
        this.targets.set(target, keys);
        return () => {
            if (!active.wraps.includes(wrap)) return;
            if (Reflect.get(target, key) !== active.current) throw new Error("Patch changed externally; refusing to overwrite it");
            const rest = active.wraps.filter(entry => entry !== wrap);
            if (rest.length) { this.build(target, key, active, rest); return; }
            Object.defineProperty(target, key, active.descriptor);
            keys.delete(key);
            if (!keys.size) this.targets.delete(target);
        };
    }
    private build(target: object, key: PropertyKey, chain: Chain, wraps: Wrap[]): void {
        let replacement: (...args: unknown[]) => unknown = (...args) => Reflect.apply(chain.original, target, args) as unknown;
        for (const wrap of wraps) {
            const next: unknown = wrap(replacement);
            if (typeof next !== "function") throw new Error("Patch wrapper must return a function");
            replacement = next as (...args: unknown[]) => unknown;
        }
        Object.defineProperty(target, key, { ...chain.descriptor, value: replacement });
        chain.wraps = wraps; chain.current = replacement;
    }
}
