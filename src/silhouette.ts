import type { SilhouetteData } from './types.js';

let samplingCanvas: OffscreenCanvas | null = null;
let samplingCtx: OffscreenCanvasRenderingContext2D | null = null;
let cachedCols = 0;
let cachedRows = 0;

const BACKGROUND_TOLERANCE = 15;

export function detectSilhouette(viewportWidth: number, viewportHeight: number, cellW: number, cellH: number, videoSource: HTMLVideoElement | HTMLCanvasElement): SilhouetteData {
  const cols = Math.ceil(viewportWidth / cellW);
  const rows = Math.ceil(viewportHeight / cellH);

  if (!samplingCanvas || cachedCols !== cols || cachedRows !== rows || !samplingCtx) {
    samplingCanvas = new OffscreenCanvas(cols, rows);
    samplingCtx = samplingCanvas.getContext("2d", { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
    cachedCols = cols;
    cachedRows = rows;
  }

  samplingCtx.drawImage(videoSource, 0, 0, cols, rows);
  const { data: pixels } = samplingCtx.getImageData(0, 0, cols, rows);

  const leftEdges = new Int32Array(rows).fill(-1);
  const rightEdges = new Int32Array(rows).fill(-1);

  const bgR = pixels[0];
  const bgG = pixels[1];
  const bgB = pixels[2];

  for (let row = 0; row < rows; row++) {
    let firstForegroundCol = -1;
    let lastForegroundCol = -1;

    for (let col = 0; col < cols; col++) {
      const offset = (row * cols + col) * 4;
      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];

      if (Math.abs(r - bgR) < BACKGROUND_TOLERANCE &&
          Math.abs(g - bgG) < BACKGROUND_TOLERANCE &&
          Math.abs(b - bgB) < BACKGROUND_TOLERANCE) {
        continue;
      }

      if (firstForegroundCol === -1) firstForegroundCol = col;
      lastForegroundCol = col;
    }

    if (firstForegroundCol !== -1) {
      leftEdges[row] = firstForegroundCol;
      rightEdges[row] = lastForegroundCol + 1;
    }
  }

  // Adding 'cols' to match object but omitting it from types.ts is fine, although could add it.
  return { leftEdges, rightEdges, rows, charW: cellW, charH: cellH };
}

export function hasSilhouetteChanged(currentLeft: Int32Array, currentRight: Int32Array, previousLeft: Int32Array | null, previousRight: Int32Array | null): boolean {
  if (!previousLeft || !previousRight || previousLeft.length !== currentLeft.length) return true;
  for (let i = 0; i < currentLeft.length; i += 4) {
    if (Math.abs(currentLeft[i] - previousLeft[i]) > 2 ||
        Math.abs(currentRight[i] - previousRight[i]) > 2) {
      return true;
    }
  }
  return false;
}
