import { useRef, useEffect } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import { useTheme } from "@/context/ThemeContext";

// Roadmap phase interface
interface RoadmapPhase {
  title: string;
  date: string;
  description: string;
  items: {
    text: string;
    completed: boolean;
  }[];
  color: string;
}

// Roadmap phases
const phases: RoadmapPhase[] = [
  {
    title: "Phase 1:TGE",
    date: "Feb 1st 2025",
    description: "Launch of the BUDJU Coin to the public",
    items: [
      { text: "Create Budju Coin", completed: true },
      { text: "50 budju wallet holders", completed: true },
      { text: "10K Market Cap", completed: true },
      { text: "Created Bank of Budju", completed: true },
      { text: "Burning BUDJU GO!", completed: true },
      { text: "Mint NFT's > 1000 holders", completed: false },
      { text: "Reach Pump.fun milestones", completed: true },
      { text: "bonding curve : 100%", completed: true },
      { text: "👑king of the hill : 100%", completed: true },
      { text: "100 budju wallet holders", completed: true },
    ],
    color: "border-budju-pink",
  },
  {
    title: "Phase 2: Rapid Progress",
    date: "1st March 2025",
    description: "Rapid progression of the BUDJU ecosystem",
    items: [
      { text: "500 Wallet Holders", completed: true },
      { text: "100K Market Cap", completed: true },
      { text: "SHOP of BUDJU's", completed: true },
      { text: "BANK of BUDJU's", completed: true },
      { text: "SHOP of BUDJU's", completed: true },
      { text: "LP POOLS of BUDJU's", completed: true },
      { text: "WEB3 Wallet intergration", completed: true },
    ],
    color: "border-budju-blue",
  },
  {
    title: "Phase 3: ",
    date: "UNKOWN 2025",
    description: "Expanding the BUDJU ecosystem",
    items: [
      { text: "Promotional Marketing", completed: false },
      { text: "1 Million Dollar Market Cap", completed: false },
      { text: "1000 Wallet Holders", completed: false },
      { text: "More Info coming", completed: false },
    ],
    color: "border-purple-500",
  },
  {
    title: "Phase 4: BUDJU is FULLY GROWN",
    date: "2026",
    description: "BUDJU Global Branding Empire",
    items: [
      { text: "Villa's of BUDJU's", completed: false },
      { text: "Competitions / Give aways", completed: false },
      { text: "Global Branding of Budju", completed: false },
      { text: "10 Million Market Cap", completed: false },
      { text: "10,000 wallet holders", completed: false },
      { text: "L1 / L2 Exchanges", completed: false },
    ],
    color: "border-green-500",
  },
];

const Roadmap = () => {
  const { isDarkMode } = useTheme();
  const sectionRef = useRef<HTMLDivElement>(null);
  const roadmapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sectionRef.current && roadmapRef.current) {
      const phases = roadmapRef.current.querySelectorAll(".roadmap-phase");

      // Animate phases on scroll
      gsap.fromTo(
        phases,
        {
          opacity: 0,
          x: -50,
        },
        {
          opacity: 1,
          x: 0,
          stagger: 0.2,
          duration: 0.8,
          ease: "power2.out",
          scrollTrigger: {
            trigger: roadmapRef.current,
            start: "top 80%",
          },
        },
      );
    }
  }, []);

  return (
    <section ref={sectionRef} className="py-20">
      <div className="budju-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className={isDarkMode ? "text-white" : "text-budju-white"}>
              ROADMAP
            </span>
          </h2>
          <p
            className={`text-lg ${isDarkMode ? "text-gray-300" : "text-white"} max-w-3xl mx-auto`}
          >
            Our ambitious plan for the BUDJU Ecosphere..
          </p>
        </motion.div>

        {/* Roadmap Timeline */}
        <div ref={roadmapRef} className="relative max-w-4xl mx-auto">
          {/* Timeline center line */}
          <div className="absolute left-4 md:left-1/2 md:-ml-0.5 w-1 h-full bg-gradient-to-b from-budju-pink via-budju-blue to-green-500 rounded-full"></div>

          {/* Timeline phases */}
          <div className="space-y-12">
            {phases.map((phase, index) => (
              <div
                key={index}
                className={`roadmap-phase flex flex-col ${
                  index % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"
                } gap-8 items-center`}
              >
                {/* Phase Title */}
                <div
                  className={`md:w-1/2 flex ${
                    index % 2 === 0 ? "md:justify-end" : "md:justify-start"
                  }`}
                >
                  <div
                    className={`text-right md:pr-8 pl-8 md:pl-0 ${
                      index % 2 === 0 ? "md:text-right" : "md:text-left"
                    }`}
                  >
                    <div className="text-budju-blue font-medium mb-1">
                      {phase.date}
                    </div>
                    <h3
                      className={`text-xl font-bold ${isDarkMode ? "text-white" : "text-budju-white"}`}
                    >
                      {phase.title}
                    </h3>
                    <p
                      className={
                        isDarkMode ? "text-gray-400 mt-2" : "text-white/80 mt-2"
                      }
                    >
                      {phase.description}
                    </p>
                  </div>
                </div>

                {/* Circle marker */}
                <div
                className={`absolute left-0 md:left-1/2 md:-translate-x-1/2 mt-1 md:mt-0 w-8 h-8 rounded-full ${isDarkMode ? "bg-white" : "bg-white"} border-4 border-white flex items-center justify-center z-10`}
                >
                <span>{index + 1}</span>
                </div>

                {/* Phase Details */}
                <div className="md:w-1/2">
                  <div
                    className={`${isDarkMode ? "budju-card" : "bg-white/20 border border-white/30 rounded-xl shadow-lg"} ${phase.color} ${
                      index % 2 === 0 ? "md:mr-8" : "md:ml-8"
                    }`}
                  >
                    <div className="p-6">
                      <ul className="space-y-3">
                        {phase.items.map((item, itemIndex) => (
                          <li key={itemIndex} className="flex items-start">
                            <div
                              className={`mt-1 mr-3 min-w-4 h-4 rounded-full ${
                                item.completed
                                    ? "bg-green-500" 
                                    : "bg-red-600"
                              }`}
                            ></div>
                            <span
                              className={
                                item.completed
                                  ? isDarkMode
                                    ? "text-white"
                                    : "text-budju-white"
                                  : isDarkMode
                                    ? "text-gray-400"
                                    : "text-white/80"
                              }
                            >
                              {item.text}
                              {item.completed && (
                                <span className="text-green-500 ml-2">✓</span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          className={`text-center mt-12 ${isDarkMode ? "text-gray-300" : "text-white"} max-w-2xl mx-auto`}
        >
            <p>
                Our BUDJU will not rest until we have conquered the universe. 
            </p>
            <p>
                #BUDJU #BUDJUISM #BUDJUARMY #BUDJU4LIFE #PROPER_BUDJU #BUDJU4EVER #BUDJU2THEMOON #BUDJUBIZ
          </p>
        </div>
      </div>
    </section>
  );
};

export default Roadmap;
