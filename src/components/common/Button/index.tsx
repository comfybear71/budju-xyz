import { forwardRef, ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router";
import { useTheme } from "@/context/ThemeContext";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonBaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  className?: string;
}

interface ButtonAsButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    ButtonBaseProps {
  as?: "button";
}

interface ButtonAsLinkProps extends ButtonBaseProps {
  as: "link";
  to: string;
  external?: boolean;
  children: ReactNode;
}

interface ButtonAsAnchorProps extends ButtonBaseProps {
  as: "a";
  href: string;
  target?: string;
  rel?: string;
  children: ReactNode;
}

type ButtonProps =
  | ButtonAsButtonProps
  | ButtonAsLinkProps
  | ButtonAsAnchorProps;

const getBaseClasses = (
  variant: ButtonVariant,
  size: ButtonSize,
  fullWidth: boolean,
  isLoading: boolean,
  isDarkMode: boolean,
  className?: string,
) => {
  const baseClasses = [
    "font-bold rounded-budju transition-all duration-300 focus:outline-none",
    "flex items-center justify-center",
    isLoading ? "cursor-not-allowed opacity-70" : "transform hover:scale-105",
    fullWidth ? "w-full" : "inline-flex",
  ];

  const sizeClasses = {
    sm: "text-xs px-3 py-1.5 sm:px-4 sm:py-2",
    md: "text-sm px-4 py-2 sm:px-6 sm:py-3",
    lg: "text-base px-6 py-3 sm:px-8 sm:py-4",
  };

  const variantClasses = {
    primary: `${
      isDarkMode
        ? "bg-budju-pink hover:bg-budju-pink-dark text-white"
        : "bg-budju-pink hover:bg-budju-pink-dark text-gray-900"
    } shadow-budju`,
    secondary: `${
      isDarkMode
        ? "bg-budju-blue hover:bg-budju-blue-dark text-white"
        : "bg-budju-blue hover:bg-budju-blue-dark text-gray-900"
    } shadow-budju`,
    outline: `${
      isDarkMode
        ? "border-2 border-budju-pink text-budju-pink hover:bg-budju-pink hover:text-white"
        : "border-2 border-budju-pink text-budju-pink hover:bg-budju-pink hover:text-gray-900"
    }`,
    ghost: `${
      isDarkMode
        ? "text-gray-200 hover:bg-gray-700/50"
        : "text-gray-800 hover:bg-gray-200/50"
    } hover:scale-105`,
  };

  return [
    ...baseClasses,
    sizeClasses[size],
    variantClasses[variant],
    className,
  ].join(" ");
};

const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
  (props, ref) => {
    const { isDarkMode } = useTheme();
    const {
      children,
      variant = "primary",
      size = "md",
      fullWidth = false,
      isLoading = false,
      leftIcon,
      rightIcon,
      className = "",
    } = props;

    const buttonClasses = getBaseClasses(
      variant,
      size,
      fullWidth,
      isLoading,
      isDarkMode,
      className,
    );

    const content = (
      <>
        {isLoading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {leftIcon && !isLoading && <span className="mr-2">{leftIcon}</span>}
        {children}
        {rightIcon && <span className="ml-2">{rightIcon}</span>}
      </>
    );

    if (!props.as || props.as === "button") {
      const {
        as,
        variant,
        size,
        fullWidth,
        isLoading,
        leftIcon,
        rightIcon,
        ...rest
      } = props as ButtonAsButtonProps;
      return (
        <button
          ref={ref as React.Ref<HTMLButtonElement>}
          className={buttonClasses}
          disabled={isLoading || props.disabled}
          {...rest}
        >
          {content}
        </button>
      );
    }

    if (props.as === "link") {
      const { to, external, ...rest } = props as ButtonAsLinkProps;
      if (external) {
        return (
          <a
            href={to}
            ref={ref as React.Ref<HTMLAnchorElement>}
            className={buttonClasses}
            target="_blank"
            rel="noopener noreferrer"
            {...rest}
          >
            {content}
          </a>
        );
      }
      return (
        <Link to={to} className={buttonClasses} {...rest}>
          {content}
        </Link>
      );
    }

    if (props.as === "a") {
      const { href, ...rest } = props as ButtonAsAnchorProps;
      return (
        <a
          ref={ref as React.Ref<HTMLAnchorElement>}
          href={href}
          className={buttonClasses}
          {...rest}
        >
          {content}
        </a>
      );
    }

    return null;
  },
);

Button.displayName = "Button";

export default Button;
