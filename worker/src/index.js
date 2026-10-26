// elektrifikasyon.org — SAF API worker'ı: MANTIK (statik dosya servis etmez)
// Model sabitleri ./model-data.js'tedir; bu dosyada sayısal model katsayısı YOKTUR
// (yalnız altyapı sayıları: hız sınırı, HTTP durum kodları, yuvarlama hassasiyeti).
// Dağıtım: `wrangler deploy` (wrangler.toml) ya da tools/bundle_worker.py ile üretilen
// dist/worker.js'i Cloudflare panosuna yapıştırma. Ortam değişkenleri: ALLOWED_ORIGINS,
// SITE_URL (bkz. README.md). API dışı istekler siteye (GitHub Pages) 301 ile yönlendirilir.

import {
  SECTORS, SUBSECTORS, SECBYID, E0_TOT, T0_TOT, TR_E0, TR_T0,
  AILE_CURVES, AILE_CURVE_N, FILO_N, FILO_R, HANE10_N,
  PARK_GROUPS, PARK_N_TOTAL, PARK_EV0, PARK_EV0_KWH, PARK_N_ICE, PARK_S0,
  MJ_PER_TWH, KWH_PER_TWH, TEP_PER_TWH, TWH_PER_KTOE, MWH_PER_TOE,
  HANE_N, HANE_M3, HANE_HP_FACTOR, HANE_PER_GAS_TOE, HANE_GAS_TWH, KONUT_E0_TWH, KONUT_F0_TWH,
} from './model-data.js';

// ---- Dağıtım ayarları: env'den okunur, yoksa gömülü varsayılanlar ----
// Yalnızca bu origin'lerden gelen tarayıcı istekleri yanıtlanır.
// Not: localhost bilinçli olarak YOK — herkes kendi makinesinde localhost
// çalıştırabileceği için üretim API'sinde izinli olmamalı.
const DEFAULT_ALLOWED_ORIGINS = 'https://elektrifikasyon.org,https://www.elektrifikasyon.org';
const DEFAULT_SITE_URL = 'https://www.elektrifikasyon.org';

