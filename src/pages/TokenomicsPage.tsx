import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import Head from "../components/common/Head";
import TokenomicsSection from "../components/sections/TokenomicsSection";
import BankSection from "../components/sections/BankSection";
import { useTokenData } from "../hooks/useTokenData";
import { bankData } from "../data/mockData";
import logoImage from "../assets/images/logo.png";

const TokenomicsPage = () => {
  const { tokenData, loading } = useTokenData();

  return (
    <>
      <Head
        title="BUDJU COIN Tokenomics"
        description="Explore BUDJU COIN tokenomics, supply information, and the innovative Bank of Budju system that burns tokens to increase value."
      />

      <div className="flex flex-col min-h-screen bg-black text-white">
        <Navbar
          logoSrc={logoImage}
          buyLink="https://ape.pro/solana/2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump"
        />

        <main className="flex-grow pt-20">
          <TokenomicsSection
            tokenData={
              tokenData || {
                symbol: "BUDJU",
                supply: 1000000000,
                pricePerToken: 0.0000123,
                currency: "USDC",
                marketCap: 123000,
                holders: 138,
                firstCreated: "January 31, 2025",
              }
            }
            isLoading={loading}
          />

          <BankSection bankData={bankData} />
        </main>

        <Footer />
      </div>
    </>
  );
};

export default TokenomicsPage;
