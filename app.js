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

function locate() {
  if (!('geolocation' in navigator)) {
    locationStatus.textContent = 'Geolocation not supported — enter manually';
    return;
  }
  locationStatus.textContent = 'Locating…';
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      locationInput.dataset.lat = latitude;
      locationInput.dataset.lon = longitude;
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=16&addressdetails=1`
        );
        if (!res.ok) throw new Error('reverse geocode failed');
        const data = await res.json();
        const a = data.address || {};
        const place = a.amenity || a.shop || a.road || '';
        const city = a.city || a.town || a.village || a.hamlet || '';
        const state = a.state_code || a.state || '';
        const label = [place, city, state].filter(Boolean).join(', ');
        locationInput.value = label || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
        locationStatus.textContent = 'Current location';
      } catch {
        locationInput.value = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
        locationStatus.textContent = 'Current location (offline — coordinates only)';
      }
    },
    () => {
      locationStatus.textContent = 'Location unavailable — enter manually';
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
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
