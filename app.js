/*
 * Past Projects map — Leaflet + OpenStreetMap renderer.
 *
 * No API key, no billing, no quota — renders in any browser.
 *
 * Shows the CMO's three requirements: AMOUNT (clustered counts that break into
 * individual jobs as you zoom), WHERE (location), and TYPE (filter, once type
 * data is available). Customer names are never shown — pins/cards display
 * "Type — City, ST" or just "City, ST".
 *
 * Swap markers.json for an updated pull and this re-renders with no code changes.
 */

// Pin + cluster colors live in the CSS in index.html (the "MAP COLORS" block):
// pins use the `.project-pin` rule; clusters use `.marker-cluster-*`. Recolor there.

let map, clusterGroup;
let allProjects = [];
const markerByKey = {};

// Compact embed mode (?compact=1): hide the side list so the map fills the frame.
// Used by the homepage iframe, which gets ~half the width of the past-projects page.
// Applied to <html> at parse time (before render) so there's no sidebar flash, and
// force-hides at ANY width (not just the mobile breakpoint). The default embed —
// no param — is unaffected. See index.html `.compact` rules.
(function applyEmbedMode() {
  try {
    const c = new URLSearchParams(location.search).get("compact");
    if (c && c !== "0" && c !== "false") document.documentElement.classList.add("compact");
  } catch (_) { /* no-op: query parsing should never block the map */ }
})();

// The six parent categories (see scripts/label-map.mjs). Order = priority: when a
// project matches several (match-any), the first one here is its PRIMARY category,
// which picks the pin color deterministically. Colorblind-safe palette shared with
// a colorblind-safe palette; "More Products" is a neutral slate so it recedes.
const CATEGORY_ORDER = [
  "Windows & Doors", "Tubs & Showers", "Patio Products", "Siding", "Decks", "More Products",
];
const CATEGORY_COLOR = {
  "Windows & Doors": "#2563eb",
  "Tubs & Showers":  "#0d9488",
  "Patio Products":  "#d97706",
  "Siding":          "#7c3aed",
  "Decks":           "#15803d",
  "More Products":   "#64748b",
};
function primaryCategory(p) {
  const cats = projectTypes(p);
  return CATEGORY_ORDER.find((c) => cats.includes(c)) || "More Products";
}
function categoryColor(p) {
  return CATEGORY_COLOR[primaryCategory(p)] || CATEGORY_COLOR["More Products"];
}
// The specific product sub-labels ("Tub to Shower", "Pergola"), for the detail line.
function productLabels(p) {
  return (p.Products || "").split(",").map((t) => t.trim()).filter(Boolean);
}

function locStr(p) {
  return [p.City, p.State].filter(Boolean).join(", ");
}
// Privacy-safe label — NEVER the customer name.
function displayTitle(p) {
  const loc = locStr(p);
  if (p.DisplayProjectTypes) return `${p.DisplayProjectTypes}${loc ? " — " + loc : ""}`;
  return loc || "Past project";
}

function distinctTypes(projects) {
  const set = new Set();
  projects.forEach((p) =>
    (p.DisplayProjectTypes || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .forEach((t) => set.add(t))
  );
  // Order by category priority (falling back to alpha for anything unexpected).
  return [...set].sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a), ib = CATEGORY_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}
function projectTypes(p) {
  return (p.DisplayProjectTypes || "").split(",").map((t) => t.trim()).filter(Boolean);
}

