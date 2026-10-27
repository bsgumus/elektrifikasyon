// Ember Labs · Türkiye Electrification Simulator — site configuration (branding and API).
// Model coefficients are NOT here; they live only in worker/src/model-data.js (served by the Worker).
// Ember Labs overlay: together with labs/style.css this is the ONLY file that differs from the
// elektrifikasyon.org site. tools/publish_labs.sh copies it to docs/config.js in the Labs repository
// (ember-labs-org/turkiye-electrification-simulator), which holds only the docs/ site (see labs/NOTES.md).
window.ELX = {
  // The Labs site calls the SAME Worker as elektrifikasyon.org (it stays on Bahadır's Cloudflare account;
  // the Worker serves only /api/*). The Labs origin https://ember-labs-org.github.io is in the Worker's
  // default ALLOWED_ORIGINS (worker/src/index.js, wrangler.toml); any other origin is answered with 403.
  API_URL: 'https://elektrifikasyon.bahadirsgumus.workers.dev',
  BRAND: { name: 'Ember Labs · Türkiye Electrification Simulator', url: 'https://ember-energy.org' },   // TBD: Labs landing URL, if one exists
  FOOTER: {
    // TBD: confirm wording and licence line with Ember comms (no footer text in the branding guidelines).
    tr: '© 2026 Ember — Ember Labs. Deneysel bir araçtır; resmi bir Ember yayını değildir.',
    en: '© 2026 Ember — Ember Labs. An experimental tool; not an official Ember publication.',
  },
  CREDIT: {
    tr: 'Yapan: Bahadır Gümüş (elektrifikasyon.org)',
    en: 'Made by Bahadır Gümüş (elektrifikasyon.org)',
  },
  DISCLAIMER: {
    // TBD: the branding guidelines carry no Labs disclaimer text; standard "experimental, not an official
    // Ember publication" wording is used below until Ember comms confirms the official version.
    tr: 'Ember Labs, Ember analistlerinin deneysel çalışmalarını paylaştığı bir alandır. Bu simülatör bir prototiptir: '
      + 'Ember’ın editoryal incelemesinden geçmemiştir, resmi bir Ember yayını değildir ve sonuçları Ember analizi olarak '
      + 'alıntılanmamalıdır. Katsayılar ve kaynaklar her sayfanın yöntem notlarında açıklanmıştır.',
    en: 'Ember Labs is where Ember analysts share experimental work. This simulator is a prototype: it has not been through '
      + 'Ember’s editorial review, it is not an official Ember publication, and its results should not be cited as Ember '
      + 'analysis. Coefficients and sources are documented in the methodology notes on each page.',
  },
};
document.addEventListener('DOMContentLoaded', () => {
  const b = document.getElementById('elxBrand'); if (b) b.textContent = ELX.BRAND.name;
  document.querySelectorAll('[data-i18n="footCredit"],[data-i18n="footDisclaimer"]').forEach(el => {
    new MutationObserver(() => { el.hidden = !el.textContent.trim(); }).observe(el, { childList: true, characterData: true, subtree: true });
    el.hidden = !el.textContent.trim();
  });
});
