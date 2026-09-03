import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStartHandler } from '../api/start.js';
import { makeTestHandler } from '../api/test.js';
import sessionHandler from '../api/session.js';
import { signBridgeSession, serializeBridgeCookie, deriveInternalTestToken } from '../api/_bridge.js';

function resMock(){
  return {
    statusCode:200, headers:{}, body:undefined, ended:false,
    status(n){this.statusCode=n;return this},
    setHeader(k,v){this.headers[k.toLowerCase()]=v;return this},
    json(v){this.body=v;this.ended=true;return this},
    end(v){this.body=v;this.ended=true;return this}
  };
}
const configOk=async()=>({ok:true,survey_url:'https://www.surveycake.com/s/damqZ'});

test('/start rejects missing assignment id',async()=>{
  const writes=[];
  const h=makeStartHandler({collectorGetImpl:configOk,collectorPostImpl:async p=>writes.push(p),secret:'s'});
  const res=resMock();
  await h({method:'GET',query:{},headers:{}},res);
  assert.equal(res.statusCode,400);
  assert.equal(writes.length,0);
});

test('/start creates production mapping and redirect',async()=>{
  const writes=[];
  const h=makeStartHandler({collectorGetImpl:configOk,collectorPostImpl:async p=>{writes.push(p);return {ok:true}},secret:'s'});
  const res=resMock();
  await h({method:'GET',query:{assignmentId:'A1',workerId:'W1',hitId:'H1'},headers:{}},res);
  assert.equal(res.statusCode,302);
  assert.equal(res.headers.location,'https://www.surveycake.com/s/damqZ');
  assert.match(String(res.headers['set-cookie']),/shopping_bridge=/);
  assert.equal(writes[0].action,'BRIDGE_START');
  assert.equal(writes[0].event_type,'BRIDGE_START');
  assert.equal(writes[0].run_mode,'production');
  assert.equal(writes[0].assignment_id,'A1');
  assert.match(writes[0].join_id,/^ST_/);
});

test('/start classifies MTurk preview separately',async()=>{
  const writes=[];
  const h=makeStartHandler({collectorGetImpl:configOk,collectorPostImpl:async p=>writes.push(p),secret:'s'});
  const res=resMock();
  await h({method:'GET',query:{assignmentId:'ASSIGNMENT_ID_NOT_AVAILABLE'},headers:{}},res);
  assert.equal(res.statusCode,302);
  assert.equal(writes[0].run_mode,'preview');
  assert.equal(writes[0].recruitment_source,'mturk_preview');
  assert.match(writes[0].join_id,/^PREVIEW_/);
});

test('/test rejects invalid access and creates internal bridge for valid access',async()=>{
  const writes=[];
  const h=makeTestHandler({collectorGetImpl:configOk,collectorPostImpl:async p=>writes.push(p),secret:'s',internalToken:'token123'});
  const bad=resMock();
  await h({method:'GET',query:{access:'wrong'},headers:{}},bad);
  assert.equal(bad.statusCode,403);
  assert.equal(writes.length,0);
  const good=resMock();
  await h({method:'GET',query:{access:'token123'},headers:{}},good);
  assert.equal(good.statusCode,302);
  assert.equal(writes[0].run_mode,'internal');
  assert.equal(writes[0].recruitment_source,'internal_test');
  assert.match(writes[0].join_id,/^TEST_/);
});

test('/api/session reports linked and unlinked state',async()=>{
  const unlinked=resMock();
  await sessionHandler({method:'GET',headers:{}},unlinked);
  assert.deepEqual(unlinked.body,{ok:true,linked:false});

  const old=process.env.BRIDGE_SIGNING_SECRET;
  process.env.BRIDGE_SIGNING_SECRET='secret';
  try{
    const token=signBridgeSession({join_id:'TEST_ABCDEF1234567890ABCDEF12',run_mode:'internal',recruitment_source:'internal_test'},'secret');
    const linked=resMock();
    await sessionHandler({method:'GET',headers:{cookie:serializeBridgeCookie(token,21600).split(';')[0]}},linked);
    assert.equal(linked.body.linked,true);
    assert.equal(linked.body.run_mode,'internal');
    assert.equal(linked.body.join_id,'TEST_ABCDEF1234567890ABCDEF12');
  } finally { if(old===undefined) delete process.env.BRIDGE_SIGNING_SECRET; else process.env.BRIDGE_SIGNING_SECRET=old; }
});

test('/test derives a stable internal token when explicit env token is unavailable',async()=>{
  const writes=[];
  const expected=deriveInternalTestToken('s');
  const h=makeTestHandler({collectorGetImpl:configOk,collectorPostImpl:async p=>writes.push(p),secret:'s',internalToken:''});
  const res=resMock();
  await h({method:'GET',query:{access:expected},headers:{}},res);
  assert.equal(res.statusCode,302);
  assert.equal(writes[0].run_mode,'internal');
});
