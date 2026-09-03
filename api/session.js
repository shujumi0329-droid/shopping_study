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

const normalizeWorkerId = value => String(value ?? '').trim();
const validWorkerId = value => /^[A-Za-z0-9_-]{3,64}$/.test(value);

export function makeSessionHandler({
  collectorPostImpl = collectorPost,
  readBridgeSessionImpl = readBridgeSession,
  createRandomJoinIdImpl = createRandomJoinId,
  signBridgeSessionImpl = signBridgeSession,
  serializeBridgeCookieImpl = serializeBridgeCookie
} = {}) {
  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return json(res, 405, { ok: false, error: 'Method not allowed' });
    }

    const existing = readBridgeSessionImpl(req);

    if (req.method === 'POST') {
      if (!existing) return json(res, 401, { ok: false, error: 'Study session is not linked' });

      let d;
      try {
        d = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      } catch {
        return json(res, 400, { ok: false, error: 'Invalid request' });
      }

      const workerId = normalizeWorkerId(d.worker_id);
      if (!validWorkerId(workerId)) {
        return json(res, 400, { ok: false, error: 'Enter a valid MTurk Worker ID' });
      }

      if (existing.worker_id) {
        if (existing.worker_id === workerId) return json(res, 200, publicSession(existing));
        return json(res, 409, { ok: false, error: 'Worker ID is already set for this study session' });
      }

      try {
        const bound = {
          ...existing,
          join_id: existing.run_mode === 'internal' ? createRandomJoinIdImpl('TEST') : existing.join_id,
          worker_id: workerId
        };
        await persistBridgeStart(bound, collectorPostImpl);
        const token = signBridgeSessionImpl(bound);
        res.setHeader('Set-Cookie', serializeBridgeCookieImpl(token));
        return json(res, 200, publicSession(bound));
      } catch (error) {
        console.error('worker id binding failed', error);
        return json(res, 503, { ok: false, error: 'Worker ID could not be saved' });
      }
    }

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
