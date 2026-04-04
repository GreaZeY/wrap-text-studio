import { prepareWithSegments } from '@chenglou/pretext';
import { state } from './state.js';
import { openExportModal, cancelExport, startExport } from './export.js';
import { buildGlyphAtlas } from './renderer.js';

const PLAY_ICON = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
const PAUSE_ICON = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

function initInactivityTimer() {
  let timeout;
  const hideControls = () => {
    document.body.classList.add('user-inactive');
  };
  
  const resetTimer = () => {
    document.body.classList.remove('user-inactive');
    clearTimeout(timeout);
    timeout = setTimeout(hideControls, 5000);
  };

  window.addEventListener('mousemove', resetTimer);
  window.addEventListener('mousedown', resetTimer);
  window.addEventListener('keydown', resetTimer);
  window.addEventListener('touchstart', resetTimer);
  
  resetTimer();
}

export function bindAllControls(videoElement, renderFrameCallback, resizeCallback, refreshTextCallback) {
  bindArtStyleControl(refreshTextCallback);
  bindTypographyControls(refreshTextCallback);
  bindBoldItalicToggles();
  bindFileUpload(videoElement);
  bindAsciiScaleSlider(refreshTextCallback);
  bindAsciiRampControl(refreshTextCallback);
  bindSliderFillTracking();
  bindCustomDropdowns();
  bindPlayerControls(videoElement, renderFrameCallback, resizeCallback, refreshTextCallback);
  bindExportControls(videoElement);
  bindTextEditor(videoElement, refreshTextCallback);
  bindSidebarToggle();
  initInactivityTimer();
}

function bindTypographyControls(refreshTextCallback) {
  ['fontFamily', 'textColor', 'fontSize', 'lineHeight', 'fontWeight'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => applyTextStyles(refreshTextCallback));
  });
}

function applyTextStyles(refreshTextCallback) {
  const color = document.getElementById('textColor').value;
  const size = document.getElementById('fontSize').value;
  const family = document.getElementById('fontFamily').value;
  const weight = document.getElementById('fontWeight').value;
  const isItalic = document.getElementById('toggleItalic')?.classList.contains('active');

  const boldBtn = document.getElementById('toggleBold');
  if (boldBtn) {
    boldBtn.classList.toggle('active', parseInt(weight) >= 600);
  }

  const overlay = document.getElementById('textOverlay');
  if (overlay) {
    overlay.style.color = color;
    overlay.style.fontFamily = family;
    overlay.style.fontSize = size + "px";
    overlay.style.fontWeight = weight;
    overlay.style.fontStyle = isItalic ? "italic" : "normal";
  }

  document.getElementById('valSize').textContent = size;
  document.getElementById('valLineHeight').textContent = document.getElementById('lineHeight').value;

  state.currentFontSpec = `${isItalic ? "italic" : "normal"} ${weight} ${size}px ${family}`;
  state.currentLineHeight = parseInt(document.getElementById('lineHeight').value);

  if (state.storyText) {
    state.parsedLayout = prepareWithSegments(state.storyText, state.currentFontSpec);
  }

  state.needsRedraw = true;
  if (refreshTextCallback) refreshTextCallback();
}

