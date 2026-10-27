#!/usr/bin/env python3
"""Yerel test sunucusu — worker/src'nin Python aynası (model-data.js + index.js'teki
API'nin birebir kopyası: aynı rotalar, aynı yuvarlama). Statik sayfaları da sunar.
Yalnızca geliştirme içindir; yayına dahil edilmez. Port: 8816.
Model değişince worker/src/model-data.js ile birlikte BURASI da güncellenmelidir
(sonra tools/bundle_worker.py ile dist/worker.js yeniden üretilir)."""
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'docs')  # yayınlanan site: docs/

SECTORS = [
    dict(id='sanayi',    name='Sanayi',               en='Industry',                E0=11255.761101422742, T0=38471.452178493426, r=2.0),
    dict(id='ulastirma', name='Ulaştırma',            en='Transport',               E0=206.20051372129703, T0=34472.71167457129,  r=2.27),  # oto 3,7× (%40) + ağır vasıta 1,8× (%60) harmanı
    dict(id='konut',     name='Konut',                en='Residential',             E0=6418.997041133478,  T0=29147.333100773478, r=2.5),
    dict(id='ticaret',   name='Ticaret ve Hizmetler', en='Commerce & Services',     E0=7197.708167958126,  T0=12974.694294357327, r=2.5),
    dict(id='tarim',     name='Tarım ve Hayvancılık', en='Agriculture & Livestock', E0=1261.8262314097376, T0=5763.723841459738,  r=2.5),
]
NON_ENERGY = 6397.722942750001
STAT_DIFF = 1372.6548286009202
for s in SECTORS:
    s['F0'] = s['T0'] - s['E0']
    s['s0'] = s['E0'] / s['T0']

# Alt sektörler (denge tablosu satırları; şeker Gıda'nın alt kümesidir)
SUBSECTORS = [
    dict(id='demircelik', parent='sanayi',    name='Demir-Çelik Ürünleri İmalatı (24)',       en='Iron & Steel Manufacturing (24)',               E0=2547.8185229776054, T0=8757.795124355576,  r=2.0),
    dict(id='cimento',    parent='sanayi',    name='Çimento Ürünleri İmalatı (23)',           en='Cement Products Manufacturing (23)',            E0=955.7435270740481,  T0=7683.6116924662365, r=1.5),
    dict(id='gida',       parent='sanayi',    name='Gıda Ürünleri İmalatı (10)',              en='Food Products Manufacturing (10)',              E0=795.0469970678135,  T0=3261.4601019111933, r=2.5),
    dict(id='kimyasal',   parent='sanayi',    name='Kimyasal Ürünlerin İmalatı (20)',         en='Chemical Products Manufacturing (20)',          E0=649.1170069556434,  T0=3092.857074934663,  r=2.0),
    dict(id='tekstil',    parent='sanayi',    name='Tekstil Ürünleri İmalatı (13)',           en='Textile Products Manufacturing (13)',           E0=1211.9245388128177, T0=2898.033267429669,  r=2.5),
    dict(id='seramik',    parent='sanayi',    name='Seramik Ürünleri İmalatı (23)',           en='Ceramic Products Manufacturing (23)',           E0=239.74166061916384, T0=1181.0566789691636, r=2.0),
    dict(id='demirdisi',  parent='sanayi',    name='Demir Dışı Metal Ürünlerin İmalatı (24)', en='Non-Ferrous Metal Products Manufacturing (24)', E0=425.5550367800803,  T0=1036.6141336314133, r=2.0),
    dict(id='cam',        parent='sanayi',    name='Cam Ürünleri İmalatı (23)',               en='Glass Products Manufacturing (23)',             E0=220.1820822942405,  T0=981.6660122442404,  r=2.0),
    dict(id='kaucuk',     parent='sanayi',    name='Kauçuk, Plastik Ürünlerin İmalatı (22)',  en='Rubber & Plastic Products Manufacturing (22)',  E0=726.3180179475685,  T0=967.6980594393715,  r=2.5),
    dict(id='demiryolu',  parent='ulastirma', name='Demiryolları',                            en='Railways',                                      E0=140.33048226848732, T0=272.5745022684873,  r=2.5),
    dict(id='seker',      parent='sanayi',    name='Şeker Üretimi (10.81)',                   en='Sugar Production (10.81)',                      E0=76.23441629201355,  T0=200.22867339201355, r=2.5),
]
for s in SUBSECTORS:
    s['F0'] = s['T0'] - s['E0']
    s['s0'] = s['E0'] / s['T0']
