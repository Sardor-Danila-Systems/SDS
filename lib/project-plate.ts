/**
 * A drawn card for a project we have no screenshot of: ink surface, the logo
 * blue as a soft glow, a hairline grid, the name and category set large. It
 * is a title card, not a fake interface — used only inside the image corridor
 * so every project is present in the motion.
 */
function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function projectPlate(title: string, category: string, index: number) {
  // Spread the glow around the card so neighbours in the stream differ.
  const gx = [78, 22, 70, 30, 85, 15, 60][index % 7];
  const gy = [20, 80, 85, 15, 70, 30, 50][index % 7];
  const number = String(index + 1).padStart(2, "0");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000">
<defs>
<radialGradient id="g" cx="${gx}%" cy="${gy}%" r="75%">
<stop offset="0" stop-color="#116bff" stop-opacity="0.85"/>
<stop offset="0.5" stop-color="#0b3d99" stop-opacity="0.35"/>
<stop offset="1" stop-color="#0b0b0c" stop-opacity="0"/>
</radialGradient>
<pattern id="p" width="80" height="80" patternUnits="userSpaceOnUse">
<path d="M80 0H0V80" fill="none" stroke="#ffffff" stroke-opacity="0.07" stroke-width="1.5"/>
</pattern>
</defs>
<rect width="1600" height="1000" fill="#0b0b0c"/>
<rect width="1600" height="1000" fill="url(#g)"/>
<rect width="1600" height="1000" fill="url(#p)"/>
<text x="96" y="140" font-family="ui-monospace,Menlo,monospace" font-size="38" fill="#ffffff" fill-opacity="0.55">${number}</text>
<text x="96" y="780" font-family="Onest,Inter,Helvetica,Arial,sans-serif" font-size="118" font-weight="500" letter-spacing="-4" fill="#ffffff">${esc(title)}</text>
<text x="100" y="860" font-family="Onest,Inter,Helvetica,Arial,sans-serif" font-size="46" fill="#ffffff" fill-opacity="0.6">${esc(category)}</text>
<rect x="96" y="900" width="120" height="6" rx="3" fill="#4d93ff"/>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
