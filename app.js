const STORAGE_KEY = 'gassy.entries';

const form = document.getElementById('entry-form');
const datetimeInput = document.getElementById('datetime');
const mileageInput = document.getElementById('mileage');
const priceInput = document.getElementById('pricePerGallon');
const totalCostInput = document.getElementById('totalCost');
const mpgPreview = document.getElementById('mpg-preview');
const mileageBoundsWarning = document.getElementById('mileage-bounds-warning');
const locationInput = document.getElementById('location');
const locationStatus = document.getElementById('location-status');
const locateBtn = document.getElementById('locate-btn');
const entriesList = document.getElementById('entries-list');
const emptyState = document.getElementById('empty-state');
const logMeta = document.getElementById('log-meta');
const logMetaCount = document.getElementById('log-meta-count');
const logMetaSummary = document.getElementById('log-meta-summary');
const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const importCsvInput = document.getElementById('import-csv-input');
const importStatus = document.getElementById('import-status');
const pageLog = document.getElementById('page-log');
const pageTrends = document.getElementById('page-trends');
const navLog = document.getElementById('nav-log');
const navTrends = document.getElementById('nav-trends');
const trendsEmpty = document.getElementById('trends-empty');
const trendsContent = document.getElementById('trends-content');
const chartFillsEl = document.getElementById('chart-fills');
const chartFillsAvgEl = document.getElementById('chart-fills-avg');
const chartFillsBodyEl = document.getElementById('chart-fills-body');
const chartSpendEl = document.getElementById('chart-spend');
const chartSpendAvgEl = document.getElementById('chart-spend-avg');
const chartSpendBodyEl = document.getElementById('chart-spend-body');
const chartMilesEl = document.getElementById('chart-miles');
const chartMilesAvgEl = document.getElementById('chart-miles-avg');
const chartMilesBodyEl = document.getElementById('chart-miles-body');
const chartMpgEl = document.getElementById('chart-mpg');
const chartMpgAvgEl = document.getElementById('chart-mpg-avg');
const chartMpgBodyEl = document.getElementById('chart-mpg-body');
const chartPriceEl = document.getElementById('chart-price');
const chartPriceAvgEl = document.getElementById('chart-price-avg');
const chartPriceBodyEl = document.getElementById('chart-price-body');
const storageUsageEl = document.getElementById('storage-usage');
const importPhotoBtn = document.getElementById('import-photo-btn');
const photoInput = document.getElementById('photo-input');
const photoStatus = document.getElementById('photo-status');
const nearbyStationsEl = document.getElementById('nearby-stations');
const submitBtn = document.getElementById('submit-btn');
const editBanner = document.getElementById('edit-banner');
const editBannerText = document.getElementById('edit-banner-text');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const deleteEntryBtn = document.getElementById('delete-entry-btn');
const missingDataNotice = document.getElementById('missing-data-notice');
const advancedToggle = document.getElementById('advanced-toggle');
const advancedPanel = document.getElementById('advanced-panel');
const entryIdField = document.getElementById('entry-id-field');
const latField = document.getElementById('lat-field');
const lonField = document.getElementById('lon-field');
const sourceField = document.getElementById('source-field');

let editingId = null;
let lastLocationSource = null; // 'photo' | 'gps' | 'manual' | null
let currentLocationLabel = '';
let isLocating = false;
let preLocateValue = '';
// Bumped when the form is reset or a different entry is loaded, so an
// in-flight lookup can't write its result into whatever is on screen now.
let locateGeneration = 0;
// One automatic GPS lookup per new-entry form session (first field edit).
// Manual 📍 / photo import still work anytime; we never re-fire on later blurs.
let autoLocateAttempted = false;

// Base prediction for the fill-up being started (mileage/price/total), or
// null when there isn't enough history yet. Recomputed each time a new-entry
// form is set up; never used while editing an existing entry.
let currentPredictions = null;
// Total-cost guess, kept in sync with whatever mileage/price the user has
// actually typed so far — sharper than currentPredictions.totalCost once
// either of those fields has real input.
let currentTotalGuess = null;

// Session toggles for month groups (monthKey → open?). Default: all collapsed
// for an at-a-glance summary view. Adding a fill-up forces that month open.
const monthOpenOverrides = new Map();
// After a successful add, animate this entry into the opened month.
let revealEntryId = null;

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function smoothScrollBehavior() {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}

function setCollapsibleOpen(panel, open) {
  if (!panel) return;
  if (open) {
    panel.hidden = false;
    if (prefersReducedMotion()) {
      panel.classList.add('is-open');
      return;
    }
    // Double-rAF so the 0fr → 1fr transition runs after display flips on.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => panel.classList.add('is-open'));
    });
    return;
  }

  // Match month expand/collapse: animate to 0fr, then hide (instant hide felt broken).
  if (prefersReducedMotion() || !panel.classList.contains('is-open') || panel.hidden) {
    panel.classList.remove('is-open');
    panel.hidden = true;
    return;
  }

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    panel.hidden = true;
    panel.removeEventListener('transitionend', onEnd);
  };
  const onEnd = (e) => {
    if (e.target !== panel) return;
    finish();
  };
  panel.addEventListener('transitionend', onEnd);
  panel.classList.remove('is-open');
  setTimeout(finish, 280);
}

// Loading state lives on the 📍 button + status line only — leave the field
// alone so we don't duplicate "Locating…" in two places or wipe typed text.
function beginLocating() {
  if (!isLocating) preLocateValue = locationInput.value;
  isLocating = true;
  locationInput.readOnly = true;
  locateBtn.disabled = true;
  locateBtn.classList.add('is-locating');
  locateBtn.setAttribute('aria-busy', 'true');
  locateBtn.setAttribute('aria-label', 'Locating…');
  locateBtn.title = 'Locating…';
  submitBtn.disabled = true;
  locationStatus.textContent = 'Locating…';
}

function endLocating() {
  isLocating = false;
  locationInput.readOnly = false;
  locateBtn.disabled = false;
  locateBtn.classList.remove('is-locating');
  locateBtn.removeAttribute('aria-busy');
  locateBtn.setAttribute('aria-label', 'Refresh current location');
  locateBtn.title = 'Refresh current location';
  submitBtn.disabled = false;
}

// Nothing new was found (e.g. permission denied) — put back whatever was
// there before the lookup started.
function cancelLocating() {
  locationInput.value = preLocateValue;
  endLocating();
}

locationInput.addEventListener('input', () => {
  lastLocationSource = 'manual';
});

function setLocationLine(label, address) {
  currentLocationLabel = label;
  locationStatus.textContent = [label, address].filter(Boolean).join(' · ');
}

function syncAdvancedFields() {
  entryIdField.value = editingId || '';
  latField.value = locationInput.dataset.lat || '';
  lonField.value = locationInput.dataset.lon || '';
  sourceField.value = lastLocationSource || '';
}

advancedToggle.addEventListener('click', () => {
  const opening = advancedPanel.hidden || !advancedPanel.classList.contains('is-open');
  setCollapsibleOpen(advancedPanel, opening);
  advancedToggle.setAttribute('aria-expanded', opening ? 'true' : 'false');
  if (opening) syncAdvancedFields();
});

sourceField.addEventListener('change', () => {
  lastLocationSource = sourceField.value || null;
});

latField.addEventListener('input', () => {
  locationInput.dataset.lat = latField.value.trim();
  missingDataNotice.hidden = true;
});

lonField.addEventListener('input', () => {
  locationInput.dataset.lon = lonField.value.trim();
  missingDataNotice.hidden = true;
});

const STATE_ABBR = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA',
  Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA',
  Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA',
  Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO',
  Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
  'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH',
  Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT',
  Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY',
  'District of Columbia': 'DC',
};

function abbrState(a) {
  return a.state_code || STATE_ABBR[a.state] || a.state || '';
}

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function nowForInput() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function setDefaultDatetime() {
  datetimeInput.value = nowForInput();
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
}

function fmtMoney(n) {
  return '$' + Number(n).toFixed(2);
}

function fmtBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// localStorage strings are stored as UTF-16 (2 bytes/char) — this is an
// estimate of on-device footprint, not an exact browser-reported figure
// (no such API exists), but close enough to be informational.
function updateStorageUsageBadge() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || '';
    const chars = STORAGE_KEY.length + raw.length;
    storageUsageEl.textContent = `${fmtBytes(chars * 2)} on device`;
  } catch {
    storageUsageEl.textContent = '';
  }
}

// Prices are stored with the trailing 9/10-cent digit (e.g. 3.999 for a
// pump price of $3.99), so a plain .toFixed(2) rounds 3.999 up to $4.00.
// Truncate that last digit instead of rounding, matching how the edit form
// already reconstructs the entered price (see loadEntryIntoForm).
function fmtPricePerGallon(n) {
  return '$' + Number(n).toFixed(3).slice(0, -1);
}

