# elektrifikasyon.org — Türkiye Electrification Explorer

Four small, bilingual (Turkish / English) interactive pages that let a reader explore how far Türkiye's final energy consumption can be electrified, and why the headline "electrification rate" behaves counter-intuitively once efficient electric technologies replace fuel.

Live site: <https://www.elektrifikasyon.org> (GitHub Pages, `docs/CNAME`; Pages publishes **only the `docs/` folder**, so `worker/`, `tools/` and `labs/` are never served to visitors).
API: <https://elektrifikasyon.bahadirsgumus.workers.dev> (Cloudflare Worker, `/api/*` only). This Worker belongs to the elektrifikasyon.org deployment and answers only that site's origins; the Ember Labs version deploys its own copy of `worker/` and points its `config.js` at it (see *Ember Labs overlay* below).

---

## What it is

| Page | File | What the reader does |
|---|---|---|
| **Simulator** (Türkiye Electrification Simulator) | `docs/index.html` | Drags one slider per sector (industry, transport, residential, commerce & services, agriculture) and eleven sub-sector sliders (iron & steel, cement, food, chemicals, textiles, ceramics, non-ferrous metals, glass, rubber & plastics, railways, sugar) to raise each electrification share; sees sector energy, national rate and fuel saved update live. |
| **Electrification Rate Fallacy** | `docs/ornek-hesaplama.html` | Four curves (3.7×, 2.5×, 2.0×, 1.8×) plus a 10-car fleet and a 10-home worked example showing why the *energy* share of electricity always trails the *count* share of converted units. |
| **Car Electrification** (The Car Transition) | `docs/otomobil.html` | One slider: what share of the 17.7 million-car fleet is electric. Shows fleet energy by fuel, the fleet's own electricity share, and the resulting national rate. |
| **Home Electrification** (The Home Heating Transition) | `docs/hane.html` | One slider: what share of 25.3 million homes heat with a heat pump. Shows heating energy, the residential sector share and the national rate. |

Architecture:

- **Static front end** on GitHub Pages: four HTML pages, one shared stylesheet (`docs/assets/style.css`) and one shared configuration script (`config.js`). The pages contain **no model coefficients used in calculation** — only labels, layout and chart code that visualises API responses (the one in-page number is the display unit conversion `1 ktoe = 11.63 GWh` in `index.html`). The methodology footnotes do quote the headline numbers as plain text (household count, 950 m³, 9,155 kcal/m³, fleet sizes, 3.7×/2.5×/2×/1.8×, 26,340.5 / 120,829.9, …) and must be kept in step with `worker/src/model-data.js` by hand.
- **API** on a Cloudflare Worker (source in `worker/src/`, bundled to `worker/dist/worker.js`): every calculation runs server-side. The worker never serves static files; any request outside `/api/` is `301`-redirected to the site.
- Each page builds its API base as `location.hostname === 'localhost' ? '' : ELX.API_URL`, so on `localhost` it talks to the local Python mirror (see *How to run locally*) and everywhere else to the Worker.
- Language is a `?lang=tr|en` query parameter on `GET` endpoints; all labels in API responses come back in the requested language.

### API surface

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/model?lang=` | — | Sector and sub-sector baselines (`E0`, `T0`, `s0`, efficiency label) and the national baseline share `share0`. |
| POST | `/api/hesap` | `{ shares: {sectorId: share}, subs: {subId: share} }` | Per-sector and per-sub-sector `E`, `F`, `T`, `share`; totals incl. national `share` and fuel `saved`. |
| GET | `/api/aile/egriler?lang=` | — | Curves for the Fallacy page (four factors, 10-car fleet, 10-home group). |
| GET | `/api/otomobil/model?lang=` | — | Fleet size, baseline EV share, baseline energy, legend. |
| POST | `/api/otomobil` | `{ sigma }` (EV share of fleet, 0–1) | Fleet composition, energy by fuel (TWh), fleet electricity share, national rate. |
| GET | `/api/hane/model?lang=` | — | Household count, per-home energy, residential sector baseline, legend. |
| POST | `/api/hane` | `{ sigma }` (heat-pump share of homes, 0–1) | Heating energy split (TWh), residential sector share, national rate. |

Responses are `Content-Type: application/json; charset=utf-8` with `Cache-Control: no-store`.

---

## Data

**Source:** Turkish Ministry of Energy and Natural Resources (ETKB), *2024 National Energy Balance Table* — revision r1 dated **15 November 2025** (as cited in the page footnotes), in thousand tonnes of oil equivalent (**ktoe**), **net calorific value**. `1 ktoe = 11.63 GWh`.

**Electrification rate definition** (the "July 2026 revision" noted in the header comments of `worker/src/model-data.js` and `tools/dev_api_server.py`; the pages themselves carry no revision date):

```
rate = electricity / final consumption of the five sectors
     = 26,340.5 / 120,829.9 ktoe = 21.80 %
