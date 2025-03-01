import { useMemo, useEffect } from "react";

// Layout components
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import Head from "../components/common/Head";

// Section components
import HeroSection from "../components/sections/HeroSection";
import NFTSlideshow from "../components/sections/NFTSlideshow";
import HowToBuySection from "../components/sections/HowToBuySection";
import TokenomicsSection from "../components/sections/TokenomicsSection";
import BankSection from "../components/sections/BankSection";
import RoadmapSection from "../components/sections/RoadmapSection";
import ShopSection from "../components/sections/ShopSection";

// Hooks
import { useTokenData } from "../hooks/useTokenData";

// Mock data
import { roadmapPhases, products, bankData } from "../data/mockData";

// Assets
import logoImage from "../assets/images/logo.png";
import titleImage from "../assets/images/title_budju.png";
import budjuImage from "../assets/images/budju.png";
import budju00Image from "../assets/images/budju00.png";
import budju01Image from "../assets/images/budju01.png";
import budju02Image from "../assets/images/budju02.png";
import budju03Image from "../assets/images/budju03.png";
import budju04Image from "../assets/images/budju04.png";
import budju05Image from "../assets/images/budju05.png";
import budju06Image from "../assets/images/budju06.png";
// import budju07Image from "../assets/images/budju07.png";
// import budju08Image from "../assets/images/budju08.png";
// import budju09Image from "../assets/images/budju09.png";
// import budju10Image from "../assets/images/budju10.png";
import budjuVideo from "../assets/videos/budju.mp4";

const HomePage = () => {
  const { tokenData, loading } = useTokenData();

  const nftImages = useMemo(
    () => [
      budju00Image,
      budju01Image,
      budju02Image,
      budju03Image,
      budju04Image,
      budju05Image,
      budju06Image,
      // budju07Image,
      // budju08Image,
      // budju09Image,
      // budju10Image,
    ],
    [],
  );

  // Add Font Awesome for icons
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css";
    document.head.appendChild(link);

    return () => {
      document.head.removeChild(link);
    };
  }, []);

  return (
    <>
      <Head
        title="BUDJU COIN | Join The Budju Parade"
        description="Join the Budju Parade! Discover BUDJU COIN, the vibrant Solana token with NFTs, community rewards, and exclusive merchandise."
      />

      <div className="flex flex-col min-h-screen bg-black text-white">
        <Navbar
          logoSrc={logoImage}
          buyLink="https://ape.pro/solana/2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump"
        />

        <main className="flex-grow">
          <HeroSection
            titleImage={titleImage}
            budjuImage={budjuImage}
            buyLink="https://ape.pro/solana/2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump"
          />

          <NFTSlideshow
            images={nftImages}
            targetHolders={1000}
            currentHolders={tokenData?.holders || 0}
          />

          <HowToBuySection />

          <TokenomicsSection
            tokenData={
              tokenData || {
                symbol: "BUDJU",
                supply: 1000000000,
                pricePerToken: 0.0000123,
                currency: "USDC",
                marketCap: 123000,
                holders: 138,
                firstCreated: "January 31, 2025",
              }
            }
            isLoading={loading}
          />

          <RoadmapSection roadmapPhases={roadmapPhases} videoSrc={budjuVideo} />

          <BankSection bankData={bankData} />

          <ShopSection products={products} />
        </main>

        <Footer />
      </div>
    </>
  );
};

export default HomePage;
