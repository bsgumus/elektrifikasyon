// Ember Labs · Türkiye Electrification Simulator — site configuration (branding and API).
// Model coefficients are NOT here; they live only in worker/src/model-data.js (served by the Worker).
// Ember Labs overlay (ember-labs-branding skill): together with labs/style.css this is the ONLY file that differs from the
// elektrifikasyon.org site. tools/publish_labs.sh copies it to docs/config.js in the Labs repository
// (ember-labs-org/turkiye-electrification-simulator), which holds only the docs/ site (see labs/NOTES.md).
window.ELX = {
  // The Labs site calls the SAME Worker as elektrifikasyon.org (it stays on Bahadır's Cloudflare account;
  // the Worker serves only /api/*). The Labs origin https://ember-labs-org.github.io is in the Worker's
  // default ALLOWED_ORIGINS (worker/src/index.js, wrangler.toml); any other origin is answered with 403.
  API_URL: 'https://elektrifikasyon.bahadirsgumus.workers.dev',
  // Ember Labs tools are embedded in the Labs site, which already shows the tool's name,
  // the maker credit and the Labs disclaimer (ember-labs-branding, rule 7). So nothing here.
  BRAND: { name: '', url: '' },
  FOOTER: { tr: '', en: '' },
  CREDIT: { tr: '', en: '' },
  DISCLAIMER: { tr: '', en: '' },
};
document.addEventListener('DOMContentLoaded', () => {
  const b = document.getElementById('elxBrand'); if (b) b.textContent = ELX.BRAND.name;
  document.querySelectorAll('[data-i18n="footCredit"],[data-i18n="footDisclaimer"]').forEach(el => {
    new MutationObserver(() => { el.hidden = !el.textContent.trim(); }).observe(el, { childList: true, characterData: true, subtree: true });
    el.hidden = !el.textContent.trim();
  });
});
