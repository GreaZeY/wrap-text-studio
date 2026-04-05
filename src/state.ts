import { DEFAULT_TEXT, DEFAULT_VIDEO_SRC } from './defaults.js';
import type { AppState } from './types.js';

export const state: AppState = {
  originalFilename: DEFAULT_VIDEO_SRC,
  asciiRamp: 'wesker',
  needsRedraw: true,
  isPlaying: false,
  isRendering: false,
  frameCount: 0,
  previousLeftEdges: null,
  previousRightEdges: null,
  storyText: DEFAULT_TEXT,
  parsedLayout: null,
  currentFontSpec: '16px "Poppins", sans-serif',
  currentLineHeight: 24,
  cellDimensions: { charW: 2, charH: 4 },
  artStyle: 'ascii',
  sidebarOpen: true,
  isMuted: false,
  isLooping: false,
};
