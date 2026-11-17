import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePlugin } from "./pluginsManifest.mjs";

// Same cases as parses_plugin_metadata in the Vackle API, keep them in step.
test("reads the metadata lines", () => {
    const source = `
const x = { id: "pinned", name: "Pinned", collapsed: false };
export default {
    id: "clear-urls", name: "Clear URLs", description: "Removes \\"junk\\" like ?si= from links.",
    version: "1.0.0", author: "Xrm0s and contributors", tags: ["Chat", "Privacy"], enabledByDefault: false,
    start() {}
};`;
    assert.deepEqual(parsePlugin(source), {
        id: "clear-urls", name: "Clear URLs", description: 'Removes "junk" like ?si= from links.',
        version: "1.0.0", author: "Xrm0s and contributors", tags: ["Chat", "Privacy"]
    });
    assert.equal(parsePlugin("const a = 1;"), null);
});
