import { prepareWithSegments } from '@chenglou/pretext';
import { state } from './src/state.js';
import { DEFAULT_VIDEO_SRC } from './src/defaults.js';
import { resizeCanvases, renderStyleFrame, clearComposite } from './src/renderer.js';
import { detectSilhouette, hasSilhouetteChanged } from './src/silhouette.js';
import { placeTextAroundSilhouette, placeTextWithDom } from './src/text-layout.js';
import { bindAllControls, applyTextStyles, hexToRgb } from './src/ui.js';

let frameCount = 0;
let lastFpsUpdate = 0;

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

  // 2. Render Visual Style
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
  
  // Measure Analysis Time
  const startAnalysis = performance.now();
  const silhouette = detectSilhouette(scaledWidth, scaledHeight, charW, charH, videoElement);
  state.benchmarks.analysisTime = performance.now() - startAnalysis;

  if (
    hasSilhouetteChanged(
      silhouette.leftEdges,
      silhouette.rightEdges,
      state.previousLeftEdges,
      state.previousRightEdges
    ) ||
    state.needsRedraw
  ) {
    // Measurement for layout happens inside the layout functions
    if (state.renderEngine === 'pretext') {
      placeTextAroundSilhouette(silhouette, silhouetteOffsetX, viewportWidth, viewportHeight);
      state.benchmarks.domLayoutTime = 0;
    } else {
      placeTextWithDom(silhouette, silhouetteOffsetX, viewportWidth, viewportHeight);
      state.benchmarks.layoutTime = 0;
    }
    
    state.previousLeftEdges = silhouette.leftEdges.slice();
    state.previousRightEdges = silhouette.rightEdges.slice();
    state.needsRedraw = false;
  }

  // Calculate FPS
  const now = performance.now();
  if (now - lastFpsUpdate > 1000) {
    state.benchmarks.fps = Math.round((frameCount * 1000) / (now - lastFpsUpdate));
    lastFpsUpdate = now;
    frameCount = 0;
  }
  frameCount++;

  // Update Benchmarks Overlay
  if (state.showBenchmarks) {
    updateBenchmarkOverlay();
  }
}

function updateBenchmarkOverlay() {
  const overlay = document.getElementById('benchmarkOverlay');
  if (!overlay) return;

  const b = state.benchmarks;
  overlay.innerHTML = `
    <div class="benchmark-title">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent-amber)"><path d="M13 3h-2v10h2V3zm4.83 2.17l-1.42 1.42C17.99 7.86 19 9.81 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.19 1.01-4.14 2.58-5.42L6.17 5.17C4.23 6.82 3 9.26 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-2.74-1.23-5.18-3.17-6.83z"/></svg>
      PERF (RAW ENGINE)
    </div>
    
    <div class="benchmark-row">
      <span class="benchmark-label">Engine (${state.renderEngine.toUpperCase()})</span>
      <span class="benchmark-value" style="color: ${state.renderEngine === 'pretext' ? 'var(--accent-amber)' : 'var(--accent-red)'}">
        ${(state.renderEngine === 'pretext' ? b.layoutTime : b.domLayoutTime).toFixed(3)}ms
      </span>
    </div>
    <div class="benchmark-row">
      <span class="benchmark-label">analysis</span>
      <span class="benchmark-value">${b.analysisTime.toFixed(2)}ms</span>
    </div>
    <div class="benchmark-row">
      <span class="benchmark-label">measure</span>
      <span class="benchmark-value">${b.measureTime.toFixed(2)}ms</span>
    </div>
    <div class="benchmark-row">
      <span class="benchmark-label">DOM Reflows</span>
      <span class="benchmark-value" style="color: ${b.reflows === 0 ? 'var(--accent-green)' : 'var(--accent-red)'}">${b.reflows}</span>
    </div>
    
    <div class="benchmark-row" style="margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;">
      <span class="benchmark-label">Real-time FPS</span>
      <span class="benchmark-value" style="color: var(--accent-green)">${Math.round(b.fps || 60)} FPS</span>
    </div>

    <div class="benchmark-info">
      <strong>PRETEXT</strong> vs <strong>STANDARD DOM</strong> comparison.
      <br/><br/>
      In <strong>DOM Mode</strong>, we measure text by creating temporary spans and reading <code>offsetWidth</code>. This triggers <strong>synchronous reflows</strong> (layout thrashing), which kills performance.
      <br/><br/>
      <strong>Pretext</strong> uses pure arithmetic with no DOM queries, maintaining <strong>0 reflows</strong> and higher FPS.
    </div>
  `;
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
  state.benchmarks.reflows++; // Actual browser layout triggered
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