// Place names come from crowd-sourced OSM data (or free-typed text) and get
// interpolated into innerHTML in the entries list — escape before rendering.
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Gas prices always end in 9/10 of a cent (e.g. $3.499), so the price field
// only takes 2 decimal digits and this appends the fixed final "9" — same
// convention as GasBuddy and most pump displays.
function getPricePerGallon() {
  const p = parseFloat(priceInput.value);
  if (!isFinite(p)) return NaN;
  // 3.59 + 0.009 is 3.5989999999999998 in IEEE floats. Round to the tenth
  // of a cent so the stored price and the CSV stay at 3.599.
  return Math.round((p + 0.009) * 1000) / 1000;
}

// Auto-decimal currency entry: digits shift in from the right (like a POS
// terminal), so typing "3899" produces "3.899" without typing a period.
function attachCurrencyInput(el, decimals) {
  el.addEventListener('input', () => {
    let digits = el.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    if (!digits) {
      el.value = '';
      return;
    }
    digits = digits.padStart(decimals + 1, '0');
    const whole = digits.slice(0, -decimals);
    const frac = digits.slice(-decimals);
    el.value = `${parseInt(whole, 10)}.${frac}`;
    el.setSelectionRange(el.value.length, el.value.length);
  });
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtDistance(meters) {
  const feet = meters * 3.28084;
  return feet < 1000 ? `${Math.round(feet)} ft` : `${(meters / 1609.34).toFixed(1)} mi`;
}

// Map APIs sometimes never answer. Without a timeout the form stays on
// "Locating…" with submit disabled, and locate() ignores further taps.
function fetchWithTimeout(url, ms = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

async function findNearbyFuelStations(lat, lon, radiusMeters) {
  // Larger stations (travel centers, big-box fuel plazas) are often mapped in
  // OSM as a way/relation (an area) rather than a single node — "nwr" plus
  // "out center" covers those too, using the area's centroid as its point.
  const query = `[out:json][timeout:8];nwr["amenity"="fuel"](around:${radiusMeters},${lat},${lon});out center;`;
  const res = await fetchWithTimeout(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('overpass failed');
  const data = await res.json();
  const stations = (data.elements || [])
    .map((el) => {
      const elLat = el.lat ?? el.center?.lat;
      const elLon = el.lon ?? el.center?.lon;
      if (elLat == null || elLon == null) return null;
      return {
        name: (el.tags && (el.tags.name || el.tags.brand)) || 'Fuel station',
        lat: elLat,
        lon: elLon,
        distance: distanceMeters(lat, lon, elLat, elLon),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance);
  // A station mapped as both a node and a way shows up twice. Keep the closer
  // point when the name matches and the two are essentially the same place.
  const unique = [];
  for (const s of stations) {
    const dup = unique.find((o) => o.name === s.name && distanceMeters(o.lat, o.lon, s.lat, s.lon) < 50);
    if (!dup) unique.push(s);
  }
  return unique;
}

// Meters. Auto-fill only within the tight radius (station footprint + GPS drift).
// The wide pass is for tappable suggestions only — never silently fill a station
// ~0.6 mi away just because Overpass found something in the neighborhood.
const FUEL_SEARCH_RADIUS_M = 150;
const FUEL_SEARCH_RADIUS_WIDE_M = 1000;

async function findNearbyFuelStationsExpanding(lat, lon) {
  // One wide query, then split: close enough to auto-fill vs farther suggestions.
  const stations = await findNearbyFuelStations(lat, lon, FUEL_SEARCH_RADIUS_WIDE_M);
  const nearby = stations.filter((s) => s.distance <= FUEL_SEARCH_RADIUS_M);
  return {
    stations,
    nearby,
    autoFill: nearby.length > 0,
  };
}

async function fetchStreetAddress(lat, lon) {
  try {
    const res = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`
    );
    if (!res.ok) return '';
    const data = await res.json();
    const a = data.address || {};
    return [a.house_number, a.road].filter(Boolean).join(' ');
  } catch {
    return '';
  }
}

function renderNearbyStations(stations, cityState) {
  nearbyStationsEl.innerHTML = '';
  if (!stations.length) {
    nearbyStationsEl.hidden = true;
    return;
  }
  nearbyStationsEl.hidden = false;
  stations.forEach((s) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'station-chip';
    chip.textContent = `${s.name} · ${fmtDistance(s.distance)}`;
    chip.addEventListener('click', async () => {
      const generation = locateGeneration;
      locationInput.value = [s.name, cityState].filter(Boolean).join(', ');
      locationInput.dataset.lat = s.lat;
      locationInput.dataset.lon = s.lon;
      missingDataNotice.hidden = true;
      const address = await fetchStreetAddress(s.lat, s.lon);
      if (generation !== locateGeneration) return;
      setLocationLine('Selected station', address);
      syncAdvancedFields();
    });
    nearbyStationsEl.appendChild(chip);
  });
}

async function reverseGeocode(latitude, longitude, foundLabel, offlineLabel) {
  const generation = locateGeneration;
  const stale = () => generation !== locateGeneration;
  beginLocating();
  locationInput.dataset.lat = latitude;
  locationInput.dataset.lon = longitude;
  renderNearbyStations([]);
  missingDataNotice.hidden = true;
  missingDataNotice.innerHTML = '';
  try {
    const res = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`
    );
    if (stale()) return;
    if (!res.ok) throw new Error('reverse geocode failed');
    const data = await res.json();
    if (stale()) return;
    const a = data.address || {};
    const city = a.city || a.town || a.village || a.hamlet || '';
    const state = abbrState(a);
    const cityState = [city, state].filter(Boolean).join(', ');
    const street = [a.house_number, a.road].filter(Boolean).join(' ');

    if (data.type === 'fuel') {
      // Nominatim's own point already resolved to a fuel station — trust it
      // immediately rather than spending a round-trip on Overpass to confirm
      // what's already correct. (`address.amenity` holds the business NAME,
      // not the tag type — the reliable signal is the top-level `type`.)
      locationInput.value = [a.amenity, cityState].filter(Boolean).join(', ');
      setLocationLine(foundLabel, street);
      return;
    }

    // Prefer a truly nearby fuel station over whatever non-fuel POI Nominatim
    // snapped to. Farther stations are offered as chips only — never auto-filled.
    try {
      const { stations, nearby, autoFill } = await findNearbyFuelStationsExpanding(latitude, longitude);
      if (stale()) return;
      if (autoFill) {
        const best = nearby[0];
        locationInput.value = [best.name, cityState].filter(Boolean).join(', ');
        locationInput.dataset.lat = best.lat;
        locationInput.dataset.lon = best.lon;
        // Nominatim allows about one request per second. Reuse the street we
        // already have when the pick is essentially the same place.
        const address = best.distance <= 80 && street
          ? street
          : await fetchStreetAddress(best.lat, best.lon);
        if (stale()) return;
        setLocationLine(foundLabel, address);
        if (stations.length > 1) renderNearbyStations(stations, cityState);
        return;
      }

      // Nothing within the tight radius — leave the field empty (don't invent a
      // road name or a distant station) and offer any wider matches as taps.
      locationInput.value = '';
      // Keep the live GPS point on the entry even when no station name stuck.
      locationInput.dataset.lat = latitude;
      locationInput.dataset.lon = longitude;
      setLocationLine(
        'No gas station found nearby',
        stations.length ? 'Tap a suggestion below if one looks right' : ''
      );
      renderNearbyStations(stations, cityState);
      return;
    } catch {
      // Overpass unavailable — fall through to a coordinate/offline fallback.
      if (stale()) return;
    }

    locationInput.value = '';
    locationInput.dataset.lat = latitude;
    locationInput.dataset.lon = longitude;
    setLocationLine('No gas station found nearby', '');
    renderNearbyStations([]);
  } catch {
    if (stale()) return;
    locationInput.value = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    setLocationLine(offlineLabel, '');
  } finally {
    if (!stale()) {
      syncAdvancedFields();
      endLocating();
    }
  }
}

function locate() {
  if (isLocating) return;

  // While editing an existing entry, you're usually somewhere else entirely
  // by the time you're fixing it up — live GPS would silently replace the
  // fill-up's real location with wherever you are right now. Re-run the
  // nearby-station search from the entry's already-saved coordinates instead,
  // so the chip picker can offer a different match if the original was wrong.
  if (editingId) {
    const savedLat = parseFloat(locationInput.dataset.lat);
    const savedLon = parseFloat(locationInput.dataset.lon);
    if (isFinite(savedLat) && isFinite(savedLon)) {
      return reverseGeocode(savedLat, savedLon, 'Saved location', 'Saved location (offline — coordinates only)');
    }
    // No saved GPS — a typed place name is the only location we have. Don't
    // silently overwrite it with wherever the phone is now; ask first. An
    // empty field can still take live GPS without a prompt.
    if (locationInput.value.trim()) {
      const ok = confirm(
        'This fill-up has no saved GPS coordinates.\n\nReplace the typed location with your current location?'
      );
      if (!ok) {
        locationStatus.textContent = 'Kept typed location — add coordinates under Advanced, or clear the field and tap 📍';
        return;
      }
    }
  }

  if (!('geolocation' in navigator)) {
    locationStatus.textContent = 'Geolocation not supported — enter manually';
    return;
  }
  const generation = locateGeneration;
  beginLocating();
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      if (generation !== locateGeneration) return;
      lastLocationSource = 'gps';
      return reverseGeocode(
        pos.coords.latitude,
        pos.coords.longitude,
        'Current location',
        'Current location (offline — coordinates only)'
      );
    },
    () => {
      if (generation !== locateGeneration) return;
      cancelLocating();
      locationStatus.textContent = 'Location unavailable — enter manually';
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// --- Minimal EXIF reader: just enough to pull GPS coords and capture time ---
// out of a JPEG's APP1 segment. iOS converts photos picked from the library
// to JPEG for web uploads, which is what this targets.

function readExif(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    if ((marker & 0xff00) !== 0xff00) break;
    if (marker === 0xffd9 || marker === 0xffda) break;
    const segLength = view.getUint16(offset + 2);
    if (marker === 0xffe1) {
      const segStart = offset + 4;
      if (
        segStart + 6 <= view.byteLength &&
        view.getUint32(segStart) === 0x45786966 &&
        view.getUint16(segStart + 4) === 0x0000
      ) {
        return readTiff(view, segStart + 6);
      }
    }
    offset += 2 + segLength;
  }
  return null;
}

function readTiff(view, tiffStart) {
  const little = view.getUint16(tiffStart) === 0x4949;
  const ifd0Offset = tiffStart + view.getUint32(tiffStart + 4, little);

  const ifd0 = readIFD(view, tiffStart, ifd0Offset, little);
  const result = { dateTime: ifd0[0x0132] };

  if (ifd0[0x8769]) {
    const exifIfd = readIFD(view, tiffStart, tiffStart + ifd0[0x8769], little);
    if (exifIfd[0x9003]) result.dateTimeOriginal = exifIfd[0x9003];
  }

  if (ifd0[0x8825]) {
    const gpsIfd = readIFD(view, tiffStart, tiffStart + ifd0[0x8825], little);
    const lat = toDecimalDegrees(gpsIfd[0x2], gpsIfd[0x1]);
    const lon = toDecimalDegrees(gpsIfd[0x4], gpsIfd[0x3]);
    if (lat != null && lon != null) result.gps = { lat, lon };
  }

  return result;
}

function readIFD(view, tiffStart, ifdOffset, little) {
  const tags = {};
  const numEntries = view.getUint16(ifdOffset, little);
  const typeSizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

  for (let i = 0; i < numEntries; i++) {
    const entryOffset = ifdOffset + 2 + i * 12;
    const tag = view.getUint16(entryOffset, little);
    const type = view.getUint16(entryOffset + 2, little);
    const count = view.getUint32(entryOffset + 4, little);
    const valueOffset = entryOffset + 8;
    const size = (typeSizes[type] || 1) * count;
    const dataOffset = size > 4 ? tiffStart + view.getUint32(valueOffset, little) : valueOffset;
    if (dataOffset + size > view.byteLength) continue;

    if (type === 2) {
      let str = '';
      for (let j = 0; j < count - 1; j++) str += String.fromCharCode(view.getUint8(dataOffset + j));
      tags[tag] = str;
    } else if (type === 3) {
      tags[tag] = count === 1
        ? view.getUint16(dataOffset, little)
        : Array.from({ length: count }, (_, j) => view.getUint16(dataOffset + j * 2, little));
    } else if (type === 4) {
      tags[tag] = count === 1
        ? view.getUint32(dataOffset, little)
        : Array.from({ length: count }, (_, j) => view.getUint32(dataOffset + j * 4, little));
    } else if (type === 5) {
      const readRational = (o) => {
        const den = view.getUint32(o + 4, little);
        return den === 0 ? 0 : view.getUint32(o, little) / den;
      };
      tags[tag] = count === 1
        ? readRational(dataOffset)
        : Array.from({ length: count }, (_, j) => readRational(dataOffset + j * 8));
    }
  }
  return tags;
}

function toDecimalDegrees(dms, ref) {
  if (!Array.isArray(dms) || dms.length < 3) return null;
  let deg = dms[0] + dms[1] / 60 + dms[2] / 3600;
  if (ref === 'S' || ref === 'W') deg = -deg;
  return deg;
}

function exifDateToInputValue(exifDate) {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(exifDate || '');
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return `${y}-${mo}-${d}T${h}:${mi}`;
}

// Finds the most recent entry dated before the given datetime — i.e. the
// prior fill-up an entry's MPG should be measured against. Always computed
// on demand rather than stored, so it can never go stale when entries are
// edited or deleted.
function findPreviousEntry(datetime, excludeId) {
  const before = loadEntries()
    .filter((e) => e.id !== excludeId && new Date(e.datetime) < new Date(datetime));
  if (!before.length) return null;
  before.sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
  return before[0];
}

function calcMpg(mileage, gallons, prevMileage) {
  if (prevMileage == null || mileage <= prevMileage || !(gallons > 0)) return null;
  return (mileage - prevMileage) / gallons;
}

// Guesses mileage/price/total for a fresh fill-up from history, so the form's
// placeholders can show a live prediction instead of a generic example.
// Returns null until there's at least one completed interval between two
// prior entries to learn from.
//
// - predicted mileage = previous odometer + the usual distance between
//   fill-ups, clamped so it can never be lower than the previous reading or
//   higher than a plausible full-tank range: the larger of
//   (avg MPG × largest fill gallons) and the longest past trip between
//   fill-ups — so a historically normal interval never false-alarms.
// - predicted price = most recent price/gallon (about as good as a guess
//   can get without a fuel-price feed).
// - predicted total = predicted gallons (from the mileage guess) × predicted
//   price — derived, not separately guessed.
function computePredictions() {
  const entries = loadEntries().sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  if (entries.length < 2) return null;

  const mpgs = [];
  const intervals = [];
  const gallonsPerFill = [];

  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1];
    const cur = entries[i];
    const gallons = cur.pricePerGallon > 0 ? cur.totalCost / cur.pricePerGallon : 0;
    const mpg = calcMpg(cur.mileage, gallons, prev.mileage);
    if (mpg != null) {
      mpgs.push(mpg);
      intervals.push(cur.mileage - prev.mileage);
    }
    if (gallons > 0) gallonsPerFill.push(gallons);
  }

  if (!mpgs.length || !gallonsPerFill.length) return null;

  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const avgMpg = avg(mpgs);
  const avgIntervalMiles = avg(intervals);
  const maxGallons = Math.max(...gallonsPerFill);
  const maxIntervalMiles = Math.max(...intervals);
  const lastEntry = entries[entries.length - 1];
  const previousMileage = lastEntry.mileage;

  if (!(avgMpg > 0) || !(maxGallons > 0)) return null;

  const lowerBound = previousMileage;
  const tankRangeMiles = avgMpg * maxGallons;
  const upperBound = previousMileage + Math.max(tankRangeMiles, maxIntervalMiles);
  const mileage = Math.min(Math.max(previousMileage + avgIntervalMiles, lowerBound), upperBound);
  const gallons = (mileage - previousMileage) / avgMpg;
  const price = lastEntry.pricePerGallon;
  const totalCost = gallons * price;

  return {
    previousMileage,
    avgMpg,
    lowerBound,
    upperBound,
    mileage,
    price,
    totalCost,
    latestDatetime: lastEntry.datetime,
  };
}

// Non-blocking: the tank-capacity bound is a heuristic (biggest fill-up on
// record), not a hard rule, so an unusual-but-real case just gets flagged
// rather than stopped.
function updateMileageBoundsWarning(mileage) {
  if (editingId || !currentPredictions || !isFinite(mileage)) {
    mileageBoundsWarning.hidden = true;
    return;
  }
  // Bounds describe the next fill-up after the newest one. A backdated
  // entry is a real earlier reading, so this warning would be a false alarm.
  if (
    datetimeInput.value &&
    currentPredictions.latestDatetime &&
    new Date(datetimeInput.value) < new Date(currentPredictions.latestDatetime)
  ) {
    mileageBoundsWarning.hidden = true;
    return;
  }
  if (mileage < currentPredictions.lowerBound) {
    mileageBoundsWarning.hidden = false;
    mileageBoundsWarning.textContent = `Lower than your last fill-up (${Math.round(currentPredictions.lowerBound).toLocaleString()} mi)`;
  } else if (mileage > currentPredictions.upperBound) {
    mileageBoundsWarning.hidden = false;
    mileageBoundsWarning.textContent = `More than a full tank could cover (~${Math.round(currentPredictions.upperBound).toLocaleString()} mi max)`;
  } else {
    mileageBoundsWarning.hidden = true;
  }
}

// Sets (or clears) the three ghost placeholders for a fresh entry. Skipped
// entirely while editing, matching the existing pattern of not letting
// auto-behavior touch an in-progress edit (see the GPS skip below).
function applyPredictedPlaceholders() {
  currentPredictions = editingId ? null : computePredictions();
  currentTotalGuess = currentPredictions ? currentPredictions.totalCost : null;

  mileageInput.placeholder = currentPredictions
    ? `≈ ${Math.round(currentPredictions.mileage).toLocaleString()}`
    : 'e.g. 45210';
  priceInput.placeholder = currentPredictions
    ? `≈${Number(currentPredictions.price).toFixed(3).slice(0, -1)}`
    : '3.49';
  totalCostInput.placeholder = currentPredictions
    ? `≈${currentPredictions.totalCost.toFixed(2)}`
    : '42.50';

  updateMileageBoundsWarning(parseFloat(mileageInput.value));
}

function monthKeyFromDatetime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabelFromKey(key) {
  if (key === 'unknown') return 'Unknown date';
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

function groupEntriesByMonth(entriesNewestFirst) {
  const groups = [];
  const byKey = new Map();
  for (const entry of entriesNewestFirst) {
    const key = monthKeyFromDatetime(entry.datetime);
    let group = byKey.get(key);
    if (!group) {
      group = { key, entries: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}

// Same summary shape for a calendar month or the whole log.
function summarizeEntries(entries) {
  let spend = 0;
  let gallons = 0;
  let miles = 0;
  let mpgMiles = 0;
  let mpgGallons = 0;
  for (const entry of entries) {
    spend += Number(entry.totalCost) || 0;
    const entryGallons = entry.pricePerGallon > 0 ? entry.totalCost / entry.pricePerGallon : 0;
    if (entryGallons > 0) gallons += entryGallons;
    const prev = findPreviousEntry(entry.datetime, entry.id);
    if (prev && entry.mileage > prev.mileage) {
      const intervalMiles = entry.mileage - prev.mileage;
      miles += intervalMiles;
      if (entryGallons > 0) {
        mpgMiles += intervalMiles;
        mpgGallons += entryGallons;
      }
    }
  }
  return {
    count: entries.length,
    spend,
    miles,
    avgMpg: mpgGallons > 0 ? mpgMiles / mpgGallons : null,
    avgPpg: gallons > 0 ? spend / gallons : null,
  };
}

function formatFillCount(count) {
  return `${count} fill-up${count === 1 ? '' : 's'}`;
}

// Metrics only (count lives on the title row). Labels stay readable without color.
function summaryMetrics(summary) {
  const metrics = [];
  metrics.push({ kind: 'spend', value: fmtMoney(summary.spend), label: 'spent' });
  if (summary.miles > 0) {
    metrics.push({
      kind: 'miles',
      value: `${Math.round(summary.miles).toLocaleString()} mi`,
      label: 'driven',
    });
  }
  if (summary.avgMpg != null) {
    metrics.push({ kind: 'mpg', value: summary.avgMpg.toFixed(1), label: 'mpg' });
  }
  if (summary.avgPpg != null) {
    metrics.push({ kind: 'price', value: fmtPricePerGallon(summary.avgPpg), label: '/gal' });
  }
  return metrics;
}

function summaryStatsHtml(summary) {
  return summaryMetrics(summary).map((metric) => (
    `<span class="stat stat-${metric.kind}">` +
      `<span class="stat-value">${escapeHtml(metric.value)}</span>` +
      `<span class="stat-label">${escapeHtml(metric.label)}</span>` +
    `</span>`
  )).join('');
}

function formatSummarySpoken(summary) {
  return [formatFillCount(summary.count), ...summaryMetrics(summary).map((m) => `${m.value} ${m.label}`)];
}

function isMonthOpen(key) {
  return monthOpenOverrides.get(key) === true;
}

function createEntryElement(entry, { arrive = false } = {}) {
  const prev = findPreviousEntry(entry.datetime, entry.id);
  const gallons = entry.pricePerGallon > 0 ? entry.totalCost / entry.pricePerGallon : 0;
  const mpg = calcMpg(entry.mileage, gallons, prev && prev.mileage);

  const li = document.createElement('li');
  li.className = 'entry';
  li.dataset.id = entry.id;
  li.setAttribute('role', 'button');
  li.tabIndex = 0;
  li.setAttribute('aria-label', `Edit fill-up from ${fmtDate(entry.datetime)}, ${fmtMoney(entry.totalCost)}`);
  li.innerHTML = `
    <div class="entry-top">
      <span class="entry-cost">${fmtMoney(entry.totalCost)}</span>
      <span class="entry-date">${fmtDate(entry.datetime)}</span>
    </div>
    <div class="entry-details">
      <span><b>${Number(entry.mileage).toLocaleString()}</b> mi</span>
      <span><b>${fmtPricePerGallon(entry.pricePerGallon)}</b>/gal</span>
      <span><b>${gallons.toFixed(2)}</b> gal</span>
      ${mpg ? `<span><b>${mpg.toFixed(1)}</b> mpg</span>` : ''}
    </div>
    ${entry.location ? `<div class="entry-location">📍 ${escapeHtml(entry.location)}</div>` : ''}
    <span class="entry-chevron" aria-hidden="true">›</span>
  `;
  if (arrive) li.classList.add('entry-arrive');
  return li;
}

// Keep chart point counts readable (~1–16). Prefer per-fill when sparse;
// roll up to week → month → quarter → year as history grows.
const MAX_CHART_POINTS = 16;

function chooseTrendGrain(entriesOldestFirst) {
  const n = entriesOldestFirst.length;
  if (n <= MAX_CHART_POINTS) return 'fill';

  const t0 = new Date(entriesOldestFirst[0].datetime).getTime();
  const t1 = new Date(entriesOldestFirst[n - 1].datetime).getTime();
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return 'month';
  const days = Math.max(1, (t1 - t0) / 86400000);

  const candidates = [
    { id: 'week', approx: days / 7 },
    { id: 'month', approx: days / 30.44 },
    { id: 'quarter', approx: days / 91.31 },
    { id: 'year', approx: days / 365.25 },
  ];
  for (const candidate of candidates) {
    if (candidate.approx <= MAX_CHART_POINTS) return candidate.id;
  }
  return 'year';
}

function isoWeekBucketKey(date) {
  // ISO week: Monday-based week containing the date.
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const year = utc.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function grainBucketKey(entry, grain) {
  if (grain === 'fill') return entry.id;
  const d = new Date(entry.datetime);
  if (Number.isNaN(d.getTime())) return 'unknown';
  const year = d.getFullYear();
  if (grain === 'week') return isoWeekBucketKey(d);
  if (grain === 'month') return `${year}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  if (grain === 'quarter') return `${year}-Q${Math.floor(d.getMonth() / 3) + 1}`;
  return String(year);
}

function seriesSpansYears(entries) {
  const years = new Set();
  for (const entry of entries) {
    const d = new Date(entry.datetime);
    if (!Number.isNaN(d.getTime())) years.add(d.getFullYear());
  }
  return years.size > 1;
}

function fmtChartBucketLabel(grain, bucketKey, sampleEntry, { includeYear = false } = {}) {
  if (grain === 'fill') {
    const d = new Date(sampleEntry.datetime);
    if (Number.isNaN(d.getTime())) return 'Unknown';
    return d.toLocaleString(undefined, includeYear
      ? { month: 'short', day: 'numeric', year: '2-digit' }
      : { month: 'short', day: 'numeric' });
  }
  if (bucketKey === 'unknown') return 'Unknown';
  if (grain === 'week') {
    const d = new Date(sampleEntry.datetime);
    return d.toLocaleString(undefined, includeYear
      ? { month: 'short', day: 'numeric', year: '2-digit' }
      : { month: 'short', day: 'numeric' });
  }
  if (grain === 'month') {
    const [year, month] = bucketKey.split('-').map(Number);
    if (!year || !month) return bucketKey;
    const d = new Date(year, month - 1, 1);
    const monthName = d.toLocaleString(undefined, { month: 'short' });
    // Prefer "Oct '25" over locale "Oct 25", which reads like a day-of-month.
    return includeYear ? `${monthName} '${String(year).slice(2)}` : monthName;
  }
  if (grain === 'quarter') {
    const match = /^(\d{4})-Q([1-4])$/.exec(bucketKey);
    if (!match) return bucketKey;
    return includeYear ? `Q${match[2]} '${String(match[1]).slice(2)}` : `Q${match[2]}`;
  }
  return bucketKey;
}

const GRAIN_PERIOD_UNIT = {
  fill: '/fill',
  week: '/wk',
  month: '/mo',
  quarter: '/qtr',
  year: '/yr',
};

const GRAIN_ARIA = {
  fill: 'fill-up',
  week: 'week',
  month: 'month',
  quarter: 'quarter',
  year: 'year',
};

// Adaptive series matching log summary metrics, oldest → newest.
function collectTrendSeries(entriesNewestFirst) {
  const oldestFirst = [...entriesNewestFirst].reverse();
  const grain = chooseTrendGrain(oldestFirst);
  const includeYear = seriesSpansYears(oldestFirst);

  const bucketOrder = [];
  const buckets = new Map();
  for (const entry of oldestFirst) {
    const key = grainBucketKey(entry, grain);
    if (!buckets.has(key)) {
      buckets.set(key, []);
      bucketOrder.push(key);
    }
    buckets.get(key).push(entry);
  }

  const keys = bucketOrder.slice(-MAX_CHART_POINTS);
  const fills = [];
  const spend = [];
  const miles = [];
  const mpg = [];
  const price = [];

  for (const key of keys) {
    const groupEntries = buckets.get(key);
    const summary = summarizeEntries(groupEntries);
    const label = fmtChartBucketLabel(grain, key, groupEntries[0], { includeYear });
    const point = (value) => ({ value, bucketKey: key, label });

    // Per-fill "count" is always 1 — skip that chart; use buckets for counts.
    if (grain !== 'fill') fills.push(point(summary.count));
    spend.push(point(summary.spend));
    if (summary.miles > 0) miles.push(point(summary.miles));
    if (summary.avgMpg != null) mpg.push(point(summary.avgMpg));
    if (summary.avgPpg != null) price.push(point(summary.avgPpg));
  }

  return { fills, spend, miles, mpg, price, grain };
}

function seriesStats(points) {
  if (!points.length) return null;
  const values = points.map((p) => p.value);
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    count: values.length,
    avg: sum / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    last: values[values.length - 1],
    first: values[0],
  };
}

// Up to 4 ticks: always ends, plus evenly spaced middles when needed.
function xAxisLabelIndexes(count) {
  if (count <= 1) return [0];
  if (count === 2) return [0, 1];
  if (count === 3) return [0, 1, 2];
  if (count <= 4) return [...Array(count).keys()];
  return [0, Math.round((count - 1) / 3), Math.round((2 * (count - 1)) / 3), count - 1];
}

function formatTrendDelta(delta, formatValue, avg) {
  const abs = Math.abs(delta);
  const threshold = Math.abs(avg) * 0.02 || 0.05;
  if (abs < threshold) return '→';
  return `${delta > 0 ? '↑' : '↓'}${formatValue(abs)}`;
}

function renderLineChart(bodyEl, avgEl, {
  points,
  formatValue,
  unitLabel,
  stroke = 'rgba(255, 107, 53, 0.9)',
  fill = '#ff6b35',
  ariaName,
  grain = 'month',
}) {
  if (!points || points.length < 1) {
    bodyEl.innerHTML = '';
    avgEl.textContent = '';
    return false;
  }

  const recent = points.slice(-MAX_CHART_POINTS);
  const all = seriesStats(points);
  const windowStats = seriesStats(recent);
  const delta = windowStats.last - windowStats.first;
  const deltaLabel = formatTrendDelta(delta, formatValue, windowStats.avg);
  const grainWord = GRAIN_ARIA[grain] || 'period';

  avgEl.textContent = unitLabel
    ? `Avg ${formatValue(all.avg)} ${unitLabel}`
    : `Avg ${formatValue(all.avg)}`;

  const width = 280;
  const height = 88;
  const padY = 8;
  const min = windowStats.min;
  const max = windowStats.max;
  const range = max - min || 1;
  const avgY = height - padY - ((windowStats.avg - min) / range) * (height - padY * 2);
  const coords = recent.map((point, i) => {
    const x = recent.length === 1 ? width / 2 : (i / (recent.length - 1)) * width;
    const y = height - padY - ((point.value - min) / range) * (height - padY * 2);
    return {
      x,
      y,
      value: point.value,
      label: point.label,
    };
  });
  const pointsAttr = coords.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const last = coords[coords.length - 1];
  const highIdx = recent.findIndex((p) => p.value === windowStats.max);
  const lowIdx = recent.findIndex((p) => p.value === windowStats.min);
  const high = coords[highIdx];
  const low = coords[lowIdx];
  const showLine = coords.length >= 2;

  const xLabels = xAxisLabelIndexes(recent.length).map((i) => {
    const pct = recent.length === 1 ? 50 : (i / (recent.length - 1)) * 100;
    return `<span style="left:${pct.toFixed(2)}%">${escapeHtml(coords[i].label)}</span>`;
  }).join('');

  const metaText = coords.length === 1
    ? `${formatValue(windowStats.last)} now`
    : [
      `${formatValue(windowStats.max)} high`,
      `${formatValue(windowStats.min)} low`,
      `${formatValue(windowStats.last)} now`,
      `${deltaLabel} change`,
    ].join(' · ');

  bodyEl.setAttribute(
    'aria-label',
    `${ariaName} by ${grainWord} over ${recent.length} ${grainWord}${recent.length === 1 ? '' : 's'}. Latest ${formatValue(windowStats.last)}, average ${formatValue(windowStats.avg)}, high ${formatValue(windowStats.max)}, low ${formatValue(windowStats.min)}.`
  );
  bodyEl.innerHTML = `
    <div class="trend-chart-plot">
      <div class="trend-chart-scale" aria-hidden="true">
        <span>${escapeHtml(formatValue(max))}</span>
        <span>${escapeHtml(formatValue(windowStats.avg))}</span>
        <span>${escapeHtml(formatValue(min))}</span>
      </div>
      <div class="trend-chart-svg-wrap">
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <line x1="0" y1="${avgY.toFixed(1)}" x2="${width}" y2="${avgY.toFixed(1)}"
            stroke="rgba(154, 160, 172, 0.35)" stroke-width="1" stroke-dasharray="4 4" />
          ${showLine ? `<polyline
            fill="none"
            stroke="${stroke}"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            points="${pointsAttr}"
          />` : ''}
          ${showLine ? `<circle cx="${high.x.toFixed(1)}" cy="${high.y.toFixed(1)}" r="3" fill="${fill}" opacity="0.55" />
          <circle cx="${low.x.toFixed(1)}" cy="${low.y.toFixed(1)}" r="3" fill="${fill}" opacity="0.55" />` : ''}
          <circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="3.5" fill="${fill}" />
        </svg>
        <div class="trend-chart-x" aria-hidden="true">${xLabels}</div>
      </div>
    </div>
    <p class="trend-chart-meta">${escapeHtml(metaText)}</p>
  `;
  return true;
}

function renderTrends(entriesNewestFirst) {
  const { fills, spend, miles, mpg, price, grain } = collectTrendSeries(entriesNewestFirst);
  const period = GRAIN_PERIOD_UNIT[grain] || '/mo';

  // Same order as log summaries: fill-ups · spend · miles · mpg · $/gal
  const fillsOk = renderLineChart(chartFillsBodyEl, chartFillsAvgEl, {
    points: fills,
    formatValue: (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1)),
    unitLabel: period,
    stroke: 'rgba(200, 160, 255, 0.95)',
    fill: '#c8a0ff',
    ariaName: 'Fill-ups',
    grain,
  });
  const spendOk = renderLineChart(chartSpendBodyEl, chartSpendAvgEl, {
    points: spend,
    formatValue: (n) => fmtMoney(n),
    unitLabel: period,
    stroke: 'rgba(255, 180, 70, 0.95)',
    fill: '#ffb446',
    ariaName: 'Spend',
    grain,
  });
  const milesOk = renderLineChart(chartMilesBodyEl, chartMilesAvgEl, {
    points: miles,
    formatValue: (n) => Math.round(n).toLocaleString(),
    unitLabel: `mi${period}`,
    stroke: 'rgba(120, 210, 160, 0.95)',
    fill: '#78d2a0',
    ariaName: 'Miles',
    grain,
  });
  const mpgOk = renderLineChart(chartMpgBodyEl, chartMpgAvgEl, {
    points: mpg,
    formatValue: (n) => n.toFixed(1),
    unitLabel: 'mpg',
    ariaName: 'Average MPG',
    grain,
  });
  const priceOk = renderLineChart(chartPriceBodyEl, chartPriceAvgEl, {
    points: price,
    formatValue: (n) => fmtPricePerGallon(n),
    unitLabel: '/gal',
    stroke: 'rgba(110, 180, 255, 0.9)',
    fill: '#6eb4ff',
    ariaName: 'Average price per gallon',
    grain,
  });

  chartFillsEl.hidden = !fillsOk;
  chartSpendEl.hidden = !spendOk;
  chartMilesEl.hidden = !milesOk;
  chartMpgEl.hidden = !mpgOk;
  chartPriceEl.hidden = !priceOk;

  const any = fillsOk || spendOk || milesOk || mpgOk || priceOk;
  trendsContent.hidden = !any;
  trendsEmpty.hidden = any;
}

function showPage(page) {
  const onTrends = page === 'trends';
  pageLog.hidden = onTrends;
  pageTrends.hidden = !onTrends;
  navLog.classList.toggle('is-active', !onTrends);
  navTrends.classList.toggle('is-active', onTrends);
  if (onTrends) {
    navLog.removeAttribute('aria-current');
    navTrends.setAttribute('aria-current', 'page');
    // Fresh render when opening Trends so charts match the current log.
    renderTrends(loadEntries().sort((a, b) => new Date(b.datetime) - new Date(a.datetime)));
  } else {
    navTrends.removeAttribute('aria-current');
    navLog.setAttribute('aria-current', 'page');
  }
}

navLog.addEventListener('click', () => showPage('log'));
navTrends.addEventListener('click', () => showPage('trends'));

function render() {
  const entries = loadEntries().sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
  entriesList.innerHTML = '';
  emptyState.style.display = entries.length ? 'none' : 'block';
  exportBtn.disabled = entries.length === 0;
  updateStorageUsageBadge();

  if (entries.length) {
    const allSummary = summarizeEntries(entries);
    logMeta.hidden = false;
    logMetaCount.textContent = formatFillCount(allSummary.count);
    logMetaSummary.innerHTML = summaryStatsHtml(allSummary);
  } else {
    logMeta.hidden = true;
    logMetaCount.textContent = '';
    logMetaSummary.innerHTML = '';
  }

  const arrivingId = revealEntryId;
  const groups = groupEntriesByMonth(entries);
  groups.forEach((group) => {
    const open = isMonthOpen(group.key);
    const summary = summarizeEntries(group.entries);
    const spoken = formatSummarySpoken(summary);

    const monthLi = document.createElement('li');
    monthLi.className = 'month-group';
    monthLi.dataset.monthKey = group.key;
    const revealingHere = Boolean(arrivingId && group.entries.some((entry) => entry.id === arrivingId));

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'month-toggle';
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute(
      'aria-label',
      `${monthLabelFromKey(group.key)}. ${spoken.join(', ')}. ${open ? 'Collapse' : 'Expand'} fill-ups.`
    );
    toggle.innerHTML = `
      <span class="month-toggle-row">
        <span class="month-label">${escapeHtml(monthLabelFromKey(group.key))}</span>
        <span class="month-count">${escapeHtml(String(summary.count))}</span>
        <span class="month-chevron" aria-hidden="true">▾</span>
      </span>
      <span class="month-summary summary-stats">${summaryStatsHtml(summary)}</span>
    `;

    const panel = document.createElement('div');
    panel.className = 'month-panel';
    const inner = document.createElement('div');
    inner.className = 'collapse-inner';
    const monthEntries = document.createElement('ul');
    monthEntries.className = 'month-entries';
    group.entries.forEach((entry) => {
      monthEntries.appendChild(createEntryElement(entry, { arrive: entry.id === arrivingId }));
    });
    inner.appendChild(monthEntries);
    panel.appendChild(inner);

    toggle.addEventListener('click', () => {
      const nextOpen = !monthLi.classList.contains('is-open');
      monthLi.classList.toggle('is-open', nextOpen);
      toggle.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
      monthOpenOverrides.set(group.key, nextOpen);
    });

    monthLi.appendChild(toggle);
    monthLi.appendChild(panel);
    entriesList.appendChild(monthLi);

    if (open) {
      // Animate the month open when revealing a just-added fill-up.
      if (revealingHere && !prefersReducedMotion()) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => monthLi.classList.add('is-open'));
        });
      } else {
        monthLi.classList.add('is-open');
      }
    }
  });

  renderTrends(entries);

  if (arrivingId) {
    const arrived = entriesList.querySelector(`.entry[data-id="${arrivingId}"]`);
    if (arrived) {
      arrived.scrollIntoView({ behavior: smoothScrollBehavior(), block: 'nearest' });
      const clearArrive = () => arrived.classList.remove('entry-arrive');
      arrived.addEventListener('animationend', clearArrive, { once: true });
      setTimeout(clearArrive, 700);
    }
    revealEntryId = null;
  }
}

