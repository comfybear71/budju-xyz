const HELP = "https://help.phantom.com/hc/en-us/articles/47187740851731";
const RULES = "https://phantom.com/prediction-market-disclosures";

/** Optional info card: prediction markets live inside the user's own Phantom app. BUDJU never handles, recommends or earns from them. */
const PredictionMarketsCard = () => (
  <div className="rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
    <div className="text-sm font-bold text-slate-200 mb-1">🔮 Prediction markets (in Phantom)</div>
    <p className="text-[11px] text-slate-400 leading-relaxed">
      Optional. Phantom has a prediction-markets feature of its own. You use it inside your own Phantom app with your own money —
      BUDJU doesn't handle, recommend or profit from these trades. It isn't available in every country, and Phantom's provider
      may ask you to verify your identity. Check the rules first and do your own research.
    </p>
    <div className="flex flex-wrap gap-2 mt-2">
      <a href={HELP} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-teal-300" style={{ background: "rgba(20,184,166,0.12)", border: "1px solid rgba(20,184,166,0.3)" }}>
        How it works in Phantom ↗
      </a>
      <a href={RULES} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-slate-300" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
        Rules &amp; eligibility ↗
      </a>
    </div>
  </div>
);

export default PredictionMarketsCard;
