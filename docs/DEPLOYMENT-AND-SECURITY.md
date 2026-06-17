# Deployment & security notes (for IT / security teams)

This one-pager is for the people who approve software on managed machines.

## What it is
An open-source (MIT) desktop app that lets researchers create/update Figshare records in bulk
from a spreadsheet. Source: https://github.com/zmobariz/figshare-uploader-web

## Privileges
- **Requires no administrator rights** to install or run.
- Shipped as (a) a **portable** executable that runs without installation, and (b) a **per-user
  installer** that installs into the user's own profile (`%LOCALAPPDATA%\Programs\…` on Windows).
- Makes no machine-wide changes: **no services, drivers, scheduled tasks, or autostart.**

## Network behaviour
- At runtime the app opens outbound **HTTPS to exactly one external host: the Figshare API**
  (`https://api.figshare.com` by default, or the institutional endpoint the user enters). Nothing else.
- It runs a small web server bound to **localhost only** (127.0.0.1, ephemeral port) for its own UI;
  it is not reachable from the network.
- **No telemetry, analytics, crash reporting, update checks, or third-party/CDN calls.** All UI code
  and libraries (including the SheetJS spreadsheet parser) are bundled in the app, not fetched at runtime.

## Data handling
- The Figshare **personal token** is entered by the user, kept in memory for the session, sent only
  to the Figshare API over HTTPS, and **never written to disk or logged**.
- Column mappings/preferences are stored locally in the app (no token).
- File uploads are streamed to Figshare; temporary copies go to the OS temp dir and are **deleted
  immediately after each row**.

## Dependencies (bundled, auditable)
- App server: `express`, `multer`, `xlsx` (SheetJS) — all pure JavaScript.
- Desktop shell: `Electron`. No other native binaries.

## Build integrity / supply chain
- Releases are built by **GitHub Actions from tagged source** (`.github/workflows/release.yml`) —
  auditable and repeatable.
- Every release includes **`SHA256SUMS-<os>.txt`**. Verify before distributing/allowlisting:
  - Windows: `Get-FileHash .\<file> -Algorithm SHA256`
  - macOS/Linux: `shasum -a 256 <file>`

## Running under application allowlisting (WDAC / AppLocker)
- The executables are **not code-signed** (certificates cost money), so SmartScreen/Gatekeeper will
  warn on first run (click-through, **no admin needed**), and **publisher-based** allowlist rules won't match.
- Recommended cost-free approval: a **file-hash allowlist rule** using the published SHA-256. Default
  AppLocker rules only allow Program Files / Windows, so the portable (`%TEMP%`) and per-user install
  (`%LOCALAPPDATA%`) need either a hash rule or an explicit path rule for the install location.

## Lowest-footprint alternative
Where packaged binaries are not permitted but a runtime is, the same app runs **from source** with no
binary: `npm install && npm start`, then open `http://localhost:4000`. A headless **CLI**
(`node cli.js`) is provided for unattended/automated use.

## Summary for approval
Open-source · MIT · no admin · no telemetry · localhost UI · single outbound host (Figshare API over
HTTPS) · token never stored · hash-verifiable builds.
