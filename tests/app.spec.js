import { test, expect } from '@playwright/test';

// Home list order. Fri (3) and Mon (7) are rest days and don't open.
const DAY = { tue: 0, wed: 1, thu: 2, sat: 4, sun: 5, fullBody: 6 };
const WED = '2026-10-14T06:10:00', SAT = '2026-10-17T09:00:00';
const at = d => Date.parse(d + 'T12:00');

// Opens the app on a fresh phone at a fixed time. `store` seeds localStorage once, so it survives reloads.
// `install` gives the page a controllable clock (for the rest timer and the backup delay).
async function open(page, { time = WED, store = {}, install = false } = {}) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());  // same fallback font on every run
  if (install) await page.clock.install({ time: new Date(time) });
  else await page.clock.setFixedTime(new Date(time));
  await page.addInitScript(s => {
    if (sessionStorage.seeded) return;
    sessionStorage.seeded = 1; localStorage.clear();
    for (const k in s) localStorage.setItem(k, typeof s[k] === 'string' ? s[k] : JSON.stringify(s[k]));
  }, store);
  await page.goto('/');
  await expect(page.locator('.dy').first()).toBeVisible();
  if (install) await page.clock.pauseAt(new Date(Date.parse(time) + 5000));
  return errors;
}
const day = (page, n) => page.locator('.dy').nth(n).click();
const back = page => page.locator('.wb').click();
const tab = (page, n) => page.locator('.ni').nth(n).click();  // 0 Train, 1 Dashboard, 2 Profile
const row = (page, lift, set) => page.locator(`#r_${lift.replace(/\W/g, '')}_${set}`);
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('rf5') || '{}'));
async function log(page, lift, set, lb, reps) {
  const r = row(page, lift, set);
  await r.locator('input').nth(0).fill(String(lb));
  await r.locator('input').nth(1).fill(String(reps));
  await r.locator('.sc').click();
}

// Last week (W1) every incline set hit the top of the 6-10 range; this week is W2.
const lastWeek = { rf5w: '1', rf5: Object.fromEntries([10, 10, 11, 10].map((r, i) =>
  [`0.push.Incline DB Press.${i}`, { w: '60', r: String(r), d: true }])) };
// Six bench sessions; Oct 4 was the deload (week 5 of cycle 1), and today is cycle 2.
const bench = { rf5c: '1', rf5: Object.fromEntries([[0, 205, '09-06'], [1, 210, '09-13'], [2, 215, '09-20'], [3, 220, '09-27'], [4, 185, '10-04'], [5, 230, '10-11']]
  .map(([w, lb, d]) => [`${w}.push.Barbell Bench Press.0`, { w: String(lb), r: '5', d: true, t: at('2026-' + d) }])) };

test('every screen loads without errors, sideways scrolling or clipped cards', async ({ page }) => {
  const errors = await open(page, { store: lastWeek });  // saved sets, so the add-weight cue shows too
  // nothing may be wider than the screen, and nothing inside a lift's card may overflow it
  const fits = async () => expect(await page.evaluate(() =>
    [document.documentElement, document.querySelector('.v.on'), ...document.querySelectorAll('.v.on .ex, .v.on .exh, .v.on .exa')]
      .filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.id || e.className))).toEqual([]);
  await fits();
  for (const n of Object.values(DAY)) {
    await day(page, n);
    await expect(page.locator('.ex').first()).toBeVisible();
    await fits();
    await back(page);
  }
  for (const n of [1, 2]) { await tab(page, n); await fits() }
  expect(errors).toEqual([]);
});

test('the week starts Tuesday and marks today', async ({ page }) => {
  await open(page);
  await expect(page.locator('.dy-nm')).toHaveText([/^Tue · Upper A/, /^Wed · Legs/, /^Thu · /, /^Fri · /,
    /^Sat · Heavy Legs/, /^Sun · Heavy Upper/, /^Sat or Sun · Full Body/, /^Mon · /]);
  await expect(page.locator('.dy.today .dy-nm')).toHaveText([/^Wed/]);
});

test('Saturday offers both weekend options', async ({ page }) => {
  await open(page, { time: SAT });
  await expect(page.locator('.dy.today .dy-nm')).toHaveText([/^Sat · Heavy Legs/, /^Sat or Sun · Full Body/]);
});

