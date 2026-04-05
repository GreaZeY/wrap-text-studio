import { prepareWithSegments, layoutNextLine as layout } from '@chenglou/pretext';
import { Muxer, ArrayBufferTarget } from 'webm-muxer';
import { state } from './state.js';
import { gl, asciiCanvas, renderStyleFrame } from './renderer.js';
import { detectSilhouette } from './silhouette.js';
import { hexToRgb } from './ui.js';
import type { PreparedTextWithSegments } from '@chenglou/pretext';

const MARGIN = 24;
const SILHOUETTE_PADDING = 6;
const MIN_TEXT_REGION_WIDTH = 40;

let isExporting = false;
let exportStartTime = 0;
let exportTimerInterval: ReturnType<typeof setInterval> | null = null;
let muxer: Muxer<ArrayBufferTarget> | null = null;
let videoEncoder: any = null; // using any since TS might not trace dom-webcodecs
let audioEncoder: any = null;
let offlineVideo: HTMLVideoElement | null = null;

const exportModal = document.getElementById('exportModal') as HTMLDialogElement;
const cancelConfirmModal = document.getElementById('cancelConfirmModal') as HTMLDialogElement;
const btnStartExport = document.getElementById('btnStartExport') as HTMLButtonElement;
const btnCancelExport = document.getElementById('btnCancelExport') as HTMLButtonElement;
const btnCancelYes = document.getElementById('btnCancelYes') as HTMLButtonElement;
const btnCancelNo = document.getElementById('btnCancelNo') as HTMLButtonElement;
const progressContainer = document.getElementById('exportProgressUi') as HTMLElement;
const progressBar = document.getElementById('exportProgressBar') as HTMLElement;
const statusText = document.getElementById('exportStatusText') as HTMLElement;
const timerDisplay = document.getElementById('exportTimer') as HTMLElement;

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
  const mins = Math.floor(elapsed / 60)
    .toString()
    .padStart(2, '0');
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
  if (offlineVideo) {
    if (offlineVideo.parentNode) offlineVideo.parentNode.removeChild(offlineVideo);
    offlineVideo.onloadeddata = null;
    offlineVideo.src = '';
    offlineVideo = null;
  }
  btnStartExport.disabled = false;
  btnCancelExport.disabled = false;
}

