import { collectorPost, json, STUDY_VERSION, MIN_COUNT, MAX_COUNT } from './_collector.js';
import { readBridgeSession } from './_bridge.js';

const EVENTS = new Set(['OPEN','ADD','REMOVE','PAGE','CONTINUE','SURVEY_COMPLETE']);
const PRODUCT_RE = /^P(?:0[1-9]|1[0-9]|2[0-4])$/;
const safeText = (v, max=500) => String(v ?? '').slice(0, max);

function mergeExtraJson(raw, bridge) {
  let extra = {};
  const text = safeText(raw, 5000).trim();
  if (text) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) extra = parsed;
      else extra.client_extra = parsed;
    } catch {
      extra.client_extra_raw = text;
    }
  }
  extra.run_mode = bridge.run_mode;
  extra.recruitment_source = bridge.recruitment_source;
  return JSON.stringify(extra).slice(0, 5000);
}

export function makeEventHandler({collectorPostImpl=collectorPost,readBridgeSessionImpl=readBridgeSession}={}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });
    try {
      const bridge = readBridgeSessionImpl(req);
      if (!bridge) return json(res, 401, { ok: false, error: 'Study session is not linked. Please reopen the study from the authorized entry link.' });
      const d = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const type = safeText(d.event_type, 40);
      if (!EVENTS.has(type)) return json(res, 400, { ok: false, error: 'Invalid event_type' });
      if (d.product_id && !PRODUCT_RE.test(String(d.product_id))) return json(res, 400, { ok: false, error: 'Invalid product_id' });

      const selectedItems = safeText(d.selected_items, 500).split(',').filter(Boolean);
      const uniqueItems = [...new Set(selectedItems)];
      if (uniqueItems.some(id => !PRODUCT_RE.test(id))) return json(res, 400, { ok: false, error: 'Invalid selected_items' });
      const selectedCount = Number(d.selected_count || 0);
      if (!Number.isFinite(selectedCount) || selectedCount < 0 || selectedCount > MAX_COUNT) return json(res, 400, { ok: false, error: 'Invalid selected_count' });
      if (type === 'CONTINUE' && (selectedCount < MIN_COUNT || selectedCount > MAX_COUNT || uniqueItems.length !== selectedCount)) {
        return json(res, 400, { ok: false, error: 'Selection is incomplete or inconsistent' });
      }

      const eventId = safeText(d.event_id, 120).trim();
      if (!eventId) return json(res, 400, { ok: false, error: 'Missing event_id' });

      const payload = {
        event_id: eventId,
        join_id: safeText(bridge.join_id, 200),
        session_id: safeText(d.session_id, 200),
        assignment_id: safeText(bridge.assignment_id, 200),
        worker_id: safeText(bridge.worker_id, 200),
        hit_id: safeText(bridge.hit_id, 200),
        run_mode: safeText(bridge.run_mode, 20),
        recruitment_source: safeText(bridge.recruitment_source, 40),
        event_type: type,
        product_id: safeText(d.product_id, 20),
        page: Math.max(1, Math.min(2, Number(d.page || 1))),
        selected_count: selectedCount,
        selected_items: uniqueItems.join(','),
        selection_order: safeText(d.selection_order, 500),
        elapsed_ms: Math.max(0, Number(d.elapsed_ms || 0)),
        study_version: STUDY_VERSION,
        client_time: safeText(d.client_time, 80),
        user_agent: safeText(d.user_agent, 1000),
        referrer: safeText(d.referrer, 1000),
        extra_json: mergeExtraJson(d.extra_json, bridge),
        selected_total_usd: Math.max(0, Number(d.selected_total_usd || 0))
      };

      await collectorPostImpl(payload);
      return json(res, 200, { ok: true, event_id: eventId });
    } catch (error) {
      console.error('event delivery failed', error);
      return json(res, 503, { ok: false, error: 'Event could not be saved' });
    }
  };
}

export default makeEventHandler();
