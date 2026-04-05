import { VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE } from './shaders.js';
import { state } from './state.js';

const GLYPH_FONT_SIZE = state.asciiFontSize
const GLYPH_FONT = `${GLYPH_FONT_SIZE}px "Courier New", monospace`;
const BACKGROUND_COLOR = [0.055, 0.055, 0.055];

const asciiCanvas = document.getElementById('textmodeCanvas');
const compositeCanvas = document.getElementById('canvasDisplay');

const gl = asciiCanvas.getContext("webgl", { 
  alpha: false, 
  antialias: false, 
  preserveDrawingBuffer: true 
});
const ctx2d = compositeCanvas.getContext("2d", { willReadFrequently: true });

function compileShader(source, type) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

const program = gl.createProgram();
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

const uniforms = {
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

function configureTexture(texture, unit, filter = gl.NEAREST) {
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
gl.uniform3f(uniforms.background, ...BACKGROUND_COLOR);

export function buildGlyphAtlas() {
  const measureCtx = new OffscreenCanvas(100, 100).getContext("2d");
  measureCtx.font = GLYPH_FONT;
  const charWidth = Math.ceil(measureCtx.measureText("@").width);
  const charHeight = GLYPH_FONT_SIZE + 2;
  const charCount = state.asciiRamp.length;

  const atlasCanvas = new OffscreenCanvas(charWidth * charCount, charHeight);
  const atlasCtx = atlasCanvas.getContext("2d");
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

// Registry of available rendering strategies
const STYLE_RENDERERS = {
  ascii: AsciiRenderer,
  original: OriginalRenderer,
  grayscale: GrayscaleRenderer
};

export function renderStyleFrame(params) {
  const strategy = STYLE_RENDERERS[state.artStyle] || STYLE_RENDERERS.ascii;
  strategy.render({ 
    gl, 
    ctx: ctx2d, 
    videoTexture, 
    uniforms,
    asciiRampLength: state.asciiRamp.length,
    ...params
  });
}

export function clearComposite(width, height) {
  ctx2d.clearRect(0, 0, width, height);
}

export { gl, asciiCanvas, compositeCanvas, ctx2d, videoTexture, uniforms };