```

- The denominator is the sum of the five end-use sectors only. **Non-energy use** (petrochemical feedstock, bitumen, etc.: 6,397.7 ktoe) and the **statistical difference** (1,372.7 ktoe) are excluded. Both constants remain in the worker for reference only.
- This definition is directly comparable with the National Energy Plan's 2020 baseline (21.8 %).
- "Fossil fuels" in the charts means *all non-electric final consumption*; it is predominantly fossil but includes small amounts of biomass, solar heat and geothermal heat.

Sector baselines held in the worker (ktoe, 2024):

| Sector | Electricity `E0` | Total `T0` | Share `s0` | Factor `r` |
|---|---:|---:|---:|---:|
| Industry | 11,255.8 | 38,471.5 | 29.26 % | 2.0 |
| Transport | 206.2 | 34,472.7 | 0.60 % | 2.27 |
| Residential | 6,419.0 | 29,147.3 | 22.02 % | 2.5 |
| Commerce & services | 7,197.7 | 12,974.7 | 55.47 % | 2.5 |
| Agriculture & livestock | 1,261.8 | 5,763.7 | 21.89 % | 2.5 |
| **Total** | **26,340.5** | **120,829.9** | **21.80 %** | |

Sub-sectors are balance-table rows nested under a sector (NACE code in brackets); sugar (10.81) is a subset of food (10). A parent slider's converted fraction is applied proportionally to each sub-sector, and the sub-sector slider then acts on the *remaining* fuel.

---

## Efficiency factors

A factor `r` is the **fuel energy displaced per unit of electricity** for the same service: converting fuel `F` yields electricity `F / r`. Raising a sector's share therefore *lowers* its total consumption, which is the mechanism behind the "fallacy" pages.

| Use | Factor | Where used |
|---|---:|---|
| Electric car | **3.7×** | Fallacy curves, fleet example (10 cars) |
| Heavy vehicles (e-trucks/buses) | **1.8×** | Fallacy curves |
| Building heat pump | **2.5×** | Fallacy curves, home example; residential, commerce & agriculture sector sliders |
| Industrial heat pump | **2.0×** | Fallacy curves; industry sector slider |
| Transport sector slider | **2.27×** | Fuel-energy-weighted blend: 40 % of transport fuel at 3.7× (cars) and 60 % at 1.8× (heavy vehicles), i.e. `1 / (0.4/3.7 + 0.6/1.8) ≈ 2.27` |

Sub-sector factors: iron & steel 2.0, cement 1.5, food 2.5, chemicals 2.0, textiles 2.5, ceramics 2.0, non-ferrous metals 2.0, glass 2.0, rubber & plastics 2.5, railways 2.5, sugar 2.5. All factors are indicative, as the page footnotes state.

### Household assumptions (`hane.html`)

| Item | Value |
|---|---:|
| Households (TurkStat) | 25,329,833 |
| Average annual heating fuel per home, natural-gas equivalent | 950 m³ |
| Calorific value (balance table) | 9,155 kcal/m³ → ≈ 0.870 toe ≈ 10.1 MWh per home |
| Heat pump electricity for the same warmth | 40 % of the fuel energy (≈ 4.0 MWh per home; i.e. 2.5×) |
| Implied national household heating fuel | ≈ 22,030 ktoe ≈ 256 TWh — below the 22,728 ktoe residential fuel total in the 2024 balance, so there is no overflow; the average also stands in for coal/wood heating in gas-equivalent terms |
| Residential sector baseline shown on the page | electricity 74.7 TWh, fuels 264.3 TWh (22.0 % electric) |

Fully converted, household heating falls from ≈ 256 TWh of fuel to ≈ 102 TWh of electricity and the national rate moves from 21.80 % to ≈ 32.7 %.

### Car fleet assumptions (`otomobil.html`)

Fleet compiled from TurkStat/EPDK statistics; 17,697,089 cars in total.

| Fuel | Cars | Annual km | l/100 km | MJ/l |
|---|---:|---:|---:|---:|
| Petrol | 5,485,169 | 13,075 | 7.5 | 34 |
| Diesel | 5,707,030 | 15,660 | 5.5 | 38 |
| LPG | 5,245,753 | 12,043 | 9.0 | 25 |
| Hybrid | 800,402 | 22,938 | 4.5 | 34 |
| Other | 34,942 | 13,859 | 7.5 | 34 |
| Electric (baseline) | 423,793 | 17,582 | — | 18 kWh/100 km |

Combustion cars convert to electric proportionally across all fuel types; a converted car keeps its own mileage and uses 18 kWh/100 km. At the baseline, 2.4 % of cars are electric but they take only ≈ 0.9 % of fleet energy; a fully electric fleet would use ≈ 45 TWh of electricity in place of ≈ 150 TWh of fuel.

---

## Repository layout

```
.
├── docs/                    ← the only folder GitHub Pages publishes (Settings → Pages → main, /docs)
│   ├── index.html           Simulator
│   ├── ornek-hesaplama.html Electrification Rate Fallacy
│   ├── otomobil.html        Car Electrification
│   ├── hane.html            Home Electrification
│   ├── config.js            Branding, footer, credit/disclaimer and API_URL (window.ELX)
│   ├── assets/style.css     Shared design tokens and page skeleton
│   ├── CNAME                www.elektrifikasyon.org
│   └── .nojekyll            Serve files as-is (no Jekyll processing)
├── worker/                  NOT published by Pages — Cloudflare Worker API
│   ├── src/model-data.js    All coefficients and data (single source of truth)
│   ├── src/index.js         Logic: rate limiter, CORS, routes, calculations
│   ├── dist/worker.js       GENERATED single-file bundle (do not edit by hand)
│   ├── wrangler.toml        Deployment config: name, main, [vars]
│   └── README.md            Deployment notes
├── tools/
│   ├── dev_api_server.py    Local server: serves docs/ + line-by-line Python mirror of the Worker API (port 8816)
│   └── bundle_worker.py     Builds worker/dist/worker.js from worker/src (--check verifies it is current)
├── labs/                    Ember Labs branding overlay (apply in the Labs repo)
│   ├── config.js            Labs branding, footer, credit, disclaimer and the API_URL placeholder
│   ├── style.css            Ember palette and typography; same tokens and selectors as docs/assets/style.css
│   └── NOTES.md             How to apply and keep in sync
├── .gitignore
└── README.md
```

### Ember Labs overlay (`labs/`)

Branding and the API URL live **only** in `docs/config.js` and `docs/assets/style.css`; the Ember Labs skin replaces just those two files and leaves the HTML, the Worker and the dev server untouched. `config.js` also fills the `CREDIT` and `DISCLAIMER` footers, which are hidden automatically when empty.

To apply the overlay in the Labs repository:

```sh
cp labs/config.js  docs/config.js
cp labs/style.css  docs/assets/style.css
```

Then deploy `worker/` under Ember's Cloudflare account (see *Deployment configuration* below), set `ALLOWED_ORIGINS` to the Labs site origin(s) and `SITE_URL` to the Labs site URL, and replace the `https://<labs-worker>.workers.dev` placeholder in `config.js` → `ELX.API_URL` with the resulting Worker URL. Until `ALLOWED_ORIGINS` contains the Labs origin, every `/api/*` call is answered with `403`. The full procedure, the weekly upstream-sync recipe (`merge=ours` for the two overlay files) and the remaining open items (Ember logo asset, footer/disclaimer wording, `BRAND.url`, page `<title>` tags, self-hosted fonts) are in `labs/NOTES.md`.

