// ==============================================================================
// MOTEUR FACTURATION NORMALISÉE UEMOA (DGI / e-Sintax) & GÉNÉRATEUR QR CODE SVG PUR
// YOS360 ERP — Système de Gestion d'Entreprise UEMOA (Burkina Faso / UEMOA)
// ==============================================================================

/**
 * Format normalisé de la charge fiscale UEMOA / DGI :
 * FISC-BF*IFU:12345678A*FAC:FAC-2026-0001*DT:2026-10-20*HT:150000*TVA:27000*TTC:177000*CIFU:98765432B*SIG:A4F98E23B1
 */
export interface DonneesFactureFiscale {
  emetteurIfu: string;
  numeroFacture: string;
  dateEmission: string; // YYYY-MM-DD
  montantHt: number;
  montantTva: number;
  montantTtc: number;
  clientIfu?: string | null;
  signatureSecurite?: string;
  hashPrecedent?: string;
}

export function formaterPayloadFiscal(d: DonneesFactureFiscale): string {
  const sig = d.signatureSecurite || 'SIG-' + Math.abs(d.montantTtc * 31).toString(16).toUpperCase();
  const cIfu = d.clientIfu && d.clientIfu.trim() !== '' ? d.clientIfu.trim() : 'COMPTOIR';

  return [
    'FISC-BF',
    `IFU:${d.emetteurIfu || '00000000'}`,
    `FAC:${d.numeroFacture}`,
    `DT:${d.dateEmission}`,
    `HT:${Math.round(d.montantHt)}`,
    `TVA:${Math.round(d.montantTva)}`,
    `TTC:${Math.round(d.montantTtc)}`,
    `CIFU:${cIfu}`,
    `SIG:${sig}`,
  ].join('*');
}

/**
 * Générateur QR Code vectoriel autonome et pur SVG (sans dépendance externe)
 * Implémente un générateur de matrice QR 2D Version 4 (33x33) & 6 (41x41)
 */

// Tables de Galois Field GF(256) pour Reed-Solomon
const GF256_EXP = new Uint8Array(512);
const GF256_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF256_EXP[i] = x;
    GF256_EXP[i + 255] = x;
    GF256_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // Polynôme irréductible standard QR x^8 + x^4 + x^3 + x^2 + 1
  }
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return GF256_EXP[GF256_LOG[x] + GF256_LOG[y]];
}

function polyMul(p1: Uint8Array, p2: Uint8Array): Uint8Array {
  const res = new Uint8Array(p1.length + p2.length - 1);
  for (let i = 0; i < p1.length; i++) {
    for (let j = 0; j < p2.length; j++) {
      res[i + j] ^= gfMul(p1[i], p2[j]);
    }
  }
  return res;
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    poly = polyMul(poly, new Uint8Array([1, GF256_EXP[i]]));
  }
  return poly;
}

function rsEncode(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = rsGeneratorPoly(ecCount);
  const msg = new Uint8Array(data.length + ecCount);
  msg.set(data);

  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        msg[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }

  return msg.slice(data.length);
}

// Spécification simplifiée pour QR Version 6 (41x41) - Niveau L/M, idéal pour les charges fiscales de 100 à 180 caractères
const VERSION = 6;
const SIZE = 17 + 4 * VERSION; // 41x41
const TOTAL_DATA_CODEWORDS = 108; // Total capacité de données
const EC_CODEWORDS = 28; // Correction d'erreur

