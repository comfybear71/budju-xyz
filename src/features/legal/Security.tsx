import { useEffect } from "react";
import { Link } from "react-router";
import { APP_NAME } from "@constants/config";
import { ROUTES } from "@/constants/routes";
import { useTheme } from "@/context/ThemeContext";
import { TOKEN_ADDRESS } from "@/constants/addresses";

const Security = () => {
  const { isDarkMode } = useTheme();

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `Security — ${APP_NAME}`;
  }, []);

  const prose = isDarkMode ? "text-gray-300" : "text-gray-700";
  const heading = isDarkMode ? "text-white" : "text-gray-900";
  const muted = isDarkMode ? "text-gray-500" : "text-gray-500";

  return (
    <main className="pt-24 pb-16 px-4">
      <article className="max-w-3xl mx-auto space-y-8">
        <header>
          <p className={`text-xs uppercase tracking-wider mb-2 ${muted}`}>
            Trust &amp; safety
          </p>
          <h1 className={`text-3xl md:text-4xl font-bold font-display ${heading}`}>
            Security
          </h1>
          <p className={`mt-2 text-sm ${muted}`}>
            For wallet security reviewers (Blowfish, Phantom, Solflare) and
            responsible disclosure.
          </p>
        </header>

        <section className={`space-y-3 text-sm leading-relaxed ${prose}`}>
          <h2 className={`text-lg font-semibold ${heading}`}>
            Responsible disclosure
          </h2>
          <p>
            Email{" "}
            <a
              className="text-budju-pink hover:underline"
              href="mailto:support@budjucoin.com"
            >
              support@budjucoin.com
            </a>{" "}
            or{" "}
            <a
              className="text-budju-pink hover:underline"
              href="mailto:sfrench71@me.com"
            >
              sfrench71@me.com
            </a>
            . Do not open a public GitHub issue for vulnerabilities. Machine-readable
            contact:{" "}
            <a
              className="text-budju-pink hover:underline"
              href="https://www.budju.xyz/.well-known/security.txt"
            >
              /.well-known/security.txt
            </a>
            .
          </p>
          <p>We aim to acknowledge within 48 hours and update within 7 days.</p>
        </section>

        <section className={`space-y-3 text-sm leading-relaxed ${prose}`}>
          <h2 className={`text-lg font-semibold ${heading}`}>
            What this dApp does on-chain
          </h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>No custom Solana program</strong> owned by BUDJU for
              swaps. Swap payloads come from official Jupiter quote/swap APIs.
            </li>
            <li>
              Frontend is a <strong>Vite + React SPA</strong> (not Next.js),
              open source:{" "}
              <a
                className="text-budju-pink hover:underline"
                href="https://github.com/comfybear71/budju-xyz"
                target="_blank"
                rel="noopener noreferrer"
              >
                github.com/comfybear71/budju-xyz
              </a>
              .
            </li>
            <li>
              SPL token mint:{" "}
              <a
                className="text-budju-pink hover:underline break-all"
                href={`https://solscan.io/token/${TOKEN_ADDRESS}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {TOKEN_ADDRESS}
              </a>
            </li>
            <li>
              Wallets: Phantom, Solflare, Jupiter (Wallet Standard). Users
              always confirm transactions in-wallet.
            </li>
            <li>
              Perp UI is primarily <strong>paper trading</strong> with virtual
              balances — not a hidden custodian of user SOL.
            </li>
          </ul>
        </section>

        <section className={`space-y-3 text-sm leading-relaxed ${prose}`}>
          <h2 className={`text-lg font-semibold ${heading}`}>
            Platform controls
          </h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>CORS restricted to budju.xyz / www.budju.xyz / localhost</li>
            <li>API rate limiting on read/write and proxy routes</li>
            <li>Cron endpoints authenticated via secrets</li>
            <li>Trading kill-switch via environment configuration</li>
          </ul>
        </section>

        <section className={`space-y-3 text-sm leading-relaxed ${prose}`}>
          <h2 className={`text-lg font-semibold ${heading}`}>Related</h2>
          <p>
            <Link to={ROUTES.TERMS} className="text-budju-pink hover:underline">
              Terms of Service
            </Link>
            {" · "}
            <Link to={ROUTES.PRIVACY} className="text-budju-pink hover:underline">
              Privacy Policy
            </Link>
            {" · "}
            <a
              className="text-budju-pink hover:underline"
              href="https://github.com/comfybear71/budju-xyz/blob/master/docs/SECURITY.md"
              target="_blank"
              rel="noopener noreferrer"
            >
              SECURITY.md on GitHub
            </a>
          </p>
        </section>
      </article>
    </main>
  );
};

export default Security;