function bindBoldItalicToggles() {
  const boldBtn = document.getElementById('toggleBold');
  const italicBtn = document.getElementById('toggleItalic');
  const weightInput = document.getElementById('fontWeight');

  if (boldBtn) {
    boldBtn.addEventListener('click', () => {
      boldBtn.classList.toggle('active');
      weightInput.value = boldBtn.classList.contains('active') ? "700" : "400";

      const headerText = weightInput.parentElement.querySelector('span');
      const items = weightInput.parentElement.querySelectorAll('li');
      items.forEach(li => li.classList.remove('selected'));

      const matchingItem = Array.from(items).find(li => li.dataset.value === weightInput.value);
      if (matchingItem) {
        matchingItem.classList.add('selected');
        headerText.textContent = matchingItem.textContent;
      }

      weightInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  if (italicBtn) {
    italicBtn.addEventListener('click', () => {
      italicBtn.classList.toggle('active');
      document.getElementById('fontFamily')
        ?.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
}

function bindFileUpload(videoElement) {
  const uploadZone = document.getElementById('uploadZone');
  const fileInput = document.getElementById('fileInput');

  uploadZone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Update UI
    document.getElementById('uploadBtnText').textContent = 'Change Media';
    document.getElementById('mediaFileName').textContent = file.name;
    document.getElementById('mediaPreview').style.display = 'flex';

    const url = URL.createObjectURL(file);
    videoElement.src = url;
    state.originalFilename = file.name;
    
    // Generate Thumbnail
    videoElement.addEventListener('loadeddata', () => {
      const thumbCanvas = document.getElementById('thumbCanvas');
      const ctx = thumbCanvas.getContext('2d');
      ctx.drawImage(videoElement, 0, 0, thumbCanvas.width, thumbCanvas.height);
    }, { once: true });

    videoElement.play();
    setTimeout(() => {
      videoElement.pause();
      state.isPlaying = false;
      document.getElementById('btnPlayPause').innerHTML = PLAY_ICON;
    }, 100);
  });
}

function bindAsciiScaleSlider(refreshTextCallback) {
  const slider = document.getElementById('asciiScale');
  const display = document.getElementById('asciiScaleVal');

  slider.addEventListener('input', (e) => {
    const scale = parseInt(e.target.value);
    display.textContent = scale;

    state.cellDimensions = { charW: Math.floor(scale * 0.5), charH: scale };
    updateSliderFill(slider);

    state.needsRedraw = true;
    if (refreshTextCallback) refreshTextCallback();
  });
}

function bindAsciiRampControl(refreshTextCallback) {
  const input = document.getElementById('asciiRamp');
  if (!input) return;

  input.addEventListener('input', (e) => {
    state.asciiRamp = e.target.value || " ";
    state.cellDimensions = buildGlyphAtlas();
    state.needsRedraw = true;

    if (refreshTextCallback) refreshTextCallback();
  });
}

function bindSliderFillTracking() {
  document.querySelectorAll('input[type="range"]').forEach(el => {
    // Initial fill
    updateSliderFill(el);
    // On-the-fly fill
    el.addEventListener('input', () => updateSliderFill(el));
  });
}

function bindArtStyleControl(refreshTextCallback) {
  const artStyleInput = document.getElementById('artStyle');
  const asciiSection = document.getElementById('asciiSettingsSection');
  
  if (!artStyleInput || !asciiSection) return;

  const updateVisibility = (val) => {
    state.artStyle = val;
    
    if (state.artStyle === 'ascii') {
      asciiSection.style.display = 'block';
    } else {
      asciiSection.style.display = 'none';
    }

    state.needsRedraw = true;
    if (refreshTextCallback) refreshTextCallback();
  };

  artStyleInput.addEventListener('input', (e) => updateVisibility(e.target.value));
  
  // Initial run
  updateVisibility(artStyleInput.value);
}

function clearDisplayCanvas() {
  const canvas = document.getElementById('canvasDisplay');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function updateSliderFill(slider) {
  const min = parseFloat(slider.min);
  const max = parseFloat(slider.max);
  const percent = ((slider.value - min) / (max - min)) * 100;
  slider.style.setProperty('--val', percent + '%');
}

function bindCustomDropdowns() {
  document.querySelectorAll('.dropdown').forEach(dropdown => {
    const header = dropdown.querySelector('.dropdown-header');
    const headerText = header.querySelector('span');
    const hiddenInput = dropdown.querySelector('input[type="hidden"]');

    header.addEventListener('click', (e) => {
      document.querySelectorAll('.dropdown').forEach(d => {
        if (d !== dropdown) d.classList.remove('open');
      });
      dropdown.classList.toggle('open');
      e.stopPropagation();
    });

    dropdown.querySelectorAll('li').forEach(item => {
      item.addEventListener('click', (e) => {
        headerText.textContent = item.textContent;
        headerText.style.fontFamily = item.style.fontFamily;
        hiddenInput.value = item.dataset.value;
        dropdown.classList.remove('open');
        dropdown.querySelectorAll('li').forEach(li => li.classList.remove('selected'));
        item.classList.add('selected');
        hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
        e.stopPropagation();
      });
    });
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('open'));
  });
}

function bindPlayerControls(videoElement, renderFrameCallback, resizeCallback) {
  const playPauseBtn = document.getElementById('btnPlayPause');
  const seekSlider = document.getElementById('seekSlider');
  const timeDisplay = document.getElementById('timeDisplay');

    playPauseBtn.addEventListener('click', () => {
    if (!state.isRendering) {
      state.isRendering = true;
      videoElement.play();
      videoElement.requestVideoFrameCallback(renderFrameCallback);
      playPauseBtn.innerHTML = PAUSE_ICON;
      state.isPlaying = true;
    } else if (state.isPlaying) {
      videoElement.pause();
      state.isPlaying = false;
      state.isRendering = false;
      playPauseBtn.innerHTML = PLAY_ICON;
    } else {
      videoElement.play();
      state.isPlaying = true;
      state.isRendering = true;
      videoElement.requestVideoFrameCallback(renderFrameCallback);
      playPauseBtn.innerHTML = PAUSE_ICON;
    }
  });

  videoElement.addEventListener('timeupdate', () => {
    if (!videoElement.duration || document.activeElement === seekSlider) return;
    const percent = (videoElement.currentTime / videoElement.duration) * 100;
    seekSlider.value = percent;
    seekSlider.style.setProperty('--seek-val', percent + '%');
    timeDisplay.textContent = formatTime(videoElement.currentTime) + " / " + formatTime(videoElement.duration);
  });

  seekSlider.addEventListener('input', (e) => {
    if (!videoElement.duration) return;
    videoElement.currentTime = (e.target.value / 100) * videoElement.duration;
    seekSlider.style.setProperty('--seek-val', e.target.value + '%');
    timeDisplay.textContent = formatTime(videoElement.currentTime) + " / " + formatTime(videoElement.duration);
    if (!state.isPlaying) {
      videoElement.requestVideoFrameCallback(() => {
        state.needsRedraw = true;
        if (refreshTextCallback) refreshTextCallback();
      });
    }
  });
}

function bindExportControls(videoElement) {
  const exportBtn = document.getElementById('btnExport');
  const startBtn = document.getElementById('btnStartExport');
  const cancelBtn = document.getElementById('btnCancelExport');

  exportBtn.addEventListener('click', () => {
    if (state.isPlaying) document.getElementById('btnPlayPause').click();
    openExportModal();
  });

  cancelBtn.addEventListener('click', cancelExport);
  startBtn.addEventListener('click', () => startExport(videoElement));
}

function bindTextEditor(videoElement, refreshTextCallback) {
  const editor = document.getElementById('textEditor');

  editor.addEventListener('input', (e) => {
    state.storyText = e.target.value;
    if (state.storyText) {
      state.parsedLayout = prepareWithSegments(state.storyText, state.currentFontSpec);
    }

    if (refreshTextCallback) refreshTextCallback();
  });
}

function bindSidebarToggle() {
  const btnClose = document.getElementById('btnSidebarClose');
  const btnOpen = document.getElementById('btnSidebarOpen');
  const sidebar = document.querySelector('.sidebar');

  if (!btnClose || !btnOpen || !sidebar) return;

  const toggle = (isOpen) => {
    state.sidebarOpen = isOpen;
    sidebar.classList.toggle('sidebar-closed', !isOpen);
    
    const onTransitionEnd = () => {
      window.dispatchEvent(new Event('resize'));
      sidebar.removeEventListener('transitionend', onTransitionEnd);
    };
    sidebar.addEventListener('transitionend', onTransitionEnd);
  };

  btnClose.addEventListener('click', () => toggle(false));
  btnOpen.addEventListener('click', () => toggle(true));
}

function formatTime(seconds) {
  if (isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
}

export { applyTextStyles };
