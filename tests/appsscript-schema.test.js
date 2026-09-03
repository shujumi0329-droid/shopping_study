import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const s=fs.readFileSync(new URL('../shopping-study/AppsScript_Collector.gs',import.meta.url),'utf8');

test('Apps Script declares and handles bridge sessions',()=>{
  assert.match(s,/const BRIDGE_SHEET = "Bridge_Sessions"/);
  assert.match(s,/data\.action === "BRIDGE_START"/);
  assert.match(s,/function handleBridgeStart_/);
  assert.match(s,/function ensureBridgeSheet_/);
});

test('event and participant schema retain mode\/source',()=>{
  assert.match(s,/data\.run_mode/);
  assert.match(s,/data\.recruitment_source/);
  assert.match(s,/getRange\(row,20,1,2\)/);
  assert.match(s,/eventExists_/);
  assert.match(s,/type === "CONTINUE"/);
});
