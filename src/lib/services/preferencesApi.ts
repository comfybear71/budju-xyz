// ============================================================
// User Preferences API Service
// Persists user preferences (theme, cart) to MongoDB per wallet.
// ============================================================

export interface UserPreferences {
  walletAddress: string;
  darkMode?: boolean;
  cart?: CartItemData[];
}

export interface CartItemData {
  productId: string;
  quantity: number;
  selectedColor?: string;
  selectedSize?: string;
}

const API_BASE = "/api/user/preferences";

export async function fetchUserPreferences(
  wallet: string,
): Promise<UserPreferences | null> {
  try {
    const res = await fetch(`${API_BASE}?wallet=${encodeURIComponent(wallet)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function saveUserPreferences(
  walletAddress: string,
  preferences: Partial<Pick<UserPreferences, "darkMode" | "cart">>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress, preferences }),
    });
    if (!res.ok) return { success: false, error: "Save failed" };
    return await res.json();
  } catch {
    return { success: false, error: "Network error" };
  }
}
