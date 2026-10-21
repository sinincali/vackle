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

export interface FlackleRole { id: string; name: string; color: string | null; iconUrl: string | null; hasIcon: boolean; }
interface Fiber { memoizedProps?: unknown; return: Fiber | null; }
function roleOf(value: unknown): FlackleRole | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const role = value as Record<string, unknown>;
    if (typeof role.id !== "string" || typeof role.name !== "string") return undefined;
    return { id: role.id, name: role.name, color: typeof role.color === "string" && role.color ? role.color : null,
        iconUrl: typeof role.icon_url === "string" && /^https:\/\//.test(role.icon_url) ? role.icon_url : null, hasIcon: Boolean(role.icon_url || role.icon_emoji) };
}
export function roleFromElement(target: Element): FlackleRole | undefined {
    for (let node: Element | null = target, depth = 0; node && depth < 3; node = node.parentElement, depth++) {
        const key = Object.keys(node).find(name => name.startsWith("__reactFiber$"));
        let fiber = key ? (node as unknown as Record<string, Fiber | undefined>)[key] : undefined;
        for (let level = 0; fiber && level < 3; fiber = fiber.return ?? undefined, level++) {
            const props = fiber.memoizedProps;
            if (typeof props !== "object" || props === null) continue;
            const { role, children } = props as { role?: unknown; children?: unknown };
            const first: unknown = Array.isArray(children) ? children[0] : undefined;
            const found = roleOf(role) ?? (typeof first === "object" && first !== null ? roleOf((first as { props?: { role?: unknown } }).props?.role) : undefined);
            if (found) return found;
        }
    }
    return undefined;
}
export interface ServerRole { id: string; color?: string | null; position: number; is_everyone?: boolean; }
export function roleColor(roles: readonly ServerRole[], roleIds: readonly string[]): string | undefined {
    return roles.filter(role => role.color && !role.is_everyone && roleIds.includes(role.id)).sort((a, b) => b.position - a.position)[0]?.color ?? undefined;
}
export function copyText(text: string, notify: (message: string, level?: "info" | "error") => void, copied?: string): void {
    Promise.resolve().then(() => navigator.clipboard.writeText(text)).then(() => { if (copied) notify(copied); }).catch(error => notify(`Couldn't copy: ${error instanceof Error ? error.message : String(error)}`, "error"));
}