test('typing alone never logs a set; tapping the circle logs the target', async ({ page }) => {
  await open(page, { store: lastWeek });
  await day(page, DAY.tue);
  const r = row(page, 'Incline DB Press', 0), [lb, reps] = [r.locator('input').nth(0), r.locator('input').nth(1)];
  await reps.pressSequentially('1');
  await expect(r).not.toHaveClass(/\bdn\b/);
  await reps.fill('');
  await r.locator('.sc').click();
  await expect(r).toHaveClass(/\bdn\b/);
  await expect(lb).toHaveValue('65');  // last week 60×10 at the top of 6-10, so up a step
  await expect(reps).toHaveValue('8');
  expect((await saved(page))['1.push.Incline DB Press.0']).toMatchObject({ w: '65', r: '8', d: true });
});

test('a filled-in row logs itself once you leave the box', async ({ page }) => {
  await open(page, { install: true });
  await day(page, DAY.tue);
  const r = row(page, 'Incline DB Press', 0), [lb, reps] = [r.locator('input').nth(0), r.locator('input').nth(1)];
  await lb.fill('60');
  await lb.blur();
  await expect(r).not.toHaveClass(/\bdn\b/);  // reps still empty
  await reps.pressSequentially('1');
  await expect(r).not.toHaveClass(/\bdn\b/);  // still typing: the 1 of 10
  await reps.pressSequentially('0');
  await r.locator('.sc').click();  // out of habit: leaving the box logs it, and this tap must not undo it
  await expect(r).toHaveClass(/\bdn\b/);
  await expect(page.locator('#tN')).toHaveText('Next: Weighted Pull-Ups · set 1');
  expect((await saved(page))['0.push.Incline DB Press.0']).toMatchObject({ w: '60', r: '10', d: true });
});

// W1 (3-4 RIR) → W2 (2-3 RIR). Worked by hand: Epley max = lb × (1 + (reps + RIR left) / 30).
test('targets come from last time and this week’s RIR', async ({ page }) => {
  const set = (lift, i, w, r) => [`0.${lift}.${i}`, { w, r, d: true }];
  await open(page, { store: { rf5w: '1', rf5: Object.fromEntries([
    set('push.Incline DB Press', 0, '60', '10'),  // max 87 → 60 would be 11, past the top → 65 × 8
    set('push.Incline DB Press', 1, '60', '8'),   // 60 would be 9, in range → keep 60, one more rep
    set('push.Incline DB Press', 2, '60', '4'),   // 60 would be 5, under the bottom → 55 × 8
    set('pull.Weighted Pull-Ups', 0, '25', '10'), // 197 lb bodyweight + 25 → +30 × 10
    set('pull.Dips', 0, '', '12')]) } });          // bodyweight: one more rep
  const want = async (lift, i, lb, reps) => {
    const [w, r] = [0, 1].map(n => row(page, lift, i).locator('input').nth(n));
    await expect(w).toHaveAttribute('placeholder', lb);
    await expect(r).toHaveAttribute('placeholder', reps);
  };
  await day(page, DAY.tue);
  await want('Incline DB Press', 0, '65', '8');
  await want('Incline DB Press', 1, '60', '9');
  await want('Incline DB Press', 2, '55', '8');
  await want('Incline DB Press', 3, 'lbs', '6–10');  // nothing logged: no target
  await want('Weighted Pull-Ups', 0, '30', '10');
  await expect(page.locator('#e_InclineDBPress .spv').first()).toHaveText('prev 60 × 10 · target 65 × 8 (+5 lb)');
  await back(page);
  await day(page, DAY.thu);
  await want('Dips', 0, 'BW', '13');
});

