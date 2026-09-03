import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveProductionJoinId,
  createRandomJoinId,
  signBridgeSession,
  verifyBridgeSession,
  parseCookieHeader,
  serializeBridgeCookie
} from '../api/_bridge.js';

const secret='super-secret-test-key';

test('production join id is deterministic and assignment-specific',()=>{
  const a=deriveProductionJoinId('ASSIGN-A',secret);
  const b=deriveProductionJoinId('ASSIGN-A',secret);
  const c=deriveProductionJoinId('ASSIGN-B',secret);
  assert.match(a,/^ST_[0-9A-F]{24}$/);
  assert.equal(a,b);
  assert.notEqual(a,c);
});

test('random ids use requested prefix',()=>{
  assert.match(createRandomJoinId('TEST'),/^TEST_[0-9A-F]{24}$/);
  assert.match(createRandomJoinId('PREVIEW'),/^PREVIEW_[0-9A-F]{24}$/);
});

test('signed bridge token verifies and tampering fails',()=>{
  const now=1_700_000_000_000;
  const session={join_id:'TEST_ABCDEF1234567890ABCDEF12',run_mode:'internal',recruitment_source:'internal_test',assignment_id:'',worker_id:'',hit_id:''};
  const token=signBridgeSession(session,secret,now);
  const verified=verifyBridgeSession(token,secret,now+1000);
  assert.equal(verified.join_id,session.join_id);
  assert.equal(verified.run_mode,'internal');
  const tampered=token.slice(0,-1)+(token.endsWith('A')?'B':'A');
  assert.equal(verifyBridgeSession(tampered,secret,now+1000),null);
  assert.equal(verifyBridgeSession(token,secret,now+6*60*60*1000+1),null);
});

test('cookie helpers use secure research-session attributes',()=>{
  const parsed=parseCookieHeader('a=1; shopping_bridge=abc.def; z=9');
  assert.equal(parsed.shopping_bridge,'abc.def');
  const header=serializeBridgeCookie('abc.def',21600);
  assert.match(header,/shopping_bridge=abc\.def/);
  assert.match(header,/HttpOnly/);
  assert.match(header,/Secure/);
  assert.match(header,/SameSite=Lax/);
  assert.match(header,/Path=\//);
  assert.match(header,/Max-Age=21600/);
});
