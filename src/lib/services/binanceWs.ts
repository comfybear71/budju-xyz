// ============================================================
// Binance WebSocket Price Service
// Connects to Binance's free public WebSocket for real-time
// price updates (sub-second latency). No API key required.
//
// Falls back gracefully — if the WS disconnects, the caller
// should continue using CoinGecko REST polling as a backup.
// ============================================================

type PriceCallback = (prices: Record<string, number>) => void;

// Map our internal asset codes → Binance USDT trading pair symbols (lowercase)
const CODE_TO_BINANCE: Record<string, string> = {
  BTC: "btcusdt",
  ETH: "ethusdt",
  SOL: "solusdt",
  XRP: "xrpusdt",
  DOGE: "dogeusdt",
  ADA: "adausdt",
  SUI: "suiusdt",
  AVAX: "avaxusdt",
  DOT: "dotusdt",
  LINK: "linkusdt",
  POL: "polusdt",
  HBAR: "hbarusdt",
  UNI: "uniusdt",
  NEAR: "nearusdt",
  NEO: "neousdt",
  TRX: "trxusdt",
  BCH: "bchusdt",
  BNB: "bnbusdt",
  ENA: "enausdt",
  RENDER: "renderusdt",
  FET: "fetusdt",
  TAO: "taousdt",
  PEPE: "pepeusdt",
  LUNA: "lunausdt",
};

// Reverse map: binance symbol → our code
const BINANCE_TO_CODE: Record<string, string> = {};
for (const [code, sym] of Object.entries(CODE_TO_BINANCE)) {
  BINANCE_TO_CODE[sym] = code;
}

const WS_BASE = "wss://stream.binance.com:9443/ws";
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];

export interface BinanceWsState {
  connected: boolean;
  lastUpdate: number;
  priceCount: number;
}

export class BinancePriceStream {
  private _ws: WebSocket | null = null;
  private _prices: Record<string, number> = {};
  private _callbacks = new Set<PriceCallback>();
  private _stateCallbacks = new Set<(state: BinanceWsState) => void>();
  private _reconnectAttempt = 0;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _destroyed = false;
  private _connected = false;
  private _lastUpdate = 0;

  connect() {
    if (this._ws || this._destroyed) return;

    const streams = Object.values(CODE_TO_BINANCE).map((s) => `${s}@miniTicker`);
    // Binance combined stream URL
    const url = `${WS_BASE}/${streams.join("/")}`;

    try {
      this._ws = new WebSocket(url);
    } catch {
      this._scheduleReconnect();
      return;
    }

    this._ws.onopen = () => {
      this._connected = true;
      this._reconnectAttempt = 0;
      this._notifyState();
    };

    this._ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        // miniTicker event: { e: "24hrMiniTicker", s: "BTCUSDT", c: "67123.45", ... }
        if (msg.e === "24hrMiniTicker" && msg.s) {
          const symbol = msg.s.toLowerCase();
          const code = BINANCE_TO_CODE[symbol];
          if (code) {
            const price = parseFloat(msg.c);
            if (price > 0) {
              this._prices[code] = price;
              this._lastUpdate = Date.now();
              this._notifyPrices();
            }
          }
        }
      } catch {
        // Ignore malformed messages
      }
    };

    this._ws.onclose = () => {
      this._ws = null;
      this._connected = false;
      this._notifyState();
      if (!this._destroyed) {
        this._scheduleReconnect();
      }
    };

    this._ws.onerror = () => {
      // onclose will fire after onerror
      this._ws?.close();
    };
  }

  disconnect() {
    this._destroyed = true;
    this._clearReconnect();
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
    this._connected = false;
    this._callbacks.clear();
    this._stateCallbacks.clear();
  }

  onPrices(cb: PriceCallback): () => void {
    this._callbacks.add(cb);
    // Immediately emit current prices if we have any
    if (Object.keys(this._prices).length > 0) {
      cb({ ...this._prices });
    }
    return () => this._callbacks.delete(cb);
  }

  onState(cb: (state: BinanceWsState) => void): () => void {
    this._stateCallbacks.add(cb);
    cb(this.getState());
    return () => this._stateCallbacks.delete(cb);
  }

  getState(): BinanceWsState {
    return {
      connected: this._connected,
      lastUpdate: this._lastUpdate,
      priceCount: Object.keys(this._prices).length,
    };
  }

  getPrices(): Record<string, number> {
    return { ...this._prices };
  }

  private _notifyPrices() {
    const snapshot = { ...this._prices };
    for (const cb of this._callbacks) {
      try {
        cb(snapshot);
      } catch {
        // Don't let one bad callback kill the stream
      }
    }
  }

  private _notifyState() {
    const state = this.getState();
    for (const cb of this._stateCallbacks) {
      try {
        cb(state);
      } catch {
        // Ignore
      }
    }
  }

  private _scheduleReconnect() {
    this._clearReconnect();
    const delay = RECONNECT_DELAYS[
      Math.min(this._reconnectAttempt, RECONNECT_DELAYS.length - 1)
    ];
    this._reconnectAttempt++;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private _clearReconnect() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }
}

