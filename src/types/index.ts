// Token related types
export interface TokenData {
  symbol: string;
  supply: number;
  pricePerToken: number;
  currency: string;
  marketCap: number;
  holders: number;
  firstCreated: string;
}

// Roadmap related types
export interface RoadmapPhase {
  title: string;
  items: {
    text: string;
    status: "completed" | "inProgress" | "pending";
  }[];
}

// Product related types
export interface Product {
  id: string;
  title: string;
  category: "ladies" | "mens" | "caps" | "special";
  description: string;
  imageSrc: string;
  price: number;
  url: string;
}

// Bank related types
export interface BankData {
  burnedTokens: number;
  burnedAddress: string;
  totalSupply: number;
  bankAddress: string;
  tokensHeld: Array<string>;
  buyBackAmount: string;
  donationsAddress: string;
  lastBurnDate: string;
}
