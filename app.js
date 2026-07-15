const STORAGE_KEY = 'gassy.entries';

const form = document.getElementById('entry-form');
const datetimeInput = document.getElementById('datetime');
const mileageInput = document.getElementById('mileage');
const priceInput = document.getElementById('pricePerGallon');
const totalCostInput = document.getElementById('totalCost');
const locationInput = document.getElementById('location');
const locationStatus = document.getElementById('location-status');
const locationAddress = document.getElementById('location-address');
const locateBtn = document.getElementById('locate-btn');
const entriesList = document.getElementById('entries-list');
const emptyState = document.getElementById('empty-state');
const exportBtn = document.getElementById('export-btn');
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

locationInput.addEventListener('input', () => {
  lastLocationSource = 'manual';
});

const SOURCE_LABELS = { photo: 'Photo', gps: 'GPS', manual: 'Typed manually' };

function syncAdvancedFields() {
  entryIdField.value = editingId || '';
  latField.value = locationInput.dataset.lat || '';
  lonField.value = locationInput.dataset.lon || '';
  sourceField.value = SOURCE_LABELS[lastLocationSource] || 'Unknown';
}

advancedToggle.addEventListener('click', () => {
  advancedPanel.hidden = !advancedPanel.hidden;
  if (!advancedPanel.hidden) syncAdvancedFields();
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
    return raw ? JSON.parse(raw) : [];
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

async function findNearbyFuelStations(lat, lon) {
  const query = `[out:json][timeout:8];node["amenity"="fuel"](around:150,${lat},${lon});out body;`;
  const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('overpass failed');
  const data = await res.json();
  return (data.elements || [])
    .map((el) => ({
      name: (el.tags && (el.tags.name || el.tags.brand)) || 'Fuel station',
      lat: el.lat,
      lon: el.lon,
      distance: distanceMeters(lat, lon, el.lat, el.lon),
    }))
    .sort((a, b) => a.distance - b.distance);
}

async function fetchStreetAddress(lat, lon) {
  try {
    const res = await fetch(
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
      locationInput.value = [s.name, cityState].filter(Boolean).join(', ');
      locationInput.dataset.lat = s.lat;
      locationInput.dataset.lon = s.lon;
      missingDataNotice.hidden = true;
      locationAddress.textContent = await fetchStreetAddress(s.lat, s.lon);
      syncAdvancedFields();
    });
    nearbyStationsEl.appendChild(chip);
  });
}

