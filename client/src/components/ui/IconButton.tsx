import "./IconButton.css";
import type { ButtonHTMLAttributes, JSX, ReactNode } from "react";

/**
 * Icon-only button. The `aria-label` HTML attribute is required at the call
 * site (icon-only buttons need one for screen readers); we extend
 * `ButtonHTMLAttributes` to inherit the typing.
 */
interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "size"> {
  icon: ReactNode;
  size?: "sm" | "md" | "lg";
  variant?: "ghost" | "soft" | "danger" | "primary" | "secondary";
  active?: boolean;
}

export default function IconButton({
  icon,
  size = "md",
  variant = "ghost",
  active,
  className = "",
  type = "button",
  ...rest
}: IconButtonProps): JSX.Element {
  // We don't enforce this at compile time (TS would require interface
  // gymnastics with the `aria-label` HTML attribute), but components that
  // drop an IconButton without one will fail the design-system review.
  return (
    <button
      {...rest}
      type={type}
      className={
        `ga-icon-button ga-icon-button--${size} ga-icon-button--${variant} ` +
        `${active ? "ga-icon-button--active" : ""} ${className}`.trim()
      }
    >
      <span className="ga-icon-button__icon" aria-hidden="true">
        {icon}
      </span>
    </button>
  );
}
