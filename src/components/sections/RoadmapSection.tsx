import { useState, useCallback, memo } from "react";
import { motion } from "framer-motion";
import { RoadmapPhase } from "@/types";
import { useAnimationObserver } from "@/hooks/useAnimationObserver";
import SectionTitle from "../common/SectionTitle";

interface RoadmapSectionProps {
  roadmapPhases: RoadmapPhase[];
  videoSrc: string;
}

const RoadmapSection = ({ roadmapPhases, videoSrc }: RoadmapSectionProps) => {
  const [activePhase, setActivePhase] = useState(0);
  const [ref, controls] = useAnimationObserver();

  const handleDotClick = useCallback((index: number) => {
    setActivePhase(index);
  }, []);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 },
    },
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return "🟢";
      case "inProgress":
        return "🟠";
      case "pending":
        return "🔴";
      default:
        return "⚪";
    }
  };

  return (
    <section className="py-12 bg-black" id="roadmap">
      <div className="container px-4 mx-auto">
        <SectionTitle whiteText="Road" blueText="map" />

        <motion.div
          ref={ref}
          className="max-w-5xl mx-auto"
          variants={containerVariants}
          initial="hidden"
          animate={controls}
        >
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <motion.div
              className="relative overflow-hidden rounded-lg aspect-video"
              variants={itemVariants}
            >
              <video
                controls
                className="absolute inset-0 object-cover w-full h-full"
                poster="/path-to-poster-image.jpg"
              >
                <source src={videoSrc} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </motion.div>

            <motion.div variants={itemVariants}>
              <div className="mb-8">
                <h3 className="text-2xl font-bold text-light-blue">
                  PHASE {activePhase + 1}
                </h3>
                <ul className="mt-4 space-y-2">
                  {roadmapPhases[activePhase]?.items.map((item, index) => (
                    <li key={index} className="flex text-white">
                      <span className="mr-2">{getStatusIcon(item.status)}</span>
                      <span>{item.text}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex justify-center gap-3 mt-4">
                {roadmapPhases.map((_, index) => (
                  <button
                    key={index}
                    className={`w-3 h-3 rounded-full ${
                      activePhase === index ? "bg-light-blue" : "bg-gray-600"
                    }`}
                    onClick={() => handleDotClick(index)}
                    aria-label={`View Phase ${index + 1}`}
                  />
                ))}
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default memo(RoadmapSection);
