import { useEffect } from "react";
import { useAnimation, type AnimationControls } from "framer-motion";
import { useInView } from "react-intersection-observer";

/**
 * Custom hook that observes an element's visibility and triggers animations based on its visibility state.
 *
 * @param {number} [threshold=0.1] - A number between 0 and 1 indicating the percentage of the target's visibility the observer's callback should execute. Default is 0.1.
 * @param {boolean} [triggerOnce=true] - A boolean indicating whether the observer should stop observing after the first time the target is visible. Default is true.
 * @returns {[(node?: Element | null) => void, AnimationControls]} - Returns a tuple containing a ref callback to be assigned to the element to observe and animation controls to manage the animation state.
 */

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