SECBYID = {s['id']: s for s in SECTORS}

# METODOLOJİ (Tem 2026 revizyonu): Enerji Dışı Tüketim nihai tüketimden SAYILMAZ.
# Payda = beş sektörün toplamı; baz oran 26.340,5 / 120.829,9 = %21,80.
E0_TOT = sum(s['E0'] for s in SECTORS)
T0_TOT = sum(s['T0'] for s in SECTORS)

# ---- Yanılgı sayfası eğrileri (ornek-hesaplama) ----
AILE_CURVES = [
    dict(id='r40', r=3.7, name='3,7× — elektrikli otomobil', en='3.7× — electric car'),
    dict(id='r25', r=2.5, name='2,5× — ısı pompası (konut)', en='2.5× — heat pump (homes)'),
    dict(id='r20', r=2.0, name='2× — sanayi ısı pompası',    en='2× — industrial heat pump'),
    dict(id='r18', r=1.8, name='1,8× — e-ağır vasıta',       en='1.8× — e-heavy vehicles'),
]
FILO_N, FILO_R = 10, 3.7
HANE10_N = 10


def filo_points():
    pts = []
    for k in range(FILO_N + 1):
        e = k / FILO_R
        f = FILO_N - k
        pts.append([k, round(e / (e + f) * 100, 1) if (e + f) > 0 and k > 0 else 0.0])
    return pts


def hane10_points():
    e0 = HANE10_N * KONUT_E0_TWH / KONUT_F0_TWH   # hane başına yakıt = 1 birim
    pts = []
    for k in range(HANE10_N + 1):
        e = e0 + k * HANE_HP_FACTOR
        f = HANE10_N - k
        pts.append([k, round(e / (e + f) * 100, 1)])
    return pts

# ---- Otomobil parkı (otomobil sayfası) ----
PARK_GROUPS = [
    dict(id='benzin', name='Benzin', en='Petrol', count=5485169, km=13075, l100=7.5, mjl=34),
    dict(id='dizel',  name='Dizel',  en='Diesel', count=5707030, km=15660, l100=5.5, mjl=38),
    dict(id='lpg',    name='LPG',    en='LPG',    count=5245753, km=12043, l100=9.0, mjl=25),
    dict(id='hibrit', name='Hibrit', en='Hybrid', count=800402,  km=22938, l100=4.5, mjl=34),
    dict(id='diger',  name='Diğer',  en='Other',  count=34942,   km=13859, l100=7.5, mjl=34),
]
PARK_N_TOTAL = 17697089
PARK_EV0 = dict(count=423793, km=17582)
PARK_EV_KWH_100 = 18.0
for g in PARK_GROUPS:
    g['fuelMJ'] = g['km'] * g['l100'] / 100.0 * g['mjl']
    g['elecKWh'] = g['km'] * PARK_EV_KWH_100 / 100.0
PARK_EV0_KWH = PARK_EV0['count'] * PARK_EV0['km'] * PARK_EV_KWH_100 / 100.0
PARK_N_ICE = sum(g['count'] for g in PARK_GROUPS)
PARK_S0 = PARK_EV0['count'] / PARK_N_TOTAL
MJ_PER_TWH, KWH_PER_TWH = 3.6e9, 1e9
# Türkiye etkisi: enerji dışı tüketim hariç nihai tüketim (sektörler toplamı)
TR_E0, TR_T0 = 26340.5, 120829.9
TEP_PER_TWH = 1000.0 / 11.63

