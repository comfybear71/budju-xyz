import { useState, useCallback } from "react";

type CopyStatus = "inactive" | "copied" | "error";

export const useCopyToClipboard = () => {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("inactive");

  const copyToClipboard = useCallback(
    async (text: string): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(text);
        setCopyStatus("copied");

        // Reset status after 2 seconds
        setTimeout(() => {
          setCopyStatus("inactive");
        }, 2000);

        return true;
      } catch (err) {
        console.error("Failed to copy text:", err);
        setCopyStatus("error");

        setTimeout(() => {
          setCopyStatus("inactive");
        }, 2000);

        return false;
      }
    },
    [],
  );

  return { copyStatus, copyToClipboard };
};
