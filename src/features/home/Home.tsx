import { useEffect } from "react";
import { APP_NAME, APP_DESCRIPTION } from "@constants/config";

// Components
import Hero from "./components/Hero";
import TokenStats from "@components/common/TokenStats";
import EcosystemOverview from "./components/EcosystemOverview";

const Home = () => {
  // Setup page
  useEffect(() => {
    // Scroll to top on page load
    window.scrollTo(0, 0);

    // Set document title and metadata
    document.title = `${APP_NAME} - JOIN THE PARADE`;

    // Update meta description
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute("content", APP_DESCRIPTION);
    } else {
      const newMetaDescription = document.createElement("meta");
      newMetaDescription.name = "description";
      newMetaDescription.content = APP_DESCRIPTION;
      document.head.appendChild(newMetaDescription);
    }

    // Update OG tags
    updateOgTag("title", APP_NAME);
    updateOgTag("description", APP_DESCRIPTION);
    updateOgTag("type", "website");
  }, []);

  // Helper function to update Open Graph tags
  const updateOgTag = (property: string, content: string) => {
    const ogTag = document.querySelector(`meta[property="og:${property}"]`);
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

      <div className="budju-section-divider"></div>

      <TokenStats />

      <div className="budju-section-divider"></div>

      <EcosystemOverview />
    </main>
  );
};

export default Home;
