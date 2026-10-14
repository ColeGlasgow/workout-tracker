import { getStore } from '@netlify/blobs';
import { timingSafeEqual } from 'node:crypto';

// Reforged's drop box. Every request needs the x-lift-key header to match LIFT_KEY.
//   POST /api/health {date, sleep, weight, rhr, hrv, steps}  from the iPhone Shortcut (Apple Health, fed by Garmin)
//   GET  /api/health                                           the app reads them by date
//   GET  /api/log, PUT /api/log {data, cw, cyc}                automatic cloud copy of the workout log
const json = (body, status = 200) => Response.json(body, { status });

function keyOk(got) {
  const want = Buffer.from(Netlify.env.get('LIFT_KEY') || ''), have = Buffer.from(got || '');
  return want.length >= 16 && have.length === want.length && timingSafeEqual(have, want);
}
const num = v => Number(String(v ?? '').replace(/[^\d.]/g, ''));
const inRange = (v, lo, hi, dp = 0) => { const n = num(v); return n >= lo && n <= hi ? +n.toFixed(dp) : undefined };
// Shortcuts may hand sleep over as hours, minutes or seconds
function hours(v) {
  let n = num(v);
  if (!(n > 0)) return;
  if (n > 1440) n /= 3600;
  else if (n > 24) n /= 60;
  return n <= 16 ? +n.toFixed(1) : undefined;
}

export default async req => {
  if (!keyOk(req.headers.get('x-lift-key'))) return json({ error: 'Wrong or missing key' }, 401);
  const store = getStore({ name: 'reforged', consistency: 'strong' });
  const what = new URL(req.url).pathname.split('/').pop();

  if (what === 'health') {
    const all = (await store.get('health', { type: 'json' })) || {};
    if (req.method === 'GET') return json(all);
    if (req.method !== 'POST') return json({ error: 'Use GET or POST' }, 405);
    const b = await req.json().catch(() => ({}));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return json({ error: 'Send date as YYYY-MM-DD', got: b }, 400);
    const got = {
      sleep: hours(b.sleep), weight: inRange(b.weight, 50, 600, 1), rhr: inRange(b.rhr, 25, 150),
      hrv: inRange(b.hrv, 5, 300), steps: inRange(b.steps, 1, 150000),
    };
    for (const k in got) if (got[k] === undefined) delete got[k];
    if (!Object.keys(got).length) return json({ error: 'Send at least one of sleep (hours), weight (lb), rhr, hrv, steps', got: b }, 400);
    all[b.date] = { ...all[b.date], ...got };
    const keep = Object.keys(all).sort().slice(-400);  // about 13 months
    await store.setJSON('health', Object.fromEntries(keep.map(d => [d, all[d]])));
    return json({ saved: b.date, ...all[b.date] });
  }

  if (what === 'log') {
    if (req.method === 'GET') return json((await store.get('log', { type: 'json' })) || {});
    if (req.method !== 'PUT') return json({ error: 'Use GET or PUT' }, 405);
    const text = await req.text();
    if (text.length > 2e6) return json({ error: 'Log too big' }, 413);
    let b;
    try { b = JSON.parse(text) } catch { return json({ error: 'Not JSON' }, 400) }
    if (!b?.data || typeof b.data !== 'object') return json({ error: 'Send {data, cw, cyc}' }, 400);
    // the app sanitizes every set again when it merges this back in
    await store.setJSON('log', { saved: new Date().toISOString(), data: b.data, cw: b.cw, cyc: b.cyc });
    return json({ saved: true });
  }

  return json({ error: 'Not found' }, 404);
};

export const config = { path: ['/api/health', '/api/log'] };
