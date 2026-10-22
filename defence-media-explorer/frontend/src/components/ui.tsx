import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonStyles = cva(
  "inline-flex max-w-full items-center justify-center gap-2 whitespace-normal break-words rounded-full px-4 py-2.5 text-left text-sm font-semibold leading-snug transition disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-spring text-pine hover:brightness-95",
        quiet: "border border-[var(--line)] bg-[var(--bg-elev)] hover:border-[var(--ink)]",
        ghost: "hover:bg-[var(--bg)]",
        danger: "bg-transparent text-[var(--danger)] border border-current",
      },
    },
    defaultVariants: { variant: "primary" },
  },
);

export function Button({
  className,
  variant,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonStyles>) {
  return <button className={cn(buttonStyles({ variant }), className)} {...props} />;
}

export function FieldLabel({
  label,
  hint,
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="grid min-w-0 gap-1.5 text-sm font-medium leading-snug">
      <span className="min-w-0">{label}</span>
      {children}
      {hint ? <span className="font-normal leading-snug text-[var(--muted)]">{hint}</span> : null}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn("field", props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn("field min-h-28", props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn("field", props.className)} />;
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "ok" | "warn" | "danger" }) {
  const tones = {
    neutral: "bg-[var(--bg)] text-[var(--ink)]",
    ok: "bg-[#d9ffe9] text-[#064e2e] dark:bg-[#0d3b28] dark:text-[#b8ffd4]",
    warn: "bg-[#fff1cc] text-[#6a4300] dark:bg-[#3d3010] dark:text-[#f0c36a]",
    danger: "bg-[#ffe1e1] text-[#7a1f1f] dark:bg-[#3d1515] dark:text-[#ffb4b4]",
  };
  return <span className={cn("inline-flex max-w-full rounded-full px-2.5 py-1 text-xs font-semibold leading-snug", tones[tone])}>{children}</span>;
}
