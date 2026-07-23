/**
 * Minimal .env loader (KEY=VALUE per line, # comments, optional quotes).
 * Not the dotenv package on purpose — this repo keeps dependencies minimal
 * and the one secret it needs (DEVTO_API_KEY) doesn't need anything fancier.
 */

const fs = require("fs");
const path = require("path");

function loadEnv(envPath) {
  const target = envPath || path.join(__dirname, "..", "..", "..", ".env");
  if (!fs.existsSync(target)) return;

  for (const line of fs.readFileSync(target, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);

    if (!(key in process.env)) process.env[key] = value;
  }
}

module.exports = { loadEnv };
