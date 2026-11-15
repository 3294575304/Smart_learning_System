import styles from "./login-space.module.css";

// Decorative vector artwork scales with the layout without an image download.
export function SpaceIllustration() {
  return (
    <svg
      aria-hidden="true"
      className={styles.art}
      focusable="false"
      preserveAspectRatio="xMidYMax meet"
      viewBox="0 0 680 960"
    >
      <defs>
        <radialGradient id="login-red-planet" cx="30%" cy="23%" r="85%">
          <stop stopColor="#ff8b7e" />
          <stop offset="0.55" stopColor="#e65b62" />
          <stop offset="1" stopColor="#ad394c" />
        </radialGradient>
        <radialGradient id="login-teal-planet" cx="32%" cy="25%" r="80%">
          <stop stopColor="#a9f4df" />
          <stop offset="0.5" stopColor="#50d1c4" />
          <stop offset="1" stopColor="#1c8d9e" />
        </radialGradient>
        <linearGradient id="login-moon" x2="0.8" y2="1">
          <stop stopColor="#ed7275" />
          <stop offset="1" stopColor="#bd4456" />
        </linearGradient>
        <linearGradient id="login-glove" x2="1" y2="0.4">
          <stop stopColor="#ffe8bd" />
          <stop offset="0.65" stopColor="#fff2d6" />
          <stop offset="1" stopColor="#d6b17e" />
        </linearGradient>
        <pattern
          id="login-dust"
          width="42"
          height="38"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="7" cy="12" r="2" fill="#8b344c" opacity="0.35" />
          <circle cx="28" cy="31" r="1.6" fill="#ffa59a" opacity="0.5" />
          <path d="M24 7q7-5 11 1" fill="none" stroke="#a94153" opacity="0.5" />
        </pattern>
      </defs>

      <path d="M0 0h680v960H0z" fill="#112b3c" />
      <path
        d="M0 280c160 80 234-35 379 58s-3 136 173 221v401H0"
        fill="#142f41"
      />

      <g fill="#d6eeee" className={styles.stars}>
        {[
          [65, 352, 2],
          [183, 397, 1.6],
          [341, 319, 2],
          [493, 381, 2.6],
          [567, 277, 1.8],
          [387, 492, 2.3],
          [60, 606, 2],
          [514, 726, 1.8],
          [199, 539, 1.4],
          [393, 673, 2],
          [116, 750, 2.2],
          [550, 590, 1.6],
          [34, 451, 1.3],
          [306, 439, 1.6],
          [471, 861, 2],
          [532, 156, 1.7],
        ].map(([cx, cy, r]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
        ))}
      </g>
      <g fill="#67d7d5" className={styles.stars}>
        <circle cx="421" cy="423" r="4" />
        <circle cx="434" cy="441" r="2" />
        <circle cx="553" cy="670" r="4" />
        <circle cx="545" cy="686" r="2" />
      </g>
      <g fill="none" stroke="#91babf" strokeLinecap="round">
        <path d="M475 322v12m-6-6h12M104 560v10m-5-5h10" />
        <path d="m372 375 5 5m0-5-5 5" opacity="0.5" />
      </g>

      {/* Coral planet and its fine, tilted orbital rings. */}
      <g className={styles.coralMotion}>
        <g transform="translate(73 680) rotate(22)">
          <ellipse
            rx="192"
            ry="34"
            fill="none"
            stroke="#ce6370"
            opacity="0.65"
          />
          <ellipse
            rx="183"
            ry="28"
            fill="none"
            stroke="#ce6370"
            opacity="0.25"
          />
          <circle r="113" fill="url(#login-red-planet)" />
          <circle
            r="123"
            fill="none"
            stroke="#df747b"
            strokeWidth="0.8"
            opacity="0.6"
          />
          <circle cx="-29" cy="-38" r="32" fill="#c34755" opacity="0.6" />
          <circle cx="46" cy="20" r="17" fill="#b74254" opacity="0.5" />
          <g fill="none" stroke="#ffb4a0" opacity="0.5">
            <path d="M-94 39c30-68 51 9 85-20S41-8 70 49s-9 65-48 23-49-16-53 7" />
            <path d="M-99 51c29-63 52 11 85-18s54-26 78 20-9 49-35 18-52-26-55 11" />
            <path d="M-82 68c28-45 50 9 77-6s22-23 43-4" />
            <path d="M25-96c-28 25 13 22 2 46s-43 10-28 28" />
            <path d="M39-91c-25 25 10 29-1 47S8-33 14-22" />
            <circle cx="-37" cy="25" r="11" />
            <circle cx="70" cy="-39" r="7" />
          </g>
          <path
            d="M-189 8c26 27 97 43 189 43s163-16 189-43"
            fill="none"
            stroke="#df7d82"
            opacity="0.7"
          />
        </g>
      </g>
      {/* Distant blue planet. */}
      <g transform="translate(450 805) rotate(-24)" opacity="0.45">
        <circle r="49" fill="#214c62" />
        <circle r="48" fill="none" stroke="#4d8297" />
        <ellipse rx="78" ry="14" fill="none" stroke="#6596a2" />
        <path
          d="M-28-33c46 5-5 30 28 37s30 28 13 38M-43-4c26-15 44 1 27 20s8 27 25 19M18-41c-25 17 17 18 14 31"
          fill="none"
          stroke="#5893a4"
        />
      </g>

      {/* Mint planet, with map-like contours and an elliptical orbit. */}
      <g className={styles.tealMotion}>
        <g transform="translate(500 582) rotate(-30)">
          <ellipse rx="95" ry="27" fill="none" stroke="#63d5d1" opacity="0.6" />
          <circle r="66" fill="url(#login-teal-planet)" />
          <ellipse
            cx="-17"
            cy="-26"
            rx="28"
            ry="19"
            fill="#c5ffec"
            opacity="0.25"
          />
          <path
            d="M-31-55c-16 28 31 27 12 54s-7 41 14 61M4-64c-22 23 26 27 11 49s-6 44 26 56M-58-24c24 8 11 32 26 41s25 13 16 38M21-57c-12 29 34 26 23 56s10 27 15 26"
            fill="none"
            stroke="#b6f6df"
            strokeWidth="1.5"
            opacity="0.7"
          />
          <circle r="72" fill="none" stroke="#7adcd1" opacity="0.5" />
          <path
            d="M-94 2c13 22 51 35 94 35S81 24 94 2"
            fill="none"
            stroke="#8be6d8"
          />
          <ellipse
            cx="54"
            cy="-60"
            rx="10"
            ry="20"
            fill="#173748"
            stroke="#8be6d8"
          />
        </g>
      </g>
      {/* The moon surface and the reaching explorer's glove. */}
      <ellipse
        cx="103"
        cy="1025"
        rx="514"
        ry="224"
        fill="url(#login-moon)"
        transform="rotate(-9 103 1025)"
      />
      <ellipse
        cx="103"
        cy="1025"
        rx="514"
        ry="224"
        fill="url(#login-dust)"
        transform="rotate(-9 103 1025)"
      />
      <g fill="none" stroke="#ffaca0" opacity="0.4">
        <ellipse
          cx="65"
          cy="850"
          rx="35"
          ry="8"
          transform="rotate(-10 65 850)"
        />
        <ellipse
          cx="462"
          cy="922"
          rx="41"
          ry="12"
          transform="rotate(-12 462 922)"
        />
        <ellipse cx="143" cy="911" rx="18" ry="6" />
      </g>
      <g className={styles.gloveMotion}>
        <g transform="translate(182 620) rotate(-10 100 220)">
          <path
            d="m47 255 19-73 4-132c0-32 39-35 43-4l6 86 46-43c23-22 48 5 27 27l-28 29 24-17c25-17 44 10 21 29l-32 24 18-4c30-6 39 27 10 38l-62 26-2 36Z"
            fill="url(#login-glove)"
            stroke="#cfb58e"
            strokeWidth="2"
          />
          <path
            d="m87 55 4 107c-14 21-22 52-13 78m40-108-16 33 24 34 37-18m1-36-27 23 21 24m-25 49c-9-22-3-43 12-49"
            fill="none"
            stroke="#d3b68b"
            strokeWidth="2"
          />
          <path d="M77 56c0-19 22-22 27-4l3 54-28 3Z" fill="#fff7e3" />
          <path d="m119 132 45-43c8-7 17-7 22-1l-43 51Z" fill="#f0d4a9" />
          <path
            d="m47 242 99 9-2 53-112-7Z"
            fill="#f7e7c7"
            stroke="#cdb38f"
            strokeWidth="2"
          />
          <path
            d="m45 254 98 9m-102 2 102 10m-105 2 105 10m-108 1 108 10"
            fill="none"
            stroke="#cfb58e"
            strokeWidth="3"
          />
          <path
            d="m31 296 115 9 36 98H-17Z"
            fill="#fff0d0"
            stroke="#d9bf99"
            strokeWidth="2"
          />
          <path
            d="m28 317 123 9m-134 9 140 10m-152 9 159 11m-172 9 180 12"
            fill="none"
            stroke="#dcc6a3"
            strokeWidth="2"
          />
          <rect
            x="68"
            y="338"
            width="38"
            height="27"
            rx="5"
            fill="#e3c79d"
            transform="rotate(5 68 338)"
          />
          <path d="m78 348 17 1m-18 6 13 1" stroke="#fff3d8" strokeWidth="2" />
        </g>
      </g>
    </svg>
  );
}
