import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  ghost: "btn-ghost",
  danger: "bg-[var(--color-danger)]/15 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/25",
};

export function Button({ variant = "primary", className = "", children, ...props }: ButtonProps) {
  return (
    <button type="button" className={`${variantClass[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
