/**
 * Figshare Bulk Uploader — web server (thin layer over lib/figshare.js)
 * Serves the SPA and proxies/orchestrates the Figshare API.
 * Tokens are supplied per request and never written to disk or logged.
 */
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const fig = require('./lib/figshare');

const app = express();
const PORT = process.env.PORT || 4000;

const TMP_DIR = path.join(os.tmpdir(), 'figshare-uploader-tmp');
fs.mkdirSync(TMP_DIR, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_q, _f, cb) => cb(null, TMP_DIR),
    filename: (_q, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.originalname}`),
  }),
  limits: { fileSize: 1024 * 1024 * 1024 * 20 },
});

app.use(express.json({ limit: '8mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/samples', express.static(path.join(__dirname, 'samples')));

const fail = (res, e) => res.status(e.status || 502).json({ ok: false, error: e.message });
const safeUnlink = (p) => fsp.unlink(p).catch(() => {});

app.get('/api/health', (_q, res) => res.json({ ok: true, version: require('./package.json').version }));

app.post('/api/test-token', async (req, res) => {
  const { token, baseUrl } = req.body || {};
  if (!token) return res.status(400).json({ ok: false, error: 'Token is required.' });
  try {
    const a = await fig.getAccount(baseUrl, token);
    res.json({ ok: true, account: { id: a.id, name: [a.first_name, a.last_name].filter(Boolean).join(' ') || a.email, email: a.email } });
  } catch (e) { fail(res, e); }
});

app.post('/api/lookups', async (req, res) => {
  const { token, baseUrl } = req.body || {};
  if (!token) return res.status(400).json({ ok: false, error: 'Token is required.' });
  const [categories, licenses, customFields] = await Promise.all([
    fig.getCategories(baseUrl, token), fig.getLicenses(baseUrl, token), fig.getCustomFields(baseUrl, token),
  ]);
  res.json({ ok: true, categories, licenses, customFields });
});

// List the account's existing articles (for de-dup / update-by-title).
app.post('/api/list-articles', async (req, res) => {
  const { token, baseUrl } = req.body || {};
  if (!token) return res.status(400).json({ ok: false, error: 'Token is required.' });
  try {
    const all = await fig.listAllArticles(baseUrl, token);
    res.json({ ok: true, articles: all.map((a) => ({ id: a.id, title: a.title, doi: a.doi, url: a.url, published: !!a.published_date })) });
  } catch (e) { fail(res, e); }
});

// Process one row (any operation).
app.post('/api/process', upload.array('files'), async (req, res) => {
  const files = (req.files || []).map((f) => ({ path: f.path, name: f.originalname }));
  try {
    const b = req.body;
    if (!b.token) throw new Error('Token is required.');
    let metadata = {};
    if (b.metadata) { try { metadata = JSON.parse(b.metadata); } catch { throw new Error('Invalid metadata payload.'); } }
    let embargo = null;
    if (b.embargo) { try { embargo = JSON.parse(b.embargo); } catch { /* ignore */ } }

    const result = await fig.runOperation({
      base: b.baseUrl, token: b.token,
      operation: b.operation || 'create',
      mode: b.mode || 'metadata',
      publish: String(b.publish) === 'true',
      reserveDoi: String(b.reserveDoi) === 'true',
      embargo,
      metadata,
      articleId: b.articleId || null,
      files,
    });

    const id = result.articleId;
    res.json({
      ok: true,
      ...result,
      privateUrl: id ? `https://figshare.com/account/articles/${id}` : null,
    });
  } catch (e) { fail(res, e); }
  finally { await Promise.all(files.map((f) => safeUnlink(f.path))); }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log('\n  Figshare Bulk Uploader v2');
  console.log('  ----------------------------------------');
  console.log(`  Open  ->  http://localhost:${PORT}`);
  console.log('  Press Ctrl+C to stop.\n');
});
