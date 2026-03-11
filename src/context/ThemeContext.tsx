import { createContext, useContext, useState, ReactNode } from "react";

interface ThemeContextType {
  isDarkMode: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getInitialTheme(): boolean {
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem("budju_dark_mode");
    if (stored !== null) return stored === "true";
  }
  return true; // Default to dark mode
}

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [isDarkMode, setIsDarkMode] = useState(getInitialTheme);

  const toggleTheme = () => {
    setIsDarkMode((prev) => {
      const next = !prev;
      try { localStorage.setItem("budju_dark_mode", String(next)); } catch {}
      return next;
    });
  };

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