export async function startExport(videoElement: HTMLVideoElement) {
  if (isExporting) return;
  isExporting = true;

  btnStartExport.disabled = true;
  btnCancelExport.disabled = false;
  progressContainer.style.display = 'block';
  statusText.textContent = 'Preparing video frames...';

  exportStartTime = performance.now();
  exportTimerInterval = setInterval(updateExportTimer, 1000);

  const targetHeight = parseInt((document.getElementById('exportRes') as HTMLInputElement).value);
  const aspectRatio = videoElement.videoWidth / videoElement.videoHeight;
  const targetWidth = Math.round(targetHeight * aspectRatio);
  const includeAudio = (document.getElementById('exportAudio') as HTMLInputElement).checked;

  offlineVideo = document.createElement('video');
  offlineVideo.crossOrigin = 'anonymous';
  offlineVideo.src = videoElement.src;
  offlineVideo.muted = true;
  offlineVideo.playsInline = true;
  offlineVideo.style.display = 'none';
  offlineVideo.style.position = 'absolute';
  offlineVideo.style.width = '1px';
  offlineVideo.style.height = '1px';
  document.body.appendChild(offlineVideo);

  await new Promise<void>((resolve) => {
    if (!offlineVideo) return resolve();
    offlineVideo.onloadeddata = () => resolve();
    if (offlineVideo.readyState >= 2) resolve();
  });

  if (!offlineVideo) return; // fail safe

  const savedHeight = asciiCanvas.height;
  asciiCanvas.width = targetWidth;
  asciiCanvas.height = targetHeight;
  gl.viewport(0, 0, targetWidth, targetHeight);

  const renderCanvas = document.createElement('canvas');
  renderCanvas.width = targetWidth;
  renderCanvas.height = targetHeight;
  const renderCtx = renderCanvas.getContext('2d', { willReadFrequently: true });
  if (!renderCtx) throw new Error('Could not create 2d export context');

  const bitrate = targetHeight >= 1080 ? 50000000 : targetHeight >= 720 ? 25000000 : 10000000;

  let audioBuffer: AudioBuffer | null = null;
  if (includeAudio) {
    try {
      statusText.textContent = 'Extracting audio track...';
      const response = await fetch(videoElement.src);
      const arrayBuffer = await response.arrayBuffer();
      // @ts-expect-error fallback
      const AudioCtxConstructor = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtxConstructor();

      audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
        const decodePromise = audioCtx.decodeAudioData(arrayBuffer, resolve, reject);
        if (decodePromise) {
          decodePromise.catch(reject);
        }
      });
    } catch (e) {
      console.warn('Audio extraction failed, exporting without audio:', e);
    }
  }

  muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: 'V_VP9',
      width: targetWidth,
      height: targetHeight,
    },
    audio: audioBuffer
      ? {
          codec: 'A_OPUS',
          sampleRate: audioBuffer.sampleRate,
          numberOfChannels: audioBuffer.numberOfChannels,
        }
      : undefined,
    firstTimestampBehavior: 'offset',
  });

  videoEncoder = new window.VideoEncoder({
    output: (chunk: any, metadata: any) => muxer!.addVideoChunk(chunk, metadata as any),
    error: (e: any) => console.error('VideoEncoder error:', e),
  });

  videoEncoder.configure({
    codec: 'vp09.00.10.08',
    width: targetWidth,
    height: targetHeight,
    bitrate: bitrate,
  });

  if (audioBuffer) {
    audioEncoder = new (window as any).AudioEncoder({
      output: (chunk: any, metadata: any) => muxer!.addAudioChunk(chunk, metadata as any),
      error: (e: any) => console.error('AudioEncoder error:', e),
    });

    audioEncoder.configure({
      codec: 'opus',
      sampleRate: audioBuffer.sampleRate,
      numberOfChannels: audioBuffer.numberOfChannels,
      bitrate: 128000,
    });
  }

  const fontScale = targetHeight / (savedHeight / (window.devicePixelRatio || 1));
  const scaledLineHeight = state.currentLineHeight * fontScale;
  const scaledFont = state.currentFontSpec.replace(
    /(\d+)px/,
    (_, size) => `${parseFloat(size) * fontScale}px`
  );
  const fontColor = (document.getElementById('textColor') as HTMLInputElement)?.value || '#d4d0c8';

  const exportLayout = prepareWithSegments(state.storyText, scaledFont) as PreparedTextWithSegments;
  const { charW, charH } = state.cellDimensions;

  let currentFrame = 0;
  const totalFrames = Math.floor(offlineVideo.duration * 30);

  // eslint-disable-next-line no-inner-declarations
  async function burnFrame(_now: number, _metadata: any) {
    if (!isExporting || !offlineVideo) return;

    const textCursor = { segmentIndex: 0, graphemeIndex: 0 };
    renderCtx!.clearRect(0, 0, targetWidth, targetHeight);

    const gridRows = Math.ceil(targetHeight / (charH * fontScale));
    const gridCols = Math.ceil(targetWidth / (charW * fontScale));

    const rgb = hexToRgb(fontColor) as [number, number, number];

    renderStyleFrame({
      gl,
      ctx: renderCtx!,
      videoSource: offlineVideo,
      viewportWidth: targetWidth,
      viewportHeight: targetHeight,
      gridCols,
      gridRows,
      charW: charW * fontScale,
      charH: charH * fontScale,
      silhouetteOffsetX: 0,
      asciiRGB: [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255],
    });

    renderCtx!.drawImage(asciiCanvas, 0, 0);

    const silhouette = detectSilhouette(
      targetWidth,
      targetHeight,
      charW * fontScale,
      charH * fontScale,
      offlineVideo
    );

    // Use a stable frame-based timestamp starting at zero for maximum player compatibility
    const timestamp = currentFrame * (1000000 / 30);
    renderCtx!.textBaseline = 'top';
    renderCtx!.font = scaledFont;
    renderCtx!.fillStyle = fontColor;
    renderCtx!.shadowColor = 'rgba(0,0,0,0.8)';
    renderCtx!.shadowBlur = 4;

    let yPosition = scaledLineHeight;
    while (yPosition + scaledLineHeight <= targetHeight) {
      const topRow = Math.max(0, Math.floor(yPosition / silhouette.charH));
      const bottomRow = Math.min(
        silhouette.rows - 1,
        Math.ceil((yPosition + scaledLineHeight) / silhouette.charH)
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

      const regions = [];
      const scaledMargin = MARGIN * fontScale;

      if (widestRight === -1) {
        regions.push({ left: scaledMargin, right: targetWidth - scaledMargin });
      } else {
        const leftBound = narrowestLeft * silhouette.charW - SILHOUETTE_PADDING * fontScale;
        const rightBound = widestRight * silhouette.charW + SILHOUETTE_PADDING * fontScale;

        if (leftBound > scaledMargin + 30 * fontScale) {
          regions.push({ left: scaledMargin, right: leftBound });
        }
        if (rightBound < targetWidth - scaledMargin - 30 * fontScale) {
          regions.push({ left: rightBound, right: targetWidth - scaledMargin });
        }
      }

      for (const region of regions) {
        const regionWidth = region.right - region.left;
        if (regionWidth < MIN_TEXT_REGION_WIDTH * fontScale) continue;

        const segment = layout(exportLayout as any, textCursor, regionWidth);
        if (!segment) break;

        renderCtx!.fillText(segment.text, region.left, yPosition);
        textCursor.segmentIndex = segment.end.segmentIndex;
        textCursor.graphemeIndex = segment.end.graphemeIndex;
      }

      yPosition += scaledLineHeight;
    }

    // Use passed timestamp from WebCodecs
    const frame = new window.VideoFrame(renderCanvas, { timestamp });
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
        statusText.textContent = 'Encoding audio...';
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

          audioEncoder.encode(
            new (window as any).AudioData({
              format: 'f32',
              sampleRate: audioBuffer.sampleRate,
              numberOfFrames: frameCount,
              numberOfChannels: audioBuffer.numberOfChannels,
              timestamp: (i / audioBuffer.sampleRate) * 1000000,
              data: data,
            })
          );
        }
        await audioEncoder.flush();
      }

      if (!isExporting) return; // Final cancel check

      await videoEncoder.flush();
      muxer!.finalize();

      const { buffer } = muxer!.target as ArrayBufferTarget;
      const originalBase =
        state.originalFilename.substring(0, state.originalFilename.lastIndexOf('.')) ||
        state.originalFilename;
      const exportFilename = `${originalBase}_${state.artStyle}_${targetHeight}p.webm`;

      const blob = new Blob([buffer], { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = exportFilename;
      link.click();

      setTimeout(() => URL.revokeObjectURL(url), 1000);
      stopExportExecution();
      exportModal.close();
      window.dispatchEvent(new Event('resize'));
    }
  }

  offlineVideo.currentTime = 0;
  offlineVideo.requestVideoFrameCallback(burnFrame);
}