function updateMpgPreview() {
  const mileage = parseFloat(mileageInput.value);
  const price = getPricePerGallon();
  const cost = parseFloat(totalCostInput.value);
  const datetime = datetimeInput.value;

  // Sharpen the total-cost hint using whatever real mileage/price the user
  // has typed so far, instead of leaving it pinned to the original guess.
  if (!editingId && currentPredictions) {
    const typedMileageValid = isFinite(mileage) && mileage > currentPredictions.previousMileage;
    const effMileage = typedMileageValid ? mileage : currentPredictions.mileage;
    const effPrice = priceInput.value.trim() !== '' && isFinite(price) ? price : currentPredictions.price;
    const effGallons = currentPredictions.avgMpg > 0
      ? (effMileage - currentPredictions.previousMileage) / currentPredictions.avgMpg
      : 0;
    currentTotalGuess = effGallons * effPrice;
    totalCostInput.placeholder = `≈${currentTotalGuess.toFixed(2)}`;
  }

  if (!datetime || !isFinite(mileage) || !isFinite(price) || !isFinite(cost) || price <= 0) {
    mpgPreview.hidden = true;
  } else {
    const gallons = cost / price;
    const prev = findPreviousEntry(datetime, editingId);
    const mpg = calcMpg(mileage, gallons, prev && prev.mileage);

    if (mpg == null) {
      mpgPreview.hidden = true;
    } else {
      const milesTraveled = mileage - prev.mileage;
      mpgPreview.hidden = false;
      mpgPreview.textContent = `≈ ${mpg.toFixed(1)} MPG over ${milesTraveled.toLocaleString()} mi / ${gallons.toFixed(2)} gal since last fill-up`;
    }
  }

  updateMileageBoundsWarning(mileage);
}

