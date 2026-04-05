import { VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE } from './shaders.js';
import { state } from './state.js';
import type { RendererParams, CellDimensions } from './types.js';

const GLYPH_FONT_SIZE = 8;
const GLYPH_FONT = `${GLYPH_FONT_SIZE}px "Courier New", monospace`;
const BACKGROUND_COLOR = [0.055, 0.055, 0.055];

const asciiCanvas = document.getElementById('textmodeCanvas') as HTMLCanvasElement;
const compositeCanvas = document.getElementById('canvasDisplay') as HTMLCanvasElement;

const gl = asciiCanvas.getContext("webgl", { 
  alpha: false, 
  antialias: false, 
  preserveDrawingBuffer: true 
}) as WebGLRenderingContext;
const ctx2d = compositeCanvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;

function compileShader(source: string, type: number): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to create WebGLShader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "Unknown compilation error");
  }
  return shader;
}

const program = gl.createProgram();
if (!program) throw new Error("Failed to create WebGLProgram");
gl.attachShader(program, compileShader(VERTEX_SHADER_SOURCE, gl.VERTEX_SHADER));
gl.attachShader(program, compileShader(FRAGMENT_SHADER_SOURCE, gl.FRAGMENT_SHADER));
gl.linkProgram(program);
gl.useProgram(program);

const quadBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
const positionAttrib = gl.getAttribLocation(program, "a_pos");
gl.enableVertexAttribArray(positionAttrib);
gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

const uniforms: Record<string, WebGLUniformLocation | null> = {
  resolution: gl.getUniformLocation(program, "u_resolution"),
  cellSize:   gl.getUniformLocation(program, "u_cellSize"),
  gridSize:   gl.getUniformLocation(program, "u_gridSize"),
  silOffset:  gl.getUniformLocation(program, "u_silOffset"),
  numChars:   gl.getUniformLocation(program, "u_numChars"),
  background: gl.getUniformLocation(program, "u_bg"),
  videoTex:   gl.getUniformLocation(program, "u_video"),
  glyphsTex:  gl.getUniformLocation(program, "u_glyphs"),
  styleId:    gl.getUniformLocation(program, "u_styleId"),
};

const videoTexture = gl.createTexture();
const glyphTexture = gl.createTexture();

function configureTexture(texture: WebGLTexture | null, unit: number, filter: number = gl.NEAREST) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
}

configureTexture(videoTexture, 0, gl.LINEAR);
configureTexture(glyphTexture, 1, gl.NEAREST);
gl.uniform1i(uniforms.videoTex, 0);
gl.uniform1i(uniforms.glyphsTex, 1);
gl.uniform3f(uniforms.background, BACKGROUND_COLOR[0], BACKGROUND_COLOR[1], BACKGROUND_COLOR[2]);

export function buildGlyphAtlas(): CellDimensions {
  const measureCanvas = new OffscreenCanvas(100, 100);
  const measureCtx = measureCanvas.getContext("2d");
  if (!measureCtx) throw new Error("Could not get 2d context");

  measureCtx.font = GLYPH_FONT;
  const charWidth = Math.ceil(measureCtx.measureText("@").width);
  const charHeight = GLYPH_FONT_SIZE + 2;
  const charCount = state.asciiRamp.length;

  const atlasCanvas = new OffscreenCanvas(charWidth * charCount, charHeight);
  const atlasCtx = atlasCanvas.getContext("2d");
  if (!atlasCtx) throw new Error("Could not get 2d context for atlas");

  atlasCtx.font = GLYPH_FONT;
  atlasCtx.textBaseline = "top";
  atlasCtx.fillStyle = "#fff";
  for (let i = 0; i < charCount; i++) {
    atlasCtx.fillText(state.asciiRamp[i], i * charWidth, 1);
  }

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, glyphTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);

  return { charW: charWidth, charH: charHeight };
}

export function resizeCanvases() {
  const container = document.getElementById("videoContainer");
  const dpr = window.devicePixelRatio || 1;
  const width = container?.clientWidth || window.innerWidth;
  let height = container?.clientHeight || window.innerHeight;

  if (width < height) height = Math.max(height, 900);

  asciiCanvas.width = compositeCanvas.width = Math.floor(width * dpr);
  asciiCanvas.height = compositeCanvas.height = Math.floor(height * dpr);
  asciiCanvas.style.width = compositeCanvas.style.width = width + 'px';
  asciiCanvas.style.height = compositeCanvas.style.height = height + 'px';

  ctx2d.scale(dpr, dpr);
  gl.viewport(0, 0, asciiCanvas.width, asciiCanvas.height);

  state.cellDimensions = buildGlyphAtlas();
  state.previousLeftEdges = null;
}

import { OriginalRenderer } from './renderers/original.js';
import { AsciiRenderer } from './renderers/ascii.js';
import { GrayscaleRenderer } from './renderers/grayscale.js';
import type { StyleRenderer } from './types.js';

// Registry of available rendering strategies
const STYLE_RENDERERS: Record<string, StyleRenderer> = {
  ascii: AsciiRenderer,
  original: OriginalRenderer,
  grayscale: GrayscaleRenderer
};

export function renderStyleFrame(params: Partial<RendererParams>) {
  const strategy = STYLE_RENDERERS[state.artStyle] || STYLE_RENDERERS.ascii;
  strategy.render({ 
    gl, 
    ctx: ctx2d, 
    videoTexture: videoTexture as WebGLTexture, 
    uniforms,
    asciiRampLength: state.asciiRamp.length,
    viewportWidth: asciiCanvas.width,
    viewportHeight: asciiCanvas.height,
    gridCols: 100,
    gridRows: 50,
    charW: state.cellDimensions.charW,
    charH: state.cellDimensions.charH,
    silhouetteOffsetX: 0,
    videoSource: asciiCanvas,
    ...params
  });
}

export function clearComposite(width: number, height: number) {
  ctx2d.clearRect(0, 0, width, height);
}

export { gl, asciiCanvas, compositeCanvas, ctx2d, videoTexture, uniforms };
