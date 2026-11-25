'use strict';

const { createHash, timingSafeEqual } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const hash = (value) => createHash('sha256').update(value).digest();
const count = new Intl.NumberFormat('en-US');
const labels = ['Runs', 'Failures', 'Success %', 'p50 ms', 'p95 ms', 'Runs with input', 'Input tokens', 'Runs with output', 'Output tokens'];

function authorized(header, password) {
  if (typeof header !== 'string' || header.length > 2048) return false;
  const expected = 'Basic ' + Buffer.from('admin:' + password).toString('base64');
  return timingSafeEqual(hash(header), hash(expected));
}

function destination(env) {
  const { POSTHOG_ORIGIN: raw, POSTHOG_PROJECT_ID: id, POSTHOG_QUERY_KEY: key } = env;
  if (!raw || !/^[1-9][0-9]{0,14}$/.test(id || '') || !key?.startsWith('phx_')) return null;
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
  return { url: new URL('/api/projects/' + id + '/query/', url).href, key };
}

function html(body) {
  return `<!doctype html><html lang="hu"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OpenCue · Futási statisztika</title>
  <style>
  :root{color-scheme:light dark}body{margin:0;font:16px/1.5 system-ui}main{max-width:78rem;margin:6vh auto;padding:1.5rem}
  h1{font-size:clamp(1.7rem,5vw,2.8rem);margin:.4rem 0}.hint{opacity:.8}table{border-collapse:collapse;width:100%;min-width:62rem}
  th,td{padding:.65rem;text-align:right;border-bottom:1px solid GrayText}th:first-child,td:first-child{text-align:left}
  .scroll{overflow:auto;padding-bottom:.3rem} .brand{font-weight:700;letter-spacing:.08em}
  </style><main><span class="brand">OPENCUE / ADMIN</span><h1>Futási statisztika</h1>${body}</main></html>`;
}

function table(results) {
  const rows = results.filter((row) => Array.isArray(row) && ['gitguardex', 'cue'].includes(row[0]));
  if (!rows.length) return '<p>Még nincs megjeleníthető futás.</p>';
  return '<div class="scroll" role="region" aria-label="Futások összesítése" tabindex="0"><table><thead><tr><th scope="col">Termék</th>' +
    labels.map((label) => '<th scope="col">' + label + '</th>').join('') +
    '</tr></thead><tbody>' +
    rows.map((row) => '<tr><th scope="row">' + (row[0] === 'cue' ? 'Cue' : 'GitGuardex') +
      '</th>' + labels.map((_, i) => {
        const raw = row[i + 1];
        const value = typeof raw === 'string' && /^\d{1,32}(?:\.\d{1,12})?$/.test(raw) ? Number(raw) : raw;
        const totalWithoutSample = (i === 6 || i === 8) && !Number(row[i]);
        const display = !totalWithoutSample && typeof value === 'number' && Number.isFinite(value) ? count.format(value) : '—';
        return '<td>' + display + '</td>';
      }).join('') + '</tr>').join('') + '</tbody></table></div>';
}

function makeHandler(env = process.env, request = globalThis.fetch) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'");
    const finish = (status, text, type = 'text/plain; charset=utf-8') => {
      res.statusCode = status;
      res.setHeader('Content-Type', type);
      res.end(text);
    };
    if (req.method !== 'GET') return finish(405, 'Method not allowed.');
    const password = env.RUN_ANALYTICS_ADMIN_PASSWORD;
    if (!password || password.length < 24) return finish(503, 'Admin access is not configured.');
    if (!authorized(req.headers.authorization, password)) {
      res.setHeader('WWW-Authenticate', 'Basic realm="OpenCue Analytics", charset="UTF-8"');
      return finish(401, 'Sign in to OpenCue Analytics.');
    }
    const render = (status, text) => finish(status, html(text), 'text/html; charset=utf-8');
    try {
      const settings = destination(env);
      if (!settings) return render(200, '<p>A PostHog adatforrás még nincs bekötve. Nem érkeznek ide futási adatok.</p>');
      const sql = readFileSync(join(__dirname, '../overview.sql'), 'utf8');
      const upstream = await request(settings.url, {
        method: 'POST',
        headers: { authorization: 'Bearer ' + settings.key, 'content-type': 'application/json' },
        body: JSON.stringify({ query: { kind: 'HogQLQuery', query: sql, name: 'OpenCue runs (30 days)' } }),
        redirect: 'error',
        signal: AbortSignal.timeout(4000),
      });
      if (!upstream.ok) {
        if (upstream.body) await upstream.body.cancel();
        return render(502, '<p>A PostHog adatforrás most nem érhető el.</p>');
      }
      const { results } = await upstream.json();
      if (!Array.isArray(results)) return render(502, '<p>A PostHog válasza nem feldolgozható.</p>');
      return render(200, '<p class="hint">Utolsó 30 nap · csak engedéllyel beküldött futások. A — hiányzó mérés.</p>' + table(results));
    } catch {
      return render(502, '<p>A PostHog adatforrás most nem érhető el.</p>');
    }
  };
}

module.exports = makeHandler();
module.exports.makeHandler = makeHandler;