# Hane (ısı pompası) sayfası
HANE_N = 25329833            # Türkiye'deki hane sayısı (TÜİK)
HANE_M3 = 950
HANE_KCAL_M3 = 9155
HANE_HP_FACTOR = 0.40
HANE_PER_GAS_TOE = HANE_M3 * HANE_KCAL_M3 / 1e7
HANE_GAS_KTOE = HANE_N * HANE_PER_GAS_TOE / 1000   # ≈22.030 bin TEP (< konut yakıt toplamı 22.728)
HANE_GAS_TWH = HANE_GAS_KTOE * 0.01163             # ≈256 TWh
KONUT_E0_TWH = 6418.997041133478 * 0.01163         # ≈74,7 TWh
KONUT_F0_TWH = 22728.33605964002 * 0.01163         # ≈264,3 TWh


def hane_model(lang='tr'):
    return dict(nHomes=HANE_N, s0=0, baseTot=r1(HANE_GAS_TWH), trBase=r4(TR_E0 / TR_T0),
                perHomeM3=HANE_M3,
                perHomeGasMWh=r1(HANE_PER_GAS_TOE * 11.63),
                perHomeElecMWh=r1(HANE_PER_GAS_TOE * 11.63 * HANE_HP_FACTOR),
                legend=[dict(id='hp', name='Heat-pump homes' if lang == 'en' else 'Isı pompalı haneler'),
                        dict(id='gas', name='Fuel-heated homes' if lang == 'en' else 'Yakıtla ısınan haneler')],
                sector=dict(E=r1(KONUT_E0_TWH), F=r1(KONUT_F0_TWH), T=r1(KONUT_E0_TWH + KONUT_F0_TWH),
                            share=r4(KONUT_E0_TWH / (KONUT_E0_TWH + KONUT_F0_TWH))))


def hane_hesap(b):
    b = b or {}
    sigma = max(0.0, min(1.0, _num(b, 'sigma', 0.0)))
    gas = (1 - sigma) * HANE_GAS_TWH
    elec = sigma * HANE_GAS_TWH * HANE_HP_FACTOR
    tot = gas + elec
    dE = elec / 0.01163
    dF = (gas - HANE_GAS_TWH) / 0.01163
    tr = (TR_E0 + dE) / (TR_T0 + dE + dF)
    sE = KONUT_E0_TWH + elec
    sF = KONUT_F0_TWH - sigma * HANE_GAS_TWH
    sT = sE + sF
    return dict(sigma=r6(sigma), hpHomes=round(sigma * HANE_N),
                share=r4(elec / tot) if tot > 0 else 0.0,
                elecTWh=r1(elec), gasTWh=r1(gas), totTWh=r1(tot),
                savedTWh=r1(HANE_GAS_TWH - tot), trShare=r4(tr),
                sector=dict(E=r1(sE), F=r1(sF), T=r1(sT), share=r4(sE / sT)),
                comp=[dict(id='hp', count=round(sigma * HANE_N)),
                      dict(id='gas', count=round((1 - sigma) * HANE_N))])


def en_num(v):
    return ('%s' % v).replace(',', '.')


def eff_label(r, lang):
    if lang == 'en':
        return 'efficiency factor %s×' % en_num(r if r != int(r) else int(r))
    return 'verim çarpanı %s×' % tr_num(r if r != int(r) else int(r))


def tr_num(v):
    return ('%s' % v).replace('.', ',')


# ekran hassasiyetine yuvarlama (worker ile aynı)
def r100(v):
    return round(v / 10.0) * 10


def r4(v):
    return round(v, 4)


def r6(v):
    return round(v, 6)


