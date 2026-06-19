/**
 * lib/update.js — optional "is there a newer release?" check against the
 * public GitHub Releases API. Best-effort and fail-soft: any error (offline,
 * blocked by IT, rate-limited) returns "no update" so the app never breaks.
 *
 * Where it calls: a single HTTPS GET to api.github.com for THIS repo's latest
 * release. No token, no telemetry, no personal data is sent. Disable entirely
 * with the environment variable NO_UPDATE_CHECK=1.
 */
const REPO = process.env.UPDATE_REPO || 'zmobariz/bulk-uploader-for-figshare';
const CURRENT = (() => { try { return require('../package.json').version; } catch (e) { return '0.0.0'; } })();
const CACHE_MS = 6 * 60 * 60 * 1000; // cache the answer for 6h
let cache = { at: 0, data: null };

// Compare dotted numeric versions. 1 if a>b, -1 if a<b, 0 equal. Pre-release suffixes ignored.
function cmpVersion(a, b) {
  const norm = (v) => String(v).replace(/^v/, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  const pa = norm(a), pb = norm(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

async function checkForUpdate({ force = false } = {}) {
  const current = CURRENT;
  if (process.env.NO_UPDATE_CHECK === '1') return { current, updateAvailable: false, disabled: true };
  if (!force && cache.data && Date.now() - cache.at < CACHE_MS) return cache.data;
  try {
    const res = await fetch('https://api.github.com/repos/' + REPO + '/releases/latest', {
      headers: { 'User-Agent': 'bulk-uploader-for-figshare', Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    const latest = String(j.tag_name || '').replace(/^v/, '');
    const data = {
      current,
      latest,
      updateAvailable: !!latest && cmpVersion(latest, current) > 0,
      url: j.html_url || ('https://github.com/' + REPO + '/releases/latest'),
      publishedAt: j.published_at || null,
    };
    cache = { at: Date.now(), data };
    return data;
  } catch (e) {
    return { current, updateAvailable: false, error: String((e && e.message) || e) };
  }
}

module.exports = { checkForUpdate, cmpVersion, REPO, CURRENT };
