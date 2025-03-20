import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router";
import Layout from "@components/common/Layout";
import { WalletProvider } from "@hooks/useWallet";
import Web3Background from "./components/common/Web3Background";
import { ThemeProvider } from "@/context/ThemeContext";

// Lazy-loaded pages for better performance
const Home = lazy(() => import("@features/home/Home"));
const NFT = lazy(() => import("@features/nft/NFT"));
const HowToBuy = lazy(() => import("@features/how-to-buy/HowToBuy"));
const Shop = lazy(() => import("@features/shop/Shop"));
const Tokenomics = lazy(() => import("@features/tokenomics/Tokenomics"));
const Bank = lazy(() => import("@features/bank/Bank"));
const Burn = lazy(() => import("@features/burn/Burn"));
const Pool = lazy(() => import("@features/pool/Pool"));
const Swap = lazy(() => import("@features/swap/Swap")); // Added SwapTool
const NotFound = lazy(() => import("@features/not-found/NotFound"));

// Loading fallback component
const LoadingFallback = () => (
  <Web3Background>
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse flex flex-col items-center">
        <img
          src="/images/logo.svg"
          alt="BUDJU Loading"
          className="w-24 h-24 animate-bounce"
        />
        <p className="mt-4 text-xl text-white">
          Loading the BUDJU experience...
        </p>
      </div>
    </div>
  </Web3Background>
);

const App = () => {
  // Initialize analytics
  useEffect(() => {
    // Google Analytics initialization
    if (import.meta.env.PROD) {
      const analyticsId = import.meta.env.VITE_ANALYTICS_ID;
      if (
        analyticsId &&
        typeof window !== "undefined" &&
        typeof window.gtag === "function"
      ) {
        window.gtag("config", analyticsId);
      }
    }
  }, []);

  return (
    <BrowserRouter>
      <ThemeProvider>
        <WalletProvider>
          <Suspense fallback={<LoadingFallback />}>
            <Layout>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/nft" element={<NFT />} />
                <Route path="/how-to-buy" element={<HowToBuy />} />
                <Route path="/pool" element={<Pool />} />
                <Route path="/shop" element={<Shop />} />
                <Route path="/tokenomics" element={<Tokenomics />} />
                <Route path="/bank" element={<Bank />} />
                <Route path="/burn" element={<Burn />} />
                <Route path="/swap" element={<Swap />} />{" "}
                {/* Added Swap route */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Layout>
          </Suspense>
        </WalletProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
};

export default App;
