import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml } from "../http/landing.js";

// TODO(bot-rewrite): Everything that exercised LeadsRepo against a real
// SQLite db has been moved to trendex-api. The bot only owns a thin HTTP
// client now — integration tests should either spin up the api or mock
// fetch. Pure-function tests from the landing escapeHtml path stay here.

test("migration 003 creates the leads table + indexes", { skip: "moved to trendex-api" }, () => {});
test("LeadsRepo: create + findById round-trip preserves payload JSON", { skip: "TODO: rewrite as api-client mock / integration" }, () => {});
test("LeadsRepo: rate limit flags recent submissions by contact", { skip: "TODO: rewrite as api-client mock / integration" }, () => {});
test("LeadsRepo: posted-message lookup + status transitions", { skip: "TODO: rewrite as api-client mock / integration" }, () => {});

test("landing: escapeHtml neutralises script injection attempts", () => {
  assert.equal(
    escapeHtml(`<script>alert("x")</script>`),
    `&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;`,
  );
  assert.equal(escapeHtml("a & b"), "a &amp; b");
  assert.equal(escapeHtml("it's"), "it&#39;s");
});
