import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const vercel = fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8');
const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');

test('friendly bridge rewrites exist', () => {
  assert.ok(vercel.includes('"source": "/start"'));
  assert.ok(vercel.includes('"destination": "/api/start"'));
  assert.ok(vercel.includes('"source": "/test"'));
  assert.ok(vercel.includes('"destination": "/api/test"'));
});

test('operator docs cover bridge secrets and modes', () => {
  for (const text of [
    'BRIDGE_SIGNING_SECRET',
    'INTERNAL_TEST_TOKEN',
    '/start',
    '/test',
    'ASSIGNMENT_ID_NOT_AVAILABLE',
    'same canonical Vercel hostname',
    'run_mode=production'
  ]) assert.ok(readme.toLowerCase().includes(text.toLowerCase()), `missing ${text}`);
});
