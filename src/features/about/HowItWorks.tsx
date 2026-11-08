import { useNavigate } from "react-router";
import { FaArrowLeft } from "react-icons/fa";

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="rounded-2xl p-4 md:p-5 mb-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
    <h2 className="text-base md:text-lg font-bold text-slate-100 mb-2">{title}</h2>
    <div className="text-[13px] md:text-sm text-slate-300 leading-relaxed space-y-2">{children}</div>
  </section>
);

const Row = ({ what, found, verdict, tone }: { what: string; found: string; verdict: string; tone: "good" | "warn" | "bad" }) => {
  const color = tone === "good" ? "#4ade80" : tone === "warn" ? "#fbbf24" : "#f87171";
  return (
    <div className="rounded-xl p-3 mb-2" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="font-bold text-slate-100 text-[13px]">{what}</div>
        <span className="text-[11px] font-bold flex-shrink-0 px-2 py-0.5 rounded-md" style={{ color, background: `${color}22` }}>{verdict}</span>
      </div>
      <div className="text-[12px] text-slate-400 mt-1">{found}</div>
    </div>
  );
};

const HowItWorks = () => {
  const navigate = useNavigate();
  return (
    <div className="max-w-3xl mx-auto px-4 pt-20 pb-12">
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)" }}
        >
          <FaArrowLeft size={14} className="text-green-400" />
        </button>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-100">How BUDJU works — and why it's built this way</h1>
          <p className="text-[11px] md:text-xs text-slate-500">What we tried, what we found, and what we chose. Plain language, no hype.</p>
        </div>
      </div>

      <Card title="The short version">
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Your money stays in your own Swyftx account.</b> BUDJU never holds, pools or moves your funds.</li>
          <li>The bot follows <b>simple, visible rules</b>: buy small when a coin dips, sell a small slice when it recovers, repeat.</li>
          <li>We tested many fancier ideas. Most didn't beat the simple approach, so we kept the simple one and added safety controls.</li>
          <li>We publish our own scorecard, including the parts that don't flatter us.</li>
          <li><b>Nothing here is a promise of profit.</b> Crypto can fall a long way. This is a tool for accumulating over time, not a get-rich-quick system.</li>
        </ul>
      </Card>

      <Card title="How the bot works">
        <p>Every coin sits in three layers. Each layer watches the price and reacts on its own:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Tier 1</b> buys a small amount after a modest dip (about −5%), <b>Tier 2</b> after a deeper dip (about −8.5%), <b>Tier 3</b> after a crash (about −15%).</li>
          <li>When a coin recovers (about +12.5% / +15% / +20%) the bot sells only a <b>small slice</b> of what it bought, never below your average cost.</li>
          <li>The cash from those sales is available for the next dip. Over time you hold more of the coin and keep cash working.</li>
          <li>Each layer waits a few hours after a trade (a cooldown) so it can't fire over and over in one move.</li>
        </ul>
      </Card>

      <Card title="Why your money stays yours">
        <p>
          Each person connects <b>their own Swyftx account</b> with their own API key. The bot places buy and sell orders in that account and nothing else — it is not set up to withdraw funds, and
          we recommend creating your key with trading permission only. You can switch the bot off, or remove your key, at any time. Each person is responsible for their own account and tax records, and
          you can download your full trade history from the Activity screen.
        </p>
        <p className="text-slate-400">We deliberately do <b>not</b> run a pooled fund where one account trades for many people. That model carries custody and regulatory risk for everyone involved.</p>
      </Card>

      <Card title="What we tried — and what we found">
        <Row what="Pooling everyone's money in one account" verdict="Dropped" tone="bad"
          found="Too much risk for everyone: custody, legal and tax. Replaced by one account per person." />
        <Row what="Fast (1-minute) paper trading with leverage" verdict="Dropped" tone="bad"
          found="Across all markets and strategies, nothing was profitable once fees were counted. 1-minute moves are mostly noise." />
        <Row what="Copying 'profitable traders' on leveraged markets" verdict="Parked" tone="warn"
          found="The biggest profit tables are dominated by market makers and hedged accounts (100% win rates, all one-sided positions, $10M+). Not copyable, and spot accounts can't mirror shorts or leverage." />
        <Row what="Smarter sell rules (trailing, wider, 'hold winners', volatility-scaled)" verdict="No clear winner" tone="warn"
          found="Replayed on a year of prices across about 50 coins. The best few were within noise of each other, so we kept the simple rule instead of adding complexity." />
        <Row what="Choosing which coins to hold" verdict="Matters most" tone="good"
          found="Differences between coins were far larger than differences between sell rules. So we built tools to rank coins, flag weak ones and swap them out, and size positions by how established a coin is." />
      </Card>

      <Card title="What our own scorecard says">
        <p>
          We measure the bot against two simple benchmarks: the same buys but never selling, and putting all the money in on day one. In our own tracking, the <b>dip-buying part has made money</b>.
          Taking profits <b>reduced results in coins that kept climbing</b> (we sold some too early) and <b>helped in coins that fell</b>. No sell rule we tested clearly fixed that trade-off.
        </p>
        <p className="text-slate-400">So we don't claim to beat the market. The aim is a disciplined, transparent way to accumulate, with risk limits, and honest measurement of whether it's working.</p>
      </Card>

      <Card title="Pros and cons">
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <div className="font-bold text-green-400 mb-1">Pros</div>
            <ul className="list-disc pl-5 space-y-1">
              <li>Your funds stay in your account; we can't withdraw them.</li>
              <li>Simple rules you can understand and switch off.</li>
              <li>Buys dips automatically, 24/7, without emotion.</li>
              <li>Safety limits: daily buying cap, optional per-coin cap, failure alerts.</li>
              <li>Full trade history download for your own records.</li>
              <li>Open about what works and what doesn't.</li>
            </ul>
          </div>
          <div>
            <div className="font-bold text-amber-400 mb-1">Cons</div>
            <ul className="list-disc pl-5 space-y-1">
              <li>Not proven to beat simply holding; strong rallies can leave you with less exposure.</li>
              <li>Keeps buying dips, so a coin that keeps falling means more of it, at falling prices.</li>
              <li>Only works on coins Swyftx lists; spot only (no shorting or leverage).</li>
              <li>Depends on third-party services (exchange, price data) being available.</li>
              <li>You still carry the market risk and the tax responsibility.</li>
            </ul>
          </div>
        </div>
      </Card>

      <Card title="Questions worth asking any bot or service — including this one">
        <ul className="list-disc pl-5 space-y-1">
          <li>Where does my money sit, and can you withdraw it?</li>
          <li>Does it beat simply holding, after fees, and can I see the proof?</li>
          <li>What happens in a crash? What are the limits on how much it can buy or spend?</li>
          <li>Does anyone promise returns? (If so, be careful.)</li>
          <li>How do I turn it off and get my records for tax?</li>
        </ul>
      </Card>

      <p className="text-[11px] text-slate-500 leading-relaxed mt-4">
        This page is general information only and is not financial, tax or legal advice. Cryptocurrency is volatile and you can lose money. Past results do not predict future results. BUDJU makes no promise of
        profit. Speak to a licensed adviser and an accountant about your own situation.
      </p>
    </div>
  );
};

export default HowItWorks;
