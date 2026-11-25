// SPDX-License-Identifier: MIT
'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sendRun } = require('./client.cjs');

const env = {
  OPENCUE_RUN_ANALYTICS: '1',
  OPENCUE_RUN_ANALYTICS_HOST: 'https://analytics.example.test',
  OPENCUE_RUN_ANALYTICS_PROJECT_KEY: 'phc_synthetic_test_key',
};
const run = { product: 'cue', durationMs: 1250, ok: true, provider: 'codex' };

test('no network without separate opt-in, legal HTTPS origin and project key', async () => {
  let requests = 0;
  const request = async () => {
    requests++;
    return new Response();
  };
  for (const envOverrides of [
    { OPENCUE_RUN_ANALYTICS: undefined },
    { DO_NOT_TRACK: '1' },
    { OPENCUE_RUN_ANALYTICS_HOST: undefined },
    { OPENCUE_RUN_ANALYTICS_HOST: 'http://analytics.example.test' },
    { OPENCUE_RUN_ANALYTICS_HOST: 'https://user:password@analytics.example.test' },
    { OPENCUE_RUN_ANALYTICS_HOST: 'https://analytics.example.test/path' },
    { OPENCUE_RUN_ANALYTICS_PROJECT_KEY: 'phx_management_key_not_allowed' },
  ]) {
    assert.equal(await sendRun(run, { ...env, ...envOverrides }, request), false);
  }
  assert.equal(await sendRun({ ...run, ok: 'yes' }, env, request), false);
  assert.equal(requests, 0);
});

test('only the allowlisted fields leave the process; IDs are per run', async () => {
  const sent = [];
  const request = async (url, init) => {
    assert.equal(url, 'https://analytics.example.test/i/v0/e/');
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'error');
    sent.push(JSON.parse(init.body));
    return new Response();
  };
  const local = {
    ...run,
    inputTokens: 37,
    outputTokens: -1,
    prompt: 'private prompt',
    cwd: '/home/private/project',
    email: 'private@example.test',
    transcript: ['private transcript'],
  };
  assert.equal(await sendRun(local, env, request), true);
  assert.equal(await sendRun({ product: 'gitguardex', durationMs: 1, ok: false }, env, request), true);
  assert.notEqual(sent[0].distinct_id, sent[1].distinct_id);
  assert.deepEqual(sent[0].properties, {
    schema_version: 1, product: 'cue', operation: 'launch', outcome: 'success',
    duration_ms: 1250, provider: 'codex', input_tokens: 37,
    $process_person_profile: false, $geoip_disable: true,
  });
  assert.deepEqual(sent[1].properties, {
    schema_version: 1, product: 'gitguardex', operation: 'finish', outcome: 'failure',
    duration_ms: 1, $process_person_profile: false, $geoip_disable: true,
  });
});

test('offline and HTTP rejection are harmless; there is no retry', async () => {
  let calls = 0;
  assert.equal(await sendRun(run, env, async () => {
    calls++;
    throw new Error('offline');
  }), false);
  assert.equal(await sendRun(run, env, async () => {
    calls++;
    return new Response('unavailable', { status: 503 });
  }), false);
  assert.equal(calls, 2);
});
