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

export function rubberBand(pull: number, dimension: number, coefficient = 0.55): number {
    if (dimension <= 0 || pull === 0) return 0;
    const offset = (1 - 1 / ((coefficient * Math.abs(pull)) / dimension + 1)) * dimension;
    return pull < 0 ? -offset : offset;
}
export function rubberBanded(value: number, min: number, max: number, dimension: number): number {
    if (value > max) return max + rubberBand(value - max, dimension);
    if (value < min) return min - rubberBand(min - value, dimension);
    return value;
}
export interface Spring { to(next: number, releaseVelocity?: number): void; set(next: number): void; stop(): void; readonly value: number; }
export function createSpring(initial: number, onUpdate: (value: number) => void, { response = 0.35, dampingRatio = 1 } = {}): Spring {
    const stiffness = ((2 * Math.PI) / response) ** 2;
    const damping = (4 * Math.PI * dampingRatio) / response;
    let value = initial, velocity = 0, target = initial, frame = 0, last = 0;
    const step = (now: number): void => {
        const dt = Math.min((now - last) / 1000, 1 / 30);
        last = now;
        for (let i = 0; i < 4; i++) {
            velocity += (-stiffness * (value - target) - damping * velocity) * (dt / 4);
            value += velocity * (dt / 4);
        }
        if (Math.abs(velocity) < 1 && Math.abs(value - target) < 0.1) { value = target; velocity = 0; frame = 0; onUpdate(value); return; }
        onUpdate(value);
        frame = requestAnimationFrame(step);
    };
    return {
        to(next, releaseVelocity) {
            target = next;
            if (releaseVelocity !== undefined) velocity = releaseVelocity;
            if (!frame) { last = performance.now(); frame = requestAnimationFrame(step); }
        },
        set(next) { cancelAnimationFrame(frame); frame = 0; value = target = next; velocity = 0; onUpdate(value); },
        stop() { cancelAnimationFrame(frame); frame = 0; },
        get value() { return value; }
    };
}
