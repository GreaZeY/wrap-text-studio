import { layoutNextLine } from '@chenglou/pretext';
import { state } from './state.js';

const MARGIN = 24;
const SILHOUETTE_PADDING = 6;
const MIN_TEXT_REGION_WIDTH = 40;

export function placeTextAroundSilhouette(silhouette, silhouetteOffsetX, viewportWidth, viewportHeight) {
  const lineHeight = state.currentLineHeight;
  const textCursor = { segmentIndex: 0, graphemeIndex: 0 };
  let yPosition = lineHeight;

  if (!state.storyText || !state.parsedLayout) return;

  const overlay = document.getElementById('textOverlay');
  const fragment = document.createDocumentFragment();

  while (yPosition + lineHeight <= viewportHeight) {
    const topRow = Math.max(0, yPosition / silhouette.charH | 0);
    const bottomRow = Math.min(silhouette.rows - 1, Math.ceil((yPosition + lineHeight) / silhouette.charH));
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

    const regions = computeTextRegions(narrowestLeft, widestRight, silhouetteOffsetX, silhouette.charW, viewportWidth);

    for (const region of regions) {
      const regionWidth = region.right - region.left;
      if (regionWidth < MIN_TEXT_REGION_WIDTH) continue;

      const segment = layoutNextLine(state.parsedLayout, textCursor, regionWidth);
      if (!segment) break;

      const span = document.createElement("span");
      span.textContent = segment.text;
      span.style.left = region.left + "px";
      span.style.top = yPosition + "px";
      fragment.appendChild(span);

      textCursor.segmentIndex = segment.end.segmentIndex;
      textCursor.graphemeIndex = segment.end.graphemeIndex;
    }

    yPosition += lineHeight;
  }

  if (overlay) {
    overlay.innerHTML = "";
    overlay.appendChild(fragment);
  }
}

function computeTextRegions(narrowestLeft, widestRight, silhouetteOffsetX, charW, viewportWidth) {
  const regions = [];

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

