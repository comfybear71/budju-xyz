import { useEffect } from "react";
import { Link } from "react-router";
import { APP_NAME } from "@constants/config";
import { ROUTES } from "@/constants/routes";
import { useTheme } from "@/context/ThemeContext";

const Privacy = () => {
  const { isDarkMode } = useTheme();

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `Privacy Policy — ${APP_NAME}`;
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
            Privacy Policy
          </h1>
          <p className={`mt-2 text-sm ${muted}`}>
            Last updated: August 15, 2026
          </p>
        </header>

        <section className={`space-y-3 text-sm leading-relaxed ${prose}`}>
          <h2 className={`text-lg font-semibold ${heading}`}>
            1. What we collect
          </h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Wallet addresses</strong> you choose to connect, used to
              show balances, pool shares, and preferences.
            </li>
            <li>
              <strong>Server logs</strong> typical of a hosted web app (IP,
              user-agent, request paths) for rate limiting, abuse prevention,
              and reliability.
            </li>
            <li>
              <strong>Optional analytics</strong> (e.g. Vercel Analytics /
              configured analytics IDs) to understand aggregate traffic.
            </li>
            <li>
              We do <strong>not</strong> ask for seed phrases or private keys.
              Never enter them on this site.
            </li>
          </ul>
        </section>

        <section className={`space-y-3 text-sm leading-relaxed ${prose}`}>
          <h2 className={`text-lg font-semibold ${heading}`}>
            2. How we use data
          </h2>
          <p>
            Data is used to operate the site, enforce rate limits, run
            authenticated admin/cron jobs, and improve product reliability. We
            do not sell personal data.
          </p>
        </section>

        <section className={`space-y-3 text-sm leading-relaxed ${prose}`}>
          <h2 className={`text-lg font-semibold ${heading}`}>
            3. Third parties
          </h2>
          <p>
            The site may call or proxy public blockchain and market APIs
            (Solana RPC / Helius, Jupiter, CoinGecko, Binance/OKX klines,
            Telegram Bot API, etc.). Their privacy practices apply to data they
            receive.
          </p>
        </section>

        <section className={`space-y-3 text-sm leading-relaxed ${prose}`}>
          <h2 className={`text-lg font-semibold ${heading}`}>4. Contact</h2>
          <p>
            Privacy or security questions:{" "}
            <a
              className="text-budju-pink hover:underline"
              href="mailto:support@budjucoin.com"
            >
              support@budjucoin.com
            </a>
            . Also see{" "}
            <Link to={ROUTES.SECURITY} className="text-budju-pink hover:underline">
              Security
            </Link>{" "}
            and{" "}
            <Link to={ROUTES.TERMS} className="text-budju-pink hover:underline">
              Terms
            </Link>
            .
          </p>
        </section>
      </article>
    </main>
  );
};

export default Privacy;
