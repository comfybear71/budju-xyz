import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@styles/globals.css";

// Add Buffer polyfill
import { Buffer } from "buffer";
(window as any).Buffer = Buffer;

// Add crypto polyfills for Web3 compatibility
if (typeof window !== "undefined") {
  if (!window.crypto) {
    window.crypto = window.crypto || {};
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