---

## How to run locally

```bash
python3 tools/dev_api_server.py
# then open http://localhost:8816/
```

No dependencies beyond Python 3. The script serves the repository root as static files and answers the same `/api/*` routes as the Worker from a Python re-implementation of the model, so the pages work fully offline. Open the site via the **`localhost`** name (not `127.0.0.1`): the pages only switch to the local mirror when `location.hostname === 'localhost'`; otherwise they call the production Worker, which rejects non-site origins.

Rounding caveat: the mirror reproduces the Worker to the last digit except at exact half-way values, where JavaScript's `Math.round` rounds up and Python's `round` rounds half to even (observed at `sigma = 0.5`, where the car and home counts are exact halves — 8,848,544.5 and 12,664,916.5 — and differ by ±1, and on the 1.8× Fallacy curve at `p = 0.25`, where 15.625 comes back as 15.63 from the Worker and 15.62 from the mirror).

---

## How to update the model

All coefficients live in **`worker/src/model-data.js`** — the single source of truth. `worker/src/index.js` holds logic only, and `worker/dist/worker.js` is a **generated** bundle: never edit it by hand, the next bundler run overwrites it and `--check` would flag the repo as stale.

1. Edit the coefficients in `worker/src/model-data.js`. Derived values (`F0`, `s0`, fuel MJ, totals) are computed there on purpose; `index.js` only consumes ready values.
2. Rebuild the bundle: `python3 tools/bundle_worker.py` (works from any directory). The script strips the `import` / `export const` statements, refuses undeclared imports or duplicate top-level names, and exits 1 if `index.js` contains a number that looks like a model coefficient (only infrastructure numbers — HTTP codes, rate limit, rounding precision — are allowed). `python3 tools/bundle_worker.py --check` reports whether `dist/worker.js` is current without rewriting it (exit 1 when stale); run it before committing.
3. Deploy the Worker, either way:
   - `cd worker && npx wrangler deploy` — uses `worker/wrangler.toml` (`main = src/index.js`; wrangler bundles the ES modules itself and does not need `dist/`), **or**
   - Cloudflare dashboard → Workers → the worker → *Edit code* → paste the entire contents of `worker/dist/worker.js` → *Deploy* (no Node/wrangler needed; this is the method documented in the bundle header).
