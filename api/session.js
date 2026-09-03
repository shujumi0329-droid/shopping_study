import { collectorPost, persistBridgeStart, json } from './_collector.js';
import { createRandomJoinId, readBridgeSession, signBridgeSession, serializeBridgeCookie } from './_bridge.js';

const publicSession = s => ({
  ok: true,
  linked: true,
  join_id: s.join_id,
  run_mode: s.run_mode,
  recruitment_source: s.recruitment_source,
  assignment_id: s.assignment_id || '',
  worker_id: s.worker_id || '',
  hit_id: s.hit_id || ''
});

export function makeSessionHandler({
  collectorPostImpl = collectorPost,
  readBridgeSessionImpl = readBridgeSession,
  createRandomJoinIdImpl = createRandomJoinId,
  signBridgeSessionImpl = signBridgeSession,
  serializeBridgeCookieImpl = serializeBridgeCookie
} = {}) {
  return async function handler(req, res) {
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Method not allowed' });

    const existing = readBridgeSessionImpl(req);
    if (existing) return json(res, 200, publicSession(existing));

    try {
      const session = {
        join_id: createRandomJoinIdImpl('TEST'),
        run_mode: 'internal',
        recruitment_source: 'internal_test',
        assignment_id: '',
        worker_id: '',
        hit_id: ''
      };
      await persistBridgeStart(session, collectorPostImpl);
      const token = signBridgeSessionImpl(session);
      res.setHeader('Set-Cookie', serializeBridgeCookieImpl(token));
      return json(res, 200, publicSession(session));
    } catch (error) {
      console.error('internal session bootstrap failed', error);
      return json(res, 503, { ok: false, linked: false, error: 'Internal test session could not be initialized' });
    }
  };
}

export default makeSessionHandler();
