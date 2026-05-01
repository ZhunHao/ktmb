export const DEMO_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ktmb demo</title>
<style>
  :root {
    --bg: #0b1020;
    --panel: #131a30;
    --panel-2: #1a2240;
    --fg: #e7ecf6;
    --muted: #8a93a8;
    --accent: #5ec1ff;
    --accent-2: #7be0a4;
    --warn: #ffb86b;
    --err: #ff6b8a;
    --border: #243056;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    background: var(--bg); color: var(--fg);
    min-height: 100vh;
  }
  header {
    padding: 18px 24px; border-bottom: 1px solid var(--border);
    display: flex; align-items: center; gap: 14px;
  }
  header h1 { font-size: 16px; margin: 0; font-weight: 600; letter-spacing: .2px; }
  header .tag { color: var(--muted); font-size: 12px; }
  header .right { margin-left: auto; color: var(--muted); font-size: 12px; }
  main { padding: 18px 24px 64px; max-width: 1100px; margin: 0 auto; }
  .grid { display: grid; gap: 14px; grid-template-columns: 1fr; }
  @media (min-width: 900px) { .grid { grid-template-columns: 1fr 1fr; } }
  section.card {
    background: var(--panel); border: 1px solid var(--border);
    border-radius: 10px; padding: 14px;
  }
  section.card h2 {
    margin: 0 0 10px; font-size: 13px; text-transform: uppercase;
    letter-spacing: .12em; color: var(--muted);
  }
  form { display: grid; gap: 8px; grid-template-columns: 1fr 1fr auto; align-items: end; }
  label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px; }
  input, select, button {
    background: var(--panel-2); color: var(--fg);
    border: 1px solid var(--border); border-radius: 6px;
    padding: 8px 10px; font: inherit; outline: none;
  }
  input:focus, select:focus { border-color: var(--accent); }
  button {
    cursor: pointer; background: var(--accent); color: #082033;
    font-weight: 600; border-color: transparent;
  }
  button:hover { filter: brightness(1.05); }
  button.secondary { background: var(--panel-2); color: var(--fg); }
  .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .row > * { flex: 1 1 auto; }
  .full { grid-column: 1 / -1; }
  pre.out {
    margin: 10px 0 0; padding: 10px; max-height: 320px; overflow: auto;
    background: #07091a; border: 1px solid var(--border); border-radius: 6px;
    font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    color: #cdd5e6; white-space: pre-wrap; word-break: break-word;
  }
  .pill {
    display: inline-block; padding: 2px 8px; border-radius: 999px;
    background: var(--panel-2); border: 1px solid var(--border);
    font-size: 11px; color: var(--muted);
  }
  .pill.ok { color: var(--accent-2); border-color: #2c5a3f; }
  .pill.err { color: var(--err); border-color: #5a2c3b; }
  .results { display: grid; gap: 6px; margin-top: 10px; }
  .item {
    display: grid; grid-template-columns: auto 1fr auto; gap: 10px;
    padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px;
    background: var(--panel-2); align-items: center;
  }
  .item .id { font-family: ui-monospace, monospace; color: var(--accent); }
  .item .meta { color: var(--muted); font-size: 12px; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .footer-note { color: var(--muted); font-size: 12px; margin-top: 16px; text-align: center; }
</style>
</head>
<body>
<header>
  <h1>ktmb</h1>
  <span class="tag">demo &middot; read-only</span>
  <span class="right" id="health">checking&hellip;</span>
</header>
<main>
  <div class="grid">
    <section class="card">
      <h2>Station search</h2>
      <div class="row">
        <input id="stations-q" placeholder="e.g. KL, Subang, Padang" autocomplete="off" />
        <button id="stations-go">Search</button>
      </div>
      <div class="results" id="stations-results"></div>
      <pre class="out" id="stations-out" hidden></pre>
    </section>

    <section class="card">
      <h2>Schedules</h2>
      <form id="schedules-form">
        <div>
          <label for="sch-from">From (station id)</label>
          <input id="sch-from" placeholder="KUL" required />
        </div>
        <div>
          <label for="sch-to">To (station id)</label>
          <input id="sch-to" placeholder="BTW" required />
        </div>
        <div>
          <label for="sch-date">Date</label>
          <input id="sch-date" type="date" required />
        </div>
        <div class="full"><button type="submit">List schedules</button></div>
      </form>
      <pre class="out" id="schedules-out" hidden></pre>
    </section>

    <section class="card">
      <h2>Komuter lines</h2>
      <div class="row">
        <button id="lines-go">Load lines</button>
        <select id="lines-pick" hidden></select>
        <button id="lines-tt" class="secondary" hidden>Timetable for today</button>
      </div>
      <pre class="out" id="lines-out" hidden></pre>
    </section>

    <section class="card">
      <h2>Realtime vehicles</h2>
      <div class="row">
        <button id="rt-go">Fetch vehicle positions</button>
        <span id="rt-count" class="pill" hidden>0</span>
      </div>
      <pre class="out" id="rt-out" hidden></pre>
    </section>
  </div>
  <p class="footer-note">
    All requests hit this server's REST API. See the project README for the full surface.
  </p>
</main>
<script>
  const $ = (id) => document.getElementById(id);
  const today = () => new Date().toISOString().slice(0, 10);

  const api = async (path) => {
    const res = await fetch(path, { headers: { accept: "application/json" } });
    let body;
    try { body = await res.json(); } catch { body = { ok: false, error: { code: "parse_error", message: "non-JSON response" } }; }
    return { status: res.status, body };
  };
  const pretty = (v) => JSON.stringify(v, null, 2);
  const showJson = (el, v) => { el.hidden = false; el.textContent = pretty(v); };

  const makeEl = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = String(text);
    return el;
  };
  const setPill = (el, kind, text) => {
    el.replaceChildren();
    const p = makeEl("span", "pill " + kind, text);
    el.appendChild(p);
  };

  // Health
  (async () => {
    try {
      const { status, body } = await api("/healthz");
      const ok = status === 200 && body.ok;
      setPill($("health"), ok ? "ok" : "err", ok ? "api ok" : "api unhealthy");
    } catch {
      setPill($("health"), "err", "api unreachable");
    }
  })();

  // Stations
  const stationsList = $("stations-results");
  const stationsOut = $("stations-out");
  const renderStations = (items) => {
    stationsList.replaceChildren();
    if (!items || items.length === 0) {
      stationsList.appendChild(makeEl("div", "meta", "No stations matched."));
      return;
    }
    for (const s of items.slice(0, 50)) {
      const row = makeEl("div", "item");
      row.appendChild(makeEl("span", "id", s.id ?? ""));
      row.appendChild(makeEl("span", null, s.name ?? ""));
      const lines = Array.isArray(s.lines) && s.lines.length ? s.lines.join(", ") : "";
      row.appendChild(makeEl("span", "meta", lines));
      stationsList.appendChild(row);
    }
  };
  const runStationSearch = async () => {
    const q = $("stations-q").value.trim();
    if (!q) { stationsList.replaceChildren(); stationsOut.hidden = true; return; }
    const { body } = await api("/v1/stations?q=" + encodeURIComponent(q));
    if (body.ok) renderStations(body.data);
    showJson(stationsOut, body);
  };
  $("stations-go").addEventListener("click", runStationSearch);
  $("stations-q").addEventListener("keydown", (e) => { if (e.key === "Enter") runStationSearch(); });

  // Schedules
  $("sch-date").value = today();
  $("schedules-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const params = new URLSearchParams({
      from: $("sch-from").value.trim(),
      to: $("sch-to").value.trim(),
      date: $("sch-date").value,
    });
    const { body } = await api("/v1/schedules?" + params.toString());
    showJson($("schedules-out"), body);
  });

  // Komuter lines + timetable
  let pickedLine = "";
  $("lines-go").addEventListener("click", async () => {
    const { body } = await api("/v1/komuter/lines");
    showJson($("lines-out"), body);
    if (body.ok && Array.isArray(body.data) && body.data.length) {
      const sel = $("lines-pick");
      sel.replaceChildren();
      for (const line of body.data) {
        const id = (line && (line.id ?? line.lineId)) ?? line;
        const name = (line && line.name) ?? id;
        const opt = makeEl("option", null, String(name) + " (" + String(id) + ")");
        opt.value = String(id);
        sel.appendChild(opt);
      }
      pickedLine = sel.value;
      sel.hidden = false;
      $("lines-tt").hidden = false;
      sel.addEventListener("change", () => { pickedLine = sel.value; });
    }
  });
  $("lines-tt").addEventListener("click", async () => {
    if (!pickedLine) return;
    const params = new URLSearchParams({ date: today() });
    const { body } = await api(
      "/v1/komuter/lines/" + encodeURIComponent(pickedLine) + "/timetable?" + params.toString()
    );
    showJson($("lines-out"), body);
  });

  // Realtime
  $("rt-go").addEventListener("click", async () => {
    const { body } = await api("/v1/realtime/vehicles");
    showJson($("rt-out"), body);
    const count = body.ok && Array.isArray(body.data) ? body.data.length : 0;
    const pill = $("rt-count");
    pill.hidden = false;
    pill.textContent = count + " vehicle" + (count === 1 ? "" : "s");
    pill.className = "pill " + (body.ok ? "ok" : "err");
  });
</script>
</body>
</html>`;
