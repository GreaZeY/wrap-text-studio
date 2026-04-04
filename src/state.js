import { DEFAULT_TEXT, DEFAULT_VIDEO_SRC } from "./defaults.js";

export const state = {
  storyText: DEFAULT_TEXT,
  initialVideoSrc: DEFAULT_VIDEO_SRC,

  currentFontSpec: '17px "Poppins", sans-serif',
  currentLineHeight: 24,

  asciiFontSize: 4,
  cellDimensions: { charW: 2, charH: 4 },

  parsedLayout: null,

  isPlaying: false,
  isRendering: false,
  isExporting: false,
  needsRedraw: false,

  frameCount: 0,
  previousLeftEdges: null,
  previousRightEdges: null,
  asciiRamp: "wesker",
  artStyle: "ascii",
  sidebarOpen: true,
};