function clearPhotoStatus() {
  photoStatus.hidden = true;
  photoStatus.textContent = '';
}

function resetToNewEntry() {
  locateGeneration++;
  if (isLocating) endLocating();
  editingId = null;
  autoLocateAttempted = false;
  form.reset();
  setDefaultDatetime();
  submitBtn.textContent = 'Add fill-up';
  editBanner.hidden = true;
  deleteEntryBtn.hidden = true;
  missingDataNotice.hidden = true;
  missingDataNotice.innerHTML = '';
  clearPhotoStatus();
  setCollapsibleOpen(advancedPanel, false);
  advancedToggle.setAttribute('aria-expanded', 'false');
  mpgPreview.hidden = true;
  applyPredictedPlaceholders();

  // form.reset() clears the visible location text, but not the coordinate
  // data attached to it — without that wipe, stale lat/lon would silently
  // carry over into the next entry.
  delete locationInput.dataset.lat;
  delete locationInput.dataset.lon;
  lastLocationSource = null;
  setLocationLine('', '');
  renderNearbyStations([]);
  syncAdvancedFields();
}

function checkMissingLocationData(entry) {
  if (entry.location && (entry.lat == null || entry.lon == null)) {
    missingDataNotice.hidden = false;
    missingDataNotice.innerHTML = `GPS coordinates weren't saved with this entry. If it was added from a photo, <button type="button" id="recover-photo-btn">re-select that photo</button> to recover them, or enter coordinates directly under Advanced.`;
    document.getElementById('recover-photo-btn').addEventListener('click', () => photoInput.click());
  } else {
    missingDataNotice.hidden = true;
    missingDataNotice.innerHTML = '';
  }
}

