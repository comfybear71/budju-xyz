import { memo, ButtonHTMLAttributes, ReactNode } from "react";
import { motion } from "framer-motion";

type ButtonProps = {
  variant?: "primary" | "secondary" | "hot-pink";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  href?: string;
  external?: boolean;
  children: ReactNode;
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className">;

const Button = ({
  children,
  variant = "primary",
  size = "md",
  fullWidth = false,
  href,
  external = false,
  className = "",
  ...props
}: ButtonProps) => {
  const variantStyles = {
    primary: "bg-light-blue text-white hover:bg-blue-400",
    secondary: "bg-white text-black hover:bg-gray-100",
    "hot-pink": "bg-hot-pink text-white hover:bg-pink-500",
  };

  const sizeStyles = {
    sm: "px-3 py-1 text-sm",
    md: "px-5 py-2",
    lg: "px-6 py-3 text-lg",
  };

  const baseStyles = `font-bold rounded-full transition-all duration-200 ${
    fullWidth ? "w-full" : ""
  } ${variantStyles[variant]} ${sizeStyles[size]} ${className}`;

  const motionProps = {
    whileHover: { scale: 1.05 },
    whileTap: { scale: 0.95 },
  };

  if (href) {
    return external ? (
      <motion.a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={baseStyles}
        whileHover={motionProps.whileHover}
        whileTap={motionProps.whileTap}
      >
        {children}
      </motion.a>
    ) : (
      <motion.a
        href={href}
        className={baseStyles}
        whileHover={motionProps.whileHover}
        whileTap={motionProps.whileTap}
      >
        {children}
      </motion.a>
    );
  }

  const { onDrag, onDragStart, onDragEnd, onAnimationStart, ...buttonProps } =
    props;

  return (
    <motion.button
      className={baseStyles}
      whileHover={motionProps.whileHover}
      whileTap={motionProps.whileTap}
      {...buttonProps}
    >
      {children}
    </motion.button>
  );
};

export default memo(Button);