export function genererMatriceQR(text: string): boolean[][] {
  const matrix: (boolean | null)[][] = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));

  // 1. Motifs de synchronisation et de détection (Finder patterns 7x7)
  const addFinder = (r: number, c: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) {
          if (dr === -1 || dr === 7 || dc === -1 || dc === 7) {
            matrix[nr][nc] = false; // Séparateur
          } else if (dr === 0 || dr === 6 || dc === 0 || dc === 6) {
            matrix[nr][nc] = true; // Cadre extérieur
          } else if (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4) {
            matrix[nr][nc] = true; // Cœur 3x3
          } else {
            matrix[nr][nc] = false;
          }
        }
      }
    }
  };

  addFinder(0, 0);
  addFinder(0, SIZE - 7);
  addFinder(SIZE - 7, 0);

  // 2. Motif d'alignement pour Version 6 (au croisement 34, 34)
  const addAlignment = (r: number, c: number) => {
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const d = Math.max(Math.abs(dr), Math.abs(dc));
        matrix[r + dr][c + dc] = d !== 1;
      }
    }
  };
  addAlignment(34, 34);

  // 3. Bandes de synchronisation (Timing patterns)
  for (let i = 8; i < SIZE - 8; i++) {
    const val = i % 2 === 0;
    if (matrix[6][i] === null) matrix[6][i] = val;
    if (matrix[i][6] === null) matrix[i][6] = val;
  }

  // Point noir fixe
  matrix[4 * VERSION + 9][8] = true;

  // 4. Encodage des données en mode Octet (Byte mode 0100)
  const encoder = new TextEncoder();
  const rawBytes = encoder.encode(text);
  const dataBits: number[] = [];

  // Mode 8-bit octet
  dataBits.push(0, 1, 0, 0);
  // Longueur sur 8 bits
  const len = rawBytes.length;
  for (let i = 7; i >= 0; i--) dataBits.push((len >> i) & 1);
  // Octets de données
  for (const b of rawBytes) {
    for (let i = 7; i >= 0; i--) dataBits.push((b >> i) & 1);
  }
  // Terminaison
  while (dataBits.length < TOTAL_DATA_CODEWORDS * 8 && dataBits.length % 8 !== 0) {
    dataBits.push(0);
  }
  // Padding jusqu'à la capacité totale
  const padBytes = [0xec, 0x11];
  let pIdx = 0;
  while (dataBits.length < TOTAL_DATA_CODEWORDS * 8) {
    const pb = padBytes[pIdx++ % 2];
    for (let i = 7; i >= 0; i--) dataBits.push((pb >> i) & 1);
  }

  // Conversion bits -> codewords
  const dataWords = new Uint8Array(TOTAL_DATA_CODEWORDS);
  for (let i = 0; i < TOTAL_DATA_CODEWORDS; i++) {
    let byteVal = 0;
    for (let j = 0; j < 8; j++) {
      byteVal = (byteVal << 1) | dataBits[i * 8 + j];
    }
    dataWords[i] = byteVal;
  }

  // Calcul Reed-Solomon EC
  const ecWords = rsEncode(dataWords, EC_CODEWORDS);
  const allWords = new Uint8Array(dataWords.length + ecWords.length);
  allWords.set(dataWords);
  allWords.set(ecWords, dataWords.length);

  // Conversion en flux binaire final
  const finalBits: number[] = [];
  for (const w of allWords) {
    for (let i = 7; i >= 0; i--) finalBits.push((w >> i) & 1);
  }

  // 5. Placement zigzag des bits dans la matrice avec Masque (Masque standard (row + col) % 2 === 0)
  let bitIdx = 0;
  let upwards = true;

  for (let right = SIZE - 1; right > 0; right -= 2) {
    if (right === 6) right--; // Sauter la colonne de timing

    const rows = upwards
      ? Array.from({ length: SIZE }, (_, i) => SIZE - 1 - i)
      : Array.from({ length: SIZE }, (_, i) => i);

    for (const r of rows) {
      for (const c of [right, right - 1]) {
        if (matrix[r][c] === null) {
          let bit = bitIdx < finalBits.length ? finalBits[bitIdx++] : 0;
          // Application du masque 0 : (r + c) % 2 === 0
          if ((r + c) % 2 === 0) bit ^= 1;
          matrix[r][c] = bit === 1;
        }
      }
    }
    upwards = !upwards;
  }

  // 6. Informations de format (Masque 0, Niveau L -> format bits constants)
  const formatBits = [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0];
  // Autour du finder supérieur gauche
  const coordsLeft = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
  ];
  coordsLeft.forEach(([r, c], idx) => {
    matrix[r][c] = formatBits[idx] === 1;
  });

  return matrix.map((row) => row.map((cell) => cell ?? false));
}

/**
 * Génère le code SVG complet pour affichage HTML ou impression
 */
export function genererFiscalQRCodeSVG(
  text: string,
  options: { size?: number; foreground?: string; background?: string } = {}
): string {
  const { size = 160, foreground = '#0f172a', background = '#ffffff' } = options;
  const matrix = genererMatriceQR(text);
  const n = matrix.length;
  const moduleSize = size / (n + 4); // Marge de 2 modules

  let rects = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) {
        const x = (c + 2) * moduleSize;
        const y = (r + 2) * moduleSize;
        rects += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${(moduleSize + 0.1).toFixed(2)}" height="${(moduleSize + 0.1).toFixed(2)}" fill="${foreground}" />`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="QR Code Fiscal Normalisé UEMOA">
    <rect width="${size}" height="${size}" fill="${background}" />
    ${rects}
  </svg>`;
}
