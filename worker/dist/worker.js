// elektrifikasyon.org — SAF API worker'ı (statik dosya servis etmez)
// Cloudflare panelinde: Workers → Create → Hello World şablonu → Edit code →
// bu dosyanın TAMAMINI yapıştırın → Deploy.
// API dışı istekler siteye (GitHub Pages) yönlendirilir.

const SITE = 'https://www.elektrifikasyon.org';

const SECTORS = [
  { id: 'sanayi',    name: 'Sanayi',               en: 'Industry',              E0: 11255.761101422742, T0: 38471.452178493426, r: 2.0 },
  { id: 'ulastirma', name: 'Ulaştırma',            en: 'Transport',             E0: 206.20051372129703, T0: 34472.71167457129,  r: 2.27 }, // oto 3,7× (%40) + ağır vasıta 1,8× (%60) harmanı
  { id: 'konut',     name: 'Konut',                en: 'Residential',           E0: 6418.997041133478,  T0: 29147.333100773478, r: 2.5 },
  { id: 'ticaret',   name: 'Ticaret ve Hizmetler', en: 'Commerce & Services',   E0: 7197.708167958126,  T0: 12974.694294357327, r: 2.5 },
  { id: 'tarim',     name: 'Tarım ve Hayvancılık', en: 'Agriculture & Livestock', E0: 1261.8262314097376, T0: 5763.723841459738, r: 2.5 },
];
const NON_ENERGY = 6397.722942750001;
const STAT_DIFF = 1372.6548286009202;
SECTORS.forEach(s => { s.F0 = s.T0 - s.E0; s.s0 = s.E0 / s.T0; });

// Alt sektörler (denge tablosu satırları; şeker Gıda'nın alt kümesidir)
const SUBSECTORS = [
  { id: 'demircelik', parent: 'sanayi',    name: 'Demir-Çelik Ürünleri İmalatı (24)',       en: 'Iron & Steel Manufacturing (24)',            E0: 2547.8185229776054, T0: 8757.795124355576,  r: 2.0 },
  { id: 'cimento',    parent: 'sanayi',    name: 'Çimento Ürünleri İmalatı (23)',           en: 'Cement Products Manufacturing (23)',         E0: 955.7435270740481,  T0: 7683.6116924662365, r: 1.5 },
  { id: 'gida',       parent: 'sanayi',    name: 'Gıda Ürünleri İmalatı (10)',              en: 'Food Products Manufacturing (10)',           E0: 795.0469970678135,  T0: 3261.4601019111933, r: 2.5 },
  { id: 'kimyasal',   parent: 'sanayi',    name: 'Kimyasal Ürünlerin İmalatı (20)',         en: 'Chemical Products Manufacturing (20)',       E0: 649.1170069556434,  T0: 3092.857074934663,  r: 2.0 },
  { id: 'tekstil',    parent: 'sanayi',    name: 'Tekstil Ürünleri İmalatı (13)',           en: 'Textile Products Manufacturing (13)',        E0: 1211.9245388128177, T0: 2898.033267429669,  r: 2.5 },
  { id: 'seramik',    parent: 'sanayi',    name: 'Seramik Ürünleri İmalatı (23)',           en: 'Ceramic Products Manufacturing (23)',        E0: 239.74166061916384, T0: 1181.0566789691636, r: 2.0 },
  { id: 'demirdisi',  parent: 'sanayi',    name: 'Demir Dışı Metal Ürünlerin İmalatı (24)', en: 'Non-Ferrous Metal Products Manufacturing (24)', E0: 425.5550367800803, T0: 1036.6141336314133, r: 2.0 },
  { id: 'cam',        parent: 'sanayi',    name: 'Cam Ürünleri İmalatı (23)',               en: 'Glass Products Manufacturing (23)',          E0: 220.1820822942405,  T0: 981.6660122442404,  r: 2.0 },
  { id: 'kaucuk',     parent: 'sanayi',    name: 'Kauçuk, Plastik Ürünlerin İmalatı (22)',  en: 'Rubber & Plastic Products Manufacturing (22)', E0: 726.3180179475685, T0: 967.6980594393715,  r: 2.5 },
  { id: 'demiryolu',  parent: 'ulastirma', name: 'Demiryolları',                            en: 'Railways',                                   E0: 140.33048226848732, T0: 272.5745022684873,  r: 2.5 },
  { id: 'seker',      parent: 'sanayi',    name: 'Şeker Üretimi (10.81)',                   en: 'Sugar Production (10.81)',                   E0: 76.23441629201355,  T0: 200.22867339201355, r: 2.5 },
];
SUBSECTORS.forEach(s => { s.F0 = s.T0 - s.E0; s.s0 = s.E0 / s.T0; });
const SECBYID = Object.fromEntries(SECTORS.map(s => [s.id, s]));