async function loadEntryIntoForm(entry) {
  locateGeneration++;
  if (isLocating) endLocating();
  const generation = locateGeneration;
  editingId = entry.id;
  // Editing never auto-locates; pin/photo remain available.
  autoLocateAttempted = true;
  currentPredictions = null;
  currentTotalGuess = null;
  mileageInput.placeholder = 'e.g. 45210';
  priceInput.placeholder = '3.49';
  totalCostInput.placeholder = '42.50';
  mileageBoundsWarning.hidden = true;
  datetimeInput.value = entry.datetime;
  mileageInput.value = entry.mileage;
  priceInput.value = entry.pricePerGallon.toFixed(3).slice(0, -1);
  totalCostInput.value = entry.totalCost.toFixed(2);
  locationInput.value = entry.location || '';
  locationInput.dataset.lat = entry.lat != null ? entry.lat : '';
  locationInput.dataset.lon = entry.lon != null ? entry.lon : '';
  lastLocationSource = entry.source || null;
  setLocationLine('', '');
  renderNearbyStations([]);
  clearPhotoStatus();

  submitBtn.textContent = 'Update fill-up';
  editBannerText.textContent = `Editing fill-up from ${fmtDate(entry.datetime)}`;
  editBanner.hidden = false;
  deleteEntryBtn.hidden = false;

  checkMissingLocationData(entry);
  syncAdvancedFields();
  updateMpgPreview();

  form.scrollIntoView({ behavior: smoothScrollBehavior(), block: 'start' });

  if (entry.lat != null && entry.lon != null) {
    const address = await fetchStreetAddress(entry.lat, entry.lon);
    if (generation !== locateGeneration) return;
    setLocationLine('Saved location', address);
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const entries = loadEntries();
  const data = {
    datetime: datetimeInput.value,
    mileage: parseFloat(mileageInput.value),
    pricePerGallon: getPricePerGallon(),
    totalCost: parseFloat(totalCostInput.value),
    location: locationInput.value.trim(),
    lat: locationInput.dataset.lat ? parseFloat(locationInput.dataset.lat) : null,
    lon: locationInput.dataset.lon ? parseFloat(locationInput.dataset.lon) : null,
    source: lastLocationSource,
  };

  let savedId = editingId;
  if (editingId) {
    const idx = entries.findIndex((entry) => entry.id === editingId);
    if (idx !== -1) entries[idx] = { ...entries[idx], ...data };
  } else {
    savedId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    entries.push({ id: savedId, ...data });
    // Keep the new fill-up visible: open its month and play the arrive animation.
    revealEntryId = savedId;
    monthOpenOverrides.set(monthKeyFromDatetime(data.datetime), true);
  }
  try {
    saveEntries(entries);
  } catch {
    revealEntryId = null;
    missingDataNotice.hidden = false;
    missingDataNotice.textContent = 'Could not save this fill-up — device storage is full. Export a backup, then delete older entries.';
    return;
  }

  resetToNewEntry();
  render();
});

