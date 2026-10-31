import "./polyfills";

import ReactDOM from "react-dom/client";
import App from "./App";
import "@styles/globals.css";
import { installAuthFetch } from "@lib/services/authSession";

// Attach the wallet sign-in pass to /api calls (and ask for one when a protected action needs it)
installAuthFetch();

// Pick up coins added/retired from the admin screen
import("@features/trade/services/tradeApi").then((m) => m.loadCoinConfig()).catch(() => {});

// Add Buffer polyfill
import { Buffer } from "buffer";
(window as any).Buffer = Buffer;

// Add crypto polyfills for Web3 compatibility
if (typeof window !== "undefined") {
  if (!window.crypto) {
    window.crypto = window.crypto || {};
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