def solve(sec, s):
    """Verilen hedef pay için (E, F, x) döndürür; x = dönüştürülen yakıt oranı."""
    a, c = sec['E0'], sec['F0']
    b = c / sec['r']
    if c <= 0 or not s > sec['s0']:
        return sec['E0'], sec['F0'], 0.0
    s = min(1.0, s)
    x = min(1.0, (s * (a + c) - a) / (b * (1 - s) + s * c))
    return a + x * b, (1 - x) * c, x


def _num(dct, key, default):
    try:
        v = float(dct.get(key))
        return v if v == v else default
    except (TypeError, ValueError):
        return default


def hesap(shares_in, subs_in=None):
    shares_in = shares_in or {}
    subs_in = subs_in or {}
    sectors = {}
    xs = {}
    Etot, Ttot, T0tot = 0.0, 0.0, 0.0  # enerji dışı tüketim paydaya dahil edilmez
    for sec in SECTORS:
        s = max(sec['s0'], min(1.0, _num(shares_in, sec['id'], sec['s0'])))
        E, F, x = solve(sec, s)
        T = E + F
        xs[sec['id']] = x
        sectors[sec['id']] = dict(E=r100(E), F=r100(F), T=round(T), share=r4(E / T), s=r4(s))
        Etot += E
        Ttot += T
        T0tot += sec['T0']

    # Alt sektörler: ana sektör kaydırıcısının dönüştürdüğü pay (x_p) alt sektöre
    # orantılı yansıtılır; alt sektör kaydırıcısı KALAN yakıta uygulanır.
    subs = {}
    for sub in SUBSECTORS:
        parent = SECBYID[sub['parent']]
        xp = xs[sub['parent']]
        a = sub['E0'] + xp * sub['F0'] / parent['r']   # ana kaydırıcı sonrası elektrik
        c = (1.0 - xp) * sub['F0']                     # kalan yakıt
        s0 = a / (a + c) if (a + c) > 0 else 1.0
        s = max(s0, min(1.0, _num(subs_in, sub['id'], s0)))
        E, F, _ = solve(dict(E0=a, F0=c, r=sub['r'], s0=s0), s)
        T = E + F
        subs[sub['id']] = dict(E=r100(E), F=r100(F), T=round(T),
                               share=r4(E / T) if T > 0 else 1.0, s=r4(E / T) if T > 0 else 1.0)
        Etot += E - a
        Ttot += (E + F) - (a + c)

    return dict(sectors=sectors, subs=subs,
                totals=dict(Etot=round(Etot), Ttot=round(Ttot), T0tot=round(T0tot), E0tot=round(E0_TOT),
                            share=r4(Etot / Ttot), share0=r4(E0_TOT / T0_TOT), saved=round(T0tot - Ttot)))


def model(lang='tr'):
    def sub_suffix(parent):
        if lang == 'en':
            return ' · sub-sector of %s' % parent['en']
        return ' · %s alt sektörü' % parent['name']

    return dict(
        sectors=[dict(id=s['id'], name=s['en'] if lang == 'en' else s['name'],
                      E0=r100(s['E0']), T0=r100(s['T0']), s0=r6(s['s0']),
                      eff=eff_label(s['r'], lang))
                 for s in SECTORS],
        subs=[dict(id=s['id'], parent=s['parent'], name=s['en'] if lang == 'en' else s['name'],
                   E0=r100(s['E0']), T0=r100(s['T0']), s0=r6(s['s0']),
                   eff=eff_label(s['r'], lang) + sub_suffix(SECBYID[s['parent']]))
              for s in SUBSECTORS],
        share0=r4(E0_TOT / T0_TOT))


def r1(v):
    return round(v, 1)


