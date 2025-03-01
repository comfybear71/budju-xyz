import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import Head from "../components/common/Head";
import HowToBuySection from "../components/sections/HowToBuySection";
import logoImage from "../assets/images/logo.png";

const HowToBuyPage = () => {
  return (
    <>
      <Head
        title="How To Buy BUDJU COIN"
        description="Learn how to buy BUDJU COIN, the vibrant Solana token with NFTs, community rewards, and exclusive merchandise."
      />

      <div className="flex flex-col min-h-screen bg-black text-white">
        <Navbar
          logoSrc={logoImage}
          buyLink="https://ape.pro/solana/2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump"
        />

        <main className="flex-grow pt-20">
          <HowToBuySection />
        </main>

        <Footer />
      </div>
    </>
  );
};

export default HowToBuyPage;
