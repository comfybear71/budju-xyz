import { useEffect } from "react";
import { useAnimation, type AnimationControls } from "framer-motion";
import { useInView } from "react-intersection-observer";

export const useAnimationObserver = (
  threshold = 0.1,
  triggerOnce = true,
): [(node?: Element | null) => void, AnimationControls] => {
  const controls = useAnimation();
  const { ref, inView } = useInView({
    threshold,
    triggerOnce,
  });

  useEffect(() => {
    if (inView) {
      controls.start("visible");
    }
  }, [controls, inView]);

  return [ref, controls];
};
