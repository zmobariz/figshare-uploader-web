# Bulk Uploader for Figshare

[![Build](https://github.com/zmobariz/bulk-uploader-for-figshare/actions/workflows/release.yml/badge.svg)](https://github.com/zmobariz/bulk-uploader-for-figshare/actions/workflows/release.yml)
[![CodeQL](https://github.com/zmobariz/bulk-uploader-for-figshare/actions/workflows/codeql.yml/badge.svg)](https://github.com/zmobariz/bulk-uploader-for-figshare/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/zmobariz/bulk-uploader-for-figshare/badge)](https://securityscorecards.dev/viewer/?uri=github.com/zmobariz/bulk-uploader-for-figshare)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A modern, browser-based replacement for the old desktop
[`amoe/figshare-uploader`](https://github.com/amoe/figshare-uploader) — plus a headless CLI.
Drop in a spreadsheet, map columns once, and create, update, publish or clean up many
Figshare articles in a single run.

> Unofficial tool. Not affiliated with or endorsed by Figshare.

---

## Download (no install, no admin rights)

Non-technical users don't need Node or a terminal — download a ready-to-run app from the
[**Releases**](https://github.com/zmobariz/bulk-uploader-for-figshare/releases) page:

Latest release: **v2.1.0** (or browse [all releases](https://github.com/zmobariz/bulk-uploader-for-figshare/releases) for newer):

- **Windows** — [portable .exe](https://github.com/zmobariz/bulk-uploader-for-figshare/releases/download/v2.1.0/BulkUploaderForFigshare-2.1.0-portable-win.exe) (double-click, nothing to install) or [per-user installer](https://github.com/zmobariz/bulk-uploader-for-figshare/releases/download/v2.1.0/BulkUploaderForFigshare-2.1.0-setup-win.exe) (no admin).
- **macOS** — [.dmg](https://github.com/zmobariz/bulk-uploader-for-figshare/releases/download/v2.1.0/BulkUploaderForFigshare-2.1.0-mac.dmg).
- **Linux** — [.AppImage](https://github.com/zmobariz/bulk-uploader-for-figshare/releases/download/v2.1.0/BulkUploaderForFigshare-2.1.0-linux.AppImage) (`chmod +x`, then run).

The app isn't code-signed (signing costs money), so the first launch shows a security prompt:
on Windows click **More info → Run anyway**, on macOS right-click → **Open**. **No administrator
rights are required.** It's fully self-contained — the only network connection it makes is to the
Figshare API. New to it? See the **[User guide](docs/USER-GUIDE.md)**. Deploying on managed/secure
machines? See **[Deployment & security](docs/DEPLOYMENT-AND-SECURITY.md)**.

## Security & assurance

Designed to run locally with a small, auditable trust boundary:

- No administrator rights required; no background services, drivers, scheduled tasks or autostart entries.
- Local UI only — the web interface binds to `127.0.0.1` by default.
- No telemetry, analytics, crash reporting, or third-party/CDN calls — libraries are bundled.
- One optional non-Figshare connection: an update check to the GitHub Releases API (and update downloads from GitHub) so the app can tell you a newer version exists. No token or data is sent there; disable with `NO_UPDATE_CHECK=1`.
- Figshare personal tokens are held in memory for the session only, sent only to the Figshare API over HTTPS, and never written to disk or logged.
- Figshare API requests are allow-listed to Figshare hosts; private/loopback destinations are rejected.
- Release binaries ship with **SHA-256 checksums**, built in CI from tagged source.
- Dependencies and code are scanned automatically (Dependabot + CodeQL); report issues privately via [GitHub Security Advisories](https://github.com/zmobariz/bulk-uploader-for-figshare/security/advisories/new).

This is **not** a guarantee that the software is free of vulnerabilities. It means the project is open source, auditable, locally run, token-minimising, telemetry-free, hash-verifiable, and continuously scanned. Full detail: **[Assurance statement](ASSURANCE.md)** &middot; **[Deployment & security notes](docs/DEPLOYMENT-AND-SECURITY.md)**.

**IT / security approval summary:** runs locally &middot; no admin &middot; no machine-wide install &middot; no telemetry &middot; no token storage &middot; outbound to the Figshare API and (optionally) GitHub for update checks/downloads — disable with `NO_UPDATE_CHECK=1` &middot; hash-verifiable binaries &middot; public, auditable source.

## Highlights (v2)

**Reliability**
- **Pre-flight check** — a visual report flagging duplicates (within your sheet and already on Figshare), invalid category/licence IDs, unmatched files and missing IDs, before anything is created.
- Sync / de-dup on re-run — match on Title and *skip* or *update* instead of creating duplicates.
- Retry only the failed rows in one click.
- Large-file uploads resume automatically (skip already-completed parts) and retry parts on network blips.
- Configurable parallelism with automatic backoff on rate limits (HTTP 429) and 5xx.

**More than create**
- Operations: **create**, **update** (metadata/files), **add files**, **publish**, **delete** (guarded).
- Update/publish/delete target rows by an *Article ID* column or by Title match.

**Richer, correct metadata**
- Searchable category & licence pickers — choose by name, the app fills the numeric ID.
- Per-row category/licence by name too (resolved against the live lists).
- Custom fields (institutional accounts).
- Authors auto-detected as ORCID, numeric author ID, or plain name.
- Reserve a DOI and set an embargo as part of the run.
- Batch defaults applied to every row that doesn't set its own.

**Workflow & record-keeping**
- Saved mapping templates + remembered settings (token never stored).
- Full per-row payload preview before anything is sent.
- Multi-sheet workbook support (pick the worksheet).
- Export a results CSV, or download a copy of your sheet with new **ID / DOI / URL / status** columns appended.

**Run it your way**
- Prebuilt **desktop apps** (Windows / macOS / Linux), the **web app** (local Node server), a headless **CLI**, or **Docker**.

## Why there's a server

Figshare's upload service needs an MD5 hash and chunked part uploads to a separate host
that browsers can't call directly (CORS). The Node server does that orchestration and
proxies the API. Your token is sent per request and is never written to disk or logged.

---

## Quick start (web app)

Requires [Node.js 18+](https://nodejs.org/).

```bash
npm install
npm start
```

Open **http://127.0.0.1:4000**.

Flow: connect → load spreadsheet → pick operation & options → (map columns, auto-matched on load) → validate → run. Watch per-row progress, retry failures, export the audit trail.

## CLI (automation / CI)

```bash
# dry run — builds and prints payloads, creates nothing
node cli.js --token "$FIGSHARE_TOKEN" --file samples/sample_metadata_template.csv \
  --config samples/sample_mapping.json --dry-run

# create as drafts, with files, 3 in parallel, write an audit CSV
node cli.js --token "$FIGSHARE_TOKEN" --file data.xlsx --config mapping.json \
  --mode files --files-dir ./files --concurrency 3 --out results.csv

# re-run safely: update existing items matched by title instead of duplicating
node cli.js --token "$FIGSHARE_TOKEN" --file data.xlsx --config mapping.json --sync update

# pre-flight only: report duplicates and problems, upload nothing
node cli.js --token "$FIGSHARE_TOKEN" --file data.xlsx --config mapping.json --preflight
```

Run `node cli.js --help` for all flags. `--config` is the JSON exported from the web app's mapper.

## Docker

```bash
npm run docker:build
npm run docker:run        # then open http://localhost:4000
```

## Build the desktop apps yourself

Most users should just download from Releases (above). To build locally:

```bash
npm install
npm run desktop      # run the desktop window locally
npm run dist         # build installer + portable for your OS into dist/
```

Cross-platform releases (Windows / macOS / Linux) are built automatically by GitHub Actions on every `v*` tag.

---

## The spreadsheet & mapping

First row = headers; each row below = one article. You map your column names to Figshare
fields in the app (auto-matched on load). Start from `samples/sample_metadata_template.csv`
or `.xlsx`. Mapping/config JSON shape:

```json
{
  "version": 2,
  "mapping": {
    "fields": {
      "title": "Title",
      "keywords": { "column": "Keywords", "separator": ";" },
      "authors": { "column": "Authors", "separator": ";" },
      "articleId": "Article ID"
    },
    "customFields": { "Department": { "column": "Dept", "list": false } },
    "defaults": { "categories": [1], "license": 1, "defined_type": "dataset" }
  },
  "options": { "operation": "create", "sync": "update", "mode": "files", "concurrency": 3 }
}
```

Fields: `title` (required for create), `description`, `keywords`, `categories`
(IDs or names), `authors` (name / ORCID / ID), `references`, `license` (ID or name),
`defined_type`, `funding`, `group_id`, plus `articleId` and `files` (used for matching /
attaching, not sent as metadata).

---

## Notes & limits

- **Unpublish isn't offered** — Figshare's public API has no endpoint to revert a published item, so the tool doesn't fake one.
- **Delete** only works on drafts/private items and is gated behind an explicit confirmation.
- **Publishing mints public DOIs** — validate first; keep the default *Draft* until confident.
- Sequential safety: parallelism is capped (default 2) and backs off on rate limits.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | Server port. |
| `HOST` | `127.0.0.1` | Bind address. Loopback by default; the Docker image sets `0.0.0.0`. |
| `FIGSHARE_TOKEN` | — | CLI token (alternative to `--token`). |
| `FIGSHARE_BASE` | api.figshare.com/v2 | CLI base URL. |

## Project layout

```
server.js          Express server (thin) -> lib/figshare.js
cli.js             Headless CLI
lib/figshare.js    API core: retry/backoff, resumable upload, runOperation()
public/
  index.html       UI
  styles.css       Styling (light + dark)
  app.js           UI logic
  shared.js        Mapping/metadata building (shared by browser + CLI)
samples/           Example template + mapping
Dockerfile         Container image
electron/main.js   Desktop wrapper (Electron)
electron-builder.yml  Desktop packaging (portable / installer / dmg / AppImage)
docs/              User guide + deployment & security notes
.github/workflows/ CI: cross-platform release builds
LICENSE · CHANGELOG.md · SECURITY.md
```

## License

MIT — free for anyone to use, modify and redistribute. See the [LICENSE](LICENSE) file. (The original tool is Apache-2.0; this is a from-scratch reimplementation, so it is free to choose its own licence — MIT was picked for simplicity and broad academic reuse.)
