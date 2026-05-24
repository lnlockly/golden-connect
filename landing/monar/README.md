# Monar landing (dormant)

Placeholder slot for Monar marketing pages, to be assembled from agentflow
`proj-4b3a24q6` (live preview <https://p-4b3a24q6.proj.agentflow.website>)
via a one-shot export.

**Status: dormant.** Not linked from the main landing build. The current
`trendex-landing` Docker image does not include this directory.

## Files

- `index.html` — single placeholder page. When opened directly says
  "Monar landing not generated yet".
- `routes.txt` — list of pages to export from agentflow preview.

## How to activate (later)

1. Run `landing/monar/scripts/export-from-agentflow.sh` (TBD) which crawls
   each route in `routes.txt`, rewrites `_next/static/*` URLs to relative,
   drops the result into `landing/monar/dist/`.
2. Copy `dist/` into the nginx image at build time (add a `COPY` line to
   `landing/Dockerfile`).
3. Wire either a separate host `monar.trendex.biz` (preferred) or a
   subpath `/monar/*` in `landing/nginx.conf`.

Until those steps run, this directory is dead weight — safe.
