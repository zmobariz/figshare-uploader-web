/**
 * lib/figshare.js — Figshare API core (shared by the web server and the CLI)
 *
 * Responsibilities:
 *   - resilient API calls (retry + backoff on 429 / 5xx)
 *   - the full chunked upload protocol WITH resume (skip completed parts)
 *   - high-level operations: create / update / publish / delete / add-files,
 *     plus reserve-DOI and embargo, wrapped in runOperation()
 *
 * No token is ever logged or persisted here.
 */

const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');

const DEFAULT_BASE = 'https://api.figshare.com/v2';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Hosts this server may call. Defaults to Figshare (production + stage);
// override with FIGSHARE_ALLOWED_HOSTS (comma-separated host suffixes).
const ALLOWED_HOST_SUFFIXES = (process.env.FIGSHARE_ALLOWED_HOSTS || 'figshare.com,figsh.com')
  .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);

// Strip trailing slashes without a backtracking regex (avoids ReDoS).
function stripTrailingSlashes(s) {
  let i = s.length;
  while (i > 0 && s.charCodeAt(i - 1) === 47) i--; // 47 = '/'
  return s.slice(0, i);
}

function cleanBase(base) {
  const s = base && String(base).trim() ? String(base).trim() : DEFAULT_BASE;
  return stripTrailingSlashes(s);
}

// SSRF guard: every outbound request must be HTTPS to an allow-listed Figshare
// host, never a private/loopback/link-local address.
function assertAllowedUrl(raw) {
  let u;
  try { u = new URL(String(raw)); } catch (e) { const err = new Error('Invalid URL'); err.status = 400; throw err; }
  if (u.protocol !== 'https:') { const err = new Error('Only https:// endpoints are allowed'); err.status = 400; throw err; }
  const host = u.hostname.toLowerCase();
  const isPrivate =
    host === 'localhost' || host === '::1' || host === '[::1]' ||
    /^127\./.test(host) || /^10\./.test(host) || /^0\./.test(host) ||
    /^169\.254\./.test(host) || /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host);
  if (isPrivate) { const err = new Error('Host not allowed: ' + host); err.status = 400; throw err; }
  const ok = ALLOWED_HOST_SUFFIXES.some((suf) => host === suf || host.endsWith('.' + suf));
  if (!ok) { const err = new Error('Host not in allow-list (' + ALLOWED_HOST_SUFFIXES.join(', ') + '): ' + host); err.status = 400; throw err; }
  return u.toString();
}

/** Fetch wrapper with retry/backoff. Retries 429 and 5xx. */
async function rawFetch(url, options = {}, { retries = 4, onRetry } = {}) {
  const safeUrl = assertAllowedUrl(url);
  let attempt = 0;
  for (;;) {
    let res;
    try {
      res = await fetch(safeUrl, options);
    } catch (e) {
      if (attempt >= retries) throw e;
      const wait = Math.min(1000 * 2 ** attempt, 15000);
      if (onRetry) onRetry(`network error, retrying in ${wait}ms`);
      await sleep(wait);
      attempt++;
      continue;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const retryAfter = parseInt(res.headers.get('retry-after') || '', 10);
      const wait = !isNaN(retryAfter) ? retryAfter * 1000 : Math.min(1000 * 2 ** attempt, 15000);
      if (onRetry) onRetry(`HTTP ${res.status}, retrying in ${wait}ms`);
      await sleep(wait);
      attempt++;
      continue;
    }
    return res;
  }
}

