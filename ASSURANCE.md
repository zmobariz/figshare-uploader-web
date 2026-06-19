# Assurance statement

This describes the security posture of **Bulk Uploader for Figshare** to help users and IT/security
teams make an informed decision. It does **not** certify the software as free of vulnerabilities.

## What this does and does not prove
- **Does show:** the project is open source and auditable, runs locally with a small trust boundary,
  minimises data exposure, and is supported by automated scanning and reproducible, hash-verifiable builds.
- **Does not prove:** the absence of vulnerabilities, fitness for any particular regulatory regime,
  or any third-party certification.

## Threat model (summary)
- Primary user: a researcher/data manager running the app on their own machine with their own Figshare token.
- The app runs a local HTTP server bound to loopback (`127.0.0.1`) for its UI; it is not network-reachable by default.
- Assets to protect: the Figshare personal token, and the integrity of what is created on Figshare.

## Data handling
- The token is entered by the user, held in memory for the session, sent only to the Figshare API over
  HTTPS, and never written to disk or logged.
- Mappings/preferences are stored locally (no token). Uploaded file bytes are streamed to Figshare;
  temporary copies go to the OS temp dir and are deleted after each row.

## Network behaviour
- Figshare API traffic is HTTPS to an allow-list of Figshare hosts (`figshare.com`, `figsh.com`);
  other, private, loopback and link-local hosts are rejected before any request is made.
- One optional, non-Figshare connection: an update check to the GitHub Releases API (`api.github.com`),
  and — on desktop builds that support it — update downloads from GitHub. No token, telemetry or
  personal data is sent; disable entirely with `NO_UPDATE_CHECK=1`. If GitHub is blocked the check
  fails silently and the app continues.
- No analytics, crash reporting or other third-party/CDN calls at runtime (the SheetJS library is bundled).

## Build & release integrity
- Release binaries (Windows portable + per-user installer, macOS `.dmg`, Linux AppImage) are built by
  GitHub Actions from tagged source (`.github/workflows/release.yml`).
- Each release includes `SHA256SUMS.txt`. Verify before distributing
  (`Get-FileHash <file> -Algorithm SHA256`, or `shasum -a 256 <file>`).
- From v2.0.7, `SHA256SUMS.txt` is also signed with Sigstore **cosign** (keyless/OIDC). Verify:
  `cosign verify-blob --certificate SHA256SUMS.txt.pem --signature SHA256SUMS.txt.sig --certificate-identity-regexp "^https://github.com/zmobariz/bulk-uploader-for-figshare" --certificate-oidc-issuer https://token.actions.githubusercontent.com SHA256SUMS.txt`
- Binaries are **not code-signed** (no paid certificate); first launch triggers SmartScreen/Gatekeeper.
  On application-allow-listing platforms (WDAC/AppLocker), allow-list by the published SHA-256.

## Dependency & code scanning
- Dependabot (alerts + weekly grouped update PRs) and CodeQL code scanning run on the repository;
  GitHub secret scanning is enabled for the public repo. `npm audit` is part of the maintenance loop.

## Vulnerability disclosure
- Report privately via GitHub Security Advisories:
  https://github.com/zmobariz/bulk-uploader-for-figshare/security/advisories/new — see `SECURITY.md`.

## Known limitations
- Unsigned binaries (SmartScreen/Gatekeeper prompts; no publisher-based allow-list rules).
- No formal third-party security audit or certification.
- Duplicate detection matches on Title (or an Article ID column), not a cryptographic key.
- Static analysis (CodeQL) flags the API-proxy fetch as a potential SSRF. This is mitigated by the
  Figshare host allow-list plus loopback binding, and is recorded as a reviewed, dismissed finding
  (the analyzer cannot model the allow-list because uploads use dynamic `*.figshare.com` subdomains).

## Privacy
- The tool collects no personal data itself. All data flows are between the user's machine and Figshare.

## Alignment with the UK NCSC Software Security Code of Practice

This project is maintained with reference to the UK **Software Security Code of Practice**
(DSIT / NCSC, May 2025) — a *voluntary* code of 14 principles across four themes (secure design &
development; build-environment / supply-chain security; secure deployment & maintenance; and
communication with customers). This is a **self-assessed** statement of alignment — **not** a
certification, audit result, or NCSC endorsement.

How the project maps to the themes:

- **Secure design & development** — small trust boundary (loopback UI; Figshare-only HTTPS
  allow-list; token kept in memory only), automated code scanning (CodeQL), open and auditable source.
- **Build-environment / supply-chain security** — CI builds from tagged source with least-privilege
  workflow permissions; GitHub Actions and the Docker base image pinned by digest; dependencies pinned
  via lockfile and tracked by Dependabot; OpenSSF Scorecard runs on the repository.
- **Secure deployment & maintenance** — reproducible release builds; SHA-256 checksums plus Sigstore
  cosign signatures; no telemetry; update checks are opt-out (`NO_UPDATE_CHECK=1`) and desktop auto-update always prompts before installing (never silent); documented guidance for managed/locked-down machines.
- **Communication with customers** — this assurance statement, `SECURITY.md`, deployment & security
  notes, a changelog, and a private vulnerability-disclosure route.

Known gaps vs. a full assessment: binaries are not code-signed with a paid certificate; there is no
formal third-party audit; and the project has a single maintainer (no separate code-review gate). The
Code is formally completed via the Government's self-assessment form, signed off by a Senior
Responsible Owner — this section is an informal mapping, not that form.