// ── Export the code-to-binance mapping for other consumers ──

export { CODE_TO_BINANCE, BINANCE_TO_CODE };

// ── Kline (Candlestick) Stream ──────────────────────────────
// Separate per-symbol WebSocket for real-time 1m kline data.
// Used by the TradingChart component for live candlestick updates.

export interface KlineBar {
  time: number; // Unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isFinal: boolean; // true when candle closed
}

type KlineCallback = (bar: KlineBar) => void;

export class BinanceKlineStream {
  private _ws: WebSocket | null = null;
  private _callbacks = new Set<KlineCallback>();
  private _reconnectAttempt = 0;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _destroyed = false;
  private _connected = false;
  private _symbol: string; // e.g. "btcusdt"
  private _interval: string; // e.g. "1m"

  constructor(symbol: string, interval = "1m") {
    this._symbol = symbol.toLowerCase();
    this._interval = interval;
  }

  get connected() {
    return this._connected;
  }

  connect() {
    if (this._ws || this._destroyed) return;

    const url = `${WS_BASE}/${this._symbol}@kline_${this._interval}`;

    try {
      this._ws = new WebSocket(url);
    } catch {
      this._scheduleReconnect();
      return;
    }

    this._ws.onopen = () => {
      this._connected = true;
      this._reconnectAttempt = 0;
    };

    this._ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        // Kline event: { e: "kline", k: { t: openTime, o, h, l, c, v, x: isFinal } }
        if (msg.e === "kline" && msg.k) {
          const k = msg.k;
          const bar: KlineBar = {
            time: Math.floor(k.t / 1000), // ms → seconds
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
            volume: parseFloat(k.v),
            isFinal: k.x,
          };
          for (const cb of this._callbacks) {
            try { cb(bar); } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ }
    };

    this._ws.onclose = () => {
      this._ws = null;
      this._connected = false;
      if (!this._destroyed) this._scheduleReconnect();
    };

    this._ws.onerror = () => {
      this._ws?.close();
    };
  }

  disconnect() {
    this._destroyed = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
    this._connected = false;
    this._callbacks.clear();
  }

  onBar(cb: KlineCallback): () => void {
    this._callbacks.add(cb);
    return () => this._callbacks.delete(cb);
  }

  private _scheduleReconnect() {
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    const delay = RECONNECT_DELAYS[
      Math.min(this._reconnectAttempt, RECONNECT_DELAYS.length - 1)
    ];
    this._reconnectAttempt++;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this.connect();
    }, delay);
  }
}

// ── Singleton ────────────────────────────────────────────────

let _instance: BinancePriceStream | null = null;

export function getBinancePriceStream(): BinancePriceStream {
  if (!_instance) {
    _instance = new BinancePriceStream();
  }
  return _instance;
}

export function destroyBinancePriceStream() {
  if (_instance) {
    _instance.disconnect();
    _instance = null;
  }
}