test('targets follow the sets you just did', async ({ page }) => {
  await open(page, { store: lastWeek });  // W1: 60 × 10, 10, 11, 10 → W2 targets 65 × 8, 8, 9, 8
  await day(page, DAY.tue);
  const want = async (i, lb, reps) => {
    await expect(row(page, 'Incline DB Press', i).locator('input').nth(0)).toHaveAttribute('placeholder', lb);
    await expect(row(page, 'Incline DB Press', i).locator('input').nth(1)).toHaveAttribute('placeholder', reps);
  };
  await log(page, 'Incline DB Press', 0, 70, 8);  // went heavier than 65 and still got 8: stronger than last week
  await want(1, '70', '8');
  await expect(page.locator('#p_InclineDBPress_1')).toHaveText('prev 60 × 10 · target 70 × 8 (+10 lb)');
  await log(page, 'Incline DB Press', 1, 70, 4);  // too heavy: 4 reps
  await want(2, '65', '8');
});

test('warm-ups ramp up to set 1 with the plates for each side', async ({ page }) => {
  await open(page, { time: SAT, store: lastWeek });
  await day(page, DAY.sat);
  const wu = page.locator('#w_BarbellBackSquat');
  await expect(wu).toHaveText('Warm-up · type set 1’s weight');  // never squatted here: no target yet
  await row(page, 'Barbell Back Squat', 0).locator('input').nth(0).fill('225');
  await expect(wu.locator('.wul')).toHaveText('Warm-up · bar × 10 first · plates a side');
  await expect(wu.locator('.wuc b')).toHaveText(['115 × 5', '155 × 3', '195 × 1', '225']);
  await expect(wu.locator('.wuc i')).toHaveText(['35', '45+10', '45+25+5', '45+45']);
  await back(page);
  await day(page, DAY.tue);
  await expect(page.locator('#w_InclineDBPress .wuc b')).toHaveText(['35 × 8', '50 × 4', '65']);  // from the 65 target
  await expect(page.locator('#w_WeightedPullUps .wuc b')).toHaveText(['BW × 5']);
});

test('the add-weight cue shows only when a target goes up', async ({ page }) => {
  await open(page, { store: lastWeek });
  await day(page, DAY.tue);
  await expect(page.locator('#e_InclineDBPress .exp.up')).toHaveText('↑ ADD 5 LB');
  await expect(page.locator('#e_WeightedPullUps .exp.up')).toHaveCount(0);
});

test('the rest timer alternates superset partners and keeps real time', async ({ page }) => {
  await open(page, { install: true });
  await day(page, DAY.tue);
  await log(page, 'Incline DB Press', 0, 60, 8);
  await expect(page.locator('#tN')).toHaveText('Next: Weighted Pull-Ups · set 1');
  await expect(page.locator('#tT')).toHaveText('1:15');
  await log(page, 'Weighted Pull-Ups', 0, 25, 8);
  await expect(page.locator('#tN')).toHaveText('Next: Incline DB Press · set 2');
  await page.clock.runFor(60_000);
  await expect(page.locator('#tT')).toHaveText('0:15');
  await page.clock.runFor(20_000);
  await expect(page.locator('#tmr')).not.toHaveClass(/\bon\b/);
});

test('a swap lasts one week and logs under its own name', async ({ page }) => {
  await open(page, { time: SAT, store: { rf5w: '1' } });
  await day(page, DAY.sat);
  const ex = page.locator('#e_SeatedLegCurl');
  await ex.locator('.swb', { hasText: 'Swap' }).click();
  await ex.locator('.swl button', { hasText: 'Lying Leg Curl' }).click();
  await expect(page.locator('#e_LyingLegCurl .exn')).toHaveText('Lying Leg Curl');
  await log(page, 'Lying Leg Curl', 0, 110, 10);
  await expect(page.locator('#tN')).toHaveText('Next: Reclined Leg Extension · set 1');
  expect(Object.keys(await saved(page))).toContain('1.heavy.Lying Leg Curl.0');
  await back(page);
  await page.locator('.si').nth(2).click();
  await day(page, DAY.sat);
  await expect(page.locator('#e_SeatedLegCurl')).toBeVisible();
});

test('Full Body shares history with the weekend days', async ({ page }) => {
  await open(page, { time: SAT });
  await day(page, DAY.fullBody);
  await log(page, 'Barbell Back Squat', 0, 235, 5);
  await back(page);
  await day(page, DAY.sat);
  await expect(row(page, 'Barbell Back Squat', 0)).toHaveClass(/\bdn\b/);
});

