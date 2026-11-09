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


test("maps Drive mutations to the Gateway API with Bearer auth", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string; body?: string; authorization: string | null }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input), method: init?.method || "GET",
      body: typeof init?.body === "string" ? init.body : undefined,
      authorization: new Headers(init?.headers).get("Authorization")
    });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    const client = new GatewayClient({ baseUrl: "https://drive.example.com", token: "pat-secret" });
    await client.mkdir("Projects", "New");
    await client.rename("Projects/New", "Renamed");
    await client.move("Projects/Renamed", "Archive");
    await client.delete("Archive/Renamed");
    await client.restore("trash-id");
    assert.deepEqual(calls.map((x) => new URL(x.url).pathname), [
      "/api/mkdir", "/api/rename", "/api/move", "/api/delete", "/api/trash/restore"
    ]);
    assert.ok(calls.every((x) => x.authorization === "Bearer pat-secret"));
    assert.deepEqual(JSON.parse(calls[1].body || "{}"), { path: "Projects/New", newName: "Renamed" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("streams local file upload as multipart data", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "ait-tools-upload-"));
  const local = join(dir, "sample.txt");
  await writeFile(local, "streamed payload");
  const originalFetch = globalThis.fetch;
  let multipart = "";
  let requestUrl = "";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestUrl = String(input);
    const chunks: Buffer[] = [];
    for await (const chunk of init?.body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
    multipart = Buffer.concat(chunks).toString("utf8");
    return new Response(JSON.stringify({ saved: ["sample.txt"] }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    const result = await new GatewayClient({ baseUrl: "https://drive.example.com", token: "pat-secret" }).upload(local, "Incoming");
    assert.equal(new URL(requestUrl).pathname, "/api/upload");
    assert.equal(new URL(requestUrl).searchParams.get("path"), "Incoming");
    assert.match(multipart, /name="file"; filename="sample.txt"/);
    assert.match(multipart, /streamed payload/);
    assert.deepEqual(result.saved, ["sample.txt"]);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { recursive: true, force: true });
  }
});

test("streams downloads to disk and protects existing local files", async () => {
  const { mkdtemp, writeFile, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "ait-tools-download-"));
  const destination = join(dir, "download.txt");
  await writeFile(destination, "keep me");
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requestUrl = String(input);
    return new Response("downloaded bytes", { status: 200 });
  }) as typeof fetch;
  try {
    const client = new GatewayClient({ baseUrl: "https://drive.example.com", token: "pat-secret" });
    await assert.rejects(() => client.download("folder/report.txt", destination), /already exists/);
    const result = await client.download("folder/report.txt", destination, true);
    assert.equal(await readFile(destination, "utf8"), "downloaded bytes");
    assert.equal(result.bytes, 16);
    assert.equal(new URL(requestUrl).searchParams.get("path"), "folder/report.txt");
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { recursive: true, force: true });
  }
});

test("batch share returns per-item success and failure", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || "{}")) as { path?: string };
    if (body.path === "missing.txt") return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    return new Response(JSON.stringify({ url: "https://drive.example.com/s/test", days: 7 }), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await new GatewayClient({ baseUrl: "https://drive.example.com", token: "pat-secret" }).shareMany(["ok.txt", "missing.txt"]);
    assert.equal(result.succeeded, 1);
    assert.equal(result.failed, 1);
    assert.equal(result.results[1]?.ok, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
