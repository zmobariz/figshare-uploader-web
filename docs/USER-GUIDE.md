# User guide (for researchers)

A 2-minute walkthrough. No coding, no admin rights.

## 1. Get the app
Download from the [Releases page](https://github.com/zmobariz/bulk-uploader-for-figshare/releases):
- **Windows** — the `...portable-win.exe` (just double-click) or the `...setup-win.exe` per-user installer.
- **macOS** — the `...mac.dmg`.
- **Linux** — the `...linux.AppImage` (`chmod +x` then run).

First launch shows a security prompt because the app isn't code-signed. On Windows click
**More info → Run anyway**; on macOS right-click the app → **Open**. No administrator rights are needed.

## 2. Connect
In Figshare: **Account settings → Applications → Personal tokens → Create**. Copy the token,
paste it into the app, and click **Test connection**.

## 3. Load your spreadsheet
One row per item; the first row holds your column headers. Use **Download template** in the app
to start from an example. Your column names can be anything — you map them next.

## 4. Map columns
The app auto-matches columns to Figshare fields on load; adjust the dropdowns if needed.
Click **Save** to store the mapping as a reusable template.

## 5. Pre-flight check
Click **Pre-flight check**. It reads your existing Figshare items and flags, per row:
duplicates (in your sheet *and* already on Figshare), invalid category/licence IDs, unmatched
files and missing IDs. **Start stays disabled until all blocking errors are fixed.**

## 6. Run
Pick **Save as draft** (recommended) or **Publish live**, then **Start**. Watch per-row progress,
**Retry failed** if needed, and **Download sheet + IDs/DOIs** for your records.

## Tips
- Keep items as **drafts** until you've checked them in Figshare; publishing mints a public DOI.
- Re-running a sheet? Set **"If a title already exists"** to *Skip* or *Update* to avoid duplicates.
- To attach data files, switch to **Metadata + files** and drag in the files your sheet references.