// METODOLOJİ (Tem 2026 revizyonu): Enerji Dışı Tüketim nihai tüketimden SAYILMAZ.
// Payda = beş sektörün toplamı (120.829,9 bin TEP); istatistiksel fark da doğal
// olarak dışarıda kalır. Baz oran: 26.340,5 / 120.829,9 = %21,80 (UEP 2020 baz
// tanımıyla uyumlu). NON_ENERGY ve STAT_DIFF sabitleri yalnız referans için durur.
const E0_TOT = SECTORS.reduce((a, s) => a + s.E0, 0);
const T0_TOT = SECTORS.reduce((a, s) => a + s.T0, 0);

// ---- Yanılgı sayfası eğrileri (ornek-hesaplama) ----
const AILE_CURVES = [
  { id: 'r40', r: 3.7, name: '3,7× — elektrikli otomobil', en: '3.7× — electric car' },
  { id: 'r25', r: 2.5, name: '2,5× — ısı pompası (konut)',  en: '2.5× — heat pump (homes)' },
  { id: 'r20', r: 2.0, name: '2× — sanayi ısı pompası',     en: '2× — industrial heat pump' },
  { id: 'r18', r: 1.8, name: '1,8× — e-ağır vasıta',        en: '1.8× — e-heavy vehicles' },
];
// 10 araçlık örnek filo: k araç elektrikliye dönerse (çarpan 3,7×) filonun enerji bazlı oranı
const FILO_N = 10, FILO_R = 3.7;
function filoPoints() {
  return Array.from({ length: FILO_N + 1 }, (_, k) => {
    const e = k / FILO_R, f = FILO_N - k;
    return [k, Math.round(e / (e + f) * 1000) / 10 || 0];
  });
}
// 10 haneli örnek grup: bugün enerjilerinin ~%22'si elektrik (konut ortalaması);
// k hane ısınmasını ısı pompasına (2,5×) çevirirse grubun enerji bazlı oranı
const HANE10_N = 10;
function hane10Points() {
  const e0 = HANE10_N * KONUT_E0_TWH / KONUT_F0_TWH;   // hane başına yakıt = 1 birim
  return Array.from({ length: HANE10_N + 1 }, (_, k) => {
    const e = e0 + k * HANE_HP_FACTOR, f = HANE10_N - k;
    return [k, Math.round(e / (e + f) * 1000) / 10];
  });
}

