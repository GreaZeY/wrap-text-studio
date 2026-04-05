import { prepareWithSegments } from '@chenglou/pretext';
import { state } from './src/state.js';
import { DEFAULT_VIDEO_SRC } from './src/defaults.js';
import { resizeCanvases, renderStyleFrame, clearComposite } from './src/renderer.js';
import { detectSilhouette, hasSilhouetteChanged } from './src/silhouette.js';
import { placeTextAroundSilhouette } from './src/text-layout.js';
import { bindAllControls, applyTextStyles, hexToRgb } from './src/ui.js';

const videoElement = document.createElement('video');
videoElement.crossOrigin = 'anonymous';
videoElement.loop = state.isLooping;
videoElement.muted = state.isMuted;
videoElement.playsInline = true;
videoElement.preload = 'auto';

function performFullRender() {
  const container = document.getElementById('videoContainer');
  const viewportWidth = container?.clientWidth || window.innerWidth;
  let viewportHeight = container?.clientHeight || window.innerHeight;
  if (viewportWidth < viewportHeight) viewportHeight = Math.max(viewportHeight, 900);

  if (!videoElement.videoWidth || videoElement.readyState < 2) return;

  const aspectRatio = videoElement.videoWidth / videoElement.videoHeight;
  const scaledHeight = viewportHeight;
  const scaledWidth = Math.round(scaledHeight * aspectRatio);
  const silhouetteOffsetX = Math.round((viewportWidth - scaledWidth) / 2);
  const { charW, charH } = state.cellDimensions;
  const gridCols = Math.ceil(scaledWidth / charW);
  const gridRows = Math.ceil(scaledHeight / charH);

  const colorHex = (document.getElementById('textColor') as HTMLInputElement)?.value || '#ffffff';
  const rgb = hexToRgb(colorHex) as [number, number, number];

  // 1. Clear composite canvas first
  clearComposite(viewportWidth, viewportHeight);

  // 2. Draw the style frame
  renderStyleFrame({
    videoSource: videoElement,
    viewportWidth,
    viewportHeight,
    gridCols,
    gridRows,
    charW,
    charH,
    silhouetteOffsetX,
    asciiRGB: rgb,
  });

  // 3. Handle silhouette and text updates
  state.frameCount++;
  const silhouette = detectSilhouette(scaledWidth, scaledHeight, charW, charH, videoElement);

  if (
    hasSilhouetteChanged(
      silhouette.leftEdges,
      silhouette.rightEdges,
      state.previousLeftEdges,
      state.previousRightEdges
    ) ||
    state.needsRedraw
  ) {
    placeTextAroundSilhouette(silhouette, silhouetteOffsetX, viewportWidth, viewportHeight);
    state.previousLeftEdges = silhouette.leftEdges.slice();
    state.previousRightEdges = silhouette.rightEdges.slice();
    state.needsRedraw = false;
  }
}

function renderFrame() {
  if (!state.isRendering) return;
  performFullRender();
}

/**
 * Force a single frame redraw. Used when settings
 * change while the video is paused.
 */
export function forceRedraw() {
  performFullRender();
}

function onVideoFrame() {
  if (!state.isRendering) return;
  renderFrame();
  videoElement.requestVideoFrameCallback(onVideoFrame);
}

window.addEventListener('resize', () => {
  resizeCanvases();
  if (state.parsedLayout && !state.isRendering) {
    forceRedraw();
  }
});

bindAllControls(videoElement, onVideoFrame, forceRedraw);

function initLayout() {
  window.dispatchEvent(new Event('resize'));
  const container = document.getElementById('videoContainer');
  if (container && container.clientWidth > 0) {
    resizeCanvases();
    state.parsedLayout = prepareWithSegments(state.storyText, state.currentFontSpec) as any;
    forceRedraw();
    applyTextStyles(forceRedraw);
  }
}

videoElement.addEventListener('loadeddata', initLayout);
videoElement.src = DEFAULT_VIDEO_SRC;

// Safety fallback for cached video or fast layout
setTimeout(initLayout, 200);

const editor = document.getElementById('textEditor') as HTMLInputElement;
if (editor) editor.value = state.storyText;

state.parsedLayout = prepareWithSegments(state.storyText, state.currentFontSpec) as any;

const loader = document.getElementById('statusLabel');
if (loader) loader.style.display = 'none';