test('the chosen week is remembered and the deload starts the next cycle', async ({ page }) => {
  await open(page);
  await page.locator('.si').nth(2).click();
  await page.reload();
  await expect(page.locator('.si.on')).toHaveText('W3');
  await page.locator('.si').nth(4).click();
  await page.locator('.nc').click();
  await expect(page.locator('#v_home .hd-s')).toHaveText("Cole's Training · Cycle 2");
  await expect(page.locator('.si.on')).toHaveText('W1');
});

test('progress history scores each session and leaves deloads out of the trend', async ({ page }) => {
  await open(page, { store: bench });
  await tab(page, 1);
  const lift = page.locator('.lp').first();
  await expect(lift).toContainText('Barbell Bench Press');
  await expect(lift).toContainText('5 sessions · +29 lb');  // 205×5 → 230×5, Epley estimated max
  await expect(lift.locator('.lpv')).toHaveText(/^268/);
  await tab(page, 0);
  await day(page, DAY.sun);
  await page.locator('#e_BarbellBenchPress .swb', { hasText: 'History' }).click();
  const rows = page.locator('#e_BarbellBenchPress .hsr');
  await expect(rows).toHaveCount(6);
  await expect(rows.nth(1)).toContainText('Oct 4 · DL');
});

test('restoring a backup lets only clean numbers in', async ({ page }) => {
  await open(page);
  await tab(page, 2);
  const file = '{"data":{"0.push.Dips.0":{"w":"\\"><img src=x onerror=alert(1)>","r":"9","d":true},'
    + '"0.push.Incline DB Press.0":{"w":"60","r":"10","d":true},"__proto__":{"w":1},"not a key":{"w":1}}}';
  await page.locator('input[type=file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(file) });
  await expect(page.locator('#toast')).toHaveText('Restored 2 sets');
  const s = await saved(page);
  expect(s['0.push.Dips.0']).toEqual({ w: '', r: '9', d: true });
  expect(Object.keys(s)).toHaveLength(2);
});

test('drop box: shows Garmin numbers, flags a short night and backs up each set', async ({ page }) => {
  const puts = [], keys = new Set();
  await page.route('**/api/health', r => { keys.add(r.request().headers()['x-lift-key']); r.fulfill({ json: { '2026-10-14': { sleep: 5.2, weight: 197.4, rhr: 52 } } }) });
  await page.route('**/api/log', r => {
    const put = r.request().method() === 'PUT';
    if (put) puts.push(r.request().postDataJSON());
    r.fulfill({ json: put ? { saved: true } : {} });
  });
  await open(page, { install: true, store: { rf5k: 'test-key-0123456789abcdef' } });
  await tab(page, 1);
  await expect(page.locator('.gc', { hasText: 'Body' })).toContainText('5.2');
  await tab(page, 0);
  await day(page, DAY.wed);
  await expect(page.locator('.bn.sn')).toContainText('Short night · 5.2 h');
  await log(page, 'Smith Squat', 0, 185, 10);
  await page.clock.runFor(2500);
  await expect.poll(() => puts.length).toBeGreaterThan(0);
  expect(Object.keys(puts.at(-1).data)).toContain('0.legs.Smith Squat.0');
  expect([...keys]).toEqual(['test-key-0123456789abcdef']);
});

test.describe('offline', () => {
  test.use({ serviceWorkers: 'allow' });
  test('opens with no signal after one visit', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'offline mode is checked in Chromium');
    await open(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#v_home .hd-l')).toHaveText('Reforged');
  });
});

// Screenshot comparisons catch layout breaks the other tests can't see. Fonts differ between machines,
// so these run on the iPhone project locally only. After an intended UI change: npm run test:update
test.describe('looks', () => {
  test.skip(({ browserName }) => browserName !== 'webkit' || !!process.env.CI, 'compared on the local iPhone run');
  test('home, a workout and the dashboard match the approved screenshots', async ({ page }) => {
    await open(page, { store: lastWeek });
    const look = { animations: 'disabled', maxDiffPixelRatio: 0.001, threshold: 0.05 };
    await expect(page).toHaveScreenshot('home.png', look);
    await day(page, DAY.tue);
    await expect(page).toHaveScreenshot('workout.png', look);
    await back(page);
    await tab(page, 1);
    await expect(page).toHaveScreenshot('dashboard.png', look);
  });
});
