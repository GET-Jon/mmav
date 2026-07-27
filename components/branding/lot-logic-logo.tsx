type LotLogicLogoProps = {
  compact?: boolean;
  className?: string;
};

export function LotLogicLogo({
  compact = false,
  className = "",
}: LotLogicLogoProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <svg
        viewBox="0 0 64 64"
        role="img"
        aria-label="Lot Logic"
        className="h-9 w-9 shrink-0"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M18 12V43C18 47.4183 21.5817 51 26 51H48"
          stroke="currentColor"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <path
          d="M34 12V31C34 35.4183 37.5817 39 42 39H51V50"
          stroke="currentColor"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {!compact ? (
        <div className="leading-none">
          <div className="whitespace-nowrap text-[18px] font-black uppercase tracking-[0.14em] text-slate-950">
            Lot Logic
          </div>

          <div className="mt-1 whitespace-nowrap text-[8px] font-bold uppercase tracking-[0.18em] text-slate-500">
            Mindful Motor Co.
          </div>
        </div>
      ) : null}
    </div>
  );
}
