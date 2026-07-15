const STORAGE_KEY = 'gassy.entries';

const form = document.getElementById('entry-form');
const datetimeInput = document.getElementById('datetime');
const mileageInput = document.getElementById('mileage');
const priceInput = document.getElementById('pricePerGallon');
const totalCostInput = document.getElementById('totalCost');
const locationInput = document.getElementById('location');
const locationStatus = document.getElementById('location-status');
const locateBtn = document.getElementById('locate-btn');
const entriesList = document.getElementById('entries-list');
const emptyState = document.getElementById('empty-state');
const exportBtn = document.getElementById('export-btn');
const importPhotoBtn = document.getElementById('import-photo-btn');
const photoInput = document.getElementById('photo-input');
const photoStatus = document.getElementById('photo-status');

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

async function reverseGeocode(latitude, longitude, foundLabel, offlineLabel) {
  locationInput.dataset.lat = latitude;
  locationInput.dataset.lon = longitude;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`
    );
    if (!res.ok) throw new Error('reverse geocode failed');
    const data = await res.json();
    const a = data.address || {};
    const place = a.amenity || a.shop || a.road || '';
    const city = a.city || a.town || a.village || a.hamlet || '';
    const state = a.state_code || a.state || '';
    const label = [place, city, state].filter(Boolean).join(', ');
    locationInput.value = label || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    locationStatus.textContent = foundLabel;
  } catch {
    locationInput.value = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    locationStatus.textContent = offlineLabel;
  }
}

function locate() {
  if (!('geolocation' in navigator)) {
    locationStatus.textContent = 'Geolocation not supported — enter manually';
    return;
  }
  locationStatus.textContent = 'Locating…';
  navigator.geolocation.getCurrentPosition(
    (pos) => reverseGeocode(
      pos.coords.latitude,
      pos.coords.longitude,
      'Current location',
      'Current location (offline — coordinates only)'
    ),
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
    li.innerHTML = `
      <button class="delete-btn" data-id="${entry.id}" aria-label="Delete entry">✕</button>
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
    `;
    entriesList.appendChild(li);
  });
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const entries = loadEntries();
  entries.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    datetime: datetimeInput.value,
    mileage: parseFloat(mileageInput.value),
    pricePerGallon: parseFloat(priceInput.value),
    totalCost: parseFloat(totalCostInput.value),
    location: locationInput.value.trim(),
    lat: locationInput.dataset.lat ? parseFloat(locationInput.dataset.lat) : null,
    lon: locationInput.dataset.lon ? parseFloat(locationInput.dataset.lon) : null,
  });
  saveEntries(entries);

  form.reset();
  setDefaultDatetime();
  locate();
  render();
});

entriesList.addEventListener('click', (e) => {
  const btn = e.target.closest('.delete-btn');
  if (!btn) return;
  const id = btn.dataset.id;
  if (!confirm('Delete this fill-up?')) return;
  const entries = loadEntries().filter((entry) => entry.id !== id);
  saveEntries(entries);
  render();
});

locateBtn.addEventListener('click', locate);

importPhotoBtn.addEventListener('click', () => photoInput.click());

photoInput.addEventListener('change', async () => {
  const file = photoInput.files[0];
  photoInput.value = '';
  if (!file) return;

  photoStatus.textContent = 'Reading photo…';
  try {
    const exif = readExif(await file.arrayBuffer());
    const dateStr = exif && (exif.dateTimeOriginal || exif.dateTime);
    const inputValue = exifDateToInputValue(dateStr);
    if (inputValue) datetimeInput.value = inputValue;

    if (exif && exif.gps) {
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
  const header = ['datetime', 'mileage', 'price_per_gallon', 'total_cost', 'gallons', 'location'];
  const rows = entries.map((e) => {
    const gallons = e.pricePerGallon > 0 ? (e.totalCost / e.pricePerGallon).toFixed(3) : '';
    return [e.datetime, e.mileage, e.pricePerGallon, e.totalCost, gallons, `"${(e.location || '').replace(/"/g, '""')}"`].join(',');
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

if ('serviceWorker' in navigator) {
  const updateBanner = document.getElementById('update-banner');
  const updateRefreshBtn = document.getElementById('update-refresh-btn');
  let refreshing = false;
  let currentReg = null;

  function reloadOnce() {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  }

  function watchForUpdate(reg) {
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          updateBanner.hidden = false;
        }
      });
    });
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      currentReg = reg;
      watchForUpdate(reg);
      // Standalone iOS apps often resume from the background without a fresh
      // page load, so proactively re-check whenever the app comes back to front.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    }).catch(() => {});
  });

  updateRefreshBtn.addEventListener('click', () => {
    updateRefreshBtn.disabled = true;
    updateRefreshBtn.textContent = 'Refreshing…';
    (currentReg
      ? Promise.resolve(currentReg)
      : navigator.serviceWorker.getRegistration()
    ).then((reg) => {
      const worker = reg && (reg.waiting || reg.installing);
      if (worker) worker.postMessage('SKIP_WAITING');
    });
    // Safari on iOS doesn't always fire controllerchange in standalone mode,
    // so force a reload shortly after regardless.
    setTimeout(reloadOnce, 1200);
  });

  navigator.serviceWorker.addEventListener('controllerchange', reloadOnce);
}
