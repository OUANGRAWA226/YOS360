// Code 39 barcode SVG generator + printable label.
// Code 39 encodes A-Z, 0-9, space and - . $ / + % characters.

const CODE39_PATTERNS: Record<string, string> = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn', '9': 'nnwwnnwnn', 'A': 'wnnnnwnnw', 'B': 'nnwnnwnnw',
  'C': 'wnwnnwnnn', 'D': 'nnnnwwnnw', 'E': 'wnnnwwnnn', 'F': 'nnwnwwnnn',
  'G': 'nnnnnwwnw', 'H': 'wnnnnwwnn', 'I': 'nnwnnwwnn', 'J': 'nnnnwwwnn',
  'K': 'wnnnnnnww', 'L': 'nnwnnnnww', 'M': 'wnwnnnnwn', 'N': 'nnnnwnnww',
  'O': 'wnnnwnnwn', 'P': 'nnwnwnnwn', 'Q': 'nnnnnnwww', 'R': 'wnnnnnwwn',
  'S': 'nnwnnnwwn', 'T': 'nnnnwnwwn', 'U': 'wwnnnnnnw', 'V': 'nwwnnnnnw',
  'W': 'wwwnnnnnn', 'X': 'nwnnwnnnw', 'Y': 'wwnnwnnnn', 'Z': 'nwwnwnnnn',
  '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '$': 'nwnwnwnnn',
  '/': 'nwnwnnnwn', '+': 'nwnnnwnwn', '%': 'nnnwnwnwn', '*': 'nwnnwnwnn',
};

// Sanitize to the Code 39 charset; unknown characters become dashes.
export function sanitizeCode39(input: string): string {
  return input
    .toUpperCase()
    .split('')
    .map((c) => (CODE39_PATTERNS[c] ? c : '-'))
    .join('');
}

export function Barcode39({ value, height = 60, moduleWidth = 2, showText = true }: {
  value: string;
  height?: number;
  moduleWidth?: number;
  showText?: boolean;
}) {
  const sanitized = sanitizeCode39(value);
  const chars = ['*', ...sanitized.split(''), '*'].filter((c) => c !== undefined);
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  chars.forEach((c) => {
    const pattern = CODE39_PATTERNS[c] || CODE39_PATTERNS['-'];
    for (let i = 0; i < pattern.length; i++) {
      const w = (pattern[i] === 'w' ? 3 : 1) * moduleWidth;
      if (i % 2 === 0) bars.push({ x, w });
      x += w;
    }
    x += moduleWidth; // inter-char gap
  });
  const width = x;

  return (
    <div className="inline-block bg-white p-2">
      <svg width={width} height={showText ? height + 20 : height} role="img" aria-label={`Code-barres ${sanitized}`}>
        {bars.map((b, i) => (
          <rect key={i} x={b.x} y={0} width={b.w} height={height} fill="#0f172a" />
        ))}
        {showText && (
          <text x={width / 2} y={height + 14} textAnchor="middle" fontSize="12" fontFamily="monospace" fill="#0f172a">
            {sanitized}
          </text>
        )}
      </svg>
    </div>
  );
}
