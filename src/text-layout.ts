import { layoutNextLine } from '@chenglou/pretext';
import { state } from './state.js';
import type { SilhouetteData, Rect } from './types.js';

const MARGIN = 24;
const SILHOUETTE_PADDING = 6;
const MIN_TEXT_REGION_WIDTH = 40;

export function placeTextAroundSilhouette(
  silhouette: SilhouetteData,
  silhouetteOffsetX: number,
  viewportWidth: number,
  viewportHeight: number
) {
  const lineHeight = state.currentLineHeight;
  const textCursor = { segmentIndex: 0, graphemeIndex: 0 };
  let yPosition = lineHeight;
  let layoutAccumulator = 0;

  if (!state.storyText || !state.parsedLayout) return;

  const overlay = document.getElementById('textOverlay');
  const fragment = document.createDocumentFragment();

  while (yPosition + lineHeight <= viewportHeight) {
    const topRow = Math.max(0, (yPosition / silhouette.charH) | 0);
    const bottomRow = Math.min(
      silhouette.rows - 1,
      Math.ceil((yPosition + lineHeight) / silhouette.charH)
    );
    let narrowestLeft = 32767;
    let widestRight = -1;

    for (let row = topRow; row <= bottomRow; row++) {
      const left = silhouette.leftEdges ? silhouette.leftEdges[row] : -1;
      const right = silhouette.rightEdges ? silhouette.rightEdges[row] : -1;
      if (left !== -1) {
        if (left < narrowestLeft) narrowestLeft = left;
        if (right > widestRight) widestRight = right;
      }
    }

    const regions = computeTextRegions(
      narrowestLeft,
      widestRight,
      silhouetteOffsetX,
      silhouette.charW,
      viewportWidth
    );

    for (const region of regions) {
      const regionWidth = region.right - region.left;
      if (regionWidth < MIN_TEXT_REGION_WIDTH) continue;

      const lStart = performance.now();
      const segment = layoutNextLine(state.parsedLayout as any, textCursor, regionWidth);
      layoutAccumulator += performance.now() - lStart;

      if (!segment) break;

      const span = document.createElement('span');
      span.textContent = segment.text;
      span.style.left = region.left + 'px';
      span.style.top = yPosition + 'px';
      fragment.appendChild(span);

      textCursor.segmentIndex = segment.end.segmentIndex;
      textCursor.graphemeIndex = segment.end.graphemeIndex;
    }

    yPosition += lineHeight;
  }

  state.benchmarks.layoutTime = layoutAccumulator;

  if (overlay) {
    overlay.innerHTML = '';
    overlay.appendChild(fragment);
  }
}

export function placeTextWithDom(
  silhouette: SilhouetteData,
  silhouetteOffsetX: number,
  viewportWidth: number,
  viewportHeight: number
) {
  const lineHeight = state.currentLineHeight;
  let yPosition = lineHeight;
  let domLayoutAccumulator = 0;

  if (!state.storyText) return;

  const overlay = document.getElementById('textOverlay');
  if (!overlay) return;

  const fragment = document.createDocumentFragment();
  const words = state.storyText.split(/\s+/);
  let wordIndex = 0;

  // Create a hidden measurer to simulate "standard" DOM measurement
  const measurer = document.createElement('span');
  measurer.style.visibility = 'hidden';
  measurer.style.position = 'absolute';
  measurer.style.whiteSpace = 'nowrap';
  // Use same font as overlay
  measurer.style.font = state.currentFontSpec;
  document.body.appendChild(measurer);

  while (yPosition + lineHeight <= viewportHeight && wordIndex < words.length) {
    const topRow = Math.max(0, (yPosition / silhouette.charH) | 0);
    const bottomRow = Math.min(
      silhouette.rows - 1,
      Math.ceil((yPosition + lineHeight) / silhouette.charH)
    );
    let narrowestLeft = 32767;
    let widestRight = -1;

    for (let row = topRow; row <= bottomRow; row++) {
      const left = silhouette.leftEdges ? silhouette.leftEdges[row] : -1;
      const right = silhouette.rightEdges ? silhouette.rightEdges[row] : -1;
      if (left !== -1) {
        if (left < narrowestLeft) narrowestLeft = left;
        if (right > widestRight) widestRight = right;
      }
    }

    const regions = computeTextRegions(
      narrowestLeft,
      widestRight,
      silhouetteOffsetX,
      silhouette.charW,
      viewportWidth
    );

    for (const region of regions) {
      const regionWidth = region.right - region.left;
      if (regionWidth < MIN_TEXT_REGION_WIDTH) continue;

      let lineText = '';
      const startMeasure = performance.now();

      while (wordIndex < words.length) {
        const nextWord = words[wordIndex];
        const testText = lineText ? lineText + ' ' + nextWord : nextWord;
        measurer.textContent = testText;
        
        // FORCING REFLOW: Reading offsetWidth
        const measuredWidth = measurer.offsetWidth;
        state.benchmarks.reflows++;

        if (measuredWidth <= regionWidth) {
          lineText = testText;
          wordIndex++;
        } else {
          break;
        }
      }
      domLayoutAccumulator += performance.now() - startMeasure;

      if (lineText) {
        const span = document.createElement('span');
        span.textContent = lineText;
        span.style.left = region.left + 'px';
        span.style.top = yPosition + 'px';
        fragment.appendChild(span);
      }
    }

    yPosition += lineHeight;
  }

  document.body.removeChild(measurer);
  state.benchmarks.domLayoutTime = domLayoutAccumulator;

  overlay.innerHTML = '';
  overlay.appendChild(fragment);
}

function computeTextRegions(
  narrowestLeft: number,
  widestRight: number,
  silhouetteOffsetX: number,
  charW: number,
  viewportWidth: number
): Rect[] {
  const regions: Rect[] = [];

  if (widestRight === -1) {
    regions.push({ left: MARGIN, right: viewportWidth - MARGIN });
    return regions;
  }

  const silhouetteLeftPx = silhouetteOffsetX + narrowestLeft * charW - SILHOUETTE_PADDING;
  const silhouetteRightPx = silhouetteOffsetX + widestRight * charW + SILHOUETTE_PADDING;

  if (silhouetteLeftPx > MARGIN + 30) {
    regions.push({ left: MARGIN, right: silhouetteLeftPx });
  }

  if (silhouetteRightPx < viewportWidth - MARGIN - 30) {
    regions.push({ left: silhouetteRightPx, right: viewportWidth - MARGIN });
  }

  return regions;
}