def aile_egriler(lang='tr'):
    N = 100
    return dict(curves=[
        dict(id=c['id'], name=c['en'] if lang == 'en' else c['name'],
             points=[[i / N, round((i / N) / (i / N + c['r'] * (1 - i / N)) * 100, 2) if i else 0.0]
                     for i in range(N + 1)])
        for c in AILE_CURVES],
        filo=dict(n=FILO_N, r=FILO_R, points=filo_points()),
        hane=dict(n=HANE10_N, r=1 / HANE_HP_FACTOR, points=hane10_points()))


def oto_model(lang='tr'):
    return dict(nTotal=PARK_N_TOTAL, s0=r6(PARK_S0),
                baseTot=r1(oto_energy(PARK_S0)[2]), trBase=r4(TR_E0 / TR_T0),
                legend=[dict(id='elektrik', name='Electric' if lang == 'en' else 'Elektrik')] +
                       [dict(id=g['id'], name=g['en'] if lang == 'en' else g['name']) for g in PARK_GROUPS])


def oto_energy(sigma):
    ev_count = sigma * PARK_N_TOTAL
    y = max(0.0, min(1.0, (ev_count - PARK_EV0['count']) / PARK_N_ICE))
    fuel = sum((1 - y) * g['count'] * g['fuelMJ'] for g in PARK_GROUPS) / MJ_PER_TWH
    elec = PARK_EV0_KWH / KWH_PER_TWH + sum(y * g['count'] * g['elecKWh'] for g in PARK_GROUPS) / KWH_PER_TWH
    return fuel, elec, fuel + elec, y, ev_count


def oto_hesap(b):
    b = b or {}
    sigma = max(PARK_S0, min(1.0, _num(b, 'sigma', PARK_S0)))
    fuel, elec, tot, y, ev_count = oto_energy(sigma)
    b_fuel, b_elec, b_tot, _, _ = oto_energy(PARK_S0)
    d_elec = (elec - b_elec) * TEP_PER_TWH
    d_fuel = (fuel - b_fuel) * TEP_PER_TWH
    tr = (TR_E0 + d_elec) / (TR_T0 + d_elec + d_fuel)
    comp = [dict(id='elektrik', name='Elektrik', count=round(ev_count))] + \
           [dict(id=g['id'], name=g['name'], count=round((1 - y) * g['count'])) for g in PARK_GROUPS]
    # treemap: grup bazlı yıllık enerji (TWh, ekran hassasiyetinde)
    enerji = [dict(id='elektrik', TWh=r1(elec))] + \
             [dict(id=g['id'], TWh=r1((1 - y) * g['count'] * g['fuelMJ'] / MJ_PER_TWH)) for g in PARK_GROUPS]
    return dict(sigma=r6(sigma), evCount=round(ev_count),
                parkShare=r4(elec / tot) if tot > 0 else 0.0,
                elecTWh=r1(elec), fuelTWh=r1(fuel), totTWh=r1(tot), savedTWh=r1(b_tot - tot),
                trShare=r4(tr), comp=comp, enerji=enerji)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def _json(self, data):
        body = json.dumps(data).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        lang = 'en' if parse_qs(parsed.query).get('lang', ['tr'])[0] == 'en' else 'tr'
        if parsed.path == '/api/model':
            return self._json(model(lang))
        if parsed.path == '/api/aile/egriler':
            return self._json(aile_egriler(lang))
        if parsed.path == '/api/otomobil/model':
            return self._json(oto_model(lang))
        if parsed.path == '/api/hane/model':
            return self._json(hane_model(lang))
        return super().do_GET()

    def do_POST(self):
        try:
            n = int(self.headers.get('Content-Length') or 0)
            body = json.loads(self.rfile.read(n) or b'{}')
        except Exception:
            body = {}
        if self.path == '/api/hesap':
            return self._json(hesap(body.get('shares'), body.get('subs')))
        if self.path == '/api/otomobil':
            return self._json(oto_hesap(body))
        if self.path == '/api/hane':
            return self._json(hane_hesap(body))
        self.send_error(404)


if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', 8816), Handler).serve_forever()
