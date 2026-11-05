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

const parseHeaders = (raw: string): Headers => {
    const headers = new Headers();
    for (const line of raw.split(/\r?\n/)) {
        const split = line.indexOf(":");
        if (split > 0) try { headers.append(line.slice(0, split).trim(), line.slice(split + 1).trim()); } catch { }
    }
    return headers;
};
export function gmFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
    return new Promise((resolve, reject) => {
        const signal = init.signal;
        if (signal?.aborted) return reject(signal.reason);
        const request = GM_xmlhttpRequest({
            method: init.method ?? "GET", url: String(input), headers: Object.fromEntries(new Headers(init.headers)),
            ...typeof init.body === "string" ? { data: init.body } : {}, responseType: "arraybuffer", anonymous: true,
            onload: response => {
                if (response.status < 200 || response.status > 599) return reject(new TypeError(`Request to ${String(input)} failed`));
                resolve(new Response([204, 205, 304].includes(response.status) ? null : response.response,
                    { status: response.status, statusText: response.statusText, headers: parseHeaders(response.responseHeaders ?? "") }));
            },
            onerror: () => reject(new TypeError(`Request to ${String(input)} failed`)),
            ontimeout: () => reject(new TypeError(`Request to ${String(input)} timed out`))
        });
        signal?.addEventListener("abort", () => { request.abort(); reject(signal.reason); }, { once: true });
    });
}
export { gmFetch as fetch };
