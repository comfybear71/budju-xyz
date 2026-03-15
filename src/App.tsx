import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Analytics } from "@vercel/analytics/react";
import Layout from "@components/common/Layout";
import ErrorBoundary from "@components/common/ErrorBoundary";
import { WalletProvider } from "@hooks/useWallet";
import Web3Background from "./components/common/Web3Background";
import { ThemeProvider } from "@/context/ThemeContext";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

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
const Balance = lazy(() => import("@features/balance/Balance"));
const Trade = lazy(() => import("@features/trade/Trade"));
const TradeDashboard = lazy(() => import("@features/trade/TradeDashboard"));
const Spot = lazy(() => import("@features/spot/Spot"));
const Marketing = lazy(() => import("@features/marketing/Marketing"));
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
    <>
    <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <ThemeProvider>
        <WalletProvider>
          <ErrorBoundary>
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
                <Route path="/balance" element={<Balance />} />
                <Route path="/trade" element={<TradeDashboard />} />
                <Route path="/trade/classic" element={<Trade />} />
                <Route path="/spot" element={<Spot />} />
                <Route path="/marketing" element={<Marketing />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Layout>
          </Suspense>
          </ErrorBoundary>
        </WalletProvider>
      </ThemeProvider>
    </BrowserRouter>
    </QueryClientProvider>
    <Analytics />
    </>
  );
};

export default App;
