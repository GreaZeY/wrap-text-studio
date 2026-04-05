export interface Rect {
  left: number;
  right: number;
}

export interface SilhouetteData {
  rows: number;
  charW: number;
  charH: number;
  leftEdges: Int32Array;
  rightEdges: Int32Array;
}

export interface CellDimensions {
  charW: number;
  charH: number;
}

export interface AppState {
  originalFilename: string;
  asciiRamp: string;
  needsRedraw: boolean;
  isPlaying: boolean;
  isRendering: boolean;
  frameCount: number;
  previousLeftEdges: Int32Array | null;
  previousRightEdges: Int32Array | null;
  storyText: string;
  parsedLayout: any; // Pretext segments
  currentFontSpec: string;
  currentLineHeight: number;
  cellDimensions: CellDimensions;
  artStyle: 'ascii' | 'original' | 'grayscale';
  sidebarOpen: boolean;
  isMuted: boolean;
  isLooping: boolean;
  showBenchmarks: boolean;
  benchmarks: {
    prepareTime: number;
    layoutTime: number;
    analysisTime: number;
    measureTime: number;
    fps: number;    
    domLayoutTime: number;
  };
  renderEngine: 'pretext' | 'dom';
}

export interface RendererParams {
  gl: WebGLRenderingContext;
  ctx: CanvasRenderingContext2D;
  videoSource: HTMLVideoElement | HTMLCanvasElement;
  viewportWidth: number;
  viewportHeight: number;
  gridCols: number;
  gridRows: number;
  charW: number;
  charH: number;
  silhouetteOffsetX: number;
  asciiRGB?: [number, number, number];
  videoTexture: WebGLTexture;
  uniforms: Record<string, WebGLUniformLocation | null>;
  asciiRampLength: number;
}

export interface StyleRenderer {
  render(params: RendererParams): void;
}
