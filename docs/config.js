// elektrifikasyon.org — site yapılandırması (marka ve API). Model katsayıları BURADA DEĞİL, worker/src/model-data.js'tedir.
// Ember Labs sürümü: yalnız bu dosya ve assets/style.css farklıdır (bkz. labs/).
window.ELX = {
  API_URL: 'https://elektrifikasyon.bahadirsgumus.workers.dev',   // Cloudflare Worker (yalnız /api/*)
  BRAND: { name: 'elektrifikasyon.org', url: 'https://www.elektrifikasyon.org' },
  FOOTER: {
    tr: '© 2026 elektrifikasyon.org — Tüm hakları saklıdır.',
    en: '© 2026 elektrifikasyon.org — All rights reserved.',
  },
  CREDIT:     { tr: '', en: '' },   // ör. 'Yapan: Bahadır Gümüş' — Labs sürümünde dolu
  DISCLAIMER: { tr: '', en: '' },   // Labs sorumluluk reddi — Labs sürümünde dolu
};
document.addEventListener('DOMContentLoaded', () => {
  const b = document.getElementById('elxBrand'); if (b) b.textContent = ELX.BRAND.name;
  document.querySelectorAll('[data-i18n="footCredit"],[data-i18n="footDisclaimer"]').forEach(el => {
    new MutationObserver(() => { el.hidden = !el.textContent.trim(); }).observe(el, { childList: true, characterData: true, subtree: true });
    el.hidden = !el.textContent.trim();
  });
});
