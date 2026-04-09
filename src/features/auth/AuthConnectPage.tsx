import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";

type Status = "loading" | "ready" | "connecting" | "signing" | "success" | "error" | "expired";

const AuthConnectPage = () => {
  const [searchParams] = useSearchParams();
  const challengeId = searchParams.get("c");
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [walletAddress, setWalletAddress] = useState("");

  // Fetch challenge on mount
  useEffect(() => {
    if (!challengeId) {
      setStatus("error");
      setError("No challenge ID provided. Scan the QR code again.");
      return;
    }

    fetch(`/api/wallet-qr?c=${challengeId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.status === "expired") {
          setStatus("expired");
        } else if (data.status === "approved") {
          setStatus("success");
          setWalletAddress(data.wallet || "");
        } else {
          setMessage(data.message || "");
          setStatus("ready");
        }
      })
      .catch(() => {
        setStatus("error");
        setError("Failed to load challenge. Try again.");
      });
  }, [challengeId]);

  const handleConnect = async () => {
    const phantom = (window as any).solana;

    // If Phantom not available, deep link into Phantom browser
    if (!phantom?.isPhantom) {
      const currentUrl = window.location.href;
      window.location.href = `https://phantom.app/ul/browse/${encodeURIComponent(currentUrl)}`;
      return;
    }

    try {
      setStatus("connecting");

      // Connect wallet
      const resp = await phantom.connect();
      const publicKey = resp.publicKey.toString();

      setStatus("signing");

      // Sign the challenge message
      const encodedMessage = new TextEncoder().encode(message);
      const signResult = await phantom.signMessage(encodedMessage, "utf8");
      const signatureBytes = signResult.signature;

      // Convert Uint8Array to base64
      const signature = btoa(String.fromCharCode(...signatureBytes));

      // Submit to server
      const verifyResp = await fetch("/api/wallet-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, signature, publicKey }),
      });

      const result = await verifyResp.json();

      if (result.success) {
        setStatus("success");
        setWalletAddress(result.wallet);
      } else {
        setStatus("error");
        setError(result.error || "Verification failed");
      }
    } catch (err: any) {
      if (err.message?.includes("User rejected")) {
        setStatus("ready");
      } else {
        setStatus("error");
        setError(err.message || "Connection failed");
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-6">
          <img src="/budju-logo.png" alt="BUDJU" className="w-16 h-16 mx-auto mb-2" />
          <h1 className="text-xl font-bold text-white">BUDJU</h1>
          <p className="text-xs text-slate-500">Wallet Connection</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/[0.08] bg-slate-900/80 p-6 backdrop-blur-sm">
          {status === "loading" && (
            <div className="text-center py-8">
              <div className="w-8 h-8 rounded-full border-2 border-purple-500 border-t-transparent animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-400">Loading challenge...</p>
            </div>
          )}

          {status === "ready" && (
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-purple-500/15 flex items-center justify-center mx-auto mb-4">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-white mb-2">Connect Wallet</h2>
              <p className="text-xs text-slate-400 mb-6">
                Sign with Phantom to log in on your other device
              </p>
              <button
                onClick={handleConnect}
                className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all"
                style={{
                  background: "linear-gradient(135deg, #9333ea, #7c3aed)",
                  boxShadow: "0 4px 15px rgba(147,51,234,0.3)",
                }}
              >
                Connect Phantom Wallet
              </button>
            </div>
          )}

          {status === "connecting" && (
            <div className="text-center py-8">
              <div className="w-8 h-8 rounded-full border-2 border-purple-500 border-t-transparent animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-400">Connecting to Phantom...</p>
            </div>
          )}

          {status === "signing" && (
            <div className="text-center py-8">
              <div className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin mx-auto mb-3" />
              <p className="text-sm text-amber-300">Sign the message in Phantom</p>
              <p className="text-xs text-slate-500 mt-1">Check your wallet for a signature request</p>
            </div>
          )}

          {status === "success" && (
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-4">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-emerald-400 mb-2">Connected!</h2>
              <p className="text-xs text-slate-400 mb-1">Wallet:</p>
              <p className="text-xs font-mono text-purple-300 break-all">{walletAddress}</p>
              <p className="text-xs text-slate-500 mt-4">You can close this page now.</p>
              <p className="text-xs text-slate-500">Your other device will auto-login.</p>
            </div>
          )}

          {status === "expired" && (
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-amber-500/15 flex items-center justify-center mx-auto mb-4">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-amber-400 mb-2">Expired</h2>
              <p className="text-xs text-slate-400">This QR code has expired. Scan a new one.</p>
            </div>
          )}

          {status === "error" && (
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-4">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-red-400 mb-2">Error</h2>
              <p className="text-xs text-slate-400">{error}</p>
              <button
                onClick={() => { setStatus("ready"); setError(""); }}
                className="mt-4 px-4 py-2 rounded-lg text-xs font-bold text-purple-300 bg-purple-500/15 border border-purple-500/30"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthConnectPage;
