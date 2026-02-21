import { useEffect } from "react";
import { APP_NAME } from "@constants/config";
import { BudjuParadeBanner } from "@components/common/ScrollingBanner";
import NFTHero from "./components/NFTHero";
import NFTGoldenShowcase from "./components/NFTGoldenShowcase";
import NFTMarketplace from "./components/NFTMarketplace";
import NFTHolderBenefits from "./components/NFTHolderBenefits";
import NFTFaq from "./components/NFTFaq";

const NFT = () => {
  useEffect(() => {
    window.scrollTo(0, 0);

    document.title = `NFT Marketplace - ${APP_NAME}`;

    const metaDescription = document.querySelector('meta[name="description"]');
    const content =
      "BUDJU NFT Marketplace — browse, buy, and collect 30 unique NFTs on Solana. Pay with BUDJU, USDC, or SOL.";
    if (metaDescription) {
      metaDescription.setAttribute("content", content);
    } else {
      const el = document.createElement("meta");
      el.name = "description";
      el.content = content;
      document.head.appendChild(el);
    }
  }, []);

  return (
    <main>
      {/* Hero */}
      <NFTHero />

      {/* Scrolling Banner */}
      <BudjuParadeBanner />

      {/* Golden NFT Showcase */}
      <NFTGoldenShowcase />

      {/* Full Marketplace */}
      <div id="marketplace">
        <NFTMarketplace />
      </div>

      {/* Holder Benefits */}
      <NFTHolderBenefits />

      {/* FAQ */}
      <NFTFaq />
    </main>
  );
};

export default NFT;
