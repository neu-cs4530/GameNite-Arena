import "./Button.css";
import type { ButtonHTMLAttributes, JSX, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "soft";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "size"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
  children?: ReactNode;
}

/**
 * Primary button primitive. Replaces the legacy `.widefill .primary` etc.
 * combinations with a single declarative API.
 */
export default function Button({
  variant = "primary",
  size = "md",
  loading,
  leftIcon,
  rightIcon,
  fullWidth,
  className = "",
  children,
  type = "button",
  disabled,
  ...rest
}: ButtonProps): JSX.Element {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      className={
        `ga-button ga-button--${variant} ga-button--${size} ` +
        `${fullWidth ? "ga-button--full" : ""} ${className}`.trim()
      }
      aria-busy={loading || undefined}
    >
      {loading ? (
        <span className="ga-button__spinner" aria-hidden="true" />
      ) : (
        leftIcon && <span className="ga-button__icon">{leftIcon}</span>
      )}
      {children && <span className="ga-button__label">{children}</span>}
      {rightIcon && !loading && <span className="ga-button__icon">{rightIcon}</span>}
    </button>
  );
}
