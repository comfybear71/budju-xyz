// src/components/common/Button/index.tsx
import { forwardRef, ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router";

// Available button variants
type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";

// Available button sizes
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

// Props for button as a button element
interface ButtonAsButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    ButtonBaseProps {
  as?: "button";
}

// Props for button as a link
interface ButtonAsLinkProps extends ButtonBaseProps {
  as: "link";
  to: string;
  external?: boolean;
  children: ReactNode;
}

// Props for button as an anchor
interface ButtonAsAnchorProps extends ButtonBaseProps {
  as: "a";
  href: string;
  target?: string;
  rel?: string;
  children: ReactNode;
}

// Union type for all possible button props
type ButtonProps =
  | ButtonAsButtonProps
  | ButtonAsLinkProps
  | ButtonAsAnchorProps;

// Helper function to determine if the props are for a button
const isButtonProps = (props: ButtonProps): props is ButtonAsButtonProps => {
  return props.as === undefined || props.as === "button";
};

// Helper function to determine if the props are for a link
const isLinkProps = (props: ButtonProps): props is ButtonAsLinkProps => {
  return props.as === "link";
};

// Helper function to determine if the props are for an anchor
const isAnchorProps = (props: ButtonProps): props is ButtonAsAnchorProps => {
  return props.as === "a";
};

// Get the base classes for the button
const getBaseClasses = (
  variant: ButtonVariant,
  size: ButtonSize,
  fullWidth: boolean,
  isLoading: boolean,
  className?: string,
) => {
  // Base classes that are common to all variants
  const baseClasses = [
    "font-bold rounded-budju transition-all duration-300 focus:outline-none",
    "flex items-center justify-center",
    isLoading ? "cursor-not-allowed opacity-70" : "transform hover:scale-105",
    fullWidth ? "w-full" : "inline-flex",
  ];

  // Size-specific classes
  const sizeClasses = {
    sm: "text-sm px-4 py-2",
    md: "px-6 py-3",
    lg: "text-lg px-8 py-4",
  };

  // Variant-specific classes
  const variantClasses = {
    primary: "bg-budju-pink hover:bg-budju-pink-dark text-white shadow-budju",
    secondary: "bg-budju-blue hover:bg-budju-blue-dark text-white shadow-budju",
    outline:
      "border-2 border-budju-pink text-budju-pink hover:bg-budju-pink hover:text-white",
    ghost: "text-white hover:bg-white/10 hover:scale-105",
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

    // Determine the CSS classes based on props
    const buttonClasses = getBaseClasses(
      variant,
      size,
      fullWidth,
      isLoading,
      className,
    );

    // Content with icons and loading state
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
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        )}

        {leftIcon && !isLoading && <span className="mr-2">{leftIcon}</span>}

        {children}

        {rightIcon && <span className="ml-2">{rightIcon}</span>}
      </>
    );

    // Render based on the 'as' prop
    if (isButtonProps(props)) {
      const {
        as,
        variant,
        size,
        fullWidth,
        isLoading,
        leftIcon,
        rightIcon,
        ...rest
      } = props;
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
    } else if (isLinkProps(props)) {
      const {
        as,
        to,
        external,
        variant,
        size,
        fullWidth,
        isLoading,
        leftIcon,
        rightIcon,
        ...rest
      } = props;

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
    } else if (isAnchorProps(props)) {
      const {
        as,
        href,
        variant,
        size,
        fullWidth,
        isLoading,
        leftIcon,
        rightIcon,
        ...rest
      } = props;
      return (
        <a
          href={href}
          ref={ref as React.Ref<HTMLAnchorElement>}
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
