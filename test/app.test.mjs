import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace('<script src="app.js"></script>', '');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');

function boot(setup) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (err) => errors.push(String(err)));
  virtualConsole.on('error', (...args) => errors.push(args.map(String).join(' ')));
  const dom = new JSDOM(html, {
    url: 'http://localhost:8099/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });
  dom.window.addEventListener('error', (e) => errors.push(String(e.error || e.message)));
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  if (setup) setup(dom);
  dom.window.eval(app);
  return { dom, errors, w: dom.window, d: dom.window.document };
}

function typeCurrency(w, el, raw) {
  el.value = raw;
  el.dispatchEvent(new w.Event('input', { bubbles: true }));
}

function fill(w, d, { datetime, mileage, priceDigits, totalDigits, location }) {
  if (datetime) d.getElementById('datetime').value = datetime;
  d.getElementById('mileage').value = String(mileage);
  typeCurrency(w, d.getElementById('pricePerGallon'), priceDigits);
  typeCurrency(w, d.getElementById('totalCost'), totalDigits);
  if (location != null) d.getElementById('location').value = location;
  d.getElementById('mileage').dispatchEvent(new w.Event('input', { bubbles: true }));
}

test('boots without errors and shows v1.14.0', () => {
  const { d, errors } = boot();
  assert.equal(errors.length, 0, errors.join(' | '));
  assert.equal(d.getElementById('app-version').textContent, 'v1.14.0');
  assert.equal(d.getElementById('export-btn').disabled, true);
  assert.equal(d.getElementById('storage-usage').textContent, '26 B on device');
  assert.equal(d.getElementById('allow-landscape'), null);
  assert.equal(d.getElementById('rotate-gate'), null);
  assert.ok(d.querySelector('.app-footer-actions #export-btn'));
  assert.ok(d.querySelector('.app-footer-actions #import-btn'));
  assert.ok(d.getElementById('nav-log'));
  assert.ok(d.getElementById('nav-trends'));
  assert.equal(d.getElementById('page-log').hidden, false);
  assert.equal(d.getElementById('page-trends').hidden, true);
});

test('Updated badge renders release notes as a bullet list', () => {
  const { d } = boot((dom) => {
    dom.window.localStorage.setItem('gassy.lastSeenVersion', '1.12.1');
  });
  const badge = d.getElementById('updated-badge');
  const panel = d.getElementById('whats-new');
  assert.equal(badge.hidden, false);
  badge.click();
  assert.equal(panel.hidden, false);
  assert.equal(badge.getAttribute('aria-expanded'), 'true');
  assert.match(panel.querySelector('.whats-new-title').textContent, /v1\.14\.0/);
  const items = [...panel.querySelectorAll('.whats-new-list li')].map((li) => li.textContent);
  assert.ok(items.length >= 2);
  assert.ok(items.every((t) => t.trim().length > 0));
  badge.click();
  assert.equal(panel.hidden, true);
  assert.equal(badge.getAttribute('aria-expanded'), 'false');
});

test('manifest locks portrait; pinch zoom stays off', () => {
  assert.match(html, /user-scalable=no/);
  assert.match(html, /maximum-scale=1/);
  const manifest = fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8');
  assert.match(manifest, /"orientation"\s*:\s*"portrait"/);
});

test('footer CSS no longer stacks opacity on already-dim text', () => {
  assert.match(css, /\.app-footer-version\s*\{/);
  assert.doesNotMatch(css, /\.app-footer-version\s*\{[^}]*opacity/);
});

test('Advanced panel sits above the datetime input so expanding pushes it down', () => {
  const { d } = boot();
  const field = d.querySelector('#datetime').closest('.field');
  const panel = d.getElementById('advanced-panel');
  assert.ok(field.contains(panel));
  assert.equal(
    [...field.children].indexOf(panel) < [...field.children].indexOf(d.getElementById('datetime')),
    true
  );
});

test('currency entry, MPG, predictions, and CSV export', async () => {
  const { d, w } = boot();

  fill(w, d, {
    datetime: '2026-10-01T12:00',
    mileage: '10000',
    priceDigits: '349',
    totalDigits: '4000',
    location: 'Shell, Town',
  });
  assert.equal(d.getElementById('pricePerGallon').value, '3.49');
  assert.equal(d.getElementById('totalCost').value, '40.00');
  d.getElementById('submit-btn').click();

  fill(w, d, {
    datetime: '2026-10-07T12:00',
    mileage: '10300',
    priceDigits: '359',
    totalDigits: '4500',
    location: '=1+1, "Main"',
  });
  d.getElementById('submit-btn').click();

  const list = d.getElementById('entries-list').textContent;
  assert.match(list, /\$45\.00/);
  assert.match(list, /\$40\.00/);
  assert.match(list, /mpg/i);
  assert.ok(d.querySelector('.month-group'));
  assert.ok(d.querySelector('.month-toggle'));
  assert.equal(d.getElementById('export-btn').disabled, false);
  assert.match(d.getElementById('mileage').placeholder, /^≈/);
  // One MPG sample isn't enough for a trend line yet.
  assert.equal(d.getElementById('chart-mpg').hidden, true);
  assert.match(d.getElementById('log-meta-summary').textContent, /2 fill-ups/);
  assert.match(d.getElementById('log-meta-summary').textContent, /\$/);

  d.getElementById('mileage').value = '5000';
  d.getElementById('mileage').dispatchEvent(new w.Event('input', { bubbles: true }));
  const warn = d.getElementById('mileage-bounds-warning');
  assert.equal(warn.hidden, false);
  assert.match(warn.textContent, /Lower than your last fill-up/);

  d.getElementById('datetime').value = '2026-10-06T12:00';
  d.getElementById('datetime').dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.equal(warn.hidden, true);

  d.getElementById('photo-status').hidden = false;
  d.getElementById('photo-status').textContent = 'Filled date & location from photo';
  fill(w, d, {
    datetime: '2026-10-08T12:00',
    mileage: '10600',
    priceDigits: '369',
    totalDigits: '4100',
  });
  d.getElementById('submit-btn').click();
  assert.equal(d.getElementById('photo-status').hidden, true);
  assert.equal(d.getElementById('chart-mpg').hidden, false);
  assert.match(d.getElementById('chart-mpg-avg').textContent, /mpg/i);
  assert.ok(d.querySelector('#chart-mpg-body svg'));
  assert.match(d.getElementById('chart-mpg-body').textContent, /high/i);
  assert.match(d.getElementById('chart-mpg-body').textContent, /low/i);
  assert.equal(d.getElementById('chart-price').hidden, false);
  assert.ok(d.querySelector('#chart-price-body svg'));
  assert.equal(d.getElementById('chart-miles').hidden, false);
  assert.ok(d.querySelector('#chart-miles-body svg'));
  assert.match(d.getElementById('log-meta-summary').textContent, /3 fill-ups/);
  assert.match(d.getElementById('log-meta-summary').textContent, /mi/);

  d.getElementById('nav-trends').click();
  assert.equal(d.getElementById('page-log').hidden, true);
  assert.equal(d.getElementById('page-trends').hidden, false);
  assert.equal(d.getElementById('nav-trends').getAttribute('aria-current'), 'page');
  d.getElementById('nav-log').click();
  assert.equal(d.getElementById('page-log').hidden, false);
  assert.equal(d.getElementById('page-trends').hidden, true);

  let blob;
  w.URL.createObjectURL = (b) => {
    blob = b;
    return 'blob:test';
  };
  w.HTMLAnchorElement.prototype.click = () => {};
  d.getElementById('export-btn').click();
  const text = await new Promise((resolve, reject) => {
    const reader = new w.FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
  assert.match(text, /3\.599/);
  assert.match(text, /"'=1\+1, ""Main"""/);

  const entries = JSON.parse(w.localStorage.getItem('gassy.entries'));
  assert.ok(entries.some((e) => e.pricePerGallon === 3.499));
  assert.ok(entries.some((e) => e.pricePerGallon === 3.599));
  assert.ok(entries.some((e) => e.location === '=1+1, "Main"'));

  // Round-trip: wipe storage, import the exported CSV, get the log back.
  w.localStorage.setItem('gassy.entries', '[]');
  w.confirm = () => true;
  const file = new w.File([text], 'backup.csv', { type: 'text/csv' });
  const input = d.getElementById('import-csv-input');
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  const restored = JSON.parse(w.localStorage.getItem('gassy.entries'));
  assert.equal(restored.length, 3);
  assert.ok(restored.some((e) => e.location === '=1+1, "Main"'));
  assert.ok(restored.some((e) => e.pricePerGallon === 3.599));
  assert.match(d.getElementById('import-status').textContent, /Restored 3/i);
});

test('CSV import rejects bad headers and can be cancelled', async () => {
  const { d, w } = boot();
  w.confirm = () => false;
  const bad = new w.File(['foo,bar\n1,2\n'], 'bad.csv', { type: 'text/csv' });
  const input = d.getElementById('import-csv-input');
  Object.defineProperty(input, 'files', { configurable: true, value: [bad] });
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  assert.match(d.getElementById('import-status').textContent, /header/i);
  assert.equal(JSON.parse(w.localStorage.getItem('gassy.entries') || '[]').length, 0);
});

test('corrupt or non-array storage does not crash', () => {
  {
    const { d, errors } = boot((dom) => {
      dom.window.localStorage.setItem('gassy.entries', '{}');
    });
    assert.equal(errors.length, 0, errors.join(' | '));
    assert.notEqual(d.getElementById('empty-state').style.display, 'none');
  }
  {
    const { d, errors } = boot((dom) => {
      dom.window.localStorage.setItem('gassy.entries', '{');
    });
    assert.equal(errors.length, 0, errors.join(' | '));
    assert.notEqual(d.getElementById('empty-state').style.display, 'none');
  }
});

test('quota failure keeps the form and shows an error', () => {
  const { d, w } = boot();
  fill(w, d, { mileage: '10000', priceDigits: '349', totalDigits: '2000' });
  const origSet = w.Storage.prototype.setItem;
  w.Storage.prototype.setItem = function (key, value) {
    if (key === 'gassy.entries') throw new DOMException('quota', 'QuotaExceededError');
    return origSet.call(this, key, value);
  };
  d.getElementById('submit-btn').click();
  const notice = d.getElementById('missing-data-notice');
  assert.equal(notice.hidden, false);
  assert.match(notice.textContent, /storage is full/);
  assert.equal(d.getElementById('mileage').value, '10000');
});

test('cancelling edit during a lookup ignores the late result', async () => {
  const { d, w } = boot();
  fill(w, d, {
    datetime: '2026-10-01T12:00',
    mileage: '10000',
    priceDigits: '349',
    totalDigits: '4000',
    location: 'Saved Station',
  });
  d.getElementById('location').dataset.lat = '37.7';
  d.getElementById('location').dataset.lon = '-122.4';
  d.getElementById('submit-btn').click();

  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  w.fetch = () => pending.then(() => new w.Response(JSON.stringify({
    type: 'fuel',
    address: { amenity: 'Should Not Appear', road: 'Main', city: 'Town', state: 'California' },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  d.querySelector('.entry').click();
  d.getElementById('locate-btn').click();
  assert.equal(d.getElementById('location').value, 'Locating…');
  assert.equal(d.getElementById('submit-btn').disabled, true);
  d.getElementById('cancel-edit-btn').click();
  assert.equal(d.getElementById('submit-btn').textContent, 'Add fill-up');
  assert.equal(d.getElementById('location').value, '');
  release();
  await pending;
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(d.getElementById('location').value, '');
  assert.equal(d.getElementById('submit-btn').disabled, false);
});

test('failed lookup recovers instead of staying stuck', async () => {
  const { d, w } = boot();
  w.navigator.geolocation = {
    getCurrentPosition(success) {
      success({ coords: { latitude: 37.7, longitude: -122.4 } });
    },
  };
  w.fetch = () => Promise.reject(new DOMException('aborted', 'AbortError'));
  d.getElementById('locate-btn').click();
  await new Promise((r) => setTimeout(r, 20));
  assert.match(d.getElementById('location').value, /37\.7/);
  assert.equal(d.getElementById('submit-btn').disabled, false);
});

function fetchUrl(url) {
  return typeof url === 'string' ? url : url.url;
}

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}

test('far stations are suggestions only — field stays empty with no-nearby message', async () => {
  const { d, w } = boot();
  w.navigator.geolocation = {
    getCurrentPosition(success) {
      success({ coords: { latitude: 37.7, longitude: -122.4 } });
    },
  };
  w.fetch = (url) => {
    const href = fetchUrl(url);
    if (href.includes('nominatim')) {
      return Promise.resolve(jsonResponse({
        type: 'residential',
        address: { road: 'Home St', city: 'Town', state: 'California' },
      }));
    }
    if (href.includes('overpass')) {
      // ~965 m away (~0.6 mi) — outside the auto-fill radius.
      return Promise.resolve(jsonResponse({
        elements: [{
          type: 'node',
          lat: 37.7087,
          lon: -122.4,
          tags: { name: 'Distant Shell', amenity: 'fuel' },
        }],
      }));
    }
    return Promise.reject(new Error(`unexpected fetch: ${href}`));
  };

  d.getElementById('locate-btn').click();
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(d.getElementById('location').value, '');
  assert.match(d.getElementById('location-status').textContent, /No gas station found nearby/i);
  assert.match(d.getElementById('location-status').textContent, /suggestion/i);
  const chips = [...d.querySelectorAll('.station-chip')];
  assert.equal(chips.length, 1);
  assert.match(chips[0].textContent, /Distant Shell/);
  assert.equal(d.getElementById('location').dataset.lat, '37.7');
});

test('truly nearby stations still auto-fill the location field', async () => {
  const { d, w } = boot();
  w.navigator.geolocation = {
    getCurrentPosition(success) {
      success({ coords: { latitude: 37.7, longitude: -122.4 } });
    },
  };
  w.fetch = (url) => {
    const href = fetchUrl(url);
    if (href.includes('nominatim')) {
      return Promise.resolve(jsonResponse({
        type: 'residential',
        address: { road: 'Pump Rd', city: 'Town', state: 'California' },
      }));
    }
    if (href.includes('overpass')) {
      return Promise.resolve(jsonResponse({
        elements: [{
          type: 'node',
          lat: 37.7004,
          lon: -122.4,
          tags: { name: 'Corner Chevon', amenity: 'fuel' },
        }],
      }));
    }
    return Promise.reject(new Error(`unexpected fetch: ${href}`));
  };

  d.getElementById('locate-btn').click();
  await new Promise((r) => setTimeout(r, 40));
  assert.match(d.getElementById('location').value, /Corner Chevon/);
  assert.equal(d.getElementById('nearby-stations').hidden, true);
});

test('editing without saved GPS asks before replacing a typed location', async () => {
  const { d, w } = boot();
  fill(w, d, {
    datetime: '2026-10-01T12:00',
    mileage: '10000',
    priceDigits: '349',
    totalDigits: '4000',
    location: 'Typed Place, Town',
  });
  d.getElementById('submit-btn').click();

  d.querySelector('.entry').click();
  assert.equal(d.getElementById('location').value, 'Typed Place, Town');
  assert.equal(d.getElementById('location').dataset.lat, '');

  let gpsCalled = false;
  w.navigator.geolocation = {
    getCurrentPosition() { gpsCalled = true; },
  };
  w.confirm = () => false;
  d.getElementById('locate-btn').click();
  assert.equal(gpsCalled, false);
  assert.equal(d.getElementById('location').value, 'Typed Place, Town');
  assert.match(d.getElementById('location-status').textContent, /Kept typed location/);

  w.confirm = () => true;
  w.fetch = () => Promise.reject(new DOMException('offline', 'AbortError'));
  d.getElementById('locate-btn').click();
  assert.equal(gpsCalled, true);
  await new Promise((r) => setTimeout(r, 20));
});

test('long log starts fully collapsed; adding a fill-up reveals that month', async () => {
  const seed = [
    { id: 'a1', datetime: '2026-05-10T12:00', mileage: 10000, pricePerGallon: 3.499, totalCost: 40, location: '', lat: null, lon: null, source: null },
    { id: 'a2', datetime: '2026-06-10T12:00', mileage: 10300, pricePerGallon: 3.499, totalCost: 40, location: '', lat: null, lon: null, source: null },
    { id: 'a3', datetime: '2026-07-10T12:00', mileage: 10600, pricePerGallon: 3.499, totalCost: 40, location: '', lat: null, lon: null, source: null },
    { id: 'a4', datetime: '2026-08-10T12:00', mileage: 10900, pricePerGallon: 3.499, totalCost: 40, location: '', lat: null, lon: null, source: null },
    { id: 'a5', datetime: '2026-09-10T12:00', mileage: 11200, pricePerGallon: 3.499, totalCost: 40, location: '', lat: null, lon: null, source: null },
    { id: 'a6', datetime: '2026-10-10T12:00', mileage: 11500, pricePerGallon: 3.499, totalCost: 40, location: '', lat: null, lon: null, source: null },
  ];
  const { d, w } = boot((dom) => {
    dom.window.localStorage.setItem('gassy.entries', JSON.stringify(seed));
  });

  const groups = [...d.querySelectorAll('.month-group')];
  assert.equal(groups.length, 6);
  assert.match(d.getElementById('log-meta-summary').textContent, /6 fill-ups/);
  assert.match(d.getElementById('log-meta-summary').textContent, /\$/);
  assert.match(d.getElementById('log-meta-summary').textContent, /mi/);
  assert.ok(groups.every((g) => !g.classList.contains('is-open')));
  assert.ok(groups.every((g) => g.querySelector('.month-toggle').getAttribute('aria-expanded') === 'false'));
  assert.match(groups[0].querySelector('.month-summary').textContent, /fill-up/);
  assert.match(groups[0].querySelector('.month-summary').textContent, /\$/);

  const toggle = groups[0].querySelector('.month-toggle');
  toggle.click();
  assert.equal(groups[0].classList.contains('is-open'), true);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');

  fill(w, d, {
    datetime: '2026-10-11T12:00',
    mileage: '11800',
    priceDigits: '359',
    totalDigits: '4500',
  });
  d.getElementById('submit-btn').click();
  // Month open is applied on a double-rAF so the expand transition can run.
  await new Promise((resolve) => {
    w.requestAnimationFrame(() => w.requestAnimationFrame(resolve));
  });
  const october = d.querySelector('.month-group[data-month-key="2026-10"]');
  assert.ok(october.classList.contains('is-open'));
  assert.ok(d.querySelector('.entry.entry-arrive'));
});

test('accessibility helpers: entry keyboard open and reduced-motion CSS', () => {
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /min-height:\s*44px/);

  const { d, w } = boot();
  fill(w, d, {
    datetime: '2026-10-01T12:00',
    mileage: '10000',
    priceDigits: '349',
    totalDigits: '4000',
    location: 'Shell',
  });
  d.getElementById('submit-btn').click();
  const entry = d.querySelector('.entry');
  assert.equal(entry.getAttribute('role'), 'button');
  assert.equal(entry.tabIndex, 0);
  entry.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(d.getElementById('submit-btn').textContent, 'Update fill-up');
});

test('editing without saved GPS can use live GPS when the field is empty', () => {
  const { d, w } = boot();
  fill(w, d, {
    datetime: '2026-10-01T12:00',
    mileage: '10000',
    priceDigits: '349',
    totalDigits: '4000',
    location: '',
  });
  d.getElementById('submit-btn').click();

  // Seed an entry with a location, then clear it in the form.
  const entries = JSON.parse(w.localStorage.getItem('gassy.entries'));
  entries[0].location = 'Was Typed';
  w.localStorage.setItem('gassy.entries', JSON.stringify(entries));
  d.querySelector('.entry').click();
  d.getElementById('location').value = '';

  let gpsCalled = false;
  let confirmCalled = false;
  w.confirm = () => { confirmCalled = true; return false; };
  w.navigator.geolocation = {
    getCurrentPosition() { gpsCalled = true; },
  };
  d.getElementById('locate-btn').click();
  assert.equal(confirmCalled, false);
  assert.equal(gpsCalled, true);
});
