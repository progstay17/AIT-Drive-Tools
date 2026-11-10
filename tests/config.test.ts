import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";

test("requires a Gateway URL when no matching profile exists", () => assert.throws(() => loadConfig({}, "missing-test-profile"), /AIT_DRIVE_URL is not set/));
test("accepts HTTPS and trims trailing slash", () => {
  const config = loadConfig({ AIT_DRIVE_URL: "https://drive.example.com/" });
  assert.equal(config.baseUrl, "https://drive.example.com");
  assert.equal(config.token, undefined);
});
test("rejects insecure non-loopback HTTP", () => assert.throws(() => loadConfig({ AIT_DRIVE_URL: "http://drive.example.com" }), /must use HTTPS/));
test("allows local HTTP for development", () => {
  const config = loadConfig({ AIT_DRIVE_URL: "http://127.0.0.1:3000", AIT_DRIVE_TOKEN: "test-token" });
  assert.equal(config.token, "test-token");
});
