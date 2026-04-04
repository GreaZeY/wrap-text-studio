import { prepareWithSegments, layoutNextLine as layout } from '@chenglou/pretext';
import { Muxer, ArrayBufferTarget } from 'webm-muxer';
import { state } from './state.js';
import { gl, asciiCanvas, videoTexture, uniforms } from './renderer.js';
import { detectSilhouette } from './silhouette.js';
import { renderStaticLayout } from './text-layout.js';
import { resizeCanvases } from './renderer.js';
import { hexToRgb } from './ui.js';

const MARGIN = 24;
const SILHOUETTE_PADDING = 6;
const MIN_TEXT_REGION_WIDTH = 40;

let isExporting = false;
let exportStartTime = 0;
let exportTimerInterval = null;
let muxer = null;
let videoEncoder = null;
let audioEncoder = null;

const exportModal = document.getElementById('exportModal');
const cancelConfirmModal = document.getElementById('cancelConfirmModal');
const btnStartExport = document.getElementById('btnStartExport');
const btnCancelExport = document.getElementById('btnCancelExport');
const btnCancelYes = document.getElementById('btnCancelYes');
const btnCancelNo = document.getElementById('btnCancelNo');
const progressContainer = document.getElementById('exportProgressUi');
const progressBar = document.getElementById('exportProgressBar');
const statusText = document.getElementById('exportStatusText');
const timerDisplay = document.getElementById('exportTimer');

export function openExportModal() {
  if (isExporting) return;

  progressContainer.style.display = 'none';
  btnStartExport.disabled = false;
  btnCancelExport.disabled = false;
  progressBar.style.width = '0%';
  timerDisplay.textContent = '00:00';
  exportModal.showModal();
}

function updateExportTimer() {
  const elapsed = Math.floor((performance.now() - exportStartTime) / 1000);
  const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
  const secs = (elapsed % 60).toString().padStart(2, '0');
  timerDisplay.textContent = `${mins}:${secs}`;
}

export function cancelExport() {
  if (isExporting) {
    cancelConfirmModal.showModal();
  } else {
    exportModal.close();
  }
}

// Handle Custom Confirmation
btnCancelNo.onclick = () => cancelConfirmModal.close();
btnCancelYes.onclick = () => {
  stopExportExecution();
  cancelConfirmModal.close();
  exportModal.close();
};

function stopExportExecution() {
  isExporting = false;
  if (exportTimerInterval) clearInterval(exportTimerInterval);
  // Encoders don't have a simple stop, so we just let them drift or they close on gc
  videoEncoder = null;
  audioEncoder = null;
  muxer = null;
  btnStartExport.disabled = false;
  btnCancelExport.disabled = false;
}

