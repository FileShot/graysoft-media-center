interface BadgeProps {
  children: React.ReactNode;
  tone?: "default" | "accent" | "success" | "danger";
}

const tones = {
  default: "bg-white/10 text-[var(--text-secondary)]",
  accent: "bg-[var(--color-accent-muted)] text-[var(--color-accent)]",
  success: "bg-emerald-500/15 text-[var(--color-success)]",
  danger: "bg-[var(--color-danger)]/15 text-[var(--color-danger)]",
};

export function Badge({ children, tone = "default" }: BadgeProps) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}
