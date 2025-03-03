// src/lib/utils/animations.ts
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// Register plugins
gsap.registerPlugin(ScrollTrigger);

// We'll use a custom interface to allow boolean shortcuts
export interface AnimationConfig {
  duration?: number;
  delay?: number;
  ease?: string;
  stagger?: number | object;
  scrollTrigger?: boolean | Record<string, any>;
}

/**
 * Creates a reveal animation for elements
 */
export const revealElement = (
  element: string | Element | Element[],
  config: AnimationConfig = {},
) => {
  const {
    duration = 0.6,
    delay = 0,
    ease = "power2.out",
    stagger = 0.1,
    scrollTrigger,
  } = config;

  // Build the animation options
  const animationOptions: gsap.TweenVars = {
    y: 0,
    opacity: 1,
    duration,
    delay,
    ease,
    stagger,
  };

  // Handle scrollTrigger specifically
  if (scrollTrigger === true) {
    // Create a proper ScrollTrigger object
    animationOptions.scrollTrigger = {
      trigger:
        typeof element === "string"
          ? element
          : Array.isArray(element)
            ? element[0]
            : element,
      start: "top 80%",
      toggleActions: "play none none none",
    };
  } else if (scrollTrigger && typeof scrollTrigger === "object") {
    // Use the provided object directly
    animationOptions.scrollTrigger = scrollTrigger;
  }
  // If scrollTrigger is false or undefined, don't add it to the options

  // Create the animation
  const animation = gsap.fromTo(
    element,
    {
      y: 30,
      opacity: 0,
    },
    animationOptions,
  );

  return animation;
};

/**
 * Creates a fade-in animation
 */
export const fadeIn = (
  element: string | Element | Element[],
  config: AnimationConfig = {},
) => {
  const {
    duration = 0.8,
    delay = 0,
    ease = "power1.inOut",
    scrollTrigger,
  } = config;

  // Build the animation options
  const animationOptions: gsap.TweenVars = {
    opacity: 1,
    duration,
    delay,
    ease,
  };

  // Handle scrollTrigger specifically
  if (scrollTrigger === true) {
    animationOptions.scrollTrigger = {
      trigger:
        typeof element === "string"
          ? element
          : Array.isArray(element)
            ? element[0]
            : element,
      start: "top 90%",
      toggleActions: "play none none none",
    };
  } else if (scrollTrigger && typeof scrollTrigger === "object") {
    animationOptions.scrollTrigger = scrollTrigger;
  }

  const animation = gsap.fromTo(element, { opacity: 0 }, animationOptions);

  return animation;
};

/**
 * Creates a floating animation
 */
export const floatAnimation = (
  element: string | Element | Element[],
  config: { amplitude?: number; duration?: number } = {},
) => {
  const { amplitude = 15, duration = 2 } = config;

  const animation = gsap.to(element, {
    y: amplitude,
    duration,
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut",
  });

  return animation;
};

/**
 * Creates a particle burst effect
 */
export const particleBurst = (
  parentElement: Element,
  config: {
    count?: number;
    colors?: string[];
    size?: number;
    duration?: number;
  } = {},
) => {
  const {
    count = 20,
    colors = ["#FF69B4", "#87CEFA", "#FFD700"],
    size = 8,
    duration = 1,
  } = config;

  const particles: HTMLElement[] = [];

  // Create particles
  for (let i = 0; i < count; i++) {
    const particle = document.createElement("div");
    particle.style.position = "absolute";
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.borderRadius = "50%";
    particle.style.backgroundColor =
      colors[Math.floor(Math.random() * colors.length)];
    particle.style.pointerEvents = "none";

    parentElement.appendChild(particle);
    particles.push(particle);

    const angle = Math.random() * Math.PI * 2;
    const distance = 30 + Math.random() * 70;

    gsap.fromTo(
      particle,
      {
        x: 0,
        y: 0,
        scale: 0,
        opacity: 1,
      },
      {
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        scale: 0.2 + Math.random() * 0.8,
        opacity: 0,
        duration: duration + Math.random() * 0.5,
        ease: "power2.out",
        onComplete: () => {
          if (parentElement.contains(particle)) {
            parentElement.removeChild(particle);
          }
        },
      },
    );
  }
};

/**
 * Animates counting up a number
 */
export const animateCounter = (
  element: Element,
  targetValue: number,
  config: {
    duration?: number;
    prefix?: string;
    suffix?: string;
    decimals?: number;
  } = {},
) => {
  const { duration = 1.5, prefix = "", suffix = "", decimals = 0 } = config;

  const obj = { value: 0 };

  const animation = gsap.to(obj, {
    value: targetValue,
    duration,
    ease: "power2.out",
    onUpdate: () => {
      const formatted = obj.value.toFixed(decimals);
      element.textContent = `${prefix}${parseFloat(formatted).toLocaleString()}${suffix}`;
    },
  });

  return animation;
};

/**
 * Creates a 3D tilt effect for cards
 */
export const createTiltEffect = (element: Element, intensity: number = 15) => {
  const handleMouseMove = (e: Event) => {
    const mouseEvent = e as MouseEvent;
    const rect = element.getBoundingClientRect();
    const x = mouseEvent.clientX - rect.left; // x position within the element
    const y = mouseEvent.clientY - rect.top; // y position within the element

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const percentX = (x - centerX) / centerX; // -1 to 1
    const percentY = (y - centerY) / centerY; // -1 to 1

    gsap.to(element, {
      rotationY: percentX * intensity,
      rotationX: -percentY * intensity,
      transformPerspective: 900,
      duration: 0.4,
      ease: "power1.out",
    });
  };

  const handleMouseLeave = () => {
    gsap.to(element, {
      rotationY: 0,
      rotationX: 0,
      duration: 0.7,
      ease: "elastic.out(1, 0.5)",
    });
  };

  element.addEventListener("mousemove", handleMouseMove);
  element.addEventListener("mouseleave", handleMouseLeave);

  // Return cleanup function
  return () => {
    element.removeEventListener("mousemove", handleMouseMove);
    element.removeEventListener("mouseleave", handleMouseLeave);
  };
};

/**
 * Page transition animation
 */
export const pageTransition = {
  initial: {
    opacity: 0,
    y: 20,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1],
    },
  },
  exit: {
    opacity: 0,
    y: -20,
    transition: {
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

/**
 * Stagger animation for list items
 */
export const staggerItems = (
  elements: Element[] | NodeListOf<Element>,
  config: AnimationConfig = {},
) => {
  const {
    duration = 0.5,
    stagger = 0.1,
    ease = "power2.out",
    scrollTrigger,
  } = config;

  // Convert NodeList to Array if needed
  const elementsArray = Array.from(elements);

  // Build the animation options
  const animationOptions: gsap.TweenVars = {
    opacity: 1,
    y: 0,
    duration,
    stagger,
    ease,
  };

  // Handle scrollTrigger specifically
  if (scrollTrigger === true && elementsArray.length > 0) {
    animationOptions.scrollTrigger = {
      trigger: elementsArray[0],
      start: "top 80%",
      toggleActions: "play none none none",
    };
  } else if (scrollTrigger && typeof scrollTrigger === "object") {
    animationOptions.scrollTrigger = scrollTrigger;
  }

  const animation = gsap.fromTo(
    elementsArray,
    { opacity: 0, y: 30 },
    animationOptions,
  );

  return animation;
};
