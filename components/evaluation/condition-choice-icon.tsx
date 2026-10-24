type ConditionChoiceVariant = "clear" | "issues" | "unknown";

/** Decorative markers for the three condition-review choices. */
export function ConditionChoiceIcon({
  variant,
  muted = false,
}: {
  variant: ConditionChoiceVariant;
  muted?: boolean;
}) {
  const color =
    variant === "clear"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : variant === "issues"
        ? "bg-violet-50 text-violet-700 ring-violet-200"
        : "bg-amber-50 text-amber-700 ring-amber-200";

  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${muted ? "bg-slate-100 text-slate-400 ring-slate-200" : color}`}
    >
      {variant === "clear" ? (
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="m7.5 12 3 3 6-6" />
        </svg>
      ) : variant === "issues" ? (
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.7 6.3a5 5 0 0 0-6.4 6.4L2.6 18.4a2 2 0 0 0 2.8 2.8l5.7-5.7a5 5 0 0 0 6.4-6.4L14 9.5z" />
        </svg>
      ) : (
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.5 2.5 0 1 1 4.7 1.2c-.7 1.1-2.2 1.4-2.2 3.1" />
          <path d="M12 17.5h.01" />
        </svg>
      )}
    </span>
  );
}
