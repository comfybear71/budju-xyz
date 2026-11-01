import { useState, type ReactNode } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa";

/** One collapsed home for the occasional admin tools (suggestions, starter buys, offload, connection check). */
const AdminTools = ({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl" style={{ background: "rgba(255,255,255,0.015)", border: "1px dashed rgba(255,255,255,0.14)" }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 text-left">
        <span className="text-sm font-bold text-slate-300">🛠 Admin tools</span>
        {open ? <FaChevronDown size={11} className="text-slate-500" /> : <FaChevronRight size={11} className="text-slate-500" />}
      </button>
      {open && <div className="px-3 pb-3 space-y-3">{children}</div>}
    </div>
  );
};

export default AdminTools;