function openEntryFromListTarget(target) {
  const li = target && target.closest ? target.closest('.entry') : null;
  if (!li || !entriesList.contains(li)) return;
  const entry = loadEntries().find((en) => en.id === li.dataset.id);
  if (entry) loadEntryIntoForm(entry);
}

entriesList.addEventListener('click', (e) => {
  if (e.target.closest('.month-toggle')) return;
  openEntryFromListTarget(e.target);
});

entriesList.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  if (!e.target.classList.contains('entry')) return;
  e.preventDefault();
  openEntryFromListTarget(e.target);
});

cancelEditBtn.addEventListener('click', resetToNewEntry);

deleteEntryBtn.addEventListener('click', () => {
  if (!editingId) return;
  if (!confirm('Delete this fill-up?')) return;
  const entries = loadEntries().filter((entry) => entry.id !== editingId);
  saveEntries(entries);
  resetToNewEntry();
  render();
});

locateBtn.addEventListener('click', () => {
  autoLocateAttempted = true;
  locate();
});

attachCurrencyInput(priceInput, 2);
attachCurrencyInput(totalCostInput, 2);

[mileageInput, priceInput, totalCostInput, datetimeInput].forEach((el) => {
  el.addEventListener('input', updateMpgPreview);
});

// Auto-locate once when the user starts filling a *new* entry — not on app
// open, not while editing, and never again on later field blurs. Manual 📍
// and photo import still work anytime.
function maybeAutoLocate() {
  if (editingId || autoLocateAttempted || isLocating) return;
  if (locationInput.value.trim()) {
    autoLocateAttempted = true;
    return;
  }
  autoLocateAttempted = true;
  locate();
}

