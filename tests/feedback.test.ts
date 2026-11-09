import test from "node:test";
import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { createTransferReporter, formatBytes, formatDuration, startFeedback } from "../src/feedback.js";

function capture(isTTY = false) {
  let value = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      value += chunk.toString();
      callback();
    }
  }) as Writable & { isTTY?: boolean; captured: () => string };
  stream.isTTY = isTTY;
  stream.captured = () => value;
  return stream;
}

test("formats byte counts and elapsed durations for human feedback", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(2 * 1024 ** 2), "2.0 MB");
  assert.equal(formatDuration(59_000), "59s");
  assert.equal(formatDuration(61_000), "1m 01s");
});

test("reports task start and completion on non-interactive stderr", () => {
  const stream = capture(false);
  const finish = startFeedback("Checking Gateway", stream);
  finish(true, "reachable");
  assert.match(stream.captured(), /Checking Gateway\.\.\./);
  assert.match(stream.captured(), /✓ Checking Gateway/);
  assert.match(stream.captured(), /reachable/);
});

test("reports task failures without leaving an active spinner", () => {
  const stream = capture(true);
  const finish = startFeedback("Validating PAT", stream);
  finish(false, "invalid token");
  finish(true);
  assert.match(stream.captured(), /✗ Validating PAT/);
  assert.match(stream.captured(), /invalid token/);
  assert.equal((stream.captured().match(/Validating PAT/g) || []).length, 2);
});

test("reports transfer bytes, percentage, speed, and ETA to stderr", () => {
  const stream = capture(false);
  const report = createTransferReporter("Uploading sample.bin", stream);
  report(1024, 4096);
  const output = stream.captured();
  assert.match(output, /Uploading sample\.bin/);
  assert.match(output, /1\.0 KB \/ 4\.0 KB \(25%\)/);
  assert.match(output, /\/s/);
  assert.match(output, /ETA/);
});
