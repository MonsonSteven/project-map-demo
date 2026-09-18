// Synthetic marker generator (portfolio demo).
//
// Produces markers.json for the Past Projects map with fully-invented pins: real
// (public) panhandle town centers are used as anchors, but every pin is jittered a
// few miles off, so no pin maps to a real project or address. Categories, product
// sub-labels and the "has photos" flag are randomized to a realistic mix.
//
// Run:  node scripts/gen-markers.mjs   (writes ../markers.json)
// Change COUNT to match whatever total volume you want the map to show.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const COUNT = 200; // total pins — adjust to taste / to match a real map's volume
const here = dirname(fileURLToPath(import.meta.url));

// Per-town spread presets (lat/lng offset bounds, degrees). Coastal towns spread
// ONLY inland so jittered pins never land in the Gulf or Mobile Bay:
//   IN = inland town, spread any direction
//   N  = water to the south (Gulf/sound) → spread north
//   E  = water to the west (Mobile Bay)  → spread east
const IN = [-0.03, 0.03, -0.03, 0.03];
const N  = [0.004, 0.038, -0.03, 0.03];
const E  = [-0.03, 0.03, 0.006, 0.04];

// Anchor towns (public geography) with a rough weight (bigger metro → more jobs) and a
// spread preset. Barrier-island / narrow-peninsula towns (Pensacola Beach, Gulf Breeze,
// Destin) are intentionally omitted — water on multiple sides leaves no safe spread.
const TOWNS = [
  ["Pensacola", "FL", 30.46, -87.24, 9, ...N],
  ["Navarre", "FL", 30.42, -86.86, 4, ...N],
  ["Milton", "FL", 30.63, -87.04, 4, ...IN],
  ["Pace", "FL", 30.60, -87.16, 3, ...IN],
  ["Cantonment", "FL", 30.61, -87.34, 2, ...IN],
  ["Crestview", "FL", 30.76, -86.57, 5, ...IN],
  ["Fort Walton Beach", "FL", 30.44, -86.61, 5, ...N],
  ["Niceville", "FL", 30.52, -86.48, 3, ...N],
  ["Mary Esther", "FL", 30.42, -86.69, 2, ...N],
  ["Foley", "AL", 30.41, -87.68, 4, ...IN],
  ["Robertsdale", "AL", 30.55, -87.71, 3, ...IN],
  ["Gulf Shores", "AL", 30.30, -87.68, 3, ...N],
  ["Daphne", "AL", 30.60, -87.87, 4, ...E],
  ["Fairhope", "AL", 30.52, -87.87, 3, ...E],
  ["Spanish Fort", "AL", 30.67, -87.88, 2, ...E],
  ["Mobile", "AL", 30.68, -88.12, 7, ...IN],
];

// Parent category → its product sub-labels (shown on the detail line).
const CATEGORIES = {
  "Windows & Doors": ["Double-Hung Windows", "Casement Windows", "Sliding Glass Door", "Entry Door", "Bay Window"],
  "Tubs & Showers": ["Tub-to-Shower Conversion", "Walk-in Tub", "Shower Remodel", "Bath Liner"],
  "Patio Products": ["Pergola", "Patio Cover", "Screen Room", "Sunroom"],
  "Siding": ["Vinyl Siding", "Fiber-Cement Siding", "Insulated Siding"],
  "Decks": ["Composite Deck", "Wood Deck", "Deck Railing"],
  "More Products": ["Gutters", "Roofing", "Insulation", "Soffit & Fascia"],
};
const CAT_NAMES = Object.keys(CATEGORIES);

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const off = (lo, hi) => lo + Math.random() * (hi - lo);

// Weighted town picker.
const WEIGHT_TOTAL = TOWNS.reduce((n, t) => n + t[4], 0);
function pickTown() {
  let r = Math.random() * WEIGHT_TOTAL;
  for (const t of TOWNS) if ((r -= t[4]) <= 0) return t;
  return TOWNS[0];
}

const projects = [];
for (let i = 0; i < COUNT; i++) {
  const [city, state, lat, lng, , latLo, latHi, lngLo, lngHi] = pickTown();
  // 1 category most of the time, 2 occasionally (a multi-trade job).
  const primary = rand(CAT_NAMES);
  const cats = [primary];
  if (Math.random() < 0.22) {
    let second = rand(CAT_NAMES);
    if (second !== primary) cats.push(second);
  }
  const products = cats.flatMap((c) => {
    const list = CATEGORIES[c];
    const n = 1 + (Math.random() < 0.3 ? 1 : 0);
    const picks = new Set();
    while (picks.size < n) picks.add(rand(list));
    return [...picks];
  });

  projects.push({
    RowKey: `demo-${String(i + 1).padStart(4, "0")}`,
    Latitude: (lat + off(latLo, latHi)).toFixed(5),
    Longitude: (lng + off(lngLo, lngHi)).toFixed(5),
    City: city,
    State: state,
    DisplayProjectTypes: cats.join(", "),
    Products: products.join(", "),
    HasAsset: Math.random() < 0.7,
  });
}

const out = {
  lat: 30.5,
  lng: -87.2,
  pastProjectZoomLevel: 8,
  generatedAt: new Date().toISOString(),
  projects,
};

writeFileSync(join(here, "..", "markers.json"), JSON.stringify(out, null, 1));
console.log(`✅ wrote ${projects.length} synthetic pins to markers.json`);
