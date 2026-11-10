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
    let uploadLoaded = 0;
    const result = await new GatewayClient({ baseUrl: "https://drive.example.com", token: "pat-secret" }).upload(local, "Incoming", (loaded) => { uploadLoaded = loaded; });
    assert.equal(uploadLoaded, Buffer.byteLength("streamed payload"));
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
  let downloadLoaded = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requestUrl = String(input);
    return new Response("downloaded bytes", { status: 200 });
  }) as typeof fetch;
  try {
    const client = new GatewayClient({ baseUrl: "https://drive.example.com", token: "pat-secret" });
    await assert.rejects(() => client.download("folder/report.txt", destination), /already exists/);
    const result = await client.download("folder/report.txt", destination, true, (loaded) => { downloadLoaded = loaded; });
    assert.equal(downloadLoaded, Buffer.byteLength("downloaded bytes"));
    assert.equal(await readFile(destination, "utf8"), "downloaded bytes");
    assert.equal(result.bytes, 16);
    assert.equal(new URL(requestUrl).searchParams.get("path"), "folder/report.txt");
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { recursive: true, force: true });
  }
});

test("creates a custom share URL slug through the Gateway API", async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody: Record<string, unknown> = {};
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBody = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
    return new Response(JSON.stringify({ url: "https://drive.example.com/go/mining-bayu", days: 7, short: true, custom: true, slug: "mining-bayu" }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;
  try {
    const result = await new GatewayClient({ baseUrl: "https://drive.example.com", token: "pat-secret" }).share("Project/audio.wav", 7, "mining-bayu");
    assert.equal(capturedBody.path, "Project/audio.wav");
    assert.equal(capturedBody.days, 7);
    assert.equal(capturedBody.slug, "mining-bayu");
    assert.equal(result.custom, true);
    assert.equal(result.slug, "mining-bayu");
    assert.equal(result.url, "https://drive.example.com/go/mining-bayu");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("lists, inspects, and revokes account-owned share links", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string; authorization: string | null }> = [];
  const item = {
    slug: "mining-bayu", url: "https://drive.example.com/go/mining-bayu", path: "Mining Rec",
    createdAt: 1794000000000, expiresAt: 1794600000000, custom: true, status: "active"
  };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method || "GET", authorization: new Headers(init?.headers).get("Authorization") });
    if ((init?.method || "GET") === "DELETE") {
      return new Response(JSON.stringify({ ok: true, slug: "mining-bayu" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ items: [item] }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    const client = new GatewayClient({ baseUrl: "https://drive.example.com", token: "pat-secret" });
    const listed = await client.listShares();
    assert.equal(listed.items[0]?.slug, "mining-bayu");
    assert.deepEqual(await client.getShare("mining-bayu"), item);
    await assert.rejects(() => client.getShare("missing"), /tidak ditemukan/);
    const revoked = await client.revokeShare("mining-bayu");
    assert.deepEqual(revoked, { ok: true, slug: "mining-bayu" });
    assert.equal(new URL(calls[0]!.url).pathname, "/api/shares");
    assert.equal(new URL(calls[3]!.url).pathname, "/api/shares/mining-bayu");
    assert.equal(calls[3]!.method, "DELETE");
    assert.ok(calls.every((call) => call.authorization === "Bearer pat-secret"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects an empty share slug before making a request", async () => {
  const client = new GatewayClient({ baseUrl: "https://drive.example.com", token: "pat-secret" });
  await assert.rejects(() => client.getShare("  "), /Slug link wajib diisi/);
  await assert.rejects(() => client.revokeShare(""), /Slug link wajib diisi/);
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


test("plans recursive folder uploads without following symbolic links", async () => {
  const { mkdtemp, mkdir, writeFile, symlink, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "ait-tools-folder-plan-"));
  const root = join(dir, "dataset");
  await mkdir(join(root, "nested", "deep"), { recursive: true });
  await writeFile(join(root, "root.txt"), "root");
  await writeFile(join(root, "nested", "deep", "child.csv"), "child-data");
  await symlink(join(root, "root.txt"), join(root, "linked.txt"));
  try {
    const plan = await new GatewayClient({ baseUrl: "https://drive.example.com", token: "pat-secret" }).planUploadFolder(root, "Incoming");
    assert.equal(plan.targetRoot, "Incoming/dataset");
    assert.equal(plan.fileCount, 2);
    assert.equal(plan.directoryCount, 3);
    assert.equal(plan.totalBytes, 14);
    assert.deepEqual(plan.skipped, ["linked.txt"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("uploads folder hierarchy before streaming each file", async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "ait-tools-folder-upload-"));
  const root = join(dir, "dataset");
  await mkdir(join(root, "nested"), { recursive: true });
  await writeFile(join(root, "root.txt"), "root");
  await writeFile(join(root, "nested", "child.txt"), "child");
  const originalFetch = globalThis.fetch;
  const calls: Array<{ path: string; body?: string }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/upload") {
      const chunks: Buffer[] = [];
      for await (const chunk of init?.body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
      calls.push({ path: url.searchParams.get("path") || "", body: Buffer.concat(chunks).toString("utf8") });
      return new Response(JSON.stringify({ saved: ["ok"] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    calls.push({ path: url.pathname, body: String(init?.body || "") });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    const result = await new GatewayClient({ baseUrl: "https://drive.example.com", token: "pat-secret" }).uploadFolder(root, "Incoming");
    assert.equal(result.targetRoot, "Incoming/dataset");
    assert.equal(result.filesUploaded, 2);
    assert.equal(result.filesFailed, 0);
    assert.deepEqual(calls.filter((x) => x.path === "/api/mkdir").map((x) => JSON.parse(x.body || "{}")), [
      { path: "Incoming", name: "dataset" },
      { path: "Incoming/dataset", name: "nested" }
    ]);
    assert.deepEqual(calls.filter((x) => x.path !== "/api/mkdir").map((x) => x.path).sort(), ["Incoming/dataset", "Incoming/dataset/nested"]);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { recursive: true, force: true });
  }
});

test("batch move returns per-item results without hiding failures", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || "{}")) as { path?: string };
    if (body.path === "missing.txt") return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await new GatewayClient({ baseUrl: "https://drive.example.com", token: "pat-secret" }).moveMany(["one.txt", "missing.txt"], "Archive");
    assert.equal(result.succeeded, 1);
    assert.equal(result.failed, 1);
    assert.equal(result.results[1]?.path, "missing.txt");
    assert.equal(result.results[1]?.ok, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("turns Gateway network failures into actionable connection guidance", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new TypeError("getaddrinfo ENOTFOUND drive.example.com"); }) as typeof fetch;
  try {
    await assert.rejects(
      () => new GatewayClient({ baseUrl: "https://drive.example.com", token: "pat-secret" }).me(),
      /Tidak dapat terhubung ke Gateway.*DNS.*reverse proxy/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("turns aborted Gateway requests into a clear timeout message", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }); }) as typeof fetch;
  try {
    await assert.rejects(
      () => new GatewayClient({ baseUrl: "https://drive.example.com", token: "pat-secret" }).me(),
      /Gateway tidak merespons dalam 30 detik/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