4. Mirror the same change in `tools/dev_api_server.py` (hand-maintained Python copy; it must stay line-for-line equivalent to `worker/src`).
5. Test locally (`python3 tools/dev_api_server.py`, open `http://localhost:8816/`) and compare a few API responses against the deployed Worker — e.g. `POST /api/hesap` with `{"shares":{"ulastirma":1}}` and `POST /api/hane` with `{"sigma":1}`.
6. If a number quoted in a page footnote changed, update the footnote text too (see below). Commit `worker/src/`, `worker/dist/worker.js` and the Python mirror together; GitHub Pages redeploys the static site on push.

Changes to wording go in the `STR` object inside each HTML page (TR and EN strings side by side); footnotes `footModel`, `footData`, `footAssump`, `footMethod`, `footRead`, `footTr` carry the methodology text shown to readers and should be kept in step with the worker.

---

## Deployment configuration

The Worker is stateless — no KV, R2, D1, Durable Objects, cron triggers or secrets — and reads two optional plain-text environment variables **on every request** (`env` in `fetch`), so a change in the Cloudflare dashboard takes effect without a redeploy. When a variable is missing or empty, the defaults compiled into `worker/src/index.js` apply; `worker/wrangler.toml` carries the same defaults in `[vars]`.

| Variable | Format | Default |
|---|---|---|
| `ALLOWED_ORIGINS` | comma-separated browser origins (scheme + host, no path, no trailing slash) | `https://elektrifikasyon.org,https://www.elektrifikasyon.org` |
| `SITE_URL` | absolute URL; the `301` target for every non-`/api/` request | `https://www.elektrifikasyon.org` |

A second deployment (such as Ember Labs under its own Cloudflare account) must set `ALLOWED_ORIGINS` to its own site origin(s) — both `www` and apex if both resolve — or every `/api/*` call is refused with `403`. Details: `worker/README.md`; the Labs-specific steps are in `labs/NOTES.md`.

---

## Security and robustness notes

