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
    title: "Phase 1: Mint Event",
    date: "Q2 2025",
    description: "Launch of the BUDJU NFT collection with exclusive mint event",
    items: [
      { text: "1,000 BUDJU token holders achieved", completed: false },
      { text: "NFT artwork and traits finalized", completed: true },
      { text: "Smart contract audited", completed: true },
      { text: "Whitelist mint for BUDJU holders", completed: false },
      { text: "Public mint launch", completed: false },
    ],
    color: "border-budju-pink",
  },
  {
    title: "Phase 2: Utility Activation",
    date: "Q3 2025",
    description: "Activating utility features for NFT holders",
    items: [
      { text: "NFT staking platform launch", completed: false },
      { text: "First exclusive airdrop for holders", completed: false },
      { text: "Merchandise store integration", completed: false },
      { text: "DAO governance setup", completed: false },
    ],
    color: "border-budju-blue",
  },
  {
    title: "Phase 3: Metaverse Integration",
    date: "Q4 2025",
    description: "Expanding the BUDJU ecosystem into the metaverse",
    items: [
      { text: "3D models of BUDJU NFTs", completed: false },
      { text: "Virtual BUDJU meetups", completed: false },
      { text: "Metaverse partnerships", completed: false },
      { text: "BUDJU virtual land sale", completed: false },
    ],
    color: "border-purple-500",
  },
  {
    title: "Phase 4: Expansion",
    date: "2026",
    description: "Further expansion of the BUDJU NFT ecosystem",
    items: [
      { text: "Second generation NFT collection", completed: false },
      { text: "Cross-chain integration", completed: false },
      { text: "NFT marketplace launch", completed: false },
      { text: "Real-world events for holders", completed: false },
    ],
    color: "border-green-500",
  },
];

const NFTRoadmap = () => {
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
            <span className="text-budju-blue">NFT</span>{" "}
            <span className={isDarkMode ? "text-white" : "text-budju-white"}>
              ROADMAP
            </span>
          </h2>
          <p
            className={`text-lg ${isDarkMode ? "text-gray-300" : "text-white"} max-w-3xl mx-auto`}
          >
            Our ambitious plan for the BUDJU NFT collection from mint to
            metaverse
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
                  className={`absolute left-0 md:left-1/2 md:-translate-x-1/2 mt-1 md:mt-0 w-8 h-8 rounded-full ${isDarkMode ? "bg-gray-900" : "bg-gray-900/50"} border-4 border-budju-blue flex items-center justify-center z-10`}
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
                                  : isDarkMode
                                    ? "bg-gray-600"
                                    : "bg-white/40"
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
            The BUDJU NFT roadmap represents our vision for the future, but
            specific timelines may be adjusted based on market conditions and
            community feedback. We're committed to delivering maximum value to
            our NFT holders at every phase.
          </p>
        </div>
      </div>
    </section>
  );
};

export default NFTRoadmap;
