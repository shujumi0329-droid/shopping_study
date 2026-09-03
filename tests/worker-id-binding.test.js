import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSessionHandler } from '../api/session.js';

function resMock(){return {statusCode:200,headers:{},body:null,status(n){this.statusCode=n;return this},setHeader(k,v){this.headers[k.toLowerCase()]=v;return this},json(v){this.body=v;return this}}}
const blankInternal={join_id:'TEST_OLD123456789012345678',run_mode:'internal',recruitment_source:'internal_test',assignment_id:'',worker_id:'',hit_id:''};

test('POST /api/session binds a Worker ID to an existing blank internal session', async()=>{
  const writes=[];
  const h=makeSessionHandler({
    collectorPostImpl:async p=>{writes.push(p);return {ok:true}},
    readBridgeSessionImpl:()=>blankInternal,
    createRandomJoinIdImpl:()=> 'TEST_BOUND12345678901234567',
    signBridgeSessionImpl:s=>`signed-${s.worker_id}`,
    serializeBridgeCookieImpl:t=>`shopping_bridge=${t}`
  });
  const res=resMock();
  await h({method:'POST',body:{worker_id:'A123WORKER'},headers:{}},res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.worker_id,'A123WORKER');
  assert.equal(res.body.join_id,'TEST_BOUND12345678901234567');
  assert.match(String(res.headers['set-cookie']),/signed-A123WORKER/);
  assert.equal(writes.length,1);
  assert.equal(writes[0].worker_id,'A123WORKER');
  assert.equal(writes[0].join_id,'TEST_BOUND12345678901234567');
});

test('POST /api/session rejects malformed Worker IDs', async()=>{
  const h=makeSessionHandler({readBridgeSessionImpl:()=>blankInternal});
  const res=resMock();
  await h({method:'POST',body:{worker_id:'bad worker id!'},headers:{}},res);
  assert.equal(res.statusCode,400);
});

test('GET blank internal session does not write a participant before Worker ID is entered', async()=>{
  const writes=[];
  const h=makeSessionHandler({
    collectorPostImpl:async p=>{writes.push(p);return {ok:true}},
    readBridgeSessionImpl:()=>null,
    createRandomJoinIdImpl:()=> 'TEST_TEMP123456789012345678',
    signBridgeSessionImpl:()=> 'signed-temp',
    serializeBridgeCookieImpl:t=>`shopping_bridge=${t}`
  });
  const res=resMock();
  await h({method:'GET',headers:{}},res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.worker_id,'');
  assert.equal(writes.length,0);
});
