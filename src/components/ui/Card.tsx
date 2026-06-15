import type { HTMLAttributes } from "react";

export function Card({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`glass rounded-xl border border-[var(--glass-border)] ${className}`} {...props}>
      {children}
    </div>
  );
}
