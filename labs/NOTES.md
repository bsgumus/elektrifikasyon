# Ember Labs copy — how it is published

The Ember Labs version of the site lives in its own repository,
**`ember-labs-org/turkiye-electrification-simulator`**, and contains **only the site**: the
`docs/` folder (four page HTMLs, `config.js`, `assets/style.css`, `.nojekyll`) plus a short README.
GitHub Pages publishes it from `/docs` at
<https://ember-labs-org.github.io/turkiye-electrification-simulator/>.

The Worker and the model (`worker/`), the dev tools (`tools/`) and this overlay (`labs/`) stay in
this private repository and on Bahadır's Cloudflare account. The Labs site calls **the same Worker**
(`ELX.API_URL = https://elektrifikasyon.bahadirsgumus.workers.dev`); its origin
`https://ember-labs-org.github.io` is in the Worker's default `ALLOWED_ORIGINS`
(`worker/src/index.js`, `worker/wrangler.toml`). Nothing model-related is ever pushed to the Labs repo.

`labs/` holds the two files that turn the elektrifikasyon.org site into the
**Ember Labs · Türkiye Electrification Simulator**. Nothing else differs: the four page HTMLs are
copied verbatim. Branding, footer, credit, disclaimer and the API URL live only in
`docs/config.js` and `docs/assets/style.css`, which is why the overlay is exactly these two files.

| Overlay file | Becomes (in the Labs repo) | What it carries |
|---|---|---|
| `labs/config.js` | `docs/config.js` | `window.ELX`: `API_URL` (shared Worker), `BRAND`, `FOOTER`, `CREDIT`, `DISCLAIMER` (TR/EN) + the unchanged `DOMContentLoaded` hook |
| `labs/style.css` | `docs/assets/style.css` | Ember palette and Poppins typography; same custom-property names and rule skeleton as upstream |

`docs/CNAME` is deliberately **not** copied: in the Labs repo it would try to claim
`www.elektrifikasyon.org` for the Labs Pages site.

## 1. One-time setup

Clone the Labs repository next to this one (the publish script looks for it at
`../elektrifikasyon-labs`; set `LABS_REPO=/path/to/clone` to use another location):

```sh
cd ..
git clone https://github.com/ember-labs-org/turkiye-electrification-simulator.git elektrifikasyon-labs
```

## 2. Publishing a site change (every time the site changes)

1. Commit the change here (upstream) as usual.
2. Run from this repository:

```sh
tools/publish_labs.sh                       # sync docs/ + overlay → ../elektrifikasyon-labs, commit, push
tools/publish_labs.sh --dry-run             # only show what would change
tools/publish_labs.sh --no-push             # commit in the Labs clone, push later
tools/publish_labs.sh -m "Fix hane chart"   # custom commit message
```

The script: pulls the Labs clone (`--ff-only`), mirrors `docs/` into `Labs/docs/` (deleting files that
no longer exist upstream, excluding `CNAME`), copies the two overlay files over `config.js` and
`assets/style.css`, verifies the overlay (no `<labs-worker>` placeholder, custom-property sets of
`labs/style.css` and `docs/assets/style.css` identical, `config.js` parses), then commits `docs/` and
pushes to `origin main` of the Labs repo. The commit message records the upstream commit hash.

Only `docs/` is managed by the script; the Labs repo's README (and anything Ember adds there) is
left alone.

## 3. Keeping the overlay in step with upstream

When `docs/assets/style.css` gains a token or a rule, add the same token/rule with Ember values to
`labs/style.css` before publishing — the script refuses to publish if the custom-property name sets
differ. When `docs/config.js` gains a field, add it to `labs/config.js` too.

## 4. Open items (TBD)

- **Ember logo / wordmark.** No Ember logo asset exists in this repository and the brand rules forbid
  redrawing or approximating it, so the nav shows `BRAND.name` as text in `<span class="brand" id="elxBrand">`.
  To use the official wordmark, add the logo file (full-colour on light / inverted on dark backgrounds)
  and replace the `<span>` with an `<img>` in the four HTML heads — this is the only HTML change the
  overlay would ever need. Keep the logo ≥ 85 px wide with clear space of one "M"-width.
- **Footer, disclaimer and licence wording.** The branding guidelines contain no Labs footer or
  disclaimer text; `config.js` uses standard "experimental, not an official Ember publication" wording
  in TR and EN. Confirm with Ember comms, and add the data licence line if Labs tools carry one.
- **`BRAND.url`** points at `https://ember-energy.org`; change it if a Labs landing page exists.
- **Page `<title>` tags** still read "Türkiye Elektrifikasyon Simülatörü" etc.; they are not driven by
  `config.js`. Change them in the HTML if the browser tab should say "Ember Labs".
- **SVG chart labels** in `otomobil.html` and `ornek-hesaplama.html` set `font-family: system-ui` inline
  (`#tmap text`, `#lchart text`, …), so they stay in the system font even though the page body is Poppins.
  Changing those inline rules to `font-family: inherit` would bring them in line; it is an HTML edit.
- **Poppins is loaded from Google Fonts** via `@import`. If Ember prefers self-hosted fonts (privacy /
  GDPR), replace the `@import` line with local `@font-face` rules — nothing else depends on it.
- **`--fossil` is Orange 3 (#E04B00), not Ember's "fossil fuels" Brown.** Brown 2 (#B6B0AF) is visually
  identical to the Neutral 2 grey used by `--baseline` for non-electrifiable segments, so the two bar
  types would merge. If the data-viz team wants Brown, a darker shade (Brown 4/5) is the only safe option.
- **Dark mode** uses black page / Neutral 5 cards with Blue 4 fill on a Blue 5 track; the fill stays dark
  enough for the pages' inline white share labels (≈ 6.5:1). Blue 3 would be livelier but drops the
  label to ≈ 2.7:1.

## Verification performed when the overlay was written

- Custom-property name sets in `labs/style.css` and `docs/assets/style.css` are identical in all three blocks
  (`:root`, `@media (prefers-color-scheme: dark)`, `:root[data-theme="dark"]`).
- Every selector of `docs/assets/style.css` is present in `labs/style.css`; the only addition is `h1::after`
  (the Ember Transition bar) plus the `@import` for Poppins.
- All hex colours in `labs/style.css` belong to the Ember palette (plus `#000000`/`#ffffff`).
- `labs/config.js` parses as JavaScript (checked with `osascript -l JavaScript`, no Node on the machine).
- The four pages reference `config.js` and `assets/style.css` by relative path and contain no absolute
  `/…` URLs, so they work under the `/turkiye-electrification-simulator/` sub-path of the Labs Pages site.
