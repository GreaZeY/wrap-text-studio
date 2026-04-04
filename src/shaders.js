export const VERTEX_SHADER_SOURCE = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

export const FRAGMENT_SHADER_SOURCE = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_video;
uniform sampler2D u_glyphs;
uniform vec2 u_resolution;
uniform vec2 u_cellSize;
uniform vec2 u_gridSize;
uniform vec2 u_silOffset;
uniform float u_numChars;
uniform vec3 u_bg;
void main() {
  vec2 px = vec2(v_uv.x, 1.0 - v_uv.y) * u_resolution;
  vec2 localPx = px - u_silOffset;
  vec2 cellIdx = floor(localPx / u_cellSize);
  vec2 cellFrac = fract(localPx / u_cellSize);
  if (cellIdx.x < 0.0 || cellIdx.y < 0.0 || cellIdx.x >= u_gridSize.x || cellIdx.y >= u_gridSize.y) {
    gl_FragColor = vec4(u_bg, 1.0);
    return;
  }
  vec2 videoUV = (cellIdx + 0.5) / u_gridSize;
  vec4 vc = texture2D(u_video, videoUV);

  vec4 bgKey = texture2D(u_video, vec2(0.01, 0.01));
  vec3 diff = abs(vc.rgb - bgKey.rgb);
  if (diff.r < 0.06 && diff.g < 0.06 && diff.b < 0.06) {
    gl_FragColor = vec4(u_bg, 1.0);
    return;
  }

  float lum = dot(vc.rgb, vec3(0.299, 0.587, 0.114));
  lum = min(1.0, lum * 1.8);
  float charF = floor(lum * (u_numChars - 1.0));
  float atlasU = (charF + cellFrac.x) / u_numChars;
  float glyphA = texture2D(u_glyphs, vec2(atlasU, cellFrac.y)).a;
  if (charF < 0.5 && glyphA < 0.1) {
    gl_FragColor = vec4(u_bg, 1.0);
    return;
  }
  float bright = min(1.0, lum * 1.8);
  vec3 tint = vc.rgb * 0.3 + vec3(bright * 0.47, bright * 0.39, bright * 0.55);
  vec3 color = mix(u_bg, tint, glyphA);
  gl_FragColor = vec4(color, 1.0);
}`;
