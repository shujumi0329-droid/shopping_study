import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../shopping-study-vercel/index.html',import.meta.url),'utf8');

test('shopping bootstraps from server bridge before OPEN',()=>{
  assert.match(html,/fetch\('\/api\/session'/);
  assert.match(html,/loadBridgeSession/);
  assert.doesNotMatch(html,/const joinId=\(!preview&&assignmentId\)\?assignmentId:sessionId/);
  const sessionPos=html.indexOf("fetch('/api/session'");
  const openPos=html.lastIndexOf("fire('OPEN'");
  assert.ok(sessionPos>=0&&openPos>sessionPos);
});

test('unlinked direct access is blocked with explicit test guidance',()=>{
  assert.match(html,/unlinkedBackdrop/);
  assert.match(html,/authorized study link/i);
  assert.match(html,/internal testers/i);
  assert.match(html,/\/test/);
});

test('existing study constraints and return behavior remain',()=>{
  assert.match(html,/minCount:1,maxCount:7/);
  assert.match(html,/visitedPage2/);
  assert.match(html,/window\.close\(\)/);
  assert.match(html,/history\.back\(\)/);
  assert.match(html,/Natural Crystal Hedgehog Pet Rock/);
  assert.match(html,/Stelle Cute Softball Plush Keychain/);
});
