import { useRef, useEffect } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import { TOKEN_INFO } from "@constants/config";

interface HistoryEvent {
  date: string;
  title: string;
  description: string;
  icon: string;
}

const historyEvents: HistoryEvent[] = [
  {
    date: TOKEN_INFO.FIRST_CREATED,
    title: "BUDJU Token Created",
    description:
      "BUDJU Token was officially launched on the Solana blockchain.",
    icon: "🚀",
  },
  {
    date: "February 10, 2025",
    title: "Listed on Raydium",
    description:
      "BUDJU was listed on Raydium DEX, providing better liquidity and trading options for holders.",
    icon: "📊",
  },
  {
    date: "February 15, 2025",
    title: "First Burn Event",
    description:
      "The first token burn occurred, removing 500,000 BUDJU from circulation to increase scarcity.",
    icon: "🔥",
  },
  {
    date: "February 20, 2025",
    title: "Bank of BUDJU Launched",
    description:
      "Bank of BUDJU was established to manage token buybacks and community initiatives.",
    icon: "🏦",
  },
  {
    date: "February 26, 2025",
    title: "Second Burn Event",
    description:
      "Another 1,069,299 BUDJU tokens were burned as part of the deflationary tokenomics.",
    icon: "🔥",
  },
];

const TokenHistory = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sectionRef.current && timelineRef.current) {
      const events = timelineRef.current.querySelectorAll(".history-event");

      // Animate timeline events on scroll
      gsap.fromTo(
        events,
        {
          opacity: 0,
          x: -30,
        },
        {
          opacity: 1,
          x: 0,
          stagger: 0.2,
          duration: 0.8,
          ease: "power2.out",
          scrollTrigger: {
            trigger: timelineRef.current,
            start: "top 80%",
          },
        },
      );
    }
  }, []);

  return (
    <section
      ref={sectionRef}
      className="py-20 bg-gradient-to-b from-budju-black to-gray-900"
    >
      <div className="budju-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className="text-white">Token</span>{" "}
            <span className="text-budju-blue">History</span>
          </h2>
          <p className="text-lg text-gray-300 max-w-3xl mx-auto">
            Key milestones in the BUDJU journey
          </p>
        </motion.div>

        {/* Timeline */}
        <div ref={timelineRef} className="max-w-4xl mx-auto relative">
          {/* Timeline center line */}
          <div className="absolute left-4 md:left-1/2 md:-ml-0.5 w-1 h-full bg-gradient-to-b from-budju-pink to-budju-blue opacity-60 rounded-full"></div>

          {/* Timeline events */}
          <div className="space-y-12 relative">
            {historyEvents.map((event, index) => (
              <div
                key={index}
                className={`history-event flex flex-col ${
                  index % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"
                } gap-8 items-center`}
              >
                {/* Date */}
                <div
                  className={`md:w-1/2 flex ${
                    index % 2 === 0 ? "md:justify-end" : "md:justify-start"
                  }`}
                >
                  <div className="text-right md:pr-8 pl-8 md:pl-0">
                    <div className="text-sm text-budju-blue font-medium mb-1">
                      {event.date}
                    </div>
                    <h3 className="text-xl font-bold text-white">
                      {event.title}
                    </h3>
                  </div>
                </div>

                {/* Circle marker */}
                <div className="absolute left-0 md:left-1/2 md:-translate-x-1/2 mt-1 md:mt-0 w-8 h-8 rounded-full bg-gray-900 border-4 border-budju-blue flex items-center justify-center shadow-glow z-10">
                  <span>{event.icon}</span>
                </div>

                {/* Description */}
                <div className={`md:w-1/2 ${index % 2 === 0 ? "" : ""}`}>
                  <div
                    className={`budju-card ${
                      index % 2 === 0 ? "md:mr-8" : "md:ml-8"
                    }`}
                  >
                    <div className="p-4">
                      <p className="text-gray-300">{event.description}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-center mt-10">
          <p className="text-gray-400 max-w-2xl mx-auto">
            BUDJU continues to grow and evolve with our community. Stay tuned
            for more exciting developments on our roadmap!
          </p>
        </div>
      </div>
    </section>
  );
};

export default TokenHistory;
