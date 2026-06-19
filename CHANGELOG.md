# Changelog

All notable changes to this project. Releases are published at
https://github.com/zmobariz/bulk-uploader-for-figshare/releases

## 2.1.0 — rebrand + update notifications
- Renamed to **Bulk Uploader for Figshare** (repo `bulk-uploader-for-figshare`) — a third-party app *for* Figshare, not affiliated with Figshare.
- In-app **About** footer showing the version with links to the GitHub repo and Releases.
- **Update notifications:** checks the GitHub Releases API and flags when a newer version exists (opt-out: `NO_UPDATE_CHECK=1`).
- **Desktop auto-update:** the Windows per-user installer and Linux AppImage download updates in the background and prompt before installing; the portable .exe and unsigned macOS build fall back to a download notification.
- Docs/assurance updated to disclose the optional GitHub connection and the opt-out.

## 2.0.6
- `HOST` is now configurable (defaults to loopback `127.0.0.1`; the Docker image binds `0.0.0.0`), fixing container port-mapping.
- Documentation: corrected `localhost`/`127.0.0.1` references, refreshed project layout, added `SECURITY.md` and this changelog.

## 2.0.4 – 2.0.5 — security (CodeQL)
- Removed a ReDoS-prone regex (non-backtracking trailing-slash strip).
- Added an HTTPS Figshare-host allow-list enforced on every outbound request (SSRF defence) and bound the local server to loopback only.

## 2.0.3 — security (Dependabot)
- Electron 31 → 42 (patched Chromium), electron-builder 24 → 26, pinned `tar` 7.5.16. `npm audit` clean.

## 2.0.2 — packaging
- Cross-platform desktop apps (Windows portable + per-user installer, macOS `.dmg`, Linux AppImage) built in GitHub Actions with SHA-256 checksums.
- Bundled SheetJS locally — no CDN call at runtime (offline/locked-down friendly).

## 2.0.0 — v2
- Pre-flight duplicate check; operations create/update/publish/delete/add-files; visual column mapper; headless CLI; Docker.
