// ktmb demo — loads pre-built JSON snapshots emitted by scripts/build-snapshot.ts
// (which itself runs the ktmb library against live data.gov.my GTFS feeds in CI).
// The snapshot files live under ./data/ relative to index.html.

(function () {
  'use strict';

  // ---------- Snapshot state ----------
  /** @type {{ builtAt: string, calendarWindow: any, scheduleDates: string[],
   *           scheduleEntries: number, showcaseStations: string[],
   *           realtimeCapturedAt: string|null, realtimeCount: number }} */
  let META = null;
  let STATIONS = [];
  let STATION_BY_CODE = {};
  let KOMUTER_LINES = [];
  /** @type {Record<string, any[]>} */
  let SCHEDULE_INDEX = {};
  /** @type {Record<string, any[]>} */
  let KOMUTER_INDEX = {};
  /** @type {Array<{vehicleId:string,tripId?:string,routeId?:string,kind:string,
   *                lat:number,lon:number,bearing?:number,
   *                speedKmh?:number,timestamp:string}>} */
  let VEHICLES = [];

  // ---------- Leaflet map state ----------
  /** @type {any|null} */
  let LEAFLET_MAP = null;
  /** @type {Map<string, any>} vehicleId → L.Marker */
  const VEHICLE_MARKERS = new Map();

  const dataUrl = (file) => `./data/${file}`;
  async function fetchJson(file) {
    const res = await fetch(dataUrl(file), { cache: 'no-cache' });
    if (!res.ok) throw new Error(`fetch ${file}: HTTP ${res.status}`);
    return res.json();
  }

  // ---------- Data API ----------
  // Same shape as the mockApi the design originally wrapped, so the rendering
  // layer downstream is unchanged.
  const ok = (data) => ({ ok: true, data });
  const err = (code, message) => ({ ok: false, error: { code, message } });
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  const dataApi = {
    async stations(query) {
      await delay(20);
      const q = (query ?? '').trim().toLowerCase();
      if (!q) return ok(STATIONS.slice(0, 12));
      const scored = [];
      for (const s of STATIONS) {
        const code = s.code.toLowerCase();
        const en = (s.nameEn || '').toLowerCase();
        const ms = (s.nameMs || '').toLowerCase();
        let score = 0;
        if (code === q) score += 100;
        else if (code.startsWith(q)) score += 60;
        if (en.startsWith(q)) score += 40;
        else if (en.includes(q)) score += 20;
        if (ms.startsWith(q)) score += 35;
        else if (ms.includes(q)) score += 15;
        if (score > 0) scored.push({ s, score });
      }
      scored.sort((a, b) => b.score - a.score);
      return ok(scored.slice(0, 12).map((x) => x.s));
    },

    async schedules({ from, to, date }) {
      await delay(30);
      const key = `${from}|${to}|${date}`;
      const hit = SCHEDULE_INDEX[key];
      if (hit && hit.length > 0) return ok(hit);
      // Friendly errors that match the calendar/route reality
      if (META && META.scheduleDates && !META.scheduleDates.includes(date)) {
        return err(
          'outside_calendar_window',
          `Snapshot covers ${META.scheduleDates.join(', ')}. KTMB's GTFS calendar window doesn't extend further; the demo refreshes daily at 03:00 MYT.`,
        );
      }
      return err(
        'no_service',
        `No direct services from ${from} to ${to} on ${date} in the snapshot. Pick a station pair from the showcase set.`,
      );
    },

    async komuterTimetable({ line, station, date }) {
      await delay(20);
      const key = `${line}|${station}|${date}`;
      const hit = KOMUTER_INDEX[key];
      if (hit) return ok(hit);
      // Try same line + station with the snapshot's own date as a fallback —
      // user-visible date may be today which sometimes lags the snapshot date.
      if (META && META.scheduleDates) {
        for (const d of META.scheduleDates) {
          const k = `${line}|${station}|${d}`;
          if (KOMUTER_INDEX[k]) return ok(KOMUTER_INDEX[k]);
        }
      }
      return ok([]);
    },

    async vehicles() {
      await delay(10);
      return ok(VEHICLES);
    },
  };

  // ---------- Wiring ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // Hero install button
  window.copyInstall = function (btn) {
    if (navigator.clipboard) navigator.clipboard.writeText('npm i @zhun_hao/ktmb');
    const orig = btn.textContent;
    btn.textContent = 'Copied';
    setTimeout(() => (btn.textContent = orig), 1200);
  };

  // ---- Stations ----
  async function runStationSearch() {
    const input = $('#station-q');
    const q = input ? input.value : '';
    const echo = $('#st-q-echo');
    if (echo) echo.textContent = q || '';
    const t0 = performance.now();
    const res = await dataApi.stations(q);
    const lat = $('#st-latency');
    if (lat) lat.textContent = String(Math.round(performance.now() - t0));
    renderStations(res);
  }

  // ---- Station autocomplete (typeahead dropdown) ----
  // Independent of the result list below: the dropdown is for fast keyboard
  // navigation; the result list shows the full record with line chips.
  let acResults = [];
  let acActiveIdx = -1;

  function setAcExpanded(expanded) {
    const input = $('#station-q');
    if (input) input.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }
  function closeAutocomplete() {
    const box = $('#station-autocomplete');
    if (!box) return;
    box.hidden = true;
    box.replaceChildren();
    acResults = [];
    acActiveIdx = -1;
    setAcExpanded(false);
  }
  function highlightAc(idx) {
    const box = $('#station-autocomplete');
    if (!box) return;
    const rows = box.querySelectorAll('.autocomplete-row');
    rows.forEach((r, i) => r.classList.toggle('active', i === idx));
    if (idx >= 0 && rows[idx]) {
      rows[idx].scrollIntoView({ block: 'nearest' });
    }
    acActiveIdx = idx;
  }
  function selectAc(idx) {
    const station = acResults[idx];
    if (!station) return;
    const input = $('#station-q');
    if (input) input.value = station.nameEn;
    closeAutocomplete();
    runStationSearch();
  }

  async function refreshAutocomplete() {
    const input = $('#station-q');
    const box = $('#station-autocomplete');
    if (!input || !box) return;
    const q = input.value.trim();
    if (q.length === 0) {
      closeAutocomplete();
      return;
    }
    const res = await dataApi.stations(q);
    if (!res.ok || !res.data || res.data.length === 0) {
      acResults = [];
      acActiveIdx = -1;
      box.replaceChildren();
      const empty = el('div', 'autocomplete-empty', `No stations match "${q}".`);
      box.appendChild(empty);
      box.hidden = false;
      setAcExpanded(true);
      return;
    }
    acResults = res.data.slice(0, 7);
    acActiveIdx = -1;
    box.replaceChildren();
    acResults.forEach((s, i) => {
      const row = el('div', 'autocomplete-row');
      row.setAttribute('role', 'option');
      row.dataset.index = String(i);
      row.appendChild(el('span', 'code', s.code));
      const name = el('span', 'name');
      name.textContent = s.nameEn;
      if (s.nameMs && s.nameMs !== s.nameEn) {
        name.appendChild(el('span', 'ms', `· ${s.nameMs}`));
      }
      row.appendChild(name);
      const lines = el('span', 'lines');
      (s.lines || []).slice(0, 2).forEach((l) => {
        const chip = el('span', 'line-chip', l);
        chip.dataset.line = l;
        lines.appendChild(chip);
      });
      row.appendChild(lines);
      // Use mousedown so the input's blur (which closes) doesn't beat the click.
      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectAc(i);
      });
      row.addEventListener('mouseenter', () => highlightAc(i));
      box.appendChild(row);
    });
    box.hidden = false;
    setAcExpanded(true);
  }

  function wireAutocomplete() {
    const input = $('#station-q');
    if (!input) return;
    input.addEventListener('focus', () => {
      if (input.value.trim()) refreshAutocomplete();
    });
    input.addEventListener('blur', () => {
      // Delay so a click on a row registers before we hide.
      setTimeout(closeAutocomplete, 120);
    });
    input.addEventListener('keydown', (e) => {
      const box = $('#station-autocomplete');
      const open = box && !box.hidden && acResults.length > 0;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!open) {
          refreshAutocomplete();
          return;
        }
        highlightAc((acActiveIdx + 1) % acResults.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!open) return;
        highlightAc(acActiveIdx <= 0 ? acResults.length - 1 : acActiveIdx - 1);
      } else if (e.key === 'Enter') {
        if (open && acActiveIdx >= 0) {
          e.preventDefault();
          selectAc(acActiveIdx);
        }
      } else if (e.key === 'Escape') {
        closeAutocomplete();
      }
    });
  }

  function renderStations(res) {
    const list = $('#station-list');
    if (!list) return;
    list.replaceChildren();
    if (!res.ok) {
      list.appendChild(textRow(`Error: ${res.error.message}`));
      return;
    }
    if (res.data.length === 0) {
      list.appendChild(textRow('No stations matched.'));
      return;
    }
    for (const s of res.data) {
      const row = el('div', 'station-row');
      row.appendChild(el('span', 'code', s.code));
      const name = el('span', 'name');
      name.textContent = s.nameEn;
      if (s.nameMs && s.nameMs !== s.nameEn) {
        name.appendChild(el('span', 'ms', `· ${s.nameMs}`));
      }
      row.appendChild(name);
      const lines = el('span', 'lines');
      (s.lines || []).forEach((l) => {
        const chip = el('span', 'line-chip', l);
        chip.dataset.line = l;
        lines.appendChild(chip);
      });
      row.appendChild(lines);
      list.appendChild(row);
    }
  }

  function textRow(text) {
    const div = el('div');
    div.style.cssText = 'padding: 24px 4px; color: var(--ink-muted-48); font-size: 14px;';
    div.textContent = text;
    return div;
  }

  // ---- Schedules ----
  // The schedule index drives the dropdowns: only stations that participate in
  // at least one snapshot entry appear, so users can never pick a dead pair.
  let SCHEDULE_FROM_TO = new Map(); // from -> Set<to>

  function deriveScheduleSets() {
    SCHEDULE_FROM_TO = new Map();
    for (const key of Object.keys(SCHEDULE_INDEX)) {
      const [from, to] = key.split('|');
      if (!from || !to) continue;
      let bag = SCHEDULE_FROM_TO.get(from);
      if (!bag) {
        bag = new Set();
        SCHEDULE_FROM_TO.set(from, bag);
      }
      bag.add(to);
    }
  }

  function refillToOptions(fromCode) {
    const toSel = $('#sch-to');
    if (!toSel) return;
    const tos = SCHEDULE_FROM_TO.get(fromCode);
    const previous = toSel.value;
    toSel.replaceChildren();
    if (!tos) return;
    const sorted = [...tos].sort();
    for (const code of sorted) {
      toSel.appendChild(option(code, `${code} — ${nameOf(code)}`));
    }
    if (sorted.includes(previous)) toSel.value = previous;
  }

  function populateScheduleControls() {
    deriveScheduleSets();
    const fromSel = $('#sch-from');
    const toSel = $('#sch-to');
    const dateSel = $('#sch-date');
    if (fromSel && toSel) {
      fromSel.replaceChildren();
      const froms = [...SCHEDULE_FROM_TO.keys()].sort();
      for (const code of froms) {
        fromSel.appendChild(option(code, `${code} — ${nameOf(code)}`));
      }
      // Default: the from with the largest set of destinations (most popular hub).
      let bestFrom = froms[0] || '';
      let bestSize = 0;
      for (const f of froms) {
        const size = SCHEDULE_FROM_TO.get(f)?.size ?? 0;
        if (size > bestSize) {
          bestSize = size;
          bestFrom = f;
        }
      }
      if (bestFrom) fromSel.value = bestFrom;
      refillToOptions(fromSel.value);
      // Pick a default `to` that exists for the selected from.
      const tos = SCHEDULE_FROM_TO.get(fromSel.value);
      if (tos && tos.size) toSel.value = [...tos].sort()[0];
      fromSel.addEventListener('change', () => {
        refillToOptions(fromSel.value);
        runSchedules();
      });
    }
    if (dateSel) {
      dateSel.replaceChildren();
      for (const d of META?.scheduleDates ?? []) {
        dateSel.appendChild(option(d, d));
      }
      const dates = META?.scheduleDates ?? [];
      if (dates.length > 0) dateSel.value = dates[0];
    }
  }

  async function runSchedules() {
    const from = $('#sch-from')?.value;
    const to = $('#sch-to')?.value;
    const date = $('#sch-date')?.value;
    if (!from || !to || !date) return;
    setText('#sch-from-echo', from);
    setText('#sch-to-echo', to);
    setText('#sch-date-echo', date);
    const t0 = performance.now();
    const res = await dataApi.schedules({ from, to, date });
    setText('#sch-latency', String(Math.round(performance.now() - t0)));
    renderSchedules(res);
  }

  function renderSchedules(res) {
    const list = $('#schedule-list');
    if (!list) return;
    list.replaceChildren();
    if (!res.ok) {
      list.appendChild(textRow(res.error.message));
      return;
    }
    if (res.data.length === 0) {
      list.appendChild(textRow('No schedules.'));
      return;
    }
    for (const t of res.data) {
      const card = el('div', 'schedule-card');
      const idCol = el('div', 'train-id');
      idCol.appendChild(el('span', 'no', t.trainNo));
      idCol.appendChild(el('span', 'svc', t.service));
      card.appendChild(idCol);

      const journey = el('div', 'journey');
      const fromCol = el('div', 'stop from');
      fromCol.appendChild(el('span', 'time', timeOf(t.from.departure)));
      fromCol.appendChild(
        el('span', 'label', `${t.from.stationCode} · ${nameOf(t.from.stationCode)}`),
      );
      const arrow = el('div', 'arrow');
      arrow.appendChild(el('span', 'duration', formatDuration(t.journeyDurationMinutes)));
      arrow.appendChild(el('span', 'line'));
      const stops = (t.intermediate || []).length;
      arrow.appendChild(el('span', 'duration', stops ? `${stops} stops` : 'direct'));
      const toCol = el('div', 'stop to');
      toCol.appendChild(el('span', 'time', timeOf(t.to.arrival)));
      toCol.appendChild(
        el('span', 'label', `${t.to.stationCode} · ${nameOf(t.to.stationCode)}`),
      );
      journey.appendChild(fromCol);
      journey.appendChild(arrow);
      journey.appendChild(toCol);
      card.appendChild(journey);

      const price = el('div', 'price');
      const classes = Array.isArray(t.classes) ? t.classes : [];
      if (classes.length > 0) {
        const cheapest = classes.reduce((a, b) =>
          a.fare.priceMinor < b.fare.priceMinor ? a : b,
        );
        const totalSeats = classes.reduce((sum, c) => sum + (c.fare.seatsLeft ?? 0), 0);
        price.appendChild(el('span', 'from', 'from'));
        price.appendChild(
          el(
            'span',
            'amount',
            `${cheapest.fare.currency === 'SGD' ? 'S$' : 'RM'}${(cheapest.fare.priceMinor / 100).toFixed(2)}`,
          ),
        );
        const seats = el('span', 'seats');
        if (totalSeats > 0) {
          const cls = totalSeats < 30 ? 'low' : 'ok';
          seats.appendChild(el('span', cls, `${totalSeats} seats`));
          seats.appendChild(document.createTextNode(` across ${classes.length} classes`));
        } else {
          seats.appendChild(el('span', 'low', 'Sold out'));
        }
        price.appendChild(seats);
      } else {
        price.appendChild(el('span', 'from', 'fares'));
        price.appendChild(el('span', 'amount', 'see KTMB'));
        const seats = el('span', 'seats');
        seats.textContent = 'Live booking endpoint not yet wired in this demo';
        price.appendChild(seats);
      }
      card.appendChild(price);

      list.appendChild(card);
    }
  }

  function timeOf(iso) {
    return iso ? iso.slice(11, 16) : '—';
  }
  function formatDuration(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
  function nameOf(code) {
    return STATION_BY_CODE[code]?.nameEn || code;
  }

  // ---- Komuter ----
  let activeLine = null;
  let activeKomuterStation = null;

  function renderLineList() {
    const list = $('#line-list');
    if (!list) return;
    list.replaceChildren();
    for (const ln of KOMUTER_LINES) {
      const btn = el(
        'button',
        'line-button' + (activeLine && ln.id === activeLine.id ? ' active' : ''),
      );
      const sw = el('span', 'swatch');
      sw.style.background = ln.color;
      btn.appendChild(sw);
      const wrap = el('div');
      wrap.appendChild(el('span', 'name', ln.name));
      const stations = ln.stations || [];
      const head = stations[0] || '?';
      const tail = stations[stations.length - 1] || '?';
      wrap.appendChild(
        el('span', 'stations', `${stations.length} stations · ${head} → ${tail}`),
      );
      btn.appendChild(wrap);
      btn.addEventListener('click', () => {
        activeLine = ln;
        activeKomuterStation =
          ln.stations[Math.floor((ln.stations.length || 1) / 2)] || ln.stations[0];
        renderLineList();
        renderStationPicker();
        runKomuter();
      });
      list.appendChild(btn);
    }
  }

  function renderStationPicker() {
    const sel = $('#komuter-station');
    if (!sel || !activeLine) return;
    sel.replaceChildren();
    for (const code of activeLine.stations) {
      sel.appendChild(option(code, `${code} — ${nameOf(code)}`));
    }
    sel.value = activeKomuterStation;
    sel.onchange = () => {
      activeKomuterStation = sel.value;
      runKomuter();
    };
  }

  async function runKomuter() {
    const meta = $('#komuter-meta');
    const wrap = $('#departures');
    if (!wrap || !activeLine) return;
    const date = (META?.scheduleDates && META.scheduleDates[0]) || new Date().toISOString().slice(0, 10);
    const res = await dataApi.komuterTimetable({
      line: activeLine.id,
      station: activeKomuterStation,
      date,
    });
    if (meta) {
      const station = STATION_BY_CODE[activeKomuterStation];
      meta.textContent = `${activeLine.name} · ${station?.nameEn || activeKomuterStation} · ${date}`;
    }
    wrap.replaceChildren();
    if (!res.ok || res.data.length === 0) {
      wrap.appendChild(textRow('No departures in snapshot for this station today.'));
      return;
    }
    const now = Date.now();
    let nextFlagged = false;
    for (const dep of res.data.slice(0, 12)) {
      const t = new Date(dep.departure).getTime();
      const isNext = !nextFlagged && t > now;
      if (isNext) nextFlagged = true;
      const card = el('div', 'departure' + (isNext ? ' next' : ''));
      card.appendChild(el('span', 'time', timeOf(dep.departure)));
      card.appendChild(el('span', 'train', String(dep.trainNo).slice(0, 12)));
      if (isNext) card.appendChild(el('span', 'badge', 'Next'));
      wrap.appendChild(card);
    }
  }

  // ---- Realtime ----
  let selectedVehicleId = null;

  // Centered on Peninsular Malaysia (KL ~3.13°N, 101.69°E). Bounds clamped so
  // pan/zoom can't drift the user off the rail network.
  function initLeafletMap() {
    if (typeof L === 'undefined' || LEAFLET_MAP) return;
    const node = $('#leaflet-map');
    if (!node) return;

    // gestureHandling adopts the Google-Maps interaction pattern as UX
    // polish: ⌘/Ctrl + wheel to zoom on desktop, two-finger pan on touch,
    // and a brief "Use ⌘ + scroll to zoom the map" overlay on the first
    // bare-scroll attempt. Plugin is loaded as a CDN script in index.html.
    // (Note: this is unrelated to the z-index leak that was actually
    // making the map appear above the sticky sub-nav — that was fixed
    // separately by `isolation: isolate` on .map-card.)
    const map = L.map(node, {
      center: [3.95, 102.1],
      zoom: 7,
      minZoom: 6,
      maxZoom: 14,
      attributionControl: true,
      zoomControl: false,
      gestureHandling: true,
      maxBounds: [
        [0.5, 99.0],
        [7.5, 105.5],
      ],
      maxBoundsViscosity: 1.0,
    });

    L.control.zoom({ position: 'bottomleft' }).addTo(map);

    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      {
        subdomains: 'abcd',
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 19,
      },
    ).addTo(map);

    LEAFLET_MAP = map;
  }

  function renderVehicles() {
    if (!LEAFLET_MAP) return;
    const present = new Set();
    for (const v of VEHICLES) {
      if (typeof v.lat !== 'number' || typeof v.lon !== 'number') continue;
      present.add(v.vehicleId);
      let marker = VEHICLE_MARKERS.get(v.vehicleId);
      const kind = v.kind || 'ets';
      if (!marker) {
        const icon = L.divIcon({
          className: 'vehicle-icon',
          html: `<div class="vehicle ${kind}"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        marker = L.marker([v.lat, v.lon], { icon, keyboard: false, riseOnHover: true });
        marker.on('click', () => selectVehicle(v.vehicleId));
        marker.addTo(LEAFLET_MAP);
        VEHICLE_MARKERS.set(v.vehicleId, marker);
      } else {
        marker.setLatLng([v.lat, v.lon]);
      }
      const root = marker.getElement();
      if (root) {
        const inner = root.querySelector('.vehicle');
        if (inner) {
          const selected = v.vehicleId === selectedVehicleId ? ' selected' : '';
          inner.className = `vehicle ${kind}${selected}`;
        }
      }
    }
    for (const [id, marker] of VEHICLE_MARKERS.entries()) {
      if (!present.has(id)) {
        LEAFLET_MAP.removeLayer(marker);
        VEHICLE_MARKERS.delete(id);
      }
    }
    if (selectedVehicleId) renderVehicleDetail();
  }

  function selectVehicle(id) {
    selectedVehicleId = id;
    renderVehicles();
    renderVehicleDetail();
  }

  function renderVehicleDetail() {
    const panel = $('#vehicle-detail');
    if (!panel) return;
    const v = VEHICLES.find((x) => x.vehicleId === selectedVehicleId);
    panel.replaceChildren();
    if (!v) {
      panel.appendChild(el('div', 'empty', 'Click a vehicle to inspect its live position.'));
      return;
    }
    panel.appendChild(el('span', 'vid', v.vehicleId));
    const h = el('h3');
    h.textContent = v.tripId ? `Trip ${v.tripId}` : `Vehicle ${v.vehicleId}`;
    panel.appendChild(h);
    const rows = [
      ['Route', v.routeId || '—'],
      ['Service', (v.kind || 'ets').toUpperCase()],
      ['Latitude', `${v.lat.toFixed(5)}°`],
      ['Longitude', `${v.lon.toFixed(5)}°`],
      ['Bearing', v.bearing != null ? `${Math.round(v.bearing)}°` : '—'],
      ['Speed', v.speedKmh != null ? `${Math.round(v.speedKmh)} km/h` : '—'],
      ['Updated', timeOf(v.timestamp)],
    ];
    for (const [k, val] of rows) {
      const r = el('div', 'detail-row');
      r.appendChild(el('span', 'label', k));
      r.appendChild(el('span', 'val', String(val)));
      panel.appendChild(r);
    }
  }

  // ---- Live realtime polling ----
  // The page boots from the static snapshot for instant first paint, but if
  // we're hosted alongside the live REST API (Deno Deploy), poll
  // /v1/realtime/vehicles every few seconds so the map stays current. On
  // GitHub Pages the endpoint 404s and we silently keep the snapshot.
  const LIVE_POLL_MS = 6_000;
  let liveMode = false;
  let pollHandle = null;
  let pollInFlight = false;

  function startPolling() {
    if (pollHandle != null) return;
    pollHandle = setInterval(pollLiveVehicles, LIVE_POLL_MS);
    setLiveDotPaused(false);
  }

  function stopPolling() {
    if (pollHandle == null) return;
    clearInterval(pollHandle);
    pollHandle = null;
    setLiveDotPaused(true);
  }

  function setLiveDotPaused(paused) {
    const dot = document.querySelector('.map-counter .live-dot');
    if (!dot) return;
    dot.classList.toggle('paused', paused);
  }

  function deriveKind(routeId) {
    if (!routeId) return 'ets';
    const id = String(routeId).toUpperCase();
    if (id.includes('KOMUTER') || id.includes('KMTR') || /K\d/.test(id)) return 'komuter';
    if (id.includes('SHUTTLE') || id.includes('TEBRAU')) return 'shuttle';
    if (id.includes('INTERCITY') || id.includes('IC')) return 'intercity';
    return 'ets';
  }

  async function pollLiveVehicles() {
    if (pollInFlight) return;
    pollInFlight = true;
    try {
      const res = await fetch('/v1/realtime/vehicles', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const body = await res.json();
      if (!body.ok || !Array.isArray(body.data)) return;
      VEHICLES = body.data.map((v) => ({ ...v, kind: deriveKind(v.routeId) }));
      setText('#vehicle-count', String(VEHICLES.length));
      renderVehicles();
      if (!liveMode) {
        liveMode = true;
        markLiveModeActive(body);
        const btn = $('#map-refresh');
        if (btn) btn.hidden = false;
      }
    } catch {
      // Endpoint missing or unreachable → silently retain snapshot.
    } finally {
      pollInFlight = false;
    }
  }

  function markLiveModeActive(body) {
    const counter = document.querySelector('.map-counter');
    if (!counter) return;
    counter.dataset.snapshotPill = 'set'; // suppress the snapshot tag
    counter.replaceChildren();
    const dot = el('span', 'live-dot');
    counter.appendChild(dot);
    const count = el('span', 'count');
    count.id = 'vehicle-count';
    count.textContent = String((body && body.data && body.data.length) || VEHICLES.length);
    counter.appendChild(count);
    counter.appendChild(document.createTextNode(' vehicles · live'));
  }

  // Snapshot timestamp pill on the realtime tile (only used when live polling
  // never succeeds — i.e. on plain GitHub Pages).
  function renderSnapshotPill() {
    if (!META) return;
    const counter = document.querySelector('.map-counter');
    if (!counter || counter.dataset.snapshotPill === 'set') return;
    counter.dataset.snapshotPill = 'set';
    const ts = META.realtimeCapturedAt || META.builtAt;
    if (!ts) return;
    const localized = new Date(ts).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const tip = el('span');
    tip.style.cssText = 'margin-left:8px;opacity:0.7;font-size:11px;';
    tip.textContent = `· snapshot ${localized}`;
    counter.appendChild(tip);
  }

  // ---- Code tabs ----
  function selectCodeTab(id) {
    if (!['lib', 'rest', 'mcp'].includes(id)) return;
    $$('.code-tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.tab === id);
    });
    ['lib', 'rest', 'mcp'].forEach((k) => {
      const node = $(`#code-${k}`);
      if (node) node.hidden = k !== id;
    });
  }
  function wireCodeTabs() {
    $$('.code-tab').forEach((tab) => {
      tab.addEventListener('click', () => selectCodeTab(tab.dataset.tab));
    });
    const syncFromHash = () => {
      const hash = location.hash.slice(1);
      if (['lib', 'rest', 'mcp'].includes(hash)) selectCodeTab(hash);
    };
    window.addEventListener('hashchange', syncFromHash);
    syncFromHash();
  }

  // ---- Helpers ----
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = String(text);
    return e;
  }
  function option(value, label) {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    return o;
  }
  function setText(sel, val) {
    const node = $(sel);
    if (node) node.textContent = val;
  }
  function cssEsc(s) {
    if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
  }

  // ---------- Init ----------
  async function init() {
    setText('#health-text', 'loading snapshot…');

    try {
      const [meta, stations, lines, schedules, komuter, vehicles] = await Promise.all([
        fetchJson('meta.json'),
        fetchJson('stations.json'),
        fetchJson('komuter-lines.json'),
        fetchJson('schedules.json'),
        fetchJson('komuter.json'),
        fetchJson('realtime.json'),
      ]);
      META = meta;
      STATIONS = stations;
      STATION_BY_CODE = Object.fromEntries(stations.map((s) => [s.code, s]));
      KOMUTER_LINES = lines;
      SCHEDULE_INDEX = schedules;
      KOMUTER_INDEX = komuter;
      VEHICLES = vehicles;
    } catch (e) {
      setText('#health-text', 'snapshot load failed');
      const list = $('#station-list');
      if (list) list.appendChild(textRow(`Snapshot failed to load: ${e.message}`));
      return;
    }

    setText('#health-text', `snapshot · ${META.realtimeCount ?? 0} vehicles`);

    // Stations
    runStationSearch();
    wireAutocomplete();
    $('#station-go')?.addEventListener('click', runStationSearch);
    $('#station-q')?.addEventListener('input', () => {
      const input = $('#station-q');
      clearTimeout(input._t);
      input._t = setTimeout(() => {
        runStationSearch();
        refreshAutocomplete();
      }, 150);
    });

    // Schedules — note: `#sch-from` change is wired inside populateScheduleControls
    // because it also has to refill the `to` options, so we wire only `to` and
    // `date` here.
    populateScheduleControls();
    runSchedules();
    $('#sch-go')?.addEventListener('click', runSchedules);
    ['#sch-to', '#sch-date'].forEach((s) =>
      $(s)?.addEventListener('change', runSchedules),
    );

    // Komuter
    if (KOMUTER_LINES.length > 0) {
      activeLine = KOMUTER_LINES[0];
      const stations = activeLine.stations || [];
      activeKomuterStation = stations[Math.floor(stations.length / 2)] || stations[0];
      renderLineList();
      renderStationPicker();
      runKomuter();
    }

    // Realtime — first paint from snapshot, then try live API.
    initLeafletMap();
    renderVehicles();
    renderSnapshotPill();
    setText('#vehicle-count', String(VEHICLES.length));
    void pollLiveVehicles();
    startPolling();

    // Pause polling when the tab is backgrounded; resume + immediate poll on focus.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        stopPolling();
      } else {
        void pollLiveVehicles();
        startPolling();
      }
    });

    // Manual refresh button (revealed once live API confirms reachable).
    const refreshBtn = $('#map-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        refreshBtn.classList.add('spinning');
        await pollLiveVehicles();
        setTimeout(() => refreshBtn.classList.remove('spinning'), 600);
      });
    }

    // Code tabs
    wireCodeTabs();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
