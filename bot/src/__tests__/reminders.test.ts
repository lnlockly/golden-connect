import { test } from "node:test";
import assert from "node:assert/strict";
import { textForLang } from "../db/reminders.js";

// TODO(bot-rewrite): DB-backed tests (listDue / setText / setDelay / toggle
// / remove / create / migration 004-005 / markAppliedByUsername) all moved
// server-side with the data layer. The bot now just forwards these calls
// over HTTP. Re-add as api-client mocks or integration tests against a
// running trendex-api. Pure-function helper tests stay here.

test("migration 004 adds applied_on_site + applied_at columns to users", { skip: "moved to trendex-api" }, () => {});
test("migration 005 seeds exactly 3 default reminder steps in ru/en/zh", { skip: "moved to trendex-api" }, () => {});
test("UsersRepo: markAppliedByUsername flips flag on case-insensitive match", { skip: "TODO: rewrite as api-client mock / integration" }, () => {});
test("RemindersRepo.listDue: filters by applied flag, blocked flag, delay, and dedup", { skip: "TODO: rewrite as api-client mock / integration" }, () => {});
test("RemindersRepo.setText / setDelay / toggle / remove / create", { skip: "TODO: rewrite as api-client mock / integration" }, () => {});

test("textForLang falls back to ru when lang-specific text is null", () => {
  const step = {
    id: 1, order_idx: 1, delay_hours: 6,
    text_ru: "ру", text_en: null, text_zh: null,
    enabled: 1, updated_at: 0,
  };
  assert.equal(textForLang(step, "ru"), "ру");
  assert.equal(textForLang(step, "en"), "ру");
  assert.equal(textForLang(step, "zh"), "ру");

  const full = { ...step, text_en: "en", text_zh: "zh" };
  assert.equal(textForLang(full, "en"), "en");
  assert.equal(textForLang(full, "zh"), "zh");
});
