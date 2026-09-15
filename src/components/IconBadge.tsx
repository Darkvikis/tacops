import { Icon } from "./Icon";

interface IconBadgeProps {
  src: string;
  title?: string;
}

export function IconBadge({ src, title }: IconBadgeProps) {
  return (
    <span className="relative inline-flex" title={title}>
      <Icon src={src} />
      <svg
        className="absolute -right-1 -bottom-1 h-4 w-4 text-red-600"
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
        <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </span>
  );
}
