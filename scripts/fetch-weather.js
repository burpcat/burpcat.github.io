/**
 * Fetches Boston's current weather from Open-Meteo (no API key needed) and
 * writes src/_data/weather.json, so base.njk can bake a --chitra-color CSS
 * variable — the reading-mode star (and her dancing strands) take their
 * color from today's real weather.
 *
 * Runs at build time (npm run build and in the GitHub Action, once each
 * morning). If the fetch fails, falls back gracefully to a default color —
 * the site still builds.
 */

const fs = require("fs");
const path = require("path");

const OUTPUT = path.join(__dirname, "..", "src", "_data", "weather.json");
const LAT = 42.3601;
const LON = -71.0589; // Boston — fixed, not configurable
const URL = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current_weather=true&timezone=America%2FNew_York`;

// WMO weathercode buckets -> a night-sky-friendly "mood color", tuned to
// read well as both a small glowing star and thin curve strokes against the
// site's light/dark/about palettes.
const BUCKETS = [
  { codes: [0], label: "clear", colorHex: "#F5D77A", colorRgb: "245,215,122" },
  { codes: [1, 2, 3], label: "cloudy", colorHex: "#A9C4D9", colorRgb: "169,196,217" },
  { codes: [45, 48], label: "fog", colorHex: "#B8B8C8", colorRgb: "184,184,200" },
  { codes: [51, 53, 55, 56, 57], label: "drizzle", colorHex: "#7FA8A3", colorRgb: "127,168,163" },
  { codes: [61, 63, 65, 66, 67, 80, 81, 82], label: "rain", colorHex: "#5B84B1", colorRgb: "91,132,177" },
  { codes: [71, 73, 75, 77, 85, 86], label: "snow", colorHex: "#D6ECEF", colorRgb: "214,236,239" },
  { codes: [95, 96, 99], label: "storm", colorHex: "#8B6FB3", colorRgb: "139,111,179" },
];
const FALLBACK = { label: "clear", colorHex: "#F5D77A", colorRgb: "245,215,122" };
const bucketFor = (code) => BUCKETS.find((b) => b.codes.includes(code)) || FALLBACK;

async function main() {
  try {
    const res = await fetch(URL, { headers: { "User-Agent": "personal-site-build" } });
    if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}`);

    const data = await res.json();
    const cw = data.current_weather;
    if (!cw || typeof cw.weathercode !== "number") throw new Error("unexpected response shape");

    const bucket = bucketFor(cw.weathercode);
    const tempF = Math.round((cw.temperature * 9) / 5 + 32); // Open-Meteo returns Celsius by default

    fs.writeFileSync(
      OUTPUT,
      JSON.stringify(
        {
          available: true,
          weathercode: cw.weathercode,
          tempF,
          label: bucket.label,
          color: bucket.colorHex,
          colorRgb: bucket.colorRgb,
          fetchedAt: new Date().toISOString(),
        },
        null,
        2
      )
    );
    console.log(`[fetch-weather] ok: ${bucket.label}, ${tempF}F (code ${cw.weathercode})`);
  } catch (e) {
    console.warn("[fetch-weather] error:", e.message);
    fs.writeFileSync(
      OUTPUT,
      JSON.stringify(
        {
          available: false,
          label: FALLBACK.label,
          color: FALLBACK.colorHex,
          colorRgb: FALLBACK.colorRgb,
          fetchedAt: new Date().toISOString(),
        },
        null,
        2
      )
    );
  }
}

main();
