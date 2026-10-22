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

interface Fiber { memoizedProps?: unknown; return: Fiber | null; }
export function* fiberProps(node: Element, depth: number): Generator<Record<string, unknown>> {
    const key = Object.keys(node).find(name => name.startsWith("__reactFiber$"));
    let fiber = key ? (node as unknown as Record<string, Fiber | undefined>)[key] : undefined;
    for (let level = 0; fiber && level < depth; fiber = fiber.return ?? undefined, level++)
        if (typeof fiber.memoizedProps === "object" && fiber.memoizedProps !== null) yield fiber.memoizedProps as Record<string, unknown>;
}
export function holdComplete(button: Element): (() => void) | undefined {
    for (const props of fiberProps(button, 3)) if (props.isHoldToConfirm === true && typeof props.onHoldComplete === "function") return props.onHoldComplete as () => void;
    return undefined;
}
