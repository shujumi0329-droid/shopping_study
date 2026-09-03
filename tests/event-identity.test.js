import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEventHandler } from '../api/event.js';

function resMock(){return{statusCode:200,headers:{},body:null,status(n){this.statusCode=n;return this},setHeader(k,v){this.headers[k.toLowerCase()]=v;return this},json(v){this.body=v;return this}}}
const linked={join_id:'ST_ABCDEF1234567890ABCDEF12',run_mode:'production',recruitment_source:'mturk',assignment_id:'REAL-A',worker_id:'REAL-W',hit_id:'REAL-H'};

test('unlinked event is rejected before collector write',async()=>{
  let calls=0;
  const h=makeEventHandler({collectorPostImpl:async()=>{calls++},readBridgeSessionImpl:()=>null});
  const res=resMock();
  await h({method:'POST',body:{event_id:'e1',event_type:'OPEN'},headers:{}},res);
  assert.equal(res.statusCode,401);
  assert.equal(calls,0);
});

test('spoofed client identity is replaced with signed bridge identity',async()=>{
  let saved;
  const h=makeEventHandler({collectorPostImpl:async p=>{saved=p;return{ok:true}},readBridgeSessionImpl:()=>linked});
  const res=resMock();
  await h({method:'POST',headers:{},body:{
    event_id:'e2',event_type:'ADD',product_id:'P03',page:1,selected_count:1,selected_items:'P03',selection_order:'P03',
    join_id:'EVIL',assignment_id:'EVIL-A',worker_id:'EVIL-W',hit_id:'EVIL-H',session_id:'browser-session',extra_json:'{"foo":"bar"}'
  }},res);
  assert.equal(res.statusCode,200);
  assert.equal(saved.join_id,linked.join_id);
  assert.equal(saved.assignment_id,'REAL-A');
  assert.equal(saved.worker_id,'REAL-W');
  assert.equal(saved.hit_id,'REAL-H');
  assert.equal(saved.run_mode,'production');
  assert.equal(saved.recruitment_source,'mturk');
  assert.equal(saved.session_id,'browser-session');
  const extra=JSON.parse(saved.extra_json);
  assert.equal(extra.foo,'bar');
  assert.equal(extra.run_mode,'production');
  assert.equal(extra.recruitment_source,'mturk');
});

test('existing selection validation remains enforced',async()=>{
  let calls=0;
  const h=makeEventHandler({collectorPostImpl:async()=>{calls++},readBridgeSessionImpl:()=>linked});
  const badProduct=resMock();
  await h({method:'POST',headers:{},body:{event_id:'e3',event_type:'ADD',product_id:'P99'}},badProduct);
  assert.equal(badProduct.statusCode,400);
  const badContinue=resMock();
  await h({method:'POST',headers:{},body:{event_id:'e4',event_type:'CONTINUE',selected_count:2,selected_items:'P01'}},badContinue);
  assert.equal(badContinue.statusCode,400);
  assert.equal(calls,0);
});
