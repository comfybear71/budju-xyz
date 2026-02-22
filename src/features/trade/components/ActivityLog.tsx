import { useState, useEffect, useRef } from "react";
import { getActivityLog, type LogEntry } from "../services/activityLog";

const ActivityLog = () => {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const log = getActivityLog();

  useEffect(() => {
    setEntries(log.getEntries());
    const unsub = log.subscribe(() => {
      setEntries(log.getEntries());
    });
    return unsub;
  }, [log]);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [entries]);

  const levelColor: Record<string, string> = {
    info: "#94a3b8",
    success: "#22c55e",
    error: "#ef4444",
    warn: "#eab308",
  };

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a]/60 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.04]">
        <span className="text-sm font-bold text-slate-300">Activity Log</span>
        <span className="text-[10px] text-slate-600 font-mono">
          {entries.length} events
        </span>
      </div>

      {/* Log entries */}
      <div
        ref={containerRef}
        className="px-4 py-2 overflow-y-auto"
        style={{ maxHeight: 200, scrollbarWidth: "thin" }}
      >
        {entries.length === 0 ? (
          <div className="text-[11px] text-slate-600 text-center py-4">
            No activity yet. Events will appear as the app runs.
          </div>
        ) : (
          <div className="space-y-0">
            {entries.map((entry, i) => (
              <div
                key={`${entry.timestamp}-${i}`}
                className="py-1 border-b border-white/[0.03] font-mono text-[11px] leading-relaxed"
                style={{ wordBreak: "break-all" }}
              >
                <span className="text-slate-600">[{entry.time}]</span>{" "}
                <span style={{ color: levelColor[entry.level] || "#94a3b8" }}>
                  {entry.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityLog;