- **Origin allowlist.** The Worker requires an `Origin` header and answers only the origins listed in the `ALLOWED_ORIGINS` environment variable — by default `https://elektrifikasyon.org` and `https://www.elektrifikasyon.org`; anything else gets `403 Forbidden`. `localhost` is deliberately *not* in the default list (anyone can run a localhost); add it only on a dev/staging deployment. Pre-flight `OPTIONS` returns `204` with `Vary: Origin`.
- **Per-IP rate limit.** Sliding window of **150 requests per 10 s** per `CF-Connecting-IP`, kept in isolate memory; over the limit returns `429 Too Many Requests` with `Retry-After: 10`. The bucket map is cleared when it exceeds 10,000 IPs as a memory safety valve. Normal slider dragging stays well under the limit.
- **Rounding to screen precision.** The API never returns more precision than the UI shows: ktoe values are rounded to the nearest 10, shares to 4 decimals (`%x.xx`), TWh to 1 decimal, slider positions to 6 decimals. Combined with the fact that coefficients are never shipped to the browser, this limits what can be reverse-engineered from responses.
- **Input clamping.** Every incoming share is clamped to `[baseline, 1]` and non-numeric input falls back to the baseline; a missing or malformed POST body is treated as the base case rather than an error.
- **No caching, no state.** `Cache-Control: no-store` on all API responses; the Worker holds no data beyond the in-memory rate-limit buckets.
- Non-`/api/` paths on the Worker are `301`-redirected to the site, so the Worker URL exposes nothing but the API.

---

## Credits and licence

Made by **Bahadır Gümüş** — <https://www.elektrifikasyon.org>.
Data: ETKB 2024 National Energy Balance (r1, 15 Nov 2025); fleet and household statistics from TurkStat / EPDK.
Licence: **TBD** — the only undecided item in this repository. It should be settled before the Labs handover (code and data/text may carry different licences, e.g. a permissive code licence plus CC BY 4.0 for data and text); the Turkish summary below says the same.

Open items marked `TODO`/`TBD` outside this file: in `labs/config.js` the `API_URL` placeholder (`https://<labs-worker>.workers.dev`), `BRAND.url` and the footer/disclaimer wording to be confirmed with Ember comms; see `labs/NOTES.md` §4.

---

## See also

- `worker/README.md` — Worker layout, deployment (wrangler or dashboard paste), environment variables, behaviour.
- `labs/NOTES.md` — Ember Labs overlay: how to apply it, deploy the Labs Worker, sync weekly from upstream, open items.
- `tools/bundle_worker.py` — docstring describes the bundling rules and checks.

---

## Türkçe özet

elektrifikasyon.org, Türkiye'nin nihai enerji tüketiminin ne ölçüde elektriklendirilebileceğini keşfetmek için dört iki dilli (TR/EN) etkileşimli sayfadan oluşur: Simülatör (sektör ve alt sektör kaydırıcıları), Elektrifikasyon Oranı Yanılgısı, Otomobillerin Elektrifikasyonu ve Hanelerin Elektrifikasyonu. Sayfalar GitHub Pages üzerinde statik olarak yayımlanır; tüm hesaplar bir Cloudflare Worker'da (kaynak `worker/src/`, tek gerçek kaynak `worker/src/model-data.js`; `tools/bundle_worker.py` ile tek dosya `worker/dist/worker.js` üretilir) sunucu tarafında yapılır ve yanıtlar ekran hassasiyetine yuvarlanarak döner, model katsayıları tarayıcıya hiç gönderilmez. Veri kaynağı ETKB 2024 Ulusal Enerji Denge Tablosu'dur (r1, 15.11.2025; bin TEP, net kalorifik değer; 1 bin TEP = 11,63 GWh). Elektrifikasyon oranı, enerji dışı tüketim ve istatistiksel fark hariç beş sektörün toplamı üzerinden tanımlanır: 26.340,5 / 120.829,9 bin TEP = %21,80 (UEP 2020 baz değeriyle uyumlu). Verim çarpanları gösterge niteliğindedir: elektrikli otomobil 3,7×, ağır vasıta 1,8×, konut ısı pompası 2,5×, sanayi ısı pompası 2×; ulaştırma kaydırıcısı 2,27× (yakıtın %40'ı otomobil, %60'ı ağır vasıta harmanı). Yerel test için `python3 tools/dev_api_server.py` çalıştırıp `http://localhost:8816/` adresini açmak yeterlidir. Ember Labs sürümü yalnız `config.js` ve `assets/style.css` dosyalarını `labs/` kaplamasıyla değiştirir ve kendi Worker'ını `ALLOWED_ORIGINS` / `SITE_URL` ortam değişkenleriyle kurar (bkz. `worker/README.md`, `labs/NOTES.md`). Yapan: Bahadır Gümüş; lisans henüz belirlenmedi.
