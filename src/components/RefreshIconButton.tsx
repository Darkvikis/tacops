interface RefreshIconButtonProps {
  onRefresh: () => void;
  isLoading: boolean;
  size?: number;
}

// No icon library in this codebase - a small inline-SVG circular-arrow glyph, styled like the
// app's other disabled-button treatments (disabled:opacity-60). stopPropagation matters here:
// this button sits inside CrusadeDominationCard/CrusadeDominationTable rows that already have
// their own onClick to open the sector map modal.
export function RefreshIconButton({ onRefresh, isLoading, size = 16 }: RefreshIconButtonProps) {
  return (
    <button
      type="button"
      disabled={isLoading}
      onClick={(e) => {
        e.stopPropagation();
        onRefresh();
      }}
      title="Refresh"
      className="inline-flex shrink-0 items-center justify-center text-neutral-500 outline-none transition-colors hover:text-blue-600 disabled:cursor-default disabled:opacity-60 dark:text-neutral-400 dark:hover:text-blue-400"
      style={{ height: size, width: size }}
    >
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12a9 9 0 1 1-3-6.7" />
        <path d="M21 3v6h-6" />
      </svg>
    </button>
  );
}
