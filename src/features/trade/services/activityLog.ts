// ==========================================
// Activity Log — Global event logger
// ==========================================
// Captures timestamped events from API calls, auto-trader,
// price updates, etc. Visible to all users.

export type LogLevel = "info" | "success" | "error" | "warn";

export interface LogEntry {
  time: string;
  message: string;
  level: LogLevel;
  timestamp: number;
}

type Listener = () => void;

const MAX_ENTRIES = 100;

class ActivityLogService {
  private _entries: LogEntry[] = [];
  private _listeners: Set<Listener> = new Set();

  log(message: string, level: LogLevel = "info") {
    const now = new Date();
    const time = now.toLocaleTimeString("en-US", { hour12: false });

    // Truncate long messages
    const msg = typeof message === "string" ? message.substring(0, 300) : String(message);

    this._entries.push({ time, message: msg, level, timestamp: now.getTime() });

    // Keep last MAX_ENTRIES
    if (this._entries.length > MAX_ENTRIES) {
      this._entries = this._entries.slice(-MAX_ENTRIES);
    }

    // Also log to console for debugging
    console.log(`[${time}] ${msg}`);

    // Notify listeners
    for (const fn of this._listeners) {
      fn();
    }
  }

  getEntries(): LogEntry[] {
    return [...this._entries];
  }

  subscribe(fn: Listener): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  clear() {
    this._entries = [];
    for (const fn of this._listeners) {
      fn();
    }
  }
}

// Singleton instance
let _instance: ActivityLogService | null = null;

export function getActivityLog(): ActivityLogService {
  if (!_instance) {
    _instance = new ActivityLogService();
  }
  return _instance;
}
