import { useId } from "react";
import { TrojanHorse } from "./trojan-horse";

/** Lightweight vector landscape. Only transforms and opacity animate. */
export function OdysseyScene() {
  const id = useId().replace(/:/g, "");
  return (
    <div className="odyssey-scene" aria-hidden="true">
      <svg viewBox="0 0 900 390" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id={`${id}-sky`} x2="0" y2="1">
            <stop stopColor="#e9e2d2" />
            <stop offset="1" stopColor="#d9d5c6" />
          </linearGradient>
          <linearGradient id={`${id}-sea`} x2="0" y2="1">
            <stop stopColor="#31596a" />
            <stop offset="1" stopColor="#102f42" />
          </linearGradient>
          <pattern
            id={`${id}-pixels`}
            width="23"
            height="23"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M0 0H4V4H0Z M12 12H15V15H12Z"
              fill="#344e5a"
              opacity=".08"
            />
          </pattern>
        </defs>
        <path d="M0 0H900V390H0Z" fill={`url(#${id}-sky)`} />
        <path d="M0 0H900V270H0Z" fill={`url(#${id}-pixels)`} />
        <g
          className="scene-clouds"
          fill="none"
          stroke="#a7afa8"
          strokeWidth="22"
          opacity=".13"
        >
          <path d="M-30 50Q60 0 160 55T350 40M510 50Q620 90 730 30T980 35M170 110Q260 75 370 112" />
        </g>
        <g stroke="#546e79" fill="none" opacity=".32">
          <circle cx="459" cy="125" r="75" strokeWidth=".6" />
          <circle cx="459" cy="125" r="61" strokeDasharray="1 9" />
          <path
            d="M459 38V55M459 194V211M372 125H388M530 125H547M421 125H497M459 87V163"
            strokeWidth=".7"
          />
          <path
            d="M459 107L464 120L477 125L464 130L459 143L454 130L441 125L454 120Z"
            fill="#31596a"
            stroke="none"
          />
        </g>
        <g
          className="scene-lightning"
          stroke="#b29350"
          fill="none"
          strokeWidth="1.8"
        >
          <path d="M230 30L215 67L229 64L206 109M741 71L728 102L740 99L722 132" />
        </g>
        <path
          d="M0 280Q60 258 120 278T240 278T360 278T480 278T600 278T720 278T840 278T960 278V390H0Z"
          fill="#82949a"
          opacity=".5"
        />
        <g className="wave wave-back" fill="#527383" opacity=".65">
          <path d="M-100 294Q-50 265 0 294T100 294T200 294T300 294T400 294T500 294T600 294T700 294T800 294T900 294T1000 294V390H-100Z" />
        </g>
        <g className="scene-ship">
          <g
            fill="#173e53"
            stroke="#173e53"
            strokeWidth="2"
            strokeLinejoin="round"
          >
            <path d="M385 261Q406 284 485 281Q513 280 524 257L531 255Q525 291 486 296H420Q394 287 385 261Z" />
            <path d="M452 160V279" fill="none" />
            <path className="scene-flag" d="M453 162L474 168L453 174Z" />
            <path
              className="scene-sail"
              d="M419 185H487Q474 214 489 243H417Q432 214 419 185Z"
            />
            <path
              d="M419 185L395 265M487 185L516 266M403 272H511"
              fill="none"
              strokeWidth="1.2"
            />
            {[414, 431, 448, 465, 482].map((x) => (
              <g key={x}>
                <circle cx={x} cy="255" r="3" />
                <path
                  d={`M${x} 261l-4 11m2-2l-14 29`}
                  fill="none"
                  strokeWidth="2.5"
                />
              </g>
            ))}
          </g>
          <g fill="none" stroke="#d7d6be" opacity=".7">
            <path d="M428 190Q441 212 429 236M478 190Q466 212 479 236M452 199L460 212L452 225L444 212Z" />
          </g>
        </g>
        <g className="wave wave-front">
          <path
            d="M-100 310Q-50 288 0 310T100 310T200 310T300 310T400 310T500 310T600 310T700 310T800 310T900 310T1000 310V390H-100Z"
            fill={`url(#${id}-sea)`}
          />
          <path
            d="M-50 323Q0 310 50 323T150 323T250 323T350 323T450 323T550 323T650 323T750 323T850 323T950 323"
            stroke="#6b8e9b"
            fill="none"
            opacity=".2"
          />
        </g>
        <g fill="#1f3644">
          <path d="M0 130L38 163L49 207L73 227L83 308L112 390H0Z M900 125L861 172L851 210L829 238L815 312L789 390H900Z" />
          <path d="M25 167Q53 127 44 104Q25 83 17 67Q37 77 45 94Q47 68 62 57Q62 83 51 101Q76 81 91 87Q78 104 53 109Q60 135 42 163Z M873 174Q850 129 857 106Q879 90 887 69Q867 80 859 95Q854 68 839 59Q841 85 852 101Q829 81 813 89Q831 107 853 112Q847 136 863 165Z" />
        </g>
        <g stroke="#5d7a8c" fill="none" strokeWidth="1" opacity=".8">
          <path d="M13 161L29 217L18 257L46 285L59 348L85 390M41 206L33 244L59 264L69 330M884 161L870 218L882 255L854 288L840 347L815 390M854 219L862 247L839 275L829 330" />
        </g>
        <g fill="#254354" opacity=".55">
          <path d="M152 69q11-12 22 0q-11-6-22 0M696 157q9-9 18 0q-9-4-18 0" />
        </g>
      </svg>
      <div className="shore-horse">
        <TrojanHorse />
      </div>
      <span className="scene-coordinate">EST. MMXXVI · A NEW ODYSSEY</span>
    </div>
  );
}
