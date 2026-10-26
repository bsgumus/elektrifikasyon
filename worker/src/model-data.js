// elektrifikasyon.org — MODEL VERİSİ (tek gerçek kaynak / single source of truth)
// ----------------------------------------------------------------------------
// Bu dosya API worker'ının TÜM sayısal sabitlerini ve baz yılı verisini içerir;
// mantık (çözücü, rotalar, CORS, hız sınırı) worker/src/index.js'tedir.
// Model katsayıları HTML sayfalarında ve config.js'te YOKTUR.
//
// KAYNAK : ETKB 2024 Ulusal Enerji Denge Tablosu, r1 (revizyon 1).
//          Sektör / alt sektör satırları: E0 = elektrik, T0 = toplam nihai tüketim.
// BİRİM  : bin TEP (ktoe). 1 bin TEP = 11,63 GWh; 1 TEP = 11,63 MWh = 10^7 kcal.
// YÖNTEM : (Tem 2026 revizyonu) Enerji Dışı Tüketim nihai tüketimden SAYILMAZ;
//          payda = beş sektörün toplamı (120.829,9 bin TEP); istatistiksel fark da
//          doğal olarak dışarıda kalır. Baz oran = 26.340,5 / 120.829,9 = %21,80
//          (UEP 2020 baz tanımıyla uyumlu). NON_ENERGY ve STAT_DIFF yalnız referans.
// r      : verim çarpanı — 1 birim yakıtın işini 1/r birim elektrik görür.
//
// Model değişince: (1) burayı düzenleyin, (2) tools/bundle_worker.py ile
// dist/worker.js'i yeniden üretin, (3) tools/dev_api_server.py'deki Python
// aynasını güncelleyin. Türetilmiş değerler (F0, s0, fuelMJ, toplamlar) bilerek
// burada hesaplanır; index.js yalnız hazır değerleri kullanır.
// ----------------------------------------------------------------------------

// ---- Birim dönüşümleri ----
export const MWH_PER_TOE = 11.63;        // 1 TEP = 11,63 MWh  (1 bin TEP = 11,63 GWh)
export const TWH_PER_KTOE = 0.01163;     // 1 bin TEP = 0,01163 TWh (= MWH_PER_TOE / 1000, aynı aritmetik için literal)
export const TEP_PER_TWH = 1000 / MWH_PER_TOE;   // 1 TWh ≈ 85,98 bin TEP
export const MJ_PER_TWH = 3.6e9;
export const KWH_PER_TWH = 1e9;

// ---- Ana sektörler (ETKB 2024 r1, bin TEP) ----
export const SECTORS = [
  { id: 'sanayi',    name: 'Sanayi',               en: 'Industry',              E0: 11255.761101422742, T0: 38471.452178493426, r: 2.0 },
  { id: 'ulastirma', name: 'Ulaştırma',            en: 'Transport',             E0: 206.20051372129703, T0: 34472.71167457129,  r: 2.27 }, // oto 3,7× (%40) + ağır vasıta 1,8× (%60) harmanı
  { id: 'konut',     name: 'Konut',                en: 'Residential',           E0: 6418.997041133478,  T0: 29147.333100773478, r: 2.5 },
  { id: 'ticaret',   name: 'Ticaret ve Hizmetler', en: 'Commerce & Services',   E0: 7197.708167958126,  T0: 12974.694294357327, r: 2.5 },
  { id: 'tarim',     name: 'Tarım ve Hayvancılık', en: 'Agriculture & Livestock', E0: 1261.8262314097376, T0: 5763.723841459738, r: 2.5 },
];
export const NON_ENERGY = 6397.722942750001;   // yalnız referans (paydaya girmez)
export const STAT_DIFF = 1372.6548286009202;   // yalnız referans (paydaya girmez)
SECTORS.forEach(s => { s.F0 = s.T0 - s.E0; s.s0 = s.E0 / s.T0; });