async function reverseGeocode(latitude, longitude, foundLabel, offlineLabel) {
  locationInput.dataset.lat = latitude;
  locationInput.dataset.lon = longitude;
  renderNearbyStations([]);
  locationAddress.textContent = '';
  missingDataNotice.hidden = true;
  missingDataNotice.innerHTML = '';
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`
    );
    if (!res.ok) throw new Error('reverse geocode failed');
    const data = await res.json();
    const a = data.address || {};
    const city = a.city || a.town || a.village || a.hamlet || '';
    const state = abbrState(a);
    const cityState = [city, state].filter(Boolean).join(', ');

    if (a.amenity || a.shop) {
      // Reverse geocoding already matched a specific business — trust it.
      locationInput.value = [a.amenity || a.shop, cityState].filter(Boolean).join(', ');
      locationAddress.textContent = [a.house_number, a.road].filter(Boolean).join(' ');
      locationStatus.textContent = foundLabel;
      return;
    }

    // No business matched (e.g. landed on an unnamed building/road) — this is
    // a gas log, so specifically look for a nearby fuel station instead.
    try {
      const stations = await findNearbyFuelStations(latitude, longitude);
      if (stations.length) {
        const best = stations[0];
        locationInput.value = [best.name, cityState].filter(Boolean).join(', ');
        locationInput.dataset.lat = best.lat;
        locationInput.dataset.lon = best.lon;
        locationAddress.textContent = await fetchStreetAddress(best.lat, best.lon);
        if (stations.length > 1) renderNearbyStations(stations, cityState);
        locationStatus.textContent = foundLabel;
        return;
      }
    } catch {
      // Overpass unavailable — fall through to the generic address below.
    }

    const label = [a.road, cityState].filter(Boolean).join(', ');
    locationInput.value = label || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    locationStatus.textContent = foundLabel;
  } catch {
    locationInput.value = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    locationStatus.textContent = offlineLabel;
  } finally {
    syncAdvancedFields();
  }
}

function locate() {
  if (!('geolocation' in navigator)) {
    locationStatus.textContent = 'Geolocation not supported — enter manually';
    return;
  }
  locationStatus.textContent = 'Locating…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      lastLocationSource = 'gps';
      return reverseGeocode(
        pos.coords.latitude,
        pos.coords.longitude,
        'Current location',
        'Current location (offline — coordinates only)'
      );
    },
    () => {
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

function render() {
  const entries = loadEntries().sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
  entriesList.innerHTML = '';
  emptyState.style.display = entries.length ? 'none' : 'block';

  // for mpg calc, find prior fill-up by mileage (chronological order)
  const byDateAsc = [...entries].sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

  entries.forEach((entry) => {
    const idx = byDateAsc.findIndex((e) => e.id === entry.id);
    const prev = idx > 0 ? byDateAsc[idx - 1] : null;
    const gallons = entry.pricePerGallon > 0 ? entry.totalCost / entry.pricePerGallon : 0;
    let mpg = null;
    if (prev && entry.mileage > prev.mileage && gallons > 0) {
      mpg = (entry.mileage - prev.mileage) / gallons;
    }

    const li = document.createElement('li');
    li.className = 'entry';
    li.dataset.id = entry.id;
    li.innerHTML = `
      <div class="entry-top">
        <span class="entry-cost">${fmtMoney(entry.totalCost)}</span>
        <span class="entry-date">${fmtDate(entry.datetime)}</span>
      </div>
      <div class="entry-details">
        <span><b>${Number(entry.mileage).toLocaleString()}</b> mi</span>
        <span><b>${fmtMoney(entry.pricePerGallon)}</b>/gal</span>
        <span><b>${gallons.toFixed(2)}</b> gal</span>
        ${mpg ? `<span><b>${mpg.toFixed(1)}</b> mpg</span>` : ''}
      </div>
      ${entry.location ? `<div class="entry-location">📍 ${entry.location}</div>` : ''}
      <span class="entry-chevron">›</span>
    `;
    entriesList.appendChild(li);
  });
}

function resetToNewEntry() {
  editingId = null;
  form.reset();
  setDefaultDatetime();
  submitBtn.textContent = 'Add fill-up';
  editBanner.hidden = true;
  deleteEntryBtn.hidden = true;
  missingDataNotice.hidden = true;
  missingDataNotice.innerHTML = '';
  advancedPanel.hidden = true;
  locate();
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
  editingId = entry.id;
  datetimeInput.value = entry.datetime;
  mileageInput.value = entry.mileage;
  priceInput.value = entry.pricePerGallon.toFixed(3);
  totalCostInput.value = entry.totalCost.toFixed(2);
  locationInput.value = entry.location || '';
  locationInput.dataset.lat = entry.lat != null ? entry.lat : '';
  locationInput.dataset.lon = entry.lon != null ? entry.lon : '';
  lastLocationSource = entry.source || null;
  locationStatus.textContent = '';
  locationAddress.textContent = '';
  renderNearbyStations([]);

  submitBtn.textContent = 'Update fill-up';
  editBannerText.textContent = `Editing fill-up from ${fmtDate(entry.datetime)}`;
  editBanner.hidden = false;
  deleteEntryBtn.hidden = false;

  checkMissingLocationData(entry);
  syncAdvancedFields();

  form.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (entry.lat != null && entry.lon != null) {
    locationAddress.textContent = await fetchStreetAddress(entry.lat, entry.lon);
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const entries = loadEntries();
  const data = {
    datetime: datetimeInput.value,
    mileage: parseFloat(mileageInput.value),
    pricePerGallon: parseFloat(priceInput.value),
    totalCost: parseFloat(totalCostInput.value),
    location: locationInput.value.trim(),
    lat: locationInput.dataset.lat ? parseFloat(locationInput.dataset.lat) : null,
    lon: locationInput.dataset.lon ? parseFloat(locationInput.dataset.lon) : null,
    source: lastLocationSource,
  };

  if (editingId) {
    const idx = entries.findIndex((entry) => entry.id === editingId);
    if (idx !== -1) entries[idx] = { ...entries[idx], ...data };
  } else {
    entries.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ...data });
  }
  saveEntries(entries);

  resetToNewEntry();
  render();
});

entriesList.addEventListener('click', (e) => {
  const li = e.target.closest('.entry');
  if (!li) return;
  const entry = loadEntries().find((en) => en.id === li.dataset.id);
  if (entry) loadEntryIntoForm(entry);
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

locateBtn.addEventListener('click', locate);

attachCurrencyInput(priceInput, 3);
attachCurrencyInput(totalCostInput, 2);

importPhotoBtn.addEventListener('click', () => photoInput.click());

photoInput.addEventListener('change', async () => {
  const file = photoInput.files[0];
  photoInput.value = '';
  if (!file) return;

  photoStatus.hidden = false;
  photoStatus.textContent = 'Reading photo…';
  try {
    const exif = readExif(await file.arrayBuffer());
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
    photoStatus.textContent = 'Could not read this photo — enter details manually';
  }
});

exportBtn.addEventListener('click', () => {
  const entries = loadEntries().sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  if (!entries.length) return;
  const header = ['datetime', 'mileage', 'price_per_gallon', 'total_cost', 'gallons', 'location', 'latitude', 'longitude'];
  const rows = entries.map((e) => {
    const gallons = e.pricePerGallon > 0 ? (e.totalCost / e.pricePerGallon).toFixed(3) : '';
    return [e.datetime, e.mileage, e.pricePerGallon, e.totalCost, gallons, `"${(e.location || '').replace(/"/g, '""')}"`, e.lat ?? '', e.lon ?? ''].join(',');
  });
  const csv = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gassy-log-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