function applyFilters() {
  const type = document.getElementById("filter-type").value;
  const q = document.getElementById("filter-search").value.trim().toLowerCase();
  return allProjects.filter((p) => {
    if (type && !projectTypes(p).includes(type)) return false;
    if (q) {
      const hay = `${p.City} ${p.State} ${p.DisplayProjectTypes || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function popupHtml(p) {
  const products = productLabels(p);
  return `
    <div class="pp-info">
      <div class="pp-info-title">${displayTitle(p)}</div>
      ${p.DisplayProjectTypes && locStr(p) ? `<div class="pp-info-loc">${locStr(p)}</div>` : ""}
      ${products.length ? `<div class="pp-info-products">${products.join(" · ")}</div>` : ""}
      ${p.HasAsset ? `<div class="pp-info-meta">📷 Project has photos on file</div>` : ""}
    </div>`;
}

function focusProject(p) {
  const marker = markerByKey[p.RowKey];
  if (!marker) return;
  map.setView(marker.getLatLng(), Math.max(map.getZoom(), 12));
  // Open within its cluster if needed.
  clusterGroup.zoomToShowLayer(marker, () => marker.openPopup());
}

function renderList(projects) {
  const panel = document.getElementById("project-list");
  if (projects.length === 0) {
    panel.innerHTML = `<div class="empty">No projects match the current filters.</div>`;
    return;
  }
  // Cap the rendered list for performance; the map still shows all.
  const LIST_CAP = 500;
  const shown = projects.slice(0, LIST_CAP);
  panel.innerHTML =
    shown
      .map(
        (p) => `
      <button class="project-card" data-key="${p.RowKey}" style="border-left:4px solid ${categoryColor(p)}">
        <div class="card-title">${displayTitle(p)}</div>
        ${p.DisplayProjectTypes && locStr(p) ? `<div class="card-loc">${locStr(p)}</div>` : ""}
        ${productLabels(p).length ? `<div class="card-products">${productLabels(p).join(" · ")}</div>` : ""}
        ${p.HasAsset ? `<span class="card-photo">📷 Photos</span>` : ""}
      </button>`
      )
      .join("") +
    (projects.length > LIST_CAP
      ? `<div class="empty">…and ${projects.length - LIST_CAP} more on the map.</div>`
      : "");
  panel.querySelectorAll(".project-card").forEach((el) => {
    el.addEventListener("click", () => {
      const p = allProjects.find((x) => String(x.RowKey) === el.dataset.key);
      if (p) focusProject(p);
    });
  });
}

function render() {
  const filtered = applyFilters();

  Object.keys(markerByKey).forEach((k) => delete markerByKey[k]);
  clusterGroup.clearLayers();

  const markers = [];
  filtered.forEach((p) => {
    const lat = parseFloat(p.Latitude), lng = parseFloat(p.Longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;
    // Pin fill is the project's PRIMARY category color (the "type" story); the
    // white stroke + geometry are uniform. Cluster bubbles stay the blue density
    // ramp (the "amount" story) — see the CSS in index.html.
    const marker = L.circleMarker([lat, lng], {
      radius: 6, className: "project-pin",
      fillColor: categoryColor(p), color: "#ffffff", weight: 1.5, fillOpacity: 0.92,
    });
    marker.bindPopup(popupHtml(p));
    markerByKey[p.RowKey] = marker;
    markers.push(marker);
  });
  clusterGroup.addLayers(markers);

  renderList(filtered);
  const rc = document.getElementById("result-count");
  rc.textContent =
    filtered.length === allProjects.length
      ? `${allProjects.length.toLocaleString()} completed projects`
      : `${filtered.length.toLocaleString()} of ${allProjects.length.toLocaleString()} projects`;

  // Keep the "near me" count in sync with the active filter (no-op until located).
  refreshNearMe();
}

// --- Map controls ----------------------------------------------------------

// Density legend (bottom-right). Colors pull from the same CSS vars as the map.
function addLegend(map) {
  const legend = L.control({ position: "bottomright" });
  legend.onAdd = () => {
    const div = L.DomUtil.create("div", "map-legend");
    div.setAttribute("role", "img");
    div.setAttribute(
      "aria-label",
      "Legend: cluster bubbles are shaded light to dark blue by how many projects are in an area; individual project pins are colored by project type (Windows & Doors, Tubs & Showers, Patio Products, Siding, Decks, More Products)."
    );
    const catKey = CATEGORY_ORDER.map(
      (c) => `<div class="legend-cat"><span class="lg-dot" style="background:${CATEGORY_COLOR[c]}"></span>${c}</div>`
    ).join("");
    div.innerHTML =
      '<div class="legend-title">Projects in an area</div>' +
      '<div class="legend-ramp" aria-hidden="true"><span>Fewer</span>' +
        '<i class="lg lg-s"></i><i class="lg lg-m"></i><i class="lg lg-l"></i>' +
        '<span>More</span></div>' +
      '<div class="legend-sep" aria-hidden="true"></div>' +
      '<div class="legend-title">Project type</div>' +
      `<div class="legend-cats" aria-hidden="true">${catKey}</div>`;
    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  legend.addTo(map);
}

// Fullscreen toggle (top-right). Uses the native Fullscreen API on the whole app
// so the filter bar stays usable. The button becomes a clear ✕ while fullscreen
// (Esc also exits). NOTE: when embedded, the host <iframe> needs allowfullscreen.
let fsButton = null;
function fsIcon(isFull) {
  return isFull
    ? '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>'
    : '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M3 7V3h4M17 7V3h-4M3 13v4h4M17 13v4h-4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) {
      Promise.resolve(req.call(el)).catch(() => {
        alert('Fullscreen was blocked. If this map is embedded, the page’s <iframe> needs the "allowfullscreen" attribute.');
      });
    }
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
  }
}
function addFullscreenControl(map) {
  const ctrl = L.control({ position: "topright" });
  ctrl.onAdd = () => {
    const btn = L.DomUtil.create("button", "map-fs-btn");
    btn.type = "button";
    btn.title = "View fullscreen";
    btn.setAttribute("aria-label", "Enter fullscreen");
    btn.innerHTML = fsIcon(false);
    L.DomEvent.disableClickPropagation(btn);
    L.DomEvent.on(btn, "click", toggleFullscreen);
    fsButton = btn;
    return btn;
  };
  ctrl.addTo(map);
  document.addEventListener("fullscreenchange", () => {
    const full = !!document.fullscreenElement;
    if (fsButton) {
      fsButton.innerHTML = fsIcon(full);
      fsButton.title = full ? "Exit fullscreen" : "View fullscreen";
      fsButton.setAttribute("aria-label", full ? "Exit fullscreen" : "Enter fullscreen");
      fsButton.classList.toggle("is-full", full);
    }
    if (map) setTimeout(() => map.invalidateSize(), 120);
  });
}

// --- "Near me" geolocation -------------------------------------------------

const RADIUS_OPTIONS = [5, 10, 25, 50];   // selectable radii (miles)
let nearRadiusMi = 25;                     // current radius (default 25)
let youMarker = null;
let nearCircle = null;                     // translucent "reach" circle on the map
let userLatLng = null;                     // last located position (client-only)
// The lead-conversion CTA shown in the "near me" popup. utm_promo tags the lead
// source so the site's form capture/attribution can credit it to this map. Canonical
// trailing-slash URL so the query param survives any redirect.
const CTA_URL = "https://summithome.example/quote/?utm_promo=past-projects-map";

// Haversine distance in miles.
function milesBetween(aLat, aLng, bLat, bLng) {
  const R = 3958.8, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function announce(msg) {
  const el = document.getElementById("sr-status");
  if (el) el.textContent = msg;
}

function youIcon() {
  return L.divIcon({
    className: "you-here",
    html: '<span class="you-dot"></span>',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

// The active type filter, or "" for none — makes the "near me" count type-aware.
function activeTypeLabel() {
  const el = document.getElementById("filter-type");
  return el ? el.value : "";
}

// Count projects within the current radius of the user, respecting the active
// type filter (so "312 Tubs & Showers projects near you", not the grand total).
function nearMeCount() {
  const projs = applyFilters();
  let near = 0, nearest = Infinity;
  projs.forEach((p) => {
    const la = +p.Latitude, ln = +p.Longitude;
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return;
    const d = milesBetween(userLatLng.lat, userLatLng.lng, la, ln);
    if (d <= nearRadiusMi) near++;
    if (d < nearest) nearest = d;
  });
  return { near, nearest };
}

// Popup body: type-aware count line + radius selector + the conversion CTA.
function nearMePopupHtml() {
  const { near, nearest } = nearMeCount();
  const type = activeTypeLabel();
  const noun = type ? `${type} project` : "completed project";
  const line =
    near > 0
      ? `<strong>${near.toLocaleString()}</strong> ${noun}${near === 1 ? "" : "s"} within ${nearRadiusMi} miles of you`
      : `No ${type ? type + " projects" : "projects"} within ${nearRadiusMi} miles — the nearest is about ${Math.round(nearest)} miles away`;
  const radiusBtns = RADIUS_OPTIONS.map(
    (mi) => `<button type="button" class="radius-btn${mi === nearRadiusMi ? " active" : ""}" data-mi="${mi}" aria-pressed="${mi === nearRadiusMi}">${mi} mi</button>`
  ).join("");
  return `
    <div class="pp-info nearme-pop">
      <div class="pp-info-title">📍 You are here</div>
      <div class="pp-info-loc">${line}</div>
      <div class="radius-row" role="group" aria-label="Search radius in miles">${radiusBtns}</div>
      <a class="cta-btn" href="${CTA_URL}" target="_blank" rel="noopener">Get a free quote &rarr;</a>
    </div>`;
}

// Draw/refresh the translucent radius circle centered on the user.
function updateNearCircle() {
  if (!userLatLng) return;
  const meters = nearRadiusMi * 1609.34;
  if (nearCircle) map.removeLayer(nearCircle);
  nearCircle = L.circle([userLatLng.lat, userLatLng.lng], {
    radius: meters, className: "near-circle",
    color: "#1565c0", weight: 1.5, fillColor: "#1565c0", fillOpacity: 0.07,
  }).addTo(map);
}

// (Re)render the whole "near me" state: circle, popup, and (optionally) the view.
function renderNearMe(recenter) {
  if (!userLatLng) return;
  updateNearCircle();
  if (!youMarker) {
    youMarker = L.marker([userLatLng.lat, userLatLng.lng], {
      icon: youIcon(), zIndexOffset: 1000, alt: "Your location", keyboard: false,
    }).addTo(map);
  }
  youMarker.bindPopup(nearMePopupHtml());
  if (recenter) map.fitBounds(nearCircle.getBounds(), { padding: [30, 30], maxZoom: 12 });
  youMarker.openPopup();
  const { near, nearest } = nearMeCount();
  const type = activeTypeLabel();
  announce(
    near > 0
      ? `${near} ${type ? type + " " : ""}projects within ${nearRadiusMi} miles of your location.`
      : `No ${type ? type + " " : ""}projects within ${nearRadiusMi} miles; nearest about ${Math.round(nearest)} miles.`
  );
}

// Lightweight update when the type filter changes while "near me" is active:
// refresh the circle + the open popup's count, without moving the map.
function refreshNearMe() {
  if (!userLatLng) return;
  updateNearCircle();
  if (youMarker && youMarker.isPopupOpen()) youMarker.setPopupContent(nearMePopupHtml());
}

// Clear the "near me" state (used by Reset).
function clearNearMe() {
  if (youMarker) { map.removeLayer(youMarker); youMarker = null; }
  if (nearCircle) { map.removeLayer(nearCircle); nearCircle = null; }
  userLatLng = null;
}

function locateUser(btn) {
  if (!navigator.geolocation) {
    alert("Your browser doesn’t support location lookup.");
    return;
  }
  if (btn) { btn.disabled = true; btn.classList.add("locating"); }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      if (btn) { btn.disabled = false; btn.classList.remove("locating"); }
      userLatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      renderNearMe(true);
    },
    (err) => {
      if (btn) { btn.disabled = false; btn.classList.remove("locating"); }
      alert(
        err.code === err.PERMISSION_DENIED
          ? "Location access was blocked. Allow location for this site to see projects near you."
          : "Couldn’t determine your location — please try again."
      );
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
  );
}

function addNearMeControl(map) {
  const ctrl = L.control({ position: "topright" });
  ctrl.onAdd = () => {
    const btn = L.DomUtil.create("button", "map-nearme-btn");
    btn.type = "button";
    btn.title = "Find completed projects near you";
    btn.setAttribute("aria-label", "Find completed projects near my location");
    btn.innerHTML =
      '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">' +
      '<circle cx="10" cy="10" r="3" fill="currentColor"/>' +
      '<path d="M10 1v3M10 16v3M1 10h3M16 10h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '<circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>' +
      '<span class="nearme-label">Near me</span>';
    L.DomEvent.disableClickPropagation(btn);
    L.DomEvent.on(btn, "click", () => locateUser(btn));
    return btn;
  };
  ctrl.addTo(map);
}

async function initMap() {
  let data;
  try {
    const res = await fetch("markers.json", { cache: "no-store" });
    data = await res.json();
  } catch (err) {
    document.getElementById("mapclusterer").innerHTML =
      '<div class="load-error"><strong>Could not load markers.json.</strong><br>' +
      "Serve this folder over http (see README).<br><code>" + String(err) + "</code></div>";
    document.getElementById("map-loading")?.classList.add("hidden");
    return;
  }

  allProjects = data.projects || [];

  const sel = document.getElementById("filter-type");
  distinctTypes(allProjects).forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    sel.appendChild(opt);
  });

  map = L.map("mapclusterer", {
    scrollWheelZoom: true,
    minZoom: 5,                            // floor: keeps the SE-US region in view
    maxZoom: 19,
    maxBounds: [[20, -100], [40, -74]],    // soft wall around the service area
    maxBoundsViscosity: 0.75,
  }).setView([data.lat || 30.6, data.lng || -87.4], data.pastProjectZoomLevel || 7);
  // Muted "Positron" basemap via OpenFreeMap — VECTOR tiles, so it stays crisp at
  // any resolution (retina included), keyless, unlimited, and can't be watermarked
  // out from under us. Rendered by MapLibre GL through the leaflet-maplibre-gl
  // plugin, so every Leaflet cluster/control above keeps working unchanged.
  // (Replaced Esri raster — which had no @2x tiles and looked soft on HiDPI —
  // which itself replaced CARTO after CARTO deprecated its free anonymous tiles.)
  L.maplibreGL({ style: "https://tiles.openfreemap.org/styles/positron" }).addTo(map);
  map.attributionControl.addAttribution(
    '&copy; <a href="https://openfreemap.org">OpenFreeMap</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  );

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  clusterGroup = L.markerClusterGroup({ chunkedLoading: true, animate: !reduceMotion });
  map.addLayer(clusterGroup);
  window.map = map; // expose for debugging

  addLegend(map);
  addFullscreenControl(map);
  addNearMeControl(map);

  document.getElementById("filter-type").addEventListener("change", render);
  document.getElementById("filter-search").addEventListener("input", render);
  document.getElementById("filter-reset").addEventListener("click", () => {
    document.getElementById("filter-type").value = "";
    document.getElementById("filter-search").value = "";
    clearNearMe();
    nearRadiusMi = 25;
    render();
    map.setView([data.lat || 30.6, data.lng || -87.4], data.pastProjectZoomLevel || 7);
  });

  // Radius selector inside the "near me" popup — delegated so it survives the
  // popup content being re-rendered. Changing radius re-counts, redraws the
  // circle, and refits the view to the new reach.
  document.addEventListener("click", (e) => {
    const btn = e.target.closest && e.target.closest(".radius-btn");
    if (!btn || !userLatLng) return;
    const mi = parseInt(btn.dataset.mi, 10);
    if (!RADIUS_OPTIONS.includes(mi)) return;
    nearRadiusMi = mi;
    renderNearMe(true);
  });

  render();
  document.getElementById("map-loading")?.classList.add("hidden");

  // The map lives in a flexbox column that often isn't sized yet at init, which
  // makes Leaflet compute the wrong viewport (renders zoomed-in/offset). Recalc
  // once the layout has settled, and re-apply the intended regional view.
  const resetView = () => {
    map.invalidateSize();
    map.setView([data.lat || 30.6, data.lng || -87.4], data.pastProjectZoomLevel || 7);
  };
  setTimeout(resetView, 300);
  window.addEventListener("load", resetView);
}

document.addEventListener("DOMContentLoaded", initMap);
