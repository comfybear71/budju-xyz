// Wallet-signature sign-in for BUDJU.
//
// The wallet signs ONE short message ("Sign in to BUDJU ...") and the server
// answers with a 12-hour pass. After that every /api request carries
// `Authorization: Bearer <pass>` automatically (installAuthFetch below), so
// admin actions, key changes, bot on/off and the order proxy are protected
// by proof of wallet ownership instead of a typed address.
//
// The popup only appears when a protected action actually needs a pass, and
// at most once per 12 hours. Reads never prompt.

const STORAGE_KEY = "budju_session";

interface StoredSession {
  wallet: string;
  token: string;
  expiresAt: number;
}

type Signer = (message: Uint8Array) => Promise<Uint8Array>;

let currentWallet: string | null = null;
let currentSigner: Signer | null = null;
let inFlight: Promise<string | null> | null = null;

// ── storage ──────────────────────────────────────────────────

function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSession;
    return s && s.token && s.expiresAt > Date.now() ? s : null;
  } catch {
    return null;
  }
}

export function storeSession(s: StoredSession) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* private mode etc. — session just won't persist */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Valid pass for this wallet, or null. */
export function getSessionToken(wallet?: string | null): string | null {
  const s = readSession();
  if (!s) return null;
  if (wallet && s.wallet !== wallet) return null;
  return s.token;
}

// ── wallet registration (called from the wallet provider) ────

export function registerAuthWallet(wallet: string | null, signer: Signer | null) {
  if (wallet !== currentWallet) {
    // A different wallet connected (or none): a pass for another wallet is useless.
    const s = readSession();
    if (s && s.wallet !== wallet) clearSession();
  }
  currentWallet = wallet;
  currentSigner = signer;
}

// ── sign-in ──────────────────────────────────────────────────

const rawFetch = (...args: Parameters<typeof fetch>) => window.fetch.call(window, ...args);
let originalFetch: typeof fetch | null = null;

function loginMessage(wallet: string, issued: number): string {
  return (
    `Sign in to BUDJU\nWallet: ${wallet}\nIssued: ${issued}\n` +
    `This proves you own this wallet. It costs nothing and moves no funds.`
  );
}

/** Make sure there is a valid pass for the connected wallet, asking the wallet
 *  to sign once if needed. Resolves to the token, or null if it can't
 *  (no wallet / QR read-only session / user declined). */
export function ensureSession(): Promise<string | null> {
  const existing = getSessionToken(currentWallet);
  if (existing) return Promise.resolve(existing);
  if (!currentWallet || !currentSigner) return Promise.resolve(null);
  if (inFlight) return inFlight;

  const wallet = currentWallet;
  const signer = currentSigner;
  inFlight = (async () => {
    try {
      const message = loginMessage(wallet, Date.now());
      const signature = await signer(new TextEncoder().encode(message));
      const doFetch = originalFetch || rawFetch;
      const res = await doFetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: wallet, message, signature: Array.from(signature) }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data?.token) return null;
      storeSession({ wallet, token: data.token, expiresAt: data.expiresAt });
      return data.token as string;
    } catch {
      return null; // user closed the wallet popup, wallet can't sign, network error…
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

// ── which requests need a pass (mirror of api/session_auth.py) ──

const ADMIN_GET = new Set(["/api/users", "/api/pool/allocations", "/api/pool/deposit-summary", "/api/debug"]);
const ADMIN_POST = new Set([
  "/api/state",
  "/api/trade",
  "/api/trade/sync",
  "/api/deposit",
  "/api/withdrawal",
  "/api/pool/initialize",
  "/api/user/sync",
]);
const OWNER_POST = new Set(["/api/user/swyftx-key", "/api/user/swyftx-key/remove", "/api/user/auto-trade"]);

function needsPass(method: string, url: URL, body: unknown): boolean {
  const p = url.pathname;
  if (p.startsWith("/api/auth/")) return false;
  if (p.startsWith("/api/admin/")) return true;
  if (method === "GET") {
    // Coin stats: "mine" / "everyone" need a pass; no scope stays public.
    if (p === "/api/coin-stats" || p === "/api/coin-trades") return url.searchParams.has("scope");
    // Per-wallet holdings behind the Leaderboard drill-down (members only).
    if (p === "/api/community/aggregate-holdings") return true;
    if (ADMIN_GET.has(p) || p.startsWith("/api/desk/")) return true;
    return p === "/api/transactions" && url.searchParams.get("admin") === "true";
  }
  if (method === "POST") {
    if (ADMIN_POST.has(p) || p.startsWith("/api/perp/") || OWNER_POST.has(p)) return true;
    // Order placement / cancellation through the server's Swyftx key
    if (p === "/api/proxy" && body && typeof body === "object") {
      const m = String((body as { method?: string }).method || "GET").toUpperCase();
      return m !== "GET";
    }
  }
  return false;
}

function parseJsonBody(init?: RequestInit): unknown {
  try {
    return typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
  } catch {
    return undefined;
  }
}

/** Wrap window.fetch once so same-origin /api calls carry the pass, and
 *  protected calls ask for one first. Call from main.tsx. */
export function installAuthFetch() {
  if (originalFetch) return; // already installed
  originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const doFetch = originalFetch as typeof fetch;
    let url: URL;
    try {
      url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    } catch {
      return doFetch(input, init);
    }
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/") || url.pathname.startsWith("/api/auth/")) {
      return doFetch(input, init);
    }

    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    const protectedCall = needsPass(method, url, parseJsonBody(init));

    let token = getSessionToken(currentWallet);
    if (!token && protectedCall) token = await ensureSession();

    const withToken = (t: string | null): RequestInit | undefined => {
      if (!t) return init;
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${t}`);
      return { ...init, headers };
    };

    let res = await doFetch(input, withToken(token));
    // Pass expired/rejected server-side: sign in again and retry exactly once.
    if (res.status === 401 && protectedCall && currentWallet) {
      clearSession();
      const fresh = await ensureSession();
      if (fresh) res = await doFetch(input, withToken(fresh));
    }
    return res;
  };
}
