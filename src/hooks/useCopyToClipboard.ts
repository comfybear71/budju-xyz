import { useState, useCallback } from "react";

type CopyStatus = "inactive" | "copied" | "error";

/**
 * Custom hook to copy text to the clipboard and manage the copy status.
 *
 * @returns An object containing:
 * - `copyStatus`: A string representing the current status of the copy operation.
 *   It can be "inactive", "copied", or "error".
 * - `copyToClipboard`: A function that takes a string as an argument and attempts to copy it to the clipboard.
 *   Returns a promise that resolves to `true` if the copy operation was successful, or `false` if it failed.
 */

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
