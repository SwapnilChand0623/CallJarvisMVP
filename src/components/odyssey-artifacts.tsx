/** Faded marginalia for the welcome page; purely decorative. */
export function OdysseyArtifacts() {
  return (
    <div className="odyssey-artifacts" aria-hidden="true">
      <svg className="odyssey-warrior" viewBox="0 0 200 360" fill="none" focusable="false">
        <g fill="currentColor">
          {/* Crested helmet, tunic, greaves, and a resting spear. */}
          <path d="M71 65C53 35 77 9 110 12c25 3 39 21 39 47l-16-6c-1-20-19-28-34-21L84 66Z" />
          <path d="M81 52q26-22 48 2l4 31-14 2-5 27-17-5-2-29-17-1Zm16 11 2 10 19-1-1-9Z" fillRule="evenodd" />
          <path d="m93 112 28 1 21 57-17 42-62-2 16-49-10-25Zm-17 102 52 1 15 39-80-1Z" />
          <path d="m75 255 19 1-5 67 9 13H66l7-16Zm35 0 18-1 8 65 17 15-34 2-2-19Z" />
          <path d="m126 123 20 10 13 44 14-6 5 10-28 14-13-39Z" />
        </g>
        <path d="M174 325V45m-5 6 5-28 6 28" stroke="currentColor" strokeWidth="3" />
        <ellipse cx="64" cy="188" rx="43" ry="53" fill="currentColor" />
        <ellipse cx="64" cy="188" rx="34" ry="43" stroke="var(--surface)" strokeWidth="2" />
        <path d="m46 207 18-43 18 43m-29-14h23" stroke="var(--surface)" strokeWidth="3" />
        <path d="M31 348h143" stroke="currentColor" />
      </svg>
      <svg className="odyssey-bow" viewBox="0 0 220 260" fill="none" focusable="false">
        <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <path d="M58 20c135 39 135 181 0 220" strokeWidth="5" />
          <path d="m58 20 33 110-33 110" strokeWidth="1.5" />
          <path d="M22 130h185m-18-10 18 10-18 10M24 118l17 12-17 12m14-24 17 12-17 12" strokeWidth="3" />
          <path d="m51 22 10-11m-10 227 10 11" strokeWidth="3" />
        </g>
      </svg>
      <svg className="odyssey-inscription" viewBox="0 0 260 95" fill="none" focusable="false">
        <path d="M8 12h244M32 80h196" stroke="currentColor" />
        <text x="130" y="55" textAnchor="middle" fill="currentColor" fontFamily="Georgia, serif" fontSize="25" letterSpacing="8">ΙΘΑΚΗ</text>
        <path d="m115 80 15-7 15 7-15 7Z" fill="currentColor" />
      </svg>
      <svg className="odyssey-meander" viewBox="0 0 320 24" fill="none" focusable="false">
        <path d="M0 22h320M0 2h20v12H8V7h6m6-5h30v12H38V7h6m6-5h30v12H68V7h6m6-5h30v12H98V7h6m6-5h30v12h-12V7h6m6-5h30v12h-12V7h6m6-5h30v12h-12V7h6m6-5h30v12h-12V7h6m6-5h30v12h-12V7h6m6-5h30v12h-12V7h6m6-5h20" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </div>
  );
}
