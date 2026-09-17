# Past Projects Map — Demo

A live, data-driven map of completed home-improvement projects for a field-services contractor.
Projects cluster by density (the "how many, and where" story) and individual pins are color-coded by
project type, with filters, search, a "near me" locator, fullscreen, and a quote call-to-action.

> **Portfolio note.** This is a public demo of a system I designed and shipped. It runs on **fully
> synthetic data** — the ~200 pins are scattered around real (public) town centers but jittered off
> any real location, and all project types/labels are invented. The client is anonymized; no real
> project, customer, or business data is present.

## How it works

- **100% static** — plain HTML + [Leaflet](https://leafletjs.com/) + marker clustering, rendered over
  keyless vector basemap tiles (OpenFreeMap / MapLibre GL). No API key, no billing, no build step.
- **Data-driven** — the map reads `markers.json` and re-renders with zero code changes. In production
  that file is generated from the crew's field-photo system (CompanyCam) — projects geocoded and
  classified into color-coded categories from their photo labels. Here it's synthetic.
- **Privacy-safe by design** — pins never show a customer name; only project *type* and *city, state*.
- **Conversion path** — the "near me" popup carries a `utm_promo` tag so leads from the map are
  attributable end to end.

## Run it locally

It must be served over http (the page fetches `markers.json`):

```bash
python -m http.server 8139   # then open http://localhost:8139
```

## Regenerate the synthetic data

```bash
node scripts/gen-markers.mjs   # writes markers.json
```

Change `COUNT` at the top of `scripts/gen-markers.mjs` to match whatever total volume you want the
map to show.

## Deploy

Any static host works:

- **GitHub Pages** — push this folder to a repo and enable Pages (the `.nojekyll` file is already
  here so Pages serves it as-is). Optionally add a `CNAME` for a custom domain.
- **Vercel / Netlify** — import the repo (or drag-drop the folder); it's detected as a static site,
  no build command needed.
