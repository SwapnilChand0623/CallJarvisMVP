/** Original wooden-horse mark, drawn as a small, reusable vector. */
export function TrojanHorse({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 80 80"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M18 49V32L12 26L20 24L25 31H44L44 17L51 8L55 15L64 19L69 29L60 34L53 29V49Z"
        fill="currentColor"
      />
      <path
        d="M25 49L22 62M44 49L49 62M15 64H58M26 37H44M26 43H44M49 18L49 29"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M27 37H42M27 43H42M49 19V29"
        stroke="var(--horse-detail, #eee7d6)"
        strokeWidth="1.4"
      />
      <circle cx="24" cy="68" r="5" stroke="currentColor" strokeWidth="3" />
      <circle cx="49" cy="68" r="5" stroke="currentColor" strokeWidth="3" />
      <circle cx="59" cy="24" r="1.6" fill="var(--horse-detail, #eee7d6)" />
      <path d="M8 76H66" stroke="currentColor" strokeWidth="1" opacity=".4" />
    </svg>
  );
}