[mileageInput, priceInput, totalCostInput, datetimeInput].forEach((el) => {
  let valueOnFocus = el.value;
  el.addEventListener('focus', () => {
    valueOnFocus = el.value;
  });
  el.addEventListener('blur', () => {
    if (el.value !== valueOnFocus) maybeAutoLocate();
  });
});

importPhotoBtn.addEventListener('click', () => photoInput.click());

photoInput.addEventListener('change', async () => {
  const file = photoInput.files[0];
  photoInput.value = '';
  if (!file) return;
  const generation = locateGeneration;
  autoLocateAttempted = true;

  photoStatus.hidden = false;
  photoStatus.textContent = 'Reading photo…';
  try {
    const exif = readExif(await file.arrayBuffer());
    if (generation !== locateGeneration) return;
    const dateStr = exif && (exif.dateTimeOriginal || exif.dateTime);
    const inputValue = exifDateToInputValue(dateStr);
    if (inputValue) datetimeInput.value = inputValue;

    if (exif && exif.gps) {
      lastLocationSource = 'photo';
      await reverseGeocode(
        exif.gps.lat,
        exif.gps.lon,
        'From photo location',
        'From photo location (offline — coordinates only)'
      );
    }
    if (generation !== locateGeneration) return;

    if (inputValue && exif.gps) {
      photoStatus.textContent = 'Filled date & location from photo';
    } else if (inputValue) {
      photoStatus.textContent = 'Filled date from photo — no location data found';
    } else if (exif && exif.gps) {
      photoStatus.textContent = 'Filled location from photo — no date found';
    } else {
      photoStatus.textContent = 'No date or location data found in this photo';
    }
  } catch {
    if (generation !== locateGeneration) return;
    photoStatus.textContent = 'Could not read this photo — enter details manually';
  }
});

function csvField(value) {
  let s = value == null ? '' : String(value);
  // Stop spreadsheet apps from treating a location like "=1+1" as a formula.
  // Only user-typed strings — numeric fields such as longitude are negative.
  if (typeof value === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const src = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\r') {
      // Ignore; \r\n handled when \n arrives. Lone \r treated as newline.
      if (next !== '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      }
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ''));
}

function stripCsvFormulaGuard(value) {
  const s = String(value ?? '');
  return /^'[=+\-@]/.test(s) ? s.slice(1) : s;
}

function newEntryId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Parses a Gassy CSV export (or compatible) into entry objects. Throws a
// human-readable Error when the file isn't usable.
function entriesFromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('This CSV has no fill-up rows.');

  const header = rows[0].map((h) => String(h).trim().toLowerCase());
  const col = (...names) => {
    for (const name of names) {
      const i = header.indexOf(name);
      if (i !== -1) return i;
    }
    return -1;
  };
  const iDatetime = col('datetime', 'date', 'date_time');
  const iMileage = col('mileage', 'odometer', 'miles');
  const iPrice = col('price_per_gallon', 'price/gallon', 'ppg', 'price');
  const iTotal = col('total_cost', 'total', 'cost');
  const iLocation = col('location', 'station', 'place');
  const iLat = col('latitude', 'lat');
  const iLon = col('longitude', 'lon', 'lng');

  if (iDatetime < 0 || iMileage < 0 || iPrice < 0 || iTotal < 0) {
    throw new Error('CSV header must include datetime, mileage, price_per_gallon, and total_cost.');
  }

  const entries = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const datetimeRaw = String(cells[iDatetime] ?? '').trim();
    // Accept "YYYY-MM-DDTHH:MM" or a value Excel mangled with seconds.
    const datetime = datetimeRaw.replace(' ', 'T').slice(0, 16);
    const mileage = parseFloat(cells[iMileage]);
    const pricePerGallon = parseFloat(cells[iPrice]);
    const totalCost = parseFloat(cells[iTotal]);
    if (!datetime || Number.isNaN(new Date(datetime).getTime())) {
      throw new Error(`Row ${r + 1}: missing or invalid datetime.`);
    }
    if (!isFinite(mileage) || mileage < 0) throw new Error(`Row ${r + 1}: invalid mileage.`);
    if (!isFinite(pricePerGallon) || pricePerGallon <= 0) throw new Error(`Row ${r + 1}: invalid price.`);
    if (!isFinite(totalCost) || totalCost < 0) throw new Error(`Row ${r + 1}: invalid total cost.`);

    let location = iLocation >= 0 ? stripCsvFormulaGuard(cells[iLocation] ?? '').trim() : '';
    const latRaw = iLat >= 0 ? String(cells[iLat] ?? '').trim() : '';
    const lonRaw = iLon >= 0 ? String(cells[iLon] ?? '').trim() : '';
    const lat = latRaw === '' ? null : parseFloat(latRaw);
    const lon = lonRaw === '' ? null : parseFloat(lonRaw);
    if (latRaw && !isFinite(lat)) throw new Error(`Row ${r + 1}: invalid latitude.`);
    if (lonRaw && !isFinite(lon)) throw new Error(`Row ${r + 1}: invalid longitude.`);

    entries.push({
      id: newEntryId() + r.toString(36),
      datetime,
      mileage,
      pricePerGallon,
      totalCost,
      location,
      lat: lat != null && isFinite(lat) ? lat : null,
      lon: lon != null && isFinite(lon) ? lon : null,
      source: null,
    });
  }
  if (!entries.length) throw new Error('This CSV has no fill-up rows.');
  return entries;
}

