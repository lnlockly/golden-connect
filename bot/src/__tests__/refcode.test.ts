import { test } from "node:test";
import assert from "node:assert/strict";
import {
  refCodeForTgId,
  isValidRefCode,
  parseStartPayload,
  buildInviteLink,
  buildWebsiteLink,
} from "../services/refcode.js";

// TODO(bot-rewrite): Repo-backed tests (createUser / descendantStats /
// resolvePending / listAncestors / dashboard / migration 002) lived against a
// real better-sqlite3 in-memory DB. They moved server-side when the bot's
// data layer became thin HTTP → golden-connect-api. Re-add them as integration
// tests against a running api, or mock the fetch layer. Kept here as a set
// of still-meaningful pure-function tests for the ref-code helpers.

test("refcode: tg_id serialises to a valid decimal ref_code", () => {
  for (const id of [1, 42, 100_000, 1_361_064_246, 999_999_999_999]) {
    const c = refCodeForTgId(id);
    assert.equal(c, String(id));
    assert.ok(isValidRefCode(c), `not valid: ${c}`);
  }
});

test("refcode: isValidRefCode rejects non-decimal and overlong values", () => {
  assert.equal(isValidRefCode(""), false);
  assert.equal(isValidRefCode("0"), false);
  assert.equal(isValidRefCode("01"), false);
  assert.equal(isValidRefCode("abc"), false);
  assert.equal(isValidRefCode("12a3"), false);
  assert.equal(isValidRefCode("12345678901234567"), false); // 17 digits
});

test("refcode: parseStartPayload accepts ref_ prefix and raw digits", () => {
  assert.equal(parseStartPayload("ref_123456789"), "123456789");
  assert.equal(parseStartPayload("987654321"), "987654321");
  assert.equal(parseStartPayload("ref_INVALID!"), null);
  assert.equal(parseStartPayload("ref_0"), null);
  assert.equal(parseStartPayload(undefined), null);
  assert.equal(parseStartPayload(""), null);
});

test("refcode: invite + website links embed the tg_id-derived ref_code", () => {
  const code = refCodeForTgId(1361064246);
  assert.equal(
    buildInviteLink("AIGolden Connect_bot", code),
    "https://t.me/AIGolden Connect_bot?start=ref_1361064246",
  );
  assert.equal(
    buildWebsiteLink("https://golden-connect.website", code),
    "https://golden-connect.website/?ref=1361064246",
  );
  assert.equal(
    buildWebsiteLink("https://golden-connect.website/", code),
    "https://golden-connect.website/?ref=1361064246",
  );
});

test("repo: createUser stores ref_code = tg_id and descendants resolve recursively", { skip: "TODO: rewrite as api-client mock / integration" }, () => {});
test("repo: pending referral resolves when claimed inviter finally joins", { skip: "TODO: rewrite as api-client mock / integration" }, () => {});
test("migration 002: legacy random ref_codes are rewritten to tg_ids", { skip: "moved to golden-connect-api" }, () => {});
test("repo: listAncestors walks the ref chain in depth-ascending order", { skip: "TODO: rewrite as api-client mock / integration" }, () => {});
test("repo: dashboard computes growth projection from 7d window", { skip: "moved to golden-connect-api" }, () => {});
