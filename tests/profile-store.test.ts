import test from "node:test";
import assert from "node:assert/strict";
import { validateProfileName } from "../src/profile-store.js";

test("accepts simple named profiles", () => {
  assert.equal(validateProfileName("kantor"), "kantor");
  assert.equal(validateProfileName("personal_02"), "personal_02");
});
test("rejects unsafe profile names", () => {
  for (const name of ["", "../outside", "name with spaces", "-leading", "a".repeat(33)]) {
    assert.throws(() => validateProfileName(name));
  }
});
