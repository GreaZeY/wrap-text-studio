import { prepareWithSegments } from '@chenglou/pretext';
import { state } from './src/state.js';
import { resizeCanvases, drawAsciiFrame, clearComposite } from './src/renderer.js';
import { detectSilhouette, hasSilhouetteChanged } from './src/silhouette.js';
import { placeTextAroundSilhouette, renderStaticLayout } from './src/text-layout.js';
import { bindAllControls, applyTextStyles, hexToRgb } from './src/ui.js';

const SILHOUETTE_REFRESH_INTERVAL = 3;

const videoElement = document.createElement("video");
videoElement.crossOrigin = "anonymous";
videoElement.loop = true;
videoElement.muted = false;
videoElement.playsInline = true;
videoElement.preload = "auto";

function renderFrame() {
  if (!state.isRendering) return;

  const container = document.getElementById("videoContainer");
  let viewportWidth = container?.clientWidth || window.innerWidth;
  let viewportHeight = container?.clientHeight || window.innerHeight;
  if (viewportWidth < viewportHeight) viewportHeight = Math.max(viewportHeight, 900);

  if (!videoElement.videoWidth) return;

  const aspectRatio = videoElement.videoWidth / videoElement.videoHeight;
  const scaledHeight = viewportHeight;
  const scaledWidth = Math.round(scaledHeight * aspectRatio);
  const silhouetteOffsetX = Math.round((viewportWidth - scaledWidth) / 2);
  const { charW, charH } = state.cellDimensions;
  const gridCols = Math.ceil(scaledWidth / charW);
  const gridRows = Math.ceil(scaledHeight / charH);

  const colorHex = document.getElementById('textColor')?.value || "#ffffff";
  const rgb = hexToRgb(colorHex);

  drawAsciiFrame(videoElement, viewportWidth, viewportHeight, gridCols, gridRows, charW, charH, silhouetteOffsetX, rgb);

  state.frameCount++;
  if (state.frameCount % SILHOUETTE_REFRESH_INTERVAL === 0 || !state.previousLeftEdges || state.needsRedraw) {
    const silhouette = detectSilhouette(scaledWidth, scaledHeight, charW, charH, videoElement);

    if (hasSilhouetteChanged(silhouette.leftEdges, silhouette.rightEdges, state.previousLeftEdges, state.previousRightEdges) || state.needsRedraw) {
      clearComposite(viewportWidth, viewportHeight);
      placeTextAroundSilhouette(silhouette, silhouetteOffsetX, viewportWidth, viewportHeight);
      state.previousLeftEdges = silhouette.leftEdges.slice();
      state.previousRightEdges = silhouette.rightEdges.slice();
      state.needsRedraw = false;
    }
  }
}

function onVideoFrame() {
  if (!state.isRendering) return;
  renderFrame();
  videoElement.requestVideoFrameCallback(onVideoFrame);
}

window.addEventListener("resize", () => {
  resizeCanvases();
  if (state.parsedLayout && !state.isRendering) {
    const container = document.getElementById("videoContainer");
    renderStaticLayout(container.clientWidth, container.clientHeight);
  }
});

bindAllControls(videoElement, onVideoFrame, resizeCanvases, renderFrame);

function initLayout() {
  window.dispatchEvent(new Event('resize'));
  const container = document.getElementById("videoContainer");
  if (container && container.clientWidth > 0) {
    resizeCanvases();
    state.parsedLayout = prepareWithSegments(state.storyText, state.currentFontSpec);
    renderStaticLayout(container.clientWidth, container.clientHeight);
    applyTextStyles(() => {});
  }
}

videoElement.addEventListener("loadeddata", initLayout);
videoElement.src = state.initialVideoSrc;

// Safety fallback for cached video or fast layout
setTimeout(initLayout, 200);

const editor = document.getElementById('textEditor');
if (editor) editor.value = state.storyText;

state.parsedLayout = prepareWithSegments(state.storyText, state.currentFontSpec);

const loader = document.getElementById('statusLabel');
if (loader) loader.style.display = 'none';