function envStr(env, key) {
  const v = env && env[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}
// Her istekte env'den kurulur: Module Worker'da env modül üstünde değil, fetch()'e gelir.
function allowedOrigins(env) {
  const raw = envStr(env, 'ALLOWED_ORIGINS') || DEFAULT_ALLOWED_ORIGINS;
  return new Set(raw.split(',').map(o => o.trim()).filter(Boolean));
}
function siteUrl(env) {
  return (envStr(env, 'SITE_URL') || DEFAULT_SITE_URL).replace(/\/+$/, '');
}

// ---- IP başına hız sınırı (kayan pencere, isolate belleğinde) ----
// Normal kullanıcı sürüklemesi seri isteklerle ~10 istek/sn'yi geçmez;
// limit meşru kullanımı rahat karşılayacak, script akınını kesecek şekilde seçildi.
const RL_WINDOW_MS = 10_000;
const RL_MAX = 150;
const rlBuckets = new Map();

function rateLimited(ip) {
  const now = Date.now();
  let arr = rlBuckets.get(ip);
  if (!arr) { arr = []; rlBuckets.set(ip, arr); }
  while (arr.length && now - arr[0] > RL_WINDOW_MS) arr.shift();
  if (arr.length >= RL_MAX) return true;
  arr.push(now);
  if (rlBuckets.size > 10_000) rlBuckets.clear(); // bellek emniyeti
  return false;
}

// ---- ekran hassasiyetine yuvarlama ----
// API, arayüzün gösterdiğinden daha hassas değer döndürmez: bin TEP değerleri
// onlar basamağına (ekrandaki tamsayı TWh bu düzeyi zaten ima eder), oranlar
// 4 ondalığa (ekranda %x,xx) yuvarlanır.
const r100 = v => Math.round(v / 10) * 10;
const r4 = v => Math.round(v * 1e4) / 1e4;
const r6 = v => Math.round(v * 1e6) / 1e6;
const r1 = v => Math.round(v * 10) / 10;

function solve(sec, s) {
  // Verilen hedef pay için {E, F, x} döndürür; x = dönüştürülen yakıt oranı.
  const a = sec.E0, c = sec.F0, b = c / sec.r;
  if (c <= 0 || !(s > sec.s0)) return { E: sec.E0, F: sec.F0, x: 0 };
  s = Math.min(1, s);
  const x = Math.min(1, (s * (a + c) - a) / (b * (1 - s) + s * c));
  return { E: a + x * b, F: (1 - x) * c, x };
}

function num(dct, key, dflt) {
  const v = Number(dct?.[key]);
  return isFinite(v) ? v : dflt;
}

function hesap(sharesIn, subsIn) {
  const sectors = {}, xs = {};
  let Etot = 0, Ttot = 0, T0tot = 0; // enerji dışı tüketim paydaya dahil edilmez
  for (const sec of SECTORS) {
    const s = Math.max(sec.s0, Math.min(1, num(sharesIn, sec.id, sec.s0)));
    const { E, F, x } = solve(sec, s);
    const T = E + F;
    xs[sec.id] = x;
    sectors[sec.id] = { E: r100(E), F: r100(F), T: Math.round(T), share: r4(E / T), s: r4(s) };
    Etot += E; Ttot += T; T0tot += sec.T0;
  }

  // Alt sektörler: ana sektör kaydırıcısının dönüştürdüğü pay (x_p) alt sektöre
  // orantılı yansıtılır; alt sektör kaydırıcısı KALAN yakıta uygulanır.
  const subs = {};
  for (const sub of SUBSECTORS) {
    const parent = SECBYID[sub.parent];
    const xp = xs[sub.parent];
    const a = sub.E0 + xp * sub.F0 / parent.r;   // ana kaydırıcı sonrası elektrik
    const c = (1 - xp) * sub.F0;                 // kalan yakıt
    const s0 = (a + c) > 0 ? a / (a + c) : 1;
    const s = Math.max(s0, Math.min(1, num(subsIn, sub.id, s0)));
    const { E, F } = solve({ E0: a, F0: c, r: sub.r, s0 }, s);
    const T = E + F;
    subs[sub.id] = { E: r100(E), F: r100(F), T: Math.round(T), share: T > 0 ? r4(E / T) : 1, s: T > 0 ? r4(E / T) : 1 };
    Etot += E - a;
    Ttot += (E + F) - (a + c);
  }

  return {
    sectors, subs,
    totals: {
      Etot: Math.round(Etot), Ttot: Math.round(Ttot), T0tot: Math.round(T0tot), E0tot: Math.round(E0_TOT),
      share: r4(Etot / Ttot), share0: r4(E0_TOT / T0_TOT), saved: Math.round(T0tot - Ttot),
    },
  };
}

// ---- Yanılgı sayfası (ornek-hesaplama) ----
// Örnek filo: k araç elektrikliye dönerse filonun enerji bazlı oranı
function filoPoints() {
  return Array.from({ length: FILO_N + 1 }, (_, k) => {
    const e = k / FILO_R, f = FILO_N - k;
    return [k, Math.round(e / (e + f) * 1000) / 10 || 0];
  });
}
// Örnek hane grubu: k hane ısınmasını ısı pompasına çevirirse grubun enerji bazlı oranı
function hane10Points() {
  const e0 = HANE10_N * KONUT_E0_TWH / KONUT_F0_TWH;   // hane başına yakıt = 1 birim
  return Array.from({ length: HANE10_N + 1 }, (_, k) => {
    const e = e0 + k * HANE_HP_FACTOR, f = HANE10_N - k;
    return [k, Math.round(e / (e + f) * 1000) / 10];
  });
}

function aileEgriler(lang) {
  const N = AILE_CURVE_N;
  return {
    curves: AILE_CURVES.map(c => ({
      id: c.id, name: lang === 'en' ? c.en : c.name,
      points: Array.from({ length: N + 1 }, (_, i) => {
        const p = i / N;
        return [p, Math.round(p / (p + c.r * (1 - p)) * 10000) / 100];
      }),
    })),
    filo: { n: FILO_N, r: FILO_R, points: filoPoints() },
    hane: { n: HANE10_N, r: 1 / HANE_HP_FACTOR, points: hane10Points() },
  };
}

// ---- Hane (ısı pompası) sayfası ----
function haneModel(lang) {
  return {
    nHomes: HANE_N, s0: 0, baseTot: r1(HANE_GAS_TWH), trBase: r4(TR_E0 / TR_T0),
    perHomeM3: HANE_M3,
    perHomeGasMWh: r1(HANE_PER_GAS_TOE * MWH_PER_TOE),
    perHomeElecMWh: r1(HANE_PER_GAS_TOE * MWH_PER_TOE * HANE_HP_FACTOR),
    legend: [
      { id: 'hp',  name: lang === 'en' ? 'Heat-pump homes' : 'Isı pompalı haneler' },
      { id: 'gas', name: lang === 'en' ? 'Fuel-heated homes' : 'Yakıtla ısınan haneler' },
    ],
    sector: {
      E: r1(KONUT_E0_TWH), F: r1(KONUT_F0_TWH), T: r1(KONUT_E0_TWH + KONUT_F0_TWH),
      share: r4(KONUT_E0_TWH / (KONUT_E0_TWH + KONUT_F0_TWH)),
    },
  };
}

function haneHesap(b) {
  const sigma = Math.max(0, Math.min(1, num(b, 'sigma', 0)));
  const gas = (1 - sigma) * HANE_GAS_TWH;
  const elec = sigma * HANE_GAS_TWH * HANE_HP_FACTOR;
  const tot = gas + elec;
  const dE = elec / TWH_PER_KTOE;                       // bin TEP
  const dF = (gas - HANE_GAS_TWH) / TWH_PER_KTOE;       // negatif
  const tr = (TR_E0 + dE) / (TR_T0 + dE + dF);
  const sE = KONUT_E0_TWH + elec;                       // mevcut hane elektriği + ısı pompası
  const sF = KONUT_F0_TWH - sigma * HANE_GAS_TWH;       // konut yakıtları − ikame edilen
  const sT = sE + sF;
  return {
    sigma: r6(sigma), hpHomes: Math.round(sigma * HANE_N),
    share: tot > 0 ? r4(elec / tot) : 0,
    elecTWh: r1(elec), gasTWh: r1(gas), totTWh: r1(tot),
    savedTWh: r1(HANE_GAS_TWH - tot), trShare: r4(tr),
    sector: { E: r1(sE), F: r1(sF), T: r1(sT), share: r4(sE / sT) },
    comp: [
      { id: 'hp',  count: Math.round(sigma * HANE_N) },
      { id: 'gas', count: Math.round((1 - sigma) * HANE_N) },
    ],
  };
}

// ---- Ana model (index sayfası) ----
const effLabel = (r, lang) => lang === 'en'
  ? `efficiency factor ${r.toLocaleString('en-GB')}×`
  : `verim çarpanı ${r.toLocaleString('tr-TR')}×`;

function model(lang) {
  const subSuffix = p => lang === 'en' ? ` · sub-sector of ${p.en}` : ` · ${p.name} alt sektörü`;
  return {
    sectors: SECTORS.map(s => ({
      id: s.id, name: lang === 'en' ? s.en : s.name, E0: r100(s.E0), T0: r100(s.T0), s0: r6(s.s0),
      eff: effLabel(s.r, lang),
    })),
    subs: SUBSECTORS.map(s => ({
      id: s.id, parent: s.parent, name: lang === 'en' ? s.en : s.name, E0: r100(s.E0), T0: r100(s.T0), s0: r6(s.s0),
      eff: effLabel(s.r, lang) + subSuffix(SECBYID[s.parent]),
    })),
    share0: r4(E0_TOT / T0_TOT),
  };
}

// ---- Otomobil parkı (otomobil sayfası) ----
function otoEnergy(sigma) {
  const evCount = sigma * PARK_N_TOTAL;
  const y = Math.max(0, Math.min(1, (evCount - PARK_EV0.count) / PARK_N_ICE));
  let fuel = 0, elec = PARK_EV0_KWH / KWH_PER_TWH;
  for (const g of PARK_GROUPS) {
    fuel += (1 - y) * g.count * g.fuelMJ / MJ_PER_TWH;
    elec += y * g.count * g.elecKWh / KWH_PER_TWH;
  }
  return { fuel, elec, tot: fuel + elec, y, evCount };
}

function otoModel(lang) {
  return {
    nTotal: PARK_N_TOTAL, s0: r6(PARK_S0),
    baseTot: r1(otoEnergy(PARK_S0).tot), trBase: r4(TR_E0 / TR_T0),
    legend: [{ id: 'elektrik', name: lang === 'en' ? 'Electric' : 'Elektrik' }]
      .concat(PARK_GROUPS.map(g => ({ id: g.id, name: lang === 'en' ? g.en : g.name }))),
  };
}

function otoHesap(b) {
  const sigma = Math.max(PARK_S0, Math.min(1, num(b, 'sigma', PARK_S0)));
  const r = otoEnergy(sigma), base = otoEnergy(PARK_S0);
  const dElec = (r.elec - base.elec) * TEP_PER_TWH;
  const dFuel = (r.fuel - base.fuel) * TEP_PER_TWH;
  const tr = (TR_E0 + dElec) / (TR_T0 + dElec + dFuel);
  return {
    sigma: r6(sigma), evCount: Math.round(r.evCount),
    parkShare: r.tot > 0 ? r4(r.elec / r.tot) : 0,
    elecTWh: r1(r.elec), fuelTWh: r1(r.fuel), totTWh: r1(r.tot), savedTWh: r1(base.tot - r.tot),
    trShare: r4(tr),
    comp: [{ id: 'elektrik', name: 'Elektrik', count: Math.round(r.evCount) }]
      .concat(PARK_GROUPS.map(g => ({ id: g.id, name: g.name, count: Math.round((1 - r.y) * g.count) }))),
    // treemap: grup bazlı yıllık enerji (TWh, ekran hassasiyetinde)
    enerji: [{ id: 'elektrik', TWh: r1(r.elec) }]
      .concat(PARK_GROUPS.map(g => ({ id: g.id, TWh: r1((1 - r.y) * g.count * g.fuelMJ / MJ_PER_TWH) }))),
  };
}

// ---- HTTP katmanı ----
function corsCheck(request, allowed) {
  // Origin başlığı ZORUNLU ve izinli listede olmalı. Site ile API ayrı
  // origin'lerde olduğu için meşru tarayıcı istekleri Origin'i her zaman taşır.
  // (Site günün birinde API ile aynı origin'e taşınırsa bu koşul gevşetilmeli.)
  const origin = request.headers.get('Origin');
  if (!origin || !allowed.has(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function json(data, cors) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      return Response.redirect(siteUrl(env) + url.pathname + url.search, 301);
    }
    const cors = corsCheck(request, allowedOrigins(env));
    if (!cors) return new Response('Forbidden', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const ip = request.headers.get('CF-Connecting-IP') || 'bilinmiyor';
    if (rateLimited(ip)) {
      return new Response('Too Many Requests', { status: 429, headers: { 'Retry-After': '10', ...cors } });
    }

    const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'tr';
    if (request.method === 'GET') {
      if (url.pathname === '/api/model') return json(model(lang), cors);
      if (url.pathname === '/api/aile/egriler') return json(aileEgriler(lang), cors);
      if (url.pathname === '/api/otomobil/model') return json(otoModel(lang), cors);
      if (url.pathname === '/api/hane/model') return json(haneModel(lang), cors);
    }
    if (request.method === 'POST') {
      let body = null;
      try { body = await request.json(); } catch (e) { /* boş gövde: baz durum */ }
      if (url.pathname === '/api/hesap') return json(hesap(body?.shares, body?.subs), cors);
      if (url.pathname === '/api/otomobil') return json(otoHesap(body), cors);
      if (url.pathname === '/api/hane') return json(haneHesap(body), cors);
    }
    return new Response('Not found', { status: 404, headers: cors });
  },
};
