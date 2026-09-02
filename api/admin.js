import { collectorGet, collectorPost, json } from './_collector.js';

async function verifyPassword(password) {
  const config = await collectorGet({ action: 'config' });
  const surveyUrl = String(config?.survey_url || '').trim();
  await collectorPost({
    action: 'ADMIN_SET_SURVEY',
    password: String(password || ''),
    survey_url: surveyUrl
  });
  return surveyUrl;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });
  try {
    const d = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const action = String(d.action || 'verify');
    const password = String(d.password || '');

    if (action === 'verify') {
      const surveyUrl = await verifyPassword(password);
      return json(res, 200, { ok: true, survey_url: surveyUrl });
    }

    if (action !== 'set-survey') return json(res, 400, { ok: false, error: 'Unknown action' });
    const surveyUrl = String(d.survey_url || '').trim();
    if (surveyUrl && !/^https:\/\//i.test(surveyUrl)) {
      return json(res, 400, { ok: false, error: 'Questionnaire URL must use https://' });
    }

    const upstream = await collectorPost({
      action: 'ADMIN_SET_SURVEY',
      password,
      survey_url: surveyUrl
    });
    return json(res, 200, { ok: true, survey_url: String(upstream?.survey_url || surveyUrl) });
  } catch (error) {
    const message = String(error?.message || error || '');
    if (/invalid admin password/i.test(message)) {
      return json(res, 401, { ok: false, error: 'Invalid password' });
    }
    console.error('admin proxy failed', error);
    return json(res, 502, { ok: false, error: 'Admin service unavailable' });
  }
}
