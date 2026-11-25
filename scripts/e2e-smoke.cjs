// End-to-End-Smoke-Test gegen den Produktions-Build (vite preview)
const { chromium, devices } = require('playwright');
const OUT = process.env.SHOTS || '/tmp/shots';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], colorScheme: process.env.SCHEME || 'dark' });
  const page = await ctx.newPage();
  const errors = []; globalThis.__errs = errors;
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
  page.on('dialog', (d) => d.accept());
  const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
  const click = (t) => page.getByRole('button', { name: t, exact: true }).first().click();
  await page.goto('http://localhost:4173/');
  await page.waitForSelector('text=RehaKompass');
  await shot('01-onboarding');
  await page.getByText('Ich habe den Hinweis gelesen').click();
  await click('Weiter');
  await click('Weiter'); // Verletzung
  // Freigaben: Vollbelastung, Kraft, Wadenheber, Fahrrad
  const segs = page.locator('.card .seg');
  for (const i of [0, 1, 2, 4]) await segs.nth(i).getByRole('radio', { name: 'Ja, freigegeben' }).click();
  await shot('02-clearances');
  await click('Weiter');
  await page.locator('input[type=number]').first().fill('30');
  const seg = (label) => page.locator('.field', { hasText: label }).locator('.seg');
  await seg('schmerzfrei gehen').getByRole('radio', { name: 'Ja' }).click();
  await seg('beidbeinige Wadenheber').getByRole('radio', { name: 'Ja' }).click();
  await page.locator('.field', { hasText: 'Wie viele Wiederholungen' }).locator('input').fill('15');
  await click('Weiter');
  await click('Weiter');
  await shot('03-summary');
  await click('Einrichtung abschließen');
  await page.waitForSelector('text=Reha-Phase');
  await shot('04-dashboard');
  await page.getByRole('button', { name: /Zum heutigen Training/ }).click();
  await page.waitForSelector('text=Heutiges Training');
  await shot('05-today');
  await page.getByRole('button', { name: /Training starten/ }).click();
  await page.locator('.scale').first().getByRole('radio', { name: '1', exact: true }).click();
  await click('Los geht’s');
  let n = 0;
  while (await page.getByRole('button', { name: /Erledigt/ }).count()) {
    if (n === 1) await shot('06-exercise');
    await page.getByRole('button', { name: /Erledigt/ }).click();
    n++;
    if (n > 20) throw new Error('Endlosschleife');
  }
  await shot('07a-before-post'); await page.locator('.field', { hasText: 'Schmerz nach' }).getByRole('radio', { name: '1', exact: true }).click();
  await page.locator('.field', { hasText: 'Schwellung' }).getByRole('radio', { name: 'Keine' }).click();
  await page.locator('.field', { hasText: 'Gangbild' }).getByRole('radio', { name: 'Normal' }).click();
  await shot('07-post');
  await click('Einheit abschließen');
  await page.waitForSelector('text=Zusammenfassung');
  await shot('08-summary');
  console.log('Übungen protokolliert:', n);
  for (const [r, name] of [['progress', '09-progress'], ['library', '10-library'], ['library/bilateral_calf_raise', '11-exercise-detail'], ['load', '12-load'], ['history', '13-history'], ['settings', '14-settings'], ['settings/simulation', '15-simulation']]) {
    await page.goto(`http://localhost:4173/#/${r}`);
    await page.waitForTimeout(250);
    await shot(name);
  }
  // Neustart → Daten müssen erhalten bleiben
  await page.reload();
  await page.goto('http://localhost:4173/#/history');
  await page.waitForTimeout(300);
  const persisted = await page.locator('.list-btn').count();
  console.log('Einheiten nach Neustart:', persisted);
  // horizontales Scrollen prüfen
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  console.log('Horizontaler Überlauf:', overflow);
  console.log('Fehler:', errors.length ? errors : 'keine');
  await browser.close();
  if (errors.length || overflow || persisted < 1) process.exit(1);
})().catch((e) => { console.error(String(e).slice(0, 300)); console.error('Fehler:', globalThis.__errs); process.exit(1); });