function setImportStatus(message, { error = false } = {}) {
  if (!message) {
    importStatus.hidden = true;
    importStatus.textContent = '';
    return;
  }
  importStatus.hidden = false;
  importStatus.textContent = message;
  importStatus.style.color = error ? 'var(--danger)' : '';
}

exportBtn.addEventListener('click', () => {
  const entries = loadEntries().sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  if (!entries.length) return;
  const header = ['datetime', 'mileage', 'price_per_gallon', 'total_cost', 'gallons', 'location', 'latitude', 'longitude'];
  const rows = entries.map((e) => {
    const gallons = e.pricePerGallon > 0 ? (e.totalCost / e.pricePerGallon).toFixed(3) : '';
    const price = isFinite(e.pricePerGallon) ? Number(e.pricePerGallon).toFixed(3) : '';
    return [e.datetime, e.mileage, price, e.totalCost, gallons, e.location || '', e.lat ?? '', e.lon ?? ''].map(csvField).join(',');
  });
  const csv = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gassy-log-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  setImportStatus('Exported — keep this file somewhere safe (e.g. Files / iCloud) before deleting the app.');
});

importBtn.addEventListener('click', () => importCsvInput.click());

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.readAsText(file);
  });
}

importCsvInput.addEventListener('change', async () => {
  const file = importCsvInput.files && importCsvInput.files[0];
  importCsvInput.value = '';
  if (!file) return;

  let text;
  try {
    text = await readFileAsText(file);
  } catch {
    setImportStatus('Could not read that file.', { error: true });
    return;
  }

  let imported;
  try {
    imported = entriesFromCsv(text);
  } catch (err) {
    setImportStatus(err && err.message ? err.message : 'Could not parse that CSV.', { error: true });
    return;
  }

  const current = loadEntries();
  const msg = current.length
    ? `Replace your current log (${current.length} fill-up${current.length === 1 ? '' : 's'}) with ${imported.length} from “${file.name}”?`
    : `Import ${imported.length} fill-up${imported.length === 1 ? '' : 's'} from “${file.name}”?`;
  if (!confirm(msg)) {
    setImportStatus('Import cancelled.');
    return;
  }

  try {
    saveEntries(imported);
  } catch {
    setImportStatus('Could not save the imported log — device storage is full.', { error: true });
    return;
  }

  monthOpenOverrides.clear();
  revealEntryId = null;
  resetToNewEntry();
  render();
  setImportStatus(`Restored ${imported.length} fill-up${imported.length === 1 ? '' : 's'} from CSV.`);
});

setDefaultDatetime();
applyPredictedPlaceholders();
render();

// --- Version badge: shows briefly after an update was just applied ---

const APP_VERSION = '1.16.0';
// Short build id while iterating on a PR — bump + mention in chat each push so
// the footer can be matched to the update. Cleared to '' before tagging a
// production release. Never shown on the live Pages host even if forgotten.
const PREVIEW_BUILD = '';
const PRODUCTION_HOST = 'jr00ck.github.io';
// Short human bullets for the in-app "✓ Updated" panel (not a full commit dump).
// Keep CHANGELOG.md in sync via `npm run changelog` (git-cliff + conventional commits).
const RELEASE_NOTES = [
  'Log summaries put fill-up count on the title row with compact tinted stats underneath',
  'Trends adapt the time grain (fill → week → month → quarter → year) so charts stay readable',
  'Single fill-ups can show as a single chart dot; denser history rolls up automatically',
];
const LAST_SEEN_KEY = 'gassy.lastSeenVersion';

function versionLabel() {
  const onProd = location.hostname === PRODUCTION_HOST;
  if (!onProd && PREVIEW_BUILD) return `v${APP_VERSION} · ${PREVIEW_BUILD}`;
  return `v${APP_VERSION}`;
}

document.getElementById('app-version').textContent = versionLabel();

const updatedBadge = document.getElementById('updated-badge');
const whatsNewEl = document.getElementById('whats-new');

const lastSeenVersion = localStorage.getItem(LAST_SEEN_KEY);
if (lastSeenVersion && lastSeenVersion !== APP_VERSION) {
  updatedBadge.hidden = false;
}
localStorage.setItem(LAST_SEEN_KEY, APP_VERSION);

function renderWhatsNew() {
  const items = RELEASE_NOTES.map((note) => `<li>${escapeHtml(note)}</li>`).join('');
  whatsNewEl.innerHTML = `
    <div class="collapse-inner">
      <p class="whats-new-title">What's new in v${escapeHtml(APP_VERSION)}</p>
      <ul class="whats-new-list">${items}</ul>
    </div>
  `;
}

updatedBadge.addEventListener('click', () => {
  const opening = updatedBadge.getAttribute('aria-expanded') !== 'true';
  if (opening) renderWhatsNew();
  setCollapsibleOpen(whatsNewEl, opening);
  updatedBadge.setAttribute('aria-expanded', opening ? 'true' : 'false');
});

// --- Service worker: offline caching only. Updates are applied exclusively
// via pull-to-refresh below, not automatically in the background. ---

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// --- Pull-to-refresh: standard iOS gesture, checks for + applies an update ---

const ptrIndicator = document.getElementById('ptr-indicator');
const appContent = document.getElementById('app-content');
const PTR_THRESHOLD = 70;
const PTR_MAX = 110;
let ptrStartY = null;
let ptrPulling = false;
let ptrReady = false;
let ptrRefreshing = false;

document.addEventListener('touchstart', (e) => {
  if (ptrRefreshing) return;
  if (window.scrollY <= 0) {
    ptrStartY = e.touches[0].clientY;
    ptrPulling = true;
  }
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  if (!ptrPulling || ptrStartY == null) return;
  const delta = e.touches[0].clientY - ptrStartY;
  if (delta > 0 && window.scrollY <= 0) {
    e.preventDefault();
    // Rubber-band damping so it eases off the further you pull, like the
    // native iOS overscroll bounce, rather than tracking the finger 1:1.
    // With Reduce Motion, skip the rubber-band animation and only track readiness.
    const pull = Math.min(delta * 0.55, PTR_MAX);
    ptrReady = pull >= PTR_THRESHOLD;
    if (prefersReducedMotion()) {
      ptrIndicator.style.opacity = ptrReady ? '1' : '0.35';
      return;
    }
    appContent.classList.add('ptr-dragging');
    ptrIndicator.classList.add('ptr-dragging');
    appContent.style.transform = `translateY(${pull}px)`;
    ptrIndicator.style.transform = `translateY(${pull - 30}px)`;
    ptrIndicator.style.opacity = String(Math.min(pull / PTR_THRESHOLD, 1));
  } else {
    ptrPulling = false;
  }
}, { passive: false });

document.addEventListener('touchend', () => {
  if (!ptrPulling) return;
  ptrPulling = false;
  appContent.classList.remove('ptr-dragging');
  ptrIndicator.classList.remove('ptr-dragging');
  if (ptrReady) {
    triggerPullRefresh();
  } else {
    appContent.style.transform = '';
    ptrIndicator.style.transform = '';
    ptrIndicator.style.opacity = '';
  }
  ptrReady = false;
});

async function triggerPullRefresh() {
  ptrRefreshing = true;
  ptrIndicator.style.opacity = '1';
  if (!prefersReducedMotion()) {
    ptrIndicator.classList.add('ptr-spinning');
    appContent.style.transform = 'translateY(56px)';
    ptrIndicator.style.transform = 'translateY(24px)';
  }

  try {
    // Bust-cache the shell assets (incl. manifest) before reload. On iOS, a
    // new orientation in the manifest still usually needs Delete App →
    // re-Add to Home Screen — pull-to-refresh alone won't re-apply that.
    await Promise.allSettled([
      fetch('manifest.webmanifest', { cache: 'reload' }),
      fetch('index.html', { cache: 'reload' }),
      fetch('app.js', { cache: 'reload' }),
      fetch('style.css', { cache: 'reload' }),
      fetch('sw.js', { cache: 'reload' }),
    ]);
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update();
        const worker = reg.waiting || reg.installing;
        if (worker) {
          worker.postMessage('SKIP_WAITING');
          await new Promise((resolve) => {
            let done = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
              done = true;
              resolve();
            }, { once: true });
            setTimeout(() => { if (!done) resolve(); }, 1500);
          });
        }
      }
    }
  } catch {
    // Network or SW issue — fall through to a plain reload regardless.
  }
  window.location.reload();
}
