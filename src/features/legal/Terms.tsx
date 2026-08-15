import { useEffect } from "react";
import { Link } from "react-router";
import { APP_NAME } from "@constants/config";
import { ROUTES } from "@/constants/routes";
import { useTheme } from "@/context/ThemeContext";
import { TOKEN_ADDRESS } from "@/constants/addresses";

const Terms = () => {
  const { isDarkMode } = useTheme();

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `Terms of Service — ${APP_NAME}`;
  }, []);

  const prose = isDarkMode ? "text-gray-300" : "text-gray-700";
  const heading = isDarkMode ? "text-white" : "text-gray-900";
  const muted = isDarkMode ? "text-gray-500" : "text-gray-500";

  return (
    <main className="pt-24 pb-16 px-4">
      <article className="max-w-3xl mx-auto space-y-8">
        <header>
          <p className={`text-xs uppercase tracking-wider mb-2 ${muted}`}>
            Legal
          </p>
          <h1 className={`text-3xl md:text-4xl font-bold font-display ${heading}`}>
            Terms of Service
          </h1>
          <p className={`mt-2 text-sm ${muted}`}>
            Last updated: August 15, 2026 · Site:{" "}
            <a
              className="text-budju-pink hover:underline"
              href="https://www.budju.xyz"
            >
              www.budju.xyz
            </a>
          </p>
        </header>

        <section className={`space-y-3 text-sm leading-relaxed ${prose}`}>
          <h2 className={`text-lg font-semibold ${heading}`}>1. What BUDJU is</h2>
          <p>
            BUDJU is a Solana community / meme-coin project and website. The
            token mint is{" "}
            <code className="text-xs break-all">{TOKEN_ADDRESS}</code>. The
            site provides informational pages, merchandise links, wallet
            connection for Solana interactions, Jupiter-powered swaps, and
            optional paper (simulated) perpetual trading tools.
          </p>
        </section>

        <section className={`space-y-3 text-sm leading-relaxed ${prose}`}>
          <h2 className={`text-lg font-semibold ${heading}`}>
            2. On-chain transactions
          </h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              Token swaps on this site are built using{" "}
              <strong>official Jupiter Swap APIs</strong> (
              <code className="text-xs">api.jup.ag</code> /{" "}
              <code className="text-xs">lite-api.jup.ag</code>), proxied through
              our backend. We do not deploy or invoke custom “drain” programs.
            </li>
            <li>
              Wallet connect supports Phantom, Solflare, and Jupiter wallets.
              You review and approve every transaction in your wallet before it
              is submitted.
            </li>
            <li>
              Paper perpetual futures on BUDJU are{" "}
              <strong>simulated / virtual balances</strong> for research and
              education. They are not live Jupiter Perps custody of user funds
              unless explicitly stated otherwise in-product.
            </li>
          </ul>
        </section>

        <section className={`space-y-3 text-sm leading-relaxed ${prose}`}>
          <h2 className={`text-lg font-semibold ${heading}`}>
            3. No financial advice
          </h2>
          <p>
            Nothing on this website is financial, investment, tax, or legal
            advice. Cryptocurrency is volatile and risky. You are solely
            responsible for your wallets, keys, and transactions.
          </p>
        </section>

        <section className={`space-y-3 text-sm leading-relaxed ${prose}`}>
          <h2 className={`text-lg font-semibold ${heading}`}>4. Eligibility</h2>
          <p>
            You must be legally able to use Solana DeFi tools in your
            jurisdiction. You agree not to use the site for fraud, phishing,
            money laundering, or other illegal activity.
          </p>
        </section>

        <section className={`space-y-3 text-sm leading-relaxed ${prose}`}>
          <h2 className={`text-lg font-semibold ${heading}`}>
            5. Open source &amp; contact
          </h2>
          <p>
            Source code is published at{" "}
            <a
              className="text-budju-pink hover:underline"
              href="https://github.com/comfybear71/budju-xyz"
              target="_blank"
              rel="noopener noreferrer"
            >
              github.com/comfybear71/budju-xyz
            </a>
            . Security reports: see{" "}
            <Link to={ROUTES.SECURITY} className="text-budju-pink hover:underline">
              Security
            </Link>{" "}
            and{" "}
            <a
              className="text-budju-pink hover:underline"
              href="https://www.budju.xyz/.well-known/security.txt"
            >
              /.well-known/security.txt
            </a>
            .
          </p>
        </section>

        <section className={`space-y-3 text-sm leading-relaxed ${prose}`}>
          <h2 className={`text-lg font-semibold ${heading}`}>6. Changes</h2>
          <p>
            We may update these terms. Continued use of the site after changes
            means you accept the updated terms. Related:{" "}
            <Link to={ROUTES.PRIVACY} className="text-budju-pink hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </section>
      </article>
    </main>
  );
};

export default Terms;
