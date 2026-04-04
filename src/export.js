import { state } from './state.js';
import { gl, asciiCanvas, videoTexture, uniforms, ASCII_DENSITY_RAMP } from './renderer.js';
import { detectSilhouette } from './silhouette.js';
import { renderStaticLayout } from './text-layout.js';
import { resizeCanvases } from './renderer.js';

const MARGIN = 24;
const SILHOUETTE_PADDING = 6;
const MIN_TEXT_REGION_WIDTH = 40;

let isExporting = false;
let mediaRecorder = null;
let recordedChunks = [];

const exportModal = document.getElementById('exportModal');
const btnStartExport = document.getElementById('btnStartExport');
const btnCancelExport = document.getElementById('btnCancelExport');
const progressContainer = document.getElementById('exportProgressUi');
const progressBar = document.getElementById('exportProgressBar');
const statusText = document.getElementById('exportStatusText');

export function openExportModal() {
  if (isExporting) return;

  progressContainer.style.display = 'none';
  btnStartExport.disabled = false;
  btnCancelExport.disabled = false;
  progressBar.style.width = '0%';
  exportModal.showModal();
}

export function cancelExport() {
  if (isExporting) return;
  exportModal.close();
}

export async function startExport(videoElement) {
  if (isExporting) return;
  isExporting = true;
  recordedChunks = [];

  btnStartExport.disabled = true;
  btnCancelExport.disabled = true;
  progressContainer.style.display = 'block';

  const targetHeight = parseInt(document.getElementById('exportRes').value);
  const aspectRatio = videoElement.videoWidth / videoElement.videoHeight;
  const targetWidth = Math.round(targetHeight * aspectRatio);
  const includeAudio = document.getElementById('exportAudio').checked;

  const offlineVideo = document.createElement("video");
  offlineVideo.crossOrigin = "anonymous";
  offlineVideo.src = videoElement.src;
  offlineVideo.muted = !includeAudio;
  offlineVideo.playsInline = true;

  await new Promise(resolve => {
    offlineVideo.onloadeddata = resolve;
    if (offlineVideo.readyState >= 2) resolve();
  });

  const savedWidth = asciiCanvas.width;
  const savedHeight = asciiCanvas.height;
  asciiCanvas.width = targetWidth;
  asciiCanvas.height = targetHeight;
  gl.viewport(0, 0, targetWidth, targetHeight);

  const renderCanvas = document.createElement("canvas");
  renderCanvas.width = targetWidth;
  renderCanvas.height = targetHeight;
  const renderCtx = renderCanvas.getContext("2d", { willReadFrequently: true });

  let stream;
  if (includeAudio) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const destination = audioCtx.createMediaStreamDestination();
    const source = audioCtx.createMediaElementSource(offlineVideo);
    source.connect(destination);
    source.connect(audioCtx.destination);
    offlineVideo.volume = 1;

    const videoStream = renderCanvas.captureStream();
    const tracks = [...videoStream.getVideoTracks(), ...destination.stream.getAudioTracks()];
    stream = new MediaStream(tracks);
  } else {
    stream = renderCanvas.captureStream();
  }

  mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(recordedChunks, { type: 'video/webm' }));
    link.download = `wrap-studio-${targetHeight}p-${Date.now()}.webm`;
    link.click();

    isExporting = false;
    exportModal.close();
    resizeCanvases();

    const container = document.getElementById("videoContainer");
    renderStaticLayout(container.clientWidth, container.clientHeight);
  };

  const fontScale = targetHeight / savedHeight;
  const scaledLineHeight = (state.currentLineHeight) * fontScale;
  const scaledFont = state.currentFontSpec.replace(/(\d+)px/, (_, size) => `${parseFloat(size) * fontScale}px`);
  const fontColor = document.getElementById('textColor')?.value || "#d4d0c8";

  const exportLayout = window.g0 ? window.g0(state.storyText, scaledFont) : null;
  const { charW, charH } = state.cellDimensions;

  function burnFrame() {
    if (!isExporting) return;

    const textCursor = { segmentIndex: 0, graphemeIndex: 0 };
    renderCtx.clearRect(0, 0, targetWidth, targetHeight);

    const gridRows = Math.ceil(targetHeight / charH);
    const gridCols = Math.ceil(targetWidth / charW);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, videoTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, offlineVideo);
    gl.uniform2f(uniforms.resolution, targetWidth, targetHeight);
    gl.uniform2f(uniforms.cellSize, charW, charH);
    gl.uniform2f(uniforms.gridSize, gridCols, gridRows);
    gl.uniform2f(uniforms.silOffset, 0, 0);
    gl.uniform1f(uniforms.numChars, ASCII_DENSITY_RAMP.length);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    renderCtx.drawImage(asciiCanvas, 0, 0);

    const silhouette = detectSilhouette(targetWidth, targetHeight, charW, charH, offlineVideo);

    renderCtx.textBaseline = "top";
    renderCtx.font = scaledFont;
    renderCtx.fillStyle = fontColor;
    renderCtx.shadowColor = "rgba(0,0,0,0.8)";
    renderCtx.shadowBlur = 4;

    let yPosition = scaledLineHeight;
    while (yPosition + scaledLineHeight <= targetHeight) {
      const topRow = Math.max(0, yPosition / silhouette.charH | 0);
      const bottomRow = Math.min(silhouette.rows - 1, Math.ceil((yPosition + scaledLineHeight) / silhouette.charH));
      let narrowestLeft = 32767;
      let widestRight = -1;

      for (let row = topRow; row <= bottomRow; row++) {
        const left = silhouette.leftEdges[row];
        const right = silhouette.rightEdges[row];
        if (left !== -1) {
          if (left < narrowestLeft) narrowestLeft = left;
          if (right > widestRight) widestRight = right;
        }
      }

      const regions = [];
      const scaledMargin = MARGIN * fontScale;

      if (widestRight === -1) {
        regions.push({ left: scaledMargin, right: targetWidth - scaledMargin });
      } else {
        const leftBound = narrowestLeft * silhouette.charW - (SILHOUETTE_PADDING * fontScale);
        const rightBound = widestRight * silhouette.charW + (SILHOUETTE_PADDING * fontScale);

        if (leftBound > scaledMargin + (30 * fontScale)) {
          regions.push({ left: scaledMargin, right: leftBound });
        }
        if (rightBound < targetWidth - scaledMargin - (30 * fontScale)) {
          regions.push({ left: rightBound, right: targetWidth - scaledMargin });
        }
      }

      for (const region of regions) {
        const regionWidth = region.right - region.left;
        if (regionWidth < (MIN_TEXT_REGION_WIDTH * fontScale)) continue;

        const segment = window.b0(exportLayout, textCursor, regionWidth);
        if (!segment) break;

        renderCtx.fillText(segment.text, region.left, yPosition);
        textCursor.segmentIndex = segment.end.segmentIndex;
        textCursor.graphemeIndex = segment.end.graphemeIndex;
      }

      yPosition += scaledLineHeight;
    }

    const progress = (offlineVideo.currentTime / offlineVideo.duration) * 100;
    progressBar.style.width = `${progress}%`;
    statusText.textContent = `${Math.floor(progress)}% Compiled`;

    offlineVideo.requestVideoFrameCallback(burnFrame);
  }

  mediaRecorder.start();
  offlineVideo.onended = () => { mediaRecorder.stop(); };
  offlineVideo.play();
  offlineVideo.requestVideoFrameCallback(burnFrame);
}
