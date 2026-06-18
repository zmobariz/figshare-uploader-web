# Changelog

All notable changes to this project. Releases are published at
https://github.com/zmobariz/figshare-uploader-web/releases

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
