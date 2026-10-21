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

import type { Translation } from "../api/types";
import { isRecord } from "../settings/schema";

const language = (value: unknown, auto: boolean): value is string => typeof value === "string" && (auto && value === "auto" || /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(value));
export async function translateText(payload: unknown): Promise<Translation> {
    if (!isRecord(payload) || typeof payload.text !== "string" || !payload.text.trim() || payload.text.length > 5000 || !language(payload.from, true) || !language(payload.to, false))
        throw new Error("Invalid translation request");
    const response = await fetch("https://translate-pa.googleapis.com/v1/translate?" + new URLSearchParams({
        "params.client": "gtx", dataTypes: "TRANSLATION", key: "AIzaSyDLEeFI5OtFBwYBIoK_jj5m32rZK5CkCXA",
        "query.sourceLanguage": payload.from, "query.targetLanguage": payload.to, "query.text": payload.text
    }), { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Google Translate returned ${response.status}`);
    const data: unknown = await response.json();
    if (!isRecord(data) || typeof data.translation !== "string") throw new Error("Google Translate returned no translation");
    return { sourceLanguage: typeof data.sourceLanguage === "string" && language(data.sourceLanguage, false) ? data.sourceLanguage : payload.from, text: data.translation.slice(0, 20000) };
}
