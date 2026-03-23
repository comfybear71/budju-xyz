import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useWallet } from "@hooks/useWallet";
import { fetchUserPreferences, saveUserPreferences } from "@lib/services/preferencesApi";

interface ThemeContextType {
  isDarkMode: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [isDarkMode, setIsDarkMode] = useState(true); // Default to dark mode
  const { connection } = useWallet();
  const walletAddress = connection.wallet?.address;

  // Load theme from DB when wallet connects
  useEffect(() => {
    if (!walletAddress) return;
    let cancelled = false;
    fetchUserPreferences(walletAddress).then((prefs) => {
      if (!cancelled && prefs && prefs.darkMode !== undefined) {
        setIsDarkMode(prefs.darkMode);
      }
    });
    return () => { cancelled = true; };
  }, [walletAddress]);

  const toggleTheme = useCallback(() => {
    setIsDarkMode((prev) => {
      const next = !prev;
      if (walletAddress) {
        saveUserPreferences(walletAddress, { darkMode: next });
      }
      return next;
    });
  }, [walletAddress]);

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