setDefaultDatetime();
locate();
render();

// --- Version badge: shows briefly after an update was just applied ---

const APP_VERSION = '1.6.1';
const RELEASE_NOTES = 'Fixes the street address not showing when editing an entry. Adds an "Advanced" toggle showing the raw stored fields (ID, latitude, longitude, location source) — "Fill from photo" now lives there instead of on the main form. Missing-GPS recovery now works for entries added before this tracking existed too.';
const LAST_SEEN_KEY = 'gassy.lastSeenVersion';

document.getElementById('app-version').textContent = `v${APP_VERSION}`;

const updatedBadge = document.getElementById('updated-badge');
const whatsNewEl = document.getElementById('whats-new');

const lastSeenVersion = localStorage.getItem(LAST_SEEN_KEY);
if (lastSeenVersion && lastSeenVersion !== APP_VERSION) {
  updatedBadge.hidden = false;
}
localStorage.setItem(LAST_SEEN_KEY, APP_VERSION);

updatedBadge.addEventListener('click', () => {
  if (whatsNewEl.hidden) {
    whatsNewEl.textContent = RELEASE_NOTES;
    whatsNewEl.hidden = false;
  } else {
    whatsNewEl.hidden = true;
  }
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
    const pull = Math.min(delta * 0.55, PTR_MAX);
    ptrReady = pull >= PTR_THRESHOLD;
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
  ptrIndicator.classList.add('ptr-spinning');
  appContent.style.transform = 'translateY(56px)';
  ptrIndicator.style.transform = 'translateY(24px)';
  ptrIndicator.style.opacity = '1';

  try {
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
