type LotLogicLogoProps = {
  compact?: boolean;
  className?: string;
};

export function LotLogicLogo({
  compact = false,
  className = "",
}: LotLogicLogoProps) {
  return (
    <img
      src="/brand/lot-logic-logo.svg"
      alt="Lot Logic by Mindful Motor Co."
      className={[
        compact ? "h-9 w-auto" : "h-10 w-auto",
        "object-contain",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