// ---- Alt sektörler (denge tablosu satırları; şeker Gıda'nın alt kümesidir) ----
export const SUBSECTORS = [
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
export const SECBYID = Object.fromEntries(SECTORS.map(s => [s.id, s]));

// Türkiye toplamı (beş sektör; enerji dışı tüketim hariç)
export const E0_TOT = SECTORS.reduce((a, s) => a + s.E0, 0);
export const T0_TOT = SECTORS.reduce((a, s) => a + s.T0, 0);
// Aynı toplamın yuvarlanmış hâli: otomobil ve hane sayfalarındaki "Türkiye etkisi" bazı
export const TR_E0 = 26340.5;
export const TR_T0 = 120829.9;

// ---- Yanılgı sayfası eğrileri (ornek-hesaplama) ----
export const AILE_CURVES = [
  { id: 'r40', r: 3.7, name: '3,7× — elektrikli otomobil', en: '3.7× — electric car' },
  { id: 'r25', r: 2.5, name: '2,5× — ısı pompası (konut)',  en: '2.5× — heat pump (homes)' },
  { id: 'r20', r: 2.0, name: '2× — sanayi ısı pompası',     en: '2× — industrial heat pump' },
  { id: 'r18', r: 1.8, name: '1,8× — e-ağır vasıta',        en: '1.8× — e-heavy vehicles' },
];
export const AILE_CURVE_N = 100;   // eğri örnekleme çözünürlüğü (nokta sayısı − 1); model katsayısı değil
// 10 araçlık örnek filo: k araç elektrikliye dönerse (çarpan 3,7×) filonun enerji bazlı oranı
export const FILO_N = 10;
export const FILO_R = 3.7;
// 10 haneli örnek grup: bugün enerjilerinin ~%22'si elektrik (konut ortalaması);
// k hane ısınmasını ısı pompasına (2,5×) çevirirse grubun enerji bazlı oranı
export const HANE10_N = 10;

// ---- Otomobil parkı (otomobil sayfası) ----
// count: TÜİK park sayıları; km: yıllık ortalama; l100: l/100 km; mjl: MJ/l (alt ısıl değer)
export const PARK_GROUPS = [
  { id: 'benzin', name: 'Benzin', en: 'Petrol', count: 5485169, km: 13075, l100: 7.5, mjl: 34 },
  { id: 'dizel',  name: 'Dizel',  en: 'Diesel', count: 5707030, km: 15660, l100: 5.5, mjl: 38 },
  { id: 'lpg',    name: 'LPG',    en: 'LPG',    count: 5245753, km: 12043, l100: 9.0, mjl: 25 },
  { id: 'hibrit', name: 'Hibrit', en: 'Hybrid', count: 800402,  km: 22938, l100: 4.5, mjl: 34 },
  { id: 'diger',  name: 'Diğer',  en: 'Other',  count: 34942,   km: 13859, l100: 7.5, mjl: 34 },
];
export const PARK_N_TOTAL = 17697089;                 // toplam otomobil parkı
export const PARK_EV0 = { count: 423793, km: 17582 };  // mevcut elektrikli otomobiller
export const PARK_EV_KWH_100 = 18;                     // elektrikli otomobil: kWh/100 km
PARK_GROUPS.forEach(g => {
  g.fuelMJ = g.km * g.l100 / 100 * g.mjl;          // araç başına yıllık yakıt (MJ)
  g.elecKWh = g.km * PARK_EV_KWH_100 / 100;        // aynı km elektrikli olsaydı (kWh)
});
export const PARK_EV0_KWH = PARK_EV0.count * PARK_EV0.km * PARK_EV_KWH_100 / 100;
export const PARK_N_ICE = PARK_GROUPS.reduce((a, g) => a + g.count, 0);
export const PARK_S0 = PARK_EV0.count / PARK_N_TOTAL;

// ---- Hane (ısı pompası) sayfası ----
export const HANE_N = 25329833;             // Türkiye'deki hane sayısı (TÜİK)
export const HANE_M3 = 950;                 // ortalama hane yıllık doğal gaz (eşdeğeri) tüketimi (m³)
export const HANE_KCAL_M3 = 9155;           // denge tablosu: 9155 kcal/m³
export const HANE_HP_FACTOR = 0.40;         // ısı pompası: aynı ısınma %60 daha az enerjiyle (r = 1/0,40 = 2,5×)
export const HANE_PER_GAS_TOE = HANE_M3 * HANE_KCAL_M3 / 1e7;                  // ≈0,870 toe/hane-yıl (≈10,1 MWh)
export const HANE_GAS_KTOE = HANE_N * HANE_PER_GAS_TOE / 1000;                 // ≈22.030 bin TEP
// Tutarlılık: 22.030 bin TEP, 2024 dengesindeki konut yakıt toplamının (22.728) altında — taşma yok.
export const HANE_GAS_TWH = HANE_GAS_KTOE * TWH_PER_KTOE;                      // ≈256 TWh
// İkinci görünüm: konut sektörünün TÜM enerjisi (2024 denge: elektrik + yakıtlar).
// Literaller SECTORS.konut.E0 ve F0 (= T0 − E0) ile aynıdır; aynı kayan nokta sonucu için literal tutulur.
export const KONUT_E0_TWH = 6418.997041133478 * TWH_PER_KTOE;    // ≈74,7 TWh (mevcut hane elektriği)
export const KONUT_F0_TWH = 22728.33605964002 * TWH_PER_KTOE;    // ≈264,3 TWh (konut yakıtları)
