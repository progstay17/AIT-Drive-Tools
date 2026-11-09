import test from "node:test";
import assert from "node:assert/strict";
import { GatewayClient } from "../src/gateway.js";

test("refuses requests without a dedicated token", async () => {
  const client = new GatewayClient({ baseUrl: "https://drive.example.com" });
  await assert.rejects(() => client.list(), /AIT_DRIVE_TOKEN is missing/);
});
test("does not fall back to browser cookie sessions", async () => {
  const client = new GatewayClient({ baseUrl: "https://drive.example.com" });
  await assert.rejects(() => client.search("report"), /Create a scoped Personal Access Token/);
});

test("sends the PAT as Bearer auth without browser cookies or CSRF headers", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedHeaders = new Headers();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedHeaders = new Headers(init?.headers);
    return new Response(JSON.stringify({ path: "", items: [] }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;
  try {
    const client = new GatewayClient({ baseUrl: "https://drive.example.com", token: "aitd_test.secret" });
    await client.list("Reports");
    assert.equal(capturedUrl, "https://drive.example.com/api/list?path=Reports");
    assert.equal(capturedHeaders.get("Authorization"), "Bearer aitd_test.secret");
    assert.equal(capturedHeaders.has("Cookie"), false);
    assert.equal(capturedHeaders.has("X-Requested-With"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("account context uses the authenticated Gateway endpoint", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    id: "worker", name: "worker", role: "user", quota: 1024, perms: { upload: true }, canAdmin: false
  }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;
  try {
    const result = await new GatewayClient({ baseUrl: "https://drive.example.com", token: "aitd_test.secret" }).me();
    assert.equal(result.id, "worker");
    assert.equal(result.canAdmin, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
