import { collectorGet, json, STUDY_VERSION, MIN_COUNT, MAX_COUNT } from './_collector.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Method not allowed' });
  try {
    const upstream = await collectorGet({ action: 'config' });
    return json(res, 200, {
      ok: true,
      survey_url: String(upstream?.survey_url || '').trim(),
      study_version: STUDY_VERSION,
      min_count: Number(upstream?.min_count || MIN_COUNT),
      max_count: Number(upstream?.max_count || MAX_COUNT)
    });
  } catch (error) {
    console.error('config proxy failed', error);
    return json(res, 502, { ok: false, error: 'Configuration service unavailable' });
  }
}
