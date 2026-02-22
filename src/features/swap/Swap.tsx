import { useEffect } from "react";
import { APP_NAME } from "@constants/config";
import SwapTool from "./components/SwapTool";

const Swap = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `Swap - ${APP_NAME}`;

    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute(
        "content",
        "Swap your tokens with BUDJU on the Bank of BUDJU platform.",
      );
    } else {
      const newMetaDescription = document.createElement("meta");
      newMetaDescription.name = "description";
      newMetaDescription.content =
        "Swap your tokens with BUDJU on the Bank of BUDJU platform.";
      document.head.appendChild(newMetaDescription);
    }
  }, []);

  return (
    <main className="pt-16 md:pt-20">
      <SwapTool />
    </main>
  );
};

export default Swap;
