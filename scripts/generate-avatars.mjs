import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "avatars");
mkdirSync(outDir, { recursive: true });

const people = [
  { id: "giulia", initials: "GC", hair: "#1c1917", skin: "#e6b089", top: "#00ED64", bg: "#023430" },
  { id: "luca", initials: "LB", hair: "#3f2a1d", skin: "#d9a074", top: "#001E2B", bg: "#00684A" },
  { id: "sofia", initials: "SR", hair: "#7a3e1d", skin: "#f3c7a1", top: "#F9EBFF", bg: "#1a3a4a" },
  { id: "marco", initials: "MF", hair: "#111111", skin: "#c48b64", top: "#E9FF99", bg: "#023430" },
  { id: "elena", initials: "EM", hair: "#4a2c17", skin: "#deae86", top: "#E3FCF7", bg: "#001E2B" },
  { id: "davide", initials: "DG", hair: "#2b2118", skin: "#c9946c", top: "#00ED64", bg: "#0b3b32" },
  { id: "chiara", initials: "CR", hair: "#c4b5a0", skin: "#f0c8a8", top: "#001E2B", bg: "#00684A" },
  { id: "alessandro", initials: "AC", hair: "#1a120c", skin: "#b97850", top: "#E9FF99", bg: "#001E2B" },
  { id: "francesca", initials: "FE", hair: "#5c3317", skin: "#ebb894", top: "#F9EBFF", bg: "#023430" },
  { id: "matteo", initials: "ML", hair: "#2a221c", skin: "#d2a07a", top: "#E3FCF7", bg: "#00684A" },
  { id: "iris", initials: "IB", hair: "#6b3f22", skin: "#f2d0b0", top: "#00ED64", bg: "#001E2B" },
  { id: "noemi", initials: "NC", hair: "#24180f", skin: "#c6865a", top: "#F9EBFF", bg: "#0b3b32" },
  { id: "samuele", initials: "SV", hair: "#3b2a1c", skin: "#e0b38c", top: "#E9FF99", bg: "#023430" },
  { id: "viola", initials: "VF", hair: "#7b2d12", skin: "#e8b48c", top: "#E3FCF7", bg: "#001E2B" },
];

function svg(person, variant) {
  const shift = variant === 1 ? 0 : variant === 2 ? 18 : -16;
  const bg2 = variant === 1 ? "#E3FCF7" : variant === 2 ? "#E9FF99" : "#F9EBFF";
  const look = variant === 2 ? 8 : variant === 3 ? -8 : 0;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 520" role="img" aria-label="Ritratto di ${person.id}">
  <rect width="400" height="520" fill="${person.bg}"/>
  <circle cx="${220 + shift}" cy="90" r="70" fill="${bg2}" opacity="0.35"/>
  <rect x="70" y="300" width="260" height="220" rx="130" fill="${person.top}"/>
  <ellipse cx="${200 + look}" cy="250" rx="92" ry="110" fill="${person.skin}"/>
  <ellipse cx="${200 + look}" cy="168" rx="78" ry="70" fill="${person.hair}"/>
  <rect x="${122 + look}" y="168" width="156" height="46" fill="${person.hair}"/>
  <circle cx="${170 + look}" cy="248" r="7" fill="#1a1a1a"/>
  <circle cx="${230 + look}" cy="248" r="7" fill="#1a1a1a"/>
  <path d="M${180 + look} 278 Q${200 + look} 290 ${220 + look} 278" fill="none" stroke="#7a4b32" stroke-width="3" stroke-linecap="round"/>
  <text x="200" y="490" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="28" font-weight="700" fill="#FFFFFF">${person.initials}</text>
</svg>
`;
}

for (const person of people) {
  const count = ["giulia", "luca", "sofia", "alessandro"].includes(person.id) ? 3 : 2;
  for (let v = 1; v <= count; v++) {
    writeFileSync(join(outDir, `${person.id}-${v}.svg`), svg(person, v));
  }
}
console.log("avatars written", people.length);
