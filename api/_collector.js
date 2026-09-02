const DEFAULT_COLLECTOR_URL = 'https://script.google.com/macros/s/AKfycbzha7_C5tjRUYqLYa-DFSqkeRkuCjrhEKzk3khdrlir3SBkgwMtWn9qjqqtrb47Xw/exec';
export const COLLECTOR_URL = String(process.env.SHOPPING_COLLECTOR_URL || DEFAULT_COLLECTOR_URL).trim();
export const STUDY_VERSION = 'shopping-v9-survey-return-2026-09-01';
export const MIN_COUNT = 1;
export const MAX_COUNT = 7;

function requireCollectorUrl() {
  if (!COLLECTOR_URL) throw new Error('SHOPPING_COLLECTOR_URL is not configured');
  return COLLECTOR_URL;
}

export async function collectorGet(params = {}) {
  const url = new URL(requireCollectorUrl());
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const res = await fetch(url, { headers: { 'accept': 'application/json' }, redirect: 'follow' });
  const text = await res.text();
  if (!res.ok) throw new Error(`Collector GET failed (${res.status})`);
  try { return JSON.parse(text); } catch { throw new Error('Collector returned invalid JSON'); }
}

export async function collectorPost(payload) {
  const res = await fetch(requireCollectorUrl(), {
    method: 'POST',
    headers: { 'content-type': 'text/plain;charset=utf-8', 'accept': 'application/json' },
    body: JSON.stringify(payload),
    redirect: 'follow'
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Collector POST failed (${res.status})`);
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Collector returned invalid JSON'); }
  if (!data || data.ok !== true) throw new Error(data?.error || 'Collector rejected request');
  return data;
}

export function json(res, status, body) {
  res.status(status);
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  return res.json(body);
}
