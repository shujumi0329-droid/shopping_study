import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../shopping-study-vercel/index.html',import.meta.url),'utf8');

test('shopping requests Worker ID only when the bridge does not already have one',()=>{
  assert.match(html,/function ensureWorkerId/);
  assert.match(html,/bridge\.worker_id/);
  assert.match(html,/Please enter your MTurk Worker ID/i);
  assert.match(html,/method:'POST'/);
  assert.match(html,/worker_id/);
});

test('Worker ID binding completes before the first OPEN event',()=>{
  const bindPos=html.indexOf('ensureWorkerId');
  const openPos=html.lastIndexOf("fire('OPEN'");
  assert.ok(bindPos>=0 && openPos>bindPos);
  assert.match(html,/if\(!await ensureWorkerId\(\)\)return/);
});
