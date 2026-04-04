import { DEFAULT_TEXT, DEFAULT_VIDEO_SRC } from "./defaults.js";

export const state = {
  storyText: DEFAULT_TEXT,
  initialVideoSrc: DEFAULT_VIDEO_SRC,

  currentFontSpec: '17px "Crimson Pro", serif',
  currentLineHeight: 24,

  cellDimensions: { charW: 7, charH: 14 },

  parsedLayout: null,

  isPlaying: false,
  isRendering: false,
  isExporting: false,
  needsRedraw: false,

  frameCount: 0,
  previousLeftEdges: null,
  previousRightEdges: null,
  asciiRamp: "wesker",
  sidebarOpen: true,
};
