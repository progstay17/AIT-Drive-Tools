import test from "node:test";
import assert from "node:assert/strict";
import { GatewayClient } from "../src/gateway.js";

test("refuses requests without a dedicated token", async () => {
  const client = new GatewayClient({ baseUrl: "https://drive.example.com" });
  await assert.rejects(() => client.list(), /AIT_DRIVE_TOKEN is missing/);
});
test("does not fall back to browser cookie sessions", async () => {
  const client = new GatewayClient({ baseUrl: "https://drive.example.com" });
  await assert.rejects(() => client.search("report"), /Browser-cookie authentication is intentionally unsupported/);
});
