# Ember Labs overlay — how to apply

`labs/` holds the two files that turn the elektrifikasyon.org site into the
**Ember Labs · Türkiye Electrification Simulator**. Nothing else changes: the four
page HTMLs, the Worker and the local dev server are shared verbatim with the upstream
repository. Branding, footer, credit, disclaimer and the API URL live only in
`docs/config.js` and `docs/assets/style.css`, which is why the overlay is exactly these two files.

| Overlay file | Replaces (in the Labs repo) | What it carries |
|---|---|---|
| `labs/config.js` | `docs/config.js` | `window.ELX`: `API_URL`, `BRAND`, `FOOTER`, `CREDIT`, `DISCLAIMER` (TR/EN) + the unchanged `DOMContentLoaded` hook |
| `labs/style.css` | `docs/assets/style.css` | Ember palette and Poppins typography; same custom-property names and rule skeleton as upstream |

> **GitHub Pages:** in the Labs repo too, publish from the `docs/` folder (Settings → Pages → branch `main`, folder `/docs`) so that `worker/`, `tools/` and `labs/` are never served.

## 1. Apply the overlay in the Labs repository

```sh
cp labs/config.js  docs/config.js
cp labs/style.css  docs/assets/style.css
```

The pages load both by relative path (`<link rel="stylesheet" href="assets/style.css">`,
`<script src="config.js">`), so no HTML edit is needed. `labs/` itself can stay in the
repo (it is inert) or be deleted after copying — keeping it makes the next sync easier.

## 2. Deploy the Worker under Ember's Cloudflare account and set the URL

1. Deploy `worker/` under Ember's Cloudflare account — either `cd worker && npx wrangler deploy`
   or paste the whole of `worker/dist/worker.js` into Cloudflare → Workers → *Edit code* → *Deploy*
   (see `worker/README.md`). The Worker is stateless: no KV, R2, D1, secrets or cron triggers.
2. In the Worker's *Settings → Variables*, set:
   - `ALLOWED_ORIGINS` — comma-separated browser origins allowed to call `/api/*`, e.g.
     `https://<org>.github.io` or the custom Labs domain (scheme + host, no path, no trailing slash).
     The Worker answers `403` to any other origin, so the Labs site will not work until this is set.
     Both `www` and apex must be listed if both resolve.
   - `SITE_URL` — where non-`/api/` requests are `301`-redirected (the Labs site URL).
   `wrangler.toml` still carries the elektrifikasyon.org defaults in `[vars]`; override them in the
   dashboard or edit the file in the Labs fork.
3. Put the resulting Worker URL into `docs/config.js` → `ELX.API_URL`, replacing the
   `https://<labs-worker>.workers.dev` placeholder. Local development is unaffected: on
   `localhost` the pages call the Python mirror (`python3 tools/dev_api_server.py`, port 8816) instead.

## 3. Weekly sync from upstream

Pull the upstream repository into the Labs repo on the usual schedule. Only two paths can
conflict — `docs/config.js` and `docs/assets/style.css` — and in both cases the Labs copy must win.
To make that automatic, add a `.gitattributes` in the Labs repo and register the `ours` driver once:

```
docs/config.js         merge=ours
docs/assets/style.css  merge=ours
```

```sh
git config merge.ours.driver true
```

After each sync, diff `labs/style.css` against the new upstream `docs/assets/style.css` **by
custom-property names and selectors** (not values): if upstream adds a token or a rule, add the same
token/rule with Ember values to `labs/style.css` and re-copy. The check used to validate this
overlay is a one-liner: extract `--name` tokens from both files and compare the sets (see the
verification note at the end).

## 4. Open items (TBD)

- **Ember logo / wordmark.** No Ember logo asset exists in this repository and the brand rules forbid
  redrawing or approximating it, so the nav shows `BRAND.name` as text in `<span class="brand" id="elxBrand">`.
  To use the official wordmark, add the logo file (full-colour on light / inverted on dark backgrounds)
  and replace the `<span>` with an `<img>` in the four HTML heads — this is the only HTML change the
  overlay would ever need. Keep the logo ≥ 85 px wide with clear space of one "M"-width.
- **Footer, disclaimer and licence wording.** The branding guidelines contain no Labs footer or
  disclaimer text; `config.js` uses standard "experimental, not an official Ember publication" wording
  in TR and EN. Confirm with Ember comms, and add the data licence line if Labs tools carry one.
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

- Custom-property name sets in `labs/style.css` and `assets/style.css` are identical in all three blocks
  (`:root`, `@media (prefers-color-scheme: dark)`, `:root[data-theme="dark"]`).
- Every selector of `assets/style.css` is present in `labs/style.css`; the only addition is `h1::after`
  (the Ember Transition bar) plus the `@import` for Poppins.
- All hex colours in `labs/style.css` belong to the Ember palette (plus `#000000`/`#ffffff`).
- `labs/config.js` parses as JavaScript (checked with `osascript -l JavaScript`, no Node on the machine).