// ---- Otomobil parkı (otomobil sayfası) ----
const PARK_GROUPS = [
  { id: 'benzin', name: 'Benzin', en: 'Petrol', count: 5485169, km: 13075, l100: 7.5, mjl: 34 },
  { id: 'dizel',  name: 'Dizel',  en: 'Diesel', count: 5707030, km: 15660, l100: 5.5, mjl: 38 },
  { id: 'lpg',    name: 'LPG',    en: 'LPG',    count: 5245753, km: 12043, l100: 9.0, mjl: 25 },
  { id: 'hibrit', name: 'Hibrit', en: 'Hybrid', count: 800402,  km: 22938, l100: 4.5, mjl: 34 },
  { id: 'diger',  name: 'Diğer',  en: 'Other',  count: 34942,   km: 13859, l100: 7.5, mjl: 34 },
];
const PARK_N_TOTAL = 17697089;
const PARK_EV0 = { count: 423793, km: 17582 };
const PARK_EV_KWH_100 = 18;
PARK_GROUPS.forEach(g => {
  g.fuelMJ = g.km * g.l100 / 100 * g.mjl;
  g.elecKWh = g.km * PARK_EV_KWH_100 / 100;
});
const PARK_EV0_KWH = PARK_EV0.count * PARK_EV0.km * PARK_EV_KWH_100 / 100;
const PARK_N_ICE = PARK_GROUPS.reduce((a, g) => a + g.count, 0);
const PARK_S0 = PARK_EV0.count / PARK_N_TOTAL;
const MJ_PER_TWH = 3.6e9, KWH_PER_TWH = 1e9;
// Türkiye etkisi: enerji dışı tüketim hariç nihai tüketim (sektörler toplamı)
const TR_E0 = 26340.5, TR_T0 = 120829.9;
const TEP_PER_TWH = 1000 / 11.63;

// Yalnızca bu origin'lerden gelen tarayıcı istekleri yanıtlanır.
// Not: localhost bilinçli olarak YOK — herkes kendi makinesinde localhost
// çalıştırabileceği için üretim API'sinde izinli olmamalı.
const ALLOWED = new Set([
  'https://elektrifikasyon.org',
  'https://www.elektrifikasyon.org',
]);

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

// ---- Hane (ısı pompası) sayfası ----
const HANE_N = 25329833;             // Türkiye'deki hane sayısı (TÜİK)
const HANE_M3 = 950;                 // ortalama hane yıllık doğal gaz (eşdeğeri) tüketimi (m³)
const HANE_KCAL_M3 = 9155;           // denge tablosu: 9155 kcal/m³
const HANE_HP_FACTOR = 0.40;         // ısı pompası: aynı ısınma %60 daha az enerjiyle
const HANE_PER_GAS_TOE = HANE_M3 * HANE_KCAL_M3 / 1e7;                  // ≈0,870 toe/hane-yıl (≈10,1 MWh)
const HANE_GAS_KTOE = HANE_N * HANE_PER_GAS_TOE / 1000;                 // ≈22.030 bin TEP
// Tutarlılık: 22.030 bin TEP, 2024 dengesindeki konut yakıt toplamının (22.728) altında — taşma yok.
const HANE_GAS_TWH = HANE_GAS_KTOE * 0.01163;                           // ≈256 TWh
// İkinci görünüm: konut sektörünün TÜM enerjisi (2024 denge: elektrik + yakıtlar)
const KONUT_E0_TWH = 6418.997041133478 * 0.01163;    // ≈74,7 TWh (mevcut hane elektriği)
const KONUT_F0_TWH = 22728.33605964002 * 0.01163;    // ≈264,3 TWh (konut yakıtları)

function haneModel(lang) {
  return {
    nHomes: HANE_N, s0: 0, baseTot: r1(HANE_GAS_TWH), trBase: r4(TR_E0 / TR_T0),
    perHomeM3: HANE_M3,
    perHomeGasMWh: r1(HANE_PER_GAS_TOE * 11.63),
    perHomeElecMWh: r1(HANE_PER_GAS_TOE * 11.63 * HANE_HP_FACTOR),
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
  const dE = elec / 0.01163;                       // bin TEP
  const dF = (gas - HANE_GAS_TWH) / 0.01163;       // negatif
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

const r1 = v => Math.round(v * 10) / 10;

function aileEgriler(lang) {
  const N = 100;
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

function corsCheck(request) {
  // Origin başlığı ZORUNLU ve izinli listede olmalı. Site ile API ayrı
  // origin'lerde olduğu için meşru tarayıcı istekleri Origin'i her zaman taşır.
  // (Site günün birinde API ile aynı origin'e taşınırsa bu koşul gevşetilmeli.)
  const origin = request.headers.get('Origin');
  if (!origin || !ALLOWED.has(origin)) return null;
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
  async fetch(request) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      return Response.redirect(SITE + url.pathname + url.search, 301);
    }
    const cors = corsCheck(request);
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
