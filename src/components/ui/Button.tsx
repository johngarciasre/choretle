"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "success" | "grape" | "ghost" | "danger" | "warning";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "href"> {
  variant?: Variant;
  size?: Size;
  href?: string;
  icon?: React.ReactNode;
}

function isSpreadableProp(prop: string): boolean {
  const buttonOnly = new Set([
    "type", "form", "formAction", "formEncType", "formMethod", "formNoValidate",
    "autoComplete", "autoCapitalize"
  ]);
  return !buttonOnly.has(prop);
}

function filterSpreadableProps(props: Record<string, unknown>): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const key in props) {
    if (isSpreadableProp(key)) {
      filtered[key] = props[key];
    }
  }
  return filtered;
}

export const BUTTON_BASE_STYLES =
  "rounded-full font-bold transition active:translate-y-0 inline-flex items-center justify-center";

export function Button({
  variant = "primary",
  size = "md",
  href,
  icon,
  className,
  children,
  ...props
}: ButtonProps) {
  const baseStyles = BUTTON_BASE_STYLES;

  const variantStyles: Record<Variant, string> = {
    primary: "bg-coral text-white shadow-md shadow-coral/30 hover:-translate-y-0.5 hover:brightness-105",
    success: "bg-teal text-white shadow-md shadow-teal/30 hover:-translate-y-0.5 hover:brightness-105",
    grape: "bg-grape text-white shadow-md shadow-grape/30 hover:-translate-y-0.5 hover:brightness-105",
    ghost: "bg-white text-ink border-2 border-ink/15 hover:border-grape/40",
    danger: "bg-[#EF476F] text-white shadow-md shadow-red-300/30 hover:-translate-y-0.5 hover:brightness-105",
    warning: "bg-red text-white shadow-md shadow-red/30 hover:-translate-y-0.5 hover:brightness-105",
  };

  const sizeStyles = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-5 py-2.5",
    lg: "px-7 py-3.5 text-lg",
  };

  if (href) {
    const spreadable = filterSpreadableProps(props);
    return (
      <Link
        href={href}
        className={cn(
          baseStyles,
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...spreadable}
      >
        {icon && <span className="mr-2">{icon}</span>}
        {children}
      </Link>
    );
  }

  return (
    <button
      className={cn(
        baseStyles,
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {icon && <span className="mr-2">{icon}</span>}
      {children}
    </button>
  );
}

export default Button;
