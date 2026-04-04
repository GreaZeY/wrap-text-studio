let samplingCanvas = null;
let samplingCtx = null;
let cachedCols = 0;
let cachedRows = 0;

const BACKGROUND_TOLERANCE = 15;

export function detectSilhouette(viewportWidth, viewportHeight, cellW, cellH, videoSource) {
  const cols = Math.ceil(viewportWidth / cellW);
  const rows = Math.ceil(viewportHeight / cellH);

  if (!samplingCanvas || cachedCols !== cols || cachedRows !== rows) {
    samplingCanvas = new OffscreenCanvas(cols, rows);
    samplingCtx = samplingCanvas.getContext("2d", { willReadFrequently: true });
    cachedCols = cols;
    cachedRows = rows;
  }

  samplingCtx.drawImage(videoSource, 0, 0, cols, rows);
  const { data: pixels } = samplingCtx.getImageData(0, 0, cols, rows);

  const leftEdges = new Int16Array(rows).fill(-1);
  const rightEdges = new Int16Array(rows).fill(-1);

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

  return { leftEdges, rightEdges, rows, cols, charW: cellW, charH: cellH };
}

export function hasSilhouetteChanged(currentLeft, currentRight, previousLeft, previousRight) {
  if (!previousLeft || previousLeft.length !== currentLeft.length) return true;
  for (let i = 0; i < currentLeft.length; i += 4) {
    if (Math.abs(currentLeft[i] - previousLeft[i]) > 2 ||
        Math.abs(currentRight[i] - previousRight[i]) > 2) {
      return true;
    }
  }
  return false;
}
