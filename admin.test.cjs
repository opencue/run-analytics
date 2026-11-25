'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { makeHandler } = require('./api/admin.js');

const password = 'this-value-is-only-a-test-fixture';
const basic = 'Basic ' + Buffer.from('admin:' + password).toString('base64');
const env = { RUN_ANALYTICS_ADMIN_PASSWORD: password };
const configured = {
  ...env,
  POSTHOG_ORIGIN: 'https://posthog.example.org',
  POSTHOG_PROJECT_ID: '123',
  POSTHOG_QUERY_KEY: 'phx_test_fixture',
};

async function invoke(handler, authorization, method = 'GET') {
  const headers = {};
  const res = { setHeader: (key, value) => { headers[key] = value; }, end: (body) => { res.body = body; } };
  await handler({ method, headers: { authorization } }, res);
  return { status: res.statusCode, headers, body: res.body };
}

test('admin fails closed without password and never queries PostHog before auth', async () => {
  let requests = 0;
  const fetch = () => { requests++; };
  assert.equal((await invoke(makeHandler({}, fetch), basic)).status, 503);
  const handler = makeHandler(configured, fetch);
  for (const auth of [undefined, 'Basic invalid']) {
    const result = await invoke(handler, auth);
    assert.equal(result.status, 401);
    assert.match(result.headers['WWW-Authenticate'], /^Basic /);
    assert.match(result.headers['Cache-Control'], /private, no-store/);
    assert.doesNotMatch(result.body, /Futási statisztika/);
  }
  assert.equal((await invoke(handler, basic, 'POST')).status, 405);
  assert.equal(requests, 0);
});

test('authenticated dashboard states when collection is not configured', async () => {
  const result = await invoke(makeHandler(env, () => assert.fail('unexpected query')), basic);
  assert.equal(result.status, 200);
  assert.match(result.body, /adatforrás még nincs bekötve/);
});

test('only renders expected aggregate rows from the configured PostHog origin', async () => {
  let requests = 0;
  const handler = makeHandler(configured, async (url, options) => {
    requests++;
    assert.equal(url, 'https://posthog.example.org/api/projects/123/query/');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.authorization, 'Bearer phx_test_fixture');
    assert.equal(JSON.parse(options.body).query.kind, 'HogQLQuery');
    return Response.json({ results: [['cue', '42', 1, 97.62, 250, 345, 0, 0, 1, '<script>'], ['<img>', 7]] });
  });
  const result = await invoke(handler, basic);
  assert.equal(requests, 1);
  assert.equal(result.status, 200);
  assert.match(result.body, /<th scope="row">Cue<\/th><td>42<\/td>/);
  assert.match(result.body, /<td>—<\/td>/);
  assert.doesNotMatch(result.body, /<script>|<img>|phx_/);
});

test('does not return upstream error details to the browser', async () => {
  const result = await invoke(makeHandler(configured, async () => new Response('private upstream error', { status: 403 })), basic);
  assert.equal(result.status, 502);
  assert.doesNotMatch(result.body, /private upstream error/);
});
