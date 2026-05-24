/**
 * Formerly opened a local SQLite database. All persistence now lives in
 * the `trendex-api` service; this module just re-exports the HTTP
 * client that every repo uses.
 *
 * Kept as a shim so existing imports (`from "../db/index.js"`) continue
 * to resolve without churn.
 */

import { ApiClient, type ApiClientOpts } from "../api/client.js";

export type DB = ApiClient;

export function openDb(opts: ApiClientOpts): ApiClient {
  return new ApiClient(opts);
}

export { ApiClient, ApiError } from "../api/client.js";
