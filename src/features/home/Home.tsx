import { useEffect } from "react";
import { APP_NAME, APP_DESCRIPTION } from "@constants/config";

// Components
import Hero from "./components/Hero";
import BotAccess from "./components/BotAccess";
import ShopHighlight from "./components/ShopHighlight";
import NFTShowcase from "./components/NFTShowcase";
import BankHighlight from "./components/BankHighlight";
import LiquidityPools from "./components/LiquidityPools";
import TokenStats from "@components/common/TokenStats";
import EcosystemOverview from "./components/EcosystemOverview";

const Home = () => {
  useEffect(() => {
    window.scrollTo(0, 0);

    document.title = `${APP_NAME} — Trading Bot | DeFi on Solana`;

    const metaDescription = document.querySelector(
      'meta[name="description"]',
    );
    if (metaDescription) {
      metaDescription.setAttribute("content", APP_DESCRIPTION);
    } else {
      const newMetaDescription = document.createElement("meta");
      newMetaDescription.name = "description";
      newMetaDescription.content = APP_DESCRIPTION;
      document.head.appendChild(newMetaDescription);
    }

    updateOgTag("title", `${APP_NAME} — Trading Bot`);
    updateOgTag("description", APP_DESCRIPTION);
    updateOgTag("type", "website");
  }, []);

  const updateOgTag = (property: string, content: string) => {
    const ogTag = document.querySelector(
      `meta[property="og:${property}"]`,
    );
    if (ogTag) {
      ogTag.setAttribute("content", content);
    } else {
      const newOgTag = document.createElement("meta");
      newOgTag.setAttribute("property", `og:${property}`);
      newOgTag.setAttribute("content", content);
      document.head.appendChild(newOgTag);
    }
  };

  return (
    <main className="flex flex-col">
      <Hero />

      <div className="budju-section-divider" />

      <BotAccess />

      <div className="budju-section-divider" />

      <ShopHighlight />

      <div className="budju-section-divider" />

      <NFTShowcase />

      <div className="budju-section-divider" />

      <BankHighlight />

      <div className="budju-section-divider" />

      <LiquidityPools />

      <div className="budju-section-divider" />

      <TokenStats />

      <div className="budju-section-divider" />

      <EcosystemOverview />
    </main>
  );
};

export default Home;
