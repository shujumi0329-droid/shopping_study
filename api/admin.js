import crypto from 'node:crypto';
import { collectorGet, collectorPost, json } from './_collector.js';

const expectedHash = () => String(process.env.SHOPPING_ADMIN_PASSWORD_SHA256 || '').trim().toLowerCase();
const hash = value => crypto.createHash('sha256').update(String(value || '')).digest('hex');
const validPassword = value => {
  const expected = expectedHash();
  if (!/^[a-f0-9]{64}$/.test(expected)) return false;
  const a = Buffer.from(hash(value));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });
  try {
    const d = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (!validPassword(d.password)) return json(res, 401, { ok: false, error: 'Invalid password' });
    const action = String(d.action || 'verify');
    if (action === 'verify') {
      const config = await collectorGet({ action: 'config' });
      return json(res, 200, { ok: true, survey_url: String(config?.survey_url || '').trim() });
    }
    if (action !== 'set-survey') return json(res, 400, { ok: false, error: 'Unknown action' });
    const surveyUrl = String(d.survey_url || '').trim();
    if (surveyUrl && !/^https:\/\//i.test(surveyUrl)) return json(res, 400, { ok: false, error: 'Questionnaire URL must use https://' });
    const upstream = await collectorPost({ action: 'ADMIN_SET_SURVEY', password: String(d.password || ''), survey_url: surveyUrl });
    return json(res, 200, { ok: true, survey_url: String(upstream?.survey_url || surveyUrl) });
  } catch (error) {
    console.error('admin proxy failed', error);
    return json(res, 502, { ok: false, error: 'Admin service unavailable' });
  }
}
