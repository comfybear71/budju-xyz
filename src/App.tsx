import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router";
import LoadingScreen from "./components/common/LoadingScreen";

// Lazy-loaded page components
const HomePage = lazy(() => import("./pages/HomePage"));
const HowToBuyPage = lazy(() => import("./pages/HowToBuyPage"));
const TokenomicsPage = lazy(() => import("./pages/TokenomicsPage"));
const JoinUsPage = lazy(() => import("./pages/JoinUsPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

const App = () => {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/how-to-buy" element={<HowToBuyPage />} />
          <Route path="/tokenomics" element={<TokenomicsPage />} />
          <Route path="/join-us" element={<JoinUsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};

export default App;
