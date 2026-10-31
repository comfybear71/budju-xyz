// Wallet-signature session passes — TypeScript side (order proxy + QR sign-in).
// MUST stay in sync with api/session_auth.py (same token format and key).
//
//   token = "v1." + base64url({"w": wallet, "exp": ms}) + "." + base64url(HMAC)
//   key   = HMAC-SHA256(secret, "budju-session-v1")
//   secret = SWYFTX_KEY_ENCRYPTION_SECRET (or CRON_SECRET) — already deployed
//
// Roll-out switch AUTH_ENFORCE: "off" | "log" (default) | "on"  (see session_auth.py)

import crypto from "crypto";

const SESSION_TTL_MS = 12 * 3_600_000;
const VERSION = "v1";

export type AuthMode = "off" | "log" | "on";

export function authMode(): AuthMode {
  const m = (process.env.AUTH_ENFORCE || "log").trim().toLowerCase();
  return m === "off" || m === "on" ? m : "log";
}

function signingKey(): Buffer {
  const secret = process.env.SWYFTX_KEY_ENCRYPTION_SECRET || process.env.CRON_SECRET || "";
  if (!secret) throw new Error("No server secret available to sign sessions");
  return crypto.createHmac("sha256", secret).update("budju-session-v1").digest();
}

function b64u(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function mintSession(wallet: string, nowMs: number = Date.now()) {
  const exp = nowMs + SESSION_TTL_MS;
  const payload = b64u(Buffer.from(JSON.stringify({ w: wallet, exp })));
  const sig = b64u(crypto.createHmac("sha256", signingKey()).update(`${VERSION}.${payload}`).digest());
  return { token: `${VERSION}.${payload}.${sig}`, expiresAt: exp, wallet };
}

/** wallet address if the pass is genuine and unexpired, else null */
export function verifySession(token: string | undefined | null, nowMs: number = Date.now()): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  try {
    const expected = b64u(crypto.createHmac("sha256", signingKey()).update(`${parts[0]}.${parts[1]}`).digest());
    const a = Buffer.from(expected);
    const b = Buffer.from(parts[2]);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    if (nowMs >= Number(payload.exp)) return null;
    return String(payload.w);
  } catch {
    return null;
  }
}

export function bearerToken(header: string | string[] | undefined): string | null {
  const h = Array.isArray(header) ? header[0] : header;
  return h && /^bearer /i.test(h) ? h.slice(7).trim() : null;
}

export function adminWallets(): string[] {
  return (process.env.ADMIN_WALLETS || "AEWvE2xXaHSGdGCaCArb2PWdKS7K9RwoCRV7CT2CJTWq")
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean);
}
