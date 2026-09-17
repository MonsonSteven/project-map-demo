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

// Anchor towns (public geography) with a rough weight (bigger metro → more jobs).
const TOWNS = [
  ["Pensacola", "FL", 30.42, -87.22, 9],
  ["Gulf Breeze", "FL", 30.36, -87.16, 3],
  ["Pensacola Beach", "FL", 30.33, -87.14, 2],
  ["Navarre", "FL", 30.40, -86.86, 4],
  ["Milton", "FL", 30.63, -87.04, 4],
  ["Pace", "FL", 30.60, -87.16, 3],
  ["Cantonment", "FL", 30.61, -87.34, 2],
  ["Crestview", "FL", 30.76, -86.57, 5],
  ["Fort Walton Beach", "FL", 30.42, -86.62, 5],
  ["Destin", "FL", 30.39, -86.50, 4],
  ["Niceville", "FL", 30.52, -86.48, 3],
  ["Mary Esther", "FL", 30.41, -86.69, 2],
  ["Foley", "AL", 30.41, -87.68, 4],
  ["Gulf Shores", "AL", 30.25, -87.70, 3],
  ["Daphne", "AL", 30.60, -87.90, 4],
  ["Fairhope", "AL", 30.52, -87.90, 3],
  ["Mobile", "AL", 30.69, -88.04, 7],
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
const jitter = (deg) => (Math.random() - 0.5) * deg;

// Weighted town picker.
const WEIGHT_TOTAL = TOWNS.reduce((n, t) => n + t[4], 0);
function pickTown() {
  let r = Math.random() * WEIGHT_TOTAL;
  for (const t of TOWNS) if ((r -= t[4]) <= 0) return t;
  return TOWNS[0];
}

const projects = [];
for (let i = 0; i < COUNT; i++) {
  const [city, state, lat, lng] = pickTown();
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
    Latitude: (lat + jitter(0.08)).toFixed(5),
    Longitude: (lng + jitter(0.08)).toFixed(5),
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