export async function startExport(videoElement) {
  if (isExporting) return;
  isExporting = true;

  btnStartExport.disabled = true;
  btnCancelExport.disabled = false; 
  progressContainer.style.display = 'block';
  statusText.textContent = "Preparing video frames...";

  exportStartTime = performance.now();
  exportTimerInterval = setInterval(updateExportTimer, 1000);

  const targetHeight = parseInt(document.getElementById('exportRes').value);
  const aspectRatio = videoElement.videoWidth / videoElement.videoHeight;
  const targetWidth = Math.round(targetHeight * aspectRatio);
  const includeAudio = document.getElementById('exportAudio').checked;

  const offlineVideo = document.createElement("video");
  offlineVideo.crossOrigin = "anonymous";
  offlineVideo.src = videoElement.src;
  offlineVideo.muted = true;
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
  
  const bitrate = targetHeight >= 1080 ? 50000000 : (targetHeight >= 720 ? 25000000 : 10000000);

  let audioBuffer = null;
  if (includeAudio) {
    try {
      statusText.textContent = "Extracting audio track...";
      const response = await fetch(videoElement.src);
      const arrayBuffer = await response.arrayBuffer();
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    } catch (e) {
      console.warn("Audio extraction failed, exporting without audio:", e);
    }
  }

  muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: 'V_VP9',
      width: targetWidth,
      height: targetHeight
    },
    audio: audioBuffer ? {
      codec: 'A_OPUS',
      sampleRate: audioBuffer.sampleRate,
      numberOfChannels: audioBuffer.numberOfChannels
    } : undefined,
    firstTimestampBehavior: 'offset'
  });

  videoEncoder = new VideoEncoder({
    output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata),
    error: (e) => console.error("VideoEncoder error:", e)
  });

  videoEncoder.configure({
    codec: 'vp09.00.10.08',
    width: targetWidth,
    height: targetHeight,
    bitrate: bitrate
  });

  if (audioBuffer) {
    audioEncoder = new AudioEncoder({
      output: (chunk, metadata) => muxer.addAudioChunk(chunk, metadata),
      error: (e) => console.error("AudioEncoder error:", e)
    });

    audioEncoder.configure({
      codec: 'opus',
      sampleRate: audioBuffer.sampleRate,
      numberOfChannels: audioBuffer.numberOfChannels,
      bitrate: 128000
    });
  }

  const fontScale = targetHeight / (savedHeight / (window.devicePixelRatio || 1));
  const scaledLineHeight = (state.currentLineHeight) * fontScale;
  const scaledFont = state.currentFontSpec.replace(/(\d+)px/, (_, size) => `${parseFloat(size) * fontScale}px`);
  const fontColor = document.getElementById('textColor')?.value || "#d4d0c8";

  const exportLayout = prepareWithSegments(state.storyText, scaledFont);
  const { charW, charH } = state.cellDimensions;

  let currentFrame = 0;
  const totalFrames = Math.floor(offlineVideo.duration * 30);

  async function burnFrame() {
    if (!isExporting) return;

    const textCursor = { segmentIndex: 0, graphemeIndex: 0 };
    renderCtx.clearRect(0, 0, targetWidth, targetHeight);

    const gridRows = Math.ceil(targetHeight / (charH * fontScale));
    const gridCols = Math.ceil(targetWidth / (charW * fontScale));

    const rgb = hexToRgb(fontColor);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, videoTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, offlineVideo);
    gl.uniform2f(uniforms.resolution, targetWidth, targetHeight);
    gl.uniform2f(uniforms.cellSize, charW * fontScale, charH * fontScale);
    gl.uniform2f(uniforms.gridSize, gridCols, gridRows);
    gl.uniform2f(uniforms.silOffset, 0, 0);
    gl.uniform1f(uniforms.numChars, state.asciiRamp.length);
    gl.uniform3f(uniforms.asciiColor, rgb[0]/255, rgb[1]/255, rgb[2]/255);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    renderCtx.drawImage(asciiCanvas, 0, 0);

    const silhouette = detectSilhouette(targetWidth, targetHeight, charW * fontScale, charH * fontScale, offlineVideo);

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

        const segment = layout(exportLayout, textCursor, regionWidth);
        if (!segment) break;

        renderCtx.fillText(segment.text, region.left, yPosition);
        textCursor.segmentIndex = segment.end.segmentIndex;
        textCursor.graphemeIndex = segment.end.graphemeIndex;
      }

      yPosition += scaledLineHeight;
    }

    const timestamp = currentFrame * (1000000 / 30);
    const frame = new VideoFrame(renderCanvas, { timestamp });
    videoEncoder.encode(frame);
    frame.close();
    
    currentFrame++;

    const progress = (currentFrame / totalFrames) * 100;
    progressBar.style.width = `${Math.min(100, progress)}%`;
    statusText.textContent = `${Math.floor(progress)}% Finished`;

    if (currentFrame < totalFrames) {
      offlineVideo.currentTime = currentFrame / 30;
      offlineVideo.requestVideoFrameCallback(burnFrame);
    } else {
      if (audioEncoder && audioBuffer) {
        statusText.textContent = "Encoding audio...";
        const samplesPerFrame = Math.floor(audioBuffer.sampleRate / 10);
        for (let i = 0; i < audioBuffer.length; i += samplesPerFrame) {
          if (!isExporting) break; // Check for cancel
          const frameCount = Math.min(samplesPerFrame, audioBuffer.length - i);
          const data = new Float32Array(frameCount * audioBuffer.numberOfChannels);
          for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
            const channelData = audioBuffer.getChannelData(ch);
            for (let s = 0; s < frameCount; s++) {
              data[s * audioBuffer.numberOfChannels + ch] = channelData[i + s];
            }
          }

          audioEncoder.encode(new AudioData({
            format: 'f32',
            sampleRate: audioBuffer.sampleRate,
            numberOfFrames: frameCount,
            numberOfChannels: audioBuffer.numberOfChannels,
            timestamp: (i / audioBuffer.sampleRate) * 1000000,
            data: data
          }));
        }
        await audioEncoder.flush();
      }

      if (!isExporting) return; // Final cancel check

      await videoEncoder.flush();
      muxer.finalize();
      
      const { buffer } = muxer.target;
      const blob = new Blob([buffer], { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `storybook-export-${targetHeight}p-${Date.now()}.webm`;
      link.click();

      setTimeout(() => URL.revokeObjectURL(url), 1000);
      stopExportExecution();
      exportModal.close();
      resizeCanvases();
      renderStaticLayout(savedWidth, savedHeight);
    }
  }

  offlineVideo.currentTime = 0;
  offlineVideo.requestVideoFrameCallback(burnFrame);
}