/** Authenticated Figshare API call; parses JSON; throws rich errors. */
async function figApi(base, route, token, options = {}, ctl = {}) {
  const url = String(route).startsWith('http') ? route : `${cleanBase(base)}${route}`;
  const res = await rawFetch(url, {
    ...options,
    headers: {
      Authorization: `token ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  }, ctl);
  const text = await res.text();
  let body = null;
  if (text) { try { body = JSON.parse(text); } catch { body = text; } }
  if (!res.ok) {
    const msg = (body && body.message) || (typeof body === 'string' && body) || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

/* ----------------------------- account / lookups ----------------------------- */

const getAccount = (base, token) => figApi(base, '/account', token, { method: 'GET' });

async function getCategories(base, token) {
  try { return await figApi(base, '/account/categories', token, { method: 'GET' }); }
  catch { try { return await figApi(base, '/categories', token, { method: 'GET' }); } catch { return []; } }
}
async function getLicenses(base, token) {
  try { return await figApi(base, '/account/licenses', token, { method: 'GET' }); }
  catch { try { return await figApi(base, '/licenses', token, { method: 'GET' }); } catch { return []; } }
}
async function getCustomFields(base, token) {
  // institutional accounts only; fail soft
  const tries = ['/account/institution/custom_fields', '/account/custom_fields'];
  for (const t of tries) {
    try { const r = await figApi(base, t, token, { method: 'GET' }); if (Array.isArray(r)) return r; } catch { /* ignore */ }
  }
  return [];
}

/** Paginate the account's articles (for de-dup / update-by-title). */
async function listAllArticles(base, token, { max = 5000 } = {}) {
  const out = [];
  let page = 1;
  const pageSize = 100;
  for (;;) {
    const batch = await figApi(base, `/account/articles?page=${page}&page_size=${pageSize}`, token, { method: 'GET' });
    if (!Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch);
    if (batch.length < pageSize || out.length >= max) break;
    page++;
  }
  return out;
}

/* ----------------------------- article operations ----------------------------- */

async function createArticle(base, token, metadata, ctl) {
  const r = await figApi(base, '/account/articles', token, { method: 'POST', body: JSON.stringify(metadata) }, ctl);
  return String(r.location).split('/').pop();
}
const updateArticle = (base, token, id, metadata, ctl) =>
  figApi(base, `/account/articles/${id}`, token, { method: 'PUT', body: JSON.stringify(metadata) }, ctl);

const publishArticle = (base, token, id, ctl) =>
  figApi(base, `/account/articles/${id}/publish`, token, { method: 'POST' }, ctl);

const deleteArticle = (base, token, id, ctl) =>
  figApi(base, `/account/articles/${id}`, token, { method: 'DELETE' }, ctl);

const reserveDoi = (base, token, id, ctl) =>
  figApi(base, `/account/articles/${id}/reserve_doi`, token, { method: 'POST' }, ctl);

const setEmbargo = (base, token, id, embargo, ctl) =>
  figApi(base, `/account/articles/${id}/embargo`, token, {
    method: 'PUT',
    body: JSON.stringify({
      is_embargoed: true,
      embargo_type: embargo.type || 'article',
      embargo_date: embargo.date,
      embargo_title: embargo.title || 'File(s) under embargo',
      embargo_reason: embargo.reason || '',
    }),
  }, ctl);

/* ----------------------------- file upload (with resume) ----------------------------- */

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    let size = 0;
    fs.createReadStream(filePath)
      .on('data', (c) => { size += c.length; hash.update(c); })
      .on('end', () => resolve({ md5: hash.digest('hex'), size }))
      .on('error', reject);
  });
}

async function readRange(filePath, start, end) {
  const length = end - start + 1;
  const buf = Buffer.alloc(length);
  const fh = await fsp.open(filePath, 'r');
  try { await fh.read(buf, 0, length, start); } finally { await fh.close(); }
  return buf;
}

/**
 * Upload one local file to an existing article.
 * Resumes by skipping parts already marked COMPLETE; retries each part.
 */
async function uploadFileToArticle(base, token, articleId, file, { onProgress, partRetries = 4 } = {}) {
  const { md5, size } = await hashFile(file.path);

  const reg = await figApi(base, `/account/articles/${articleId}/files`, token, {
    method: 'POST', body: JSON.stringify({ name: file.name, md5, size }),
  });
  const fileLocation = reg.location;

  const info = await figApi(base, fileLocation, token, { method: 'GET' });
  const uploadUrl = info.upload_url;

  const partsRes = await rawFetch(uploadUrl);
  if (!partsRes.ok) throw new Error(`Upload service unavailable (HTTP ${partsRes.status})`);
  const partsInfo = await partsRes.json();
  const parts = partsInfo.parts || [];

  let uploadedParts = 0;
  for (const part of parts) {
    if (String(part.status).toUpperCase() === 'COMPLETE') { uploadedParts++; if (onProgress) onProgress(uploadedParts, parts.length); continue; }
    const chunk = await readRange(file.path, part.startOffset, part.endOffset);
    let attempt = 0;
    for (;;) {
      const put = await rawFetch(`${uploadUrl}/${part.partNo}`, {
        method: 'PUT', body: chunk, headers: { 'Content-Type': 'application/octet-stream' },
      });
      if (put.ok) break;
      if (attempt >= partRetries) throw new Error(`Part ${part.partNo} failed (HTTP ${put.status})`);
      await sleep(Math.min(1000 * 2 ** attempt, 15000));
      attempt++;
    }
    uploadedParts++;
    if (onProgress) onProgress(uploadedParts, parts.length);
  }

  await figApi(base, fileLocation, token, { method: 'POST' }); // complete
  return { name: file.name, size, md5, parts: parts.length };
}

/* ----------------------------- high-level orchestration ----------------------------- */

/**
 * Run a single operation for one row.
 * opts = {
 *   base, token, operation: 'create'|'update'|'publish'|'delete'|'addfiles',
 *   mode: 'metadata'|'files', publish: bool, reserveDoi: bool,
 *   embargo: {enabled, type, date} | null,
 *   metadata: {}, articleId: string|null, files: [{path,name}], onProgress
 * }
 */
async function runOperation(opts) {
  const { base, token, operation, mode, publish, reserveDoi: doReserve, embargo, metadata, files = [], onProgress } = opts;
  let articleId = opts.articleId ? String(opts.articleId) : null;
  const result = { operation, articleId: null, action: null, doi: null, uploaded: [], published: false, warnings: [] };

  if (operation === 'delete') {
    if (!articleId) throw new Error('Delete needs an Article ID.');
    await deleteArticle(base, token, articleId);
    result.action = 'deleted'; result.articleId = articleId;
    return result;
  }

  if (operation === 'publish') {
    if (!articleId) throw new Error('Publish needs an Article ID.');
    const pub = await publishArticle(base, token, articleId);
    result.action = 'published'; result.published = true; result.articleId = articleId;
    result.publishedUrl = pub && pub.location ? pub.location : null;
    return result;
  }

  if (operation === 'create') {
    if (!metadata || !metadata.title) throw new Error('Create needs a non-empty Title.');
    articleId = await createArticle(base, token, metadata);
    result.action = 'created';
  } else if (operation === 'update') {
    if (!articleId) throw new Error('Update needs an Article ID (mapped column or matched by title).');
    if (metadata && Object.keys(metadata).length) await updateArticle(base, token, articleId, metadata);
    result.action = 'updated';
  } else if (operation === 'addfiles') {
    if (!articleId) throw new Error('Add-files needs an Article ID.');
    result.action = 'files-added';
  } else {
    throw new Error(`Unknown operation: ${operation}`);
  }
  result.articleId = articleId;

  // files (create / update / addfiles)
  if ((mode === 'files' || operation === 'addfiles') && files.length) {
    for (const f of files) {
      const r = await uploadFileToArticle(base, token, articleId, f, { onProgress });
      result.uploaded.push(r);
    }
  } else if ((mode === 'files' || operation === 'addfiles') && !files.length) {
    result.warnings.push('No matching files were attached.');
  }

  // reserve DOI
  if (doReserve && (operation === 'create' || operation === 'update')) {
    try { const d = await reserveDoi(base, token, articleId); result.doi = d && d.doi ? d.doi : null; }
    catch (e) { result.warnings.push('DOI reserve failed: ' + e.message); }
  }

  // embargo
  if (embargo && embargo.enabled && embargo.date && (operation === 'create' || operation === 'update')) {
    try { await setEmbargo(base, token, articleId, embargo); result.embargoed = true; }
    catch (e) { result.warnings.push('Embargo failed: ' + e.message); }
  }

  // publish
  if (publish && (operation === 'create' || operation === 'update')) {
    const pub = await publishArticle(base, token, articleId);
    result.published = true;
    result.publishedUrl = pub && pub.location ? pub.location : null;
  }

  return result;
}

module.exports = {
  DEFAULT_BASE, cleanBase, figApi,
  getAccount, getCategories, getLicenses, getCustomFields, listAllArticles,
  createArticle, updateArticle, publishArticle, deleteArticle, reserveDoi, setEmbargo,
  hashFile, uploadFileToArticle, runOperation,
};
