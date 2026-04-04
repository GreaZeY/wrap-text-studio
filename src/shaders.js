const glsl = (s, ...v) => s.map((sh, i) => sh + (v[i] || '')).join('');

export const VERTEX_SHADER_SOURCE = glsl`
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

export const FRAGMENT_SHADER_SOURCE = glsl`
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
uniform vec3 u_asciiColor;

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

  float lum = dot(vc.rgb, vec3(0.2126, 0.7152, 0.0722));
  
  float brightFactor = 2.4; 
  lum = clamp(lum * brightFactor, 0.0, 1.0);
  
  float charF = floor(pow(lum, 0.9) * (u_numChars - 1.0));
  float atlasU = (charF + cellFrac.x) / u_numChars;
  float glyphA = texture2D(u_glyphs, vec2(atlasU, cellFrac.y)).a;

  if (lum < 0.05) {
    gl_FragColor = vec4(u_bg, 1.0);
    return;
  }

  vec3 contrastColor = pow(vc.rgb, vec3(1.2)); 
  vec3 tint = mix(u_asciiColor, contrastColor, 0.35) * (lum * 1.5 + 0.1);
  vec3 finalColor = mix(u_bg, tint, glyphA * 1.1);
  finalColor = mix(vec3(dot(finalColor, vec3(0.333))), finalColor, 1.3); 
  finalColor *= 1.2; 
  
  gl_FragColor = vec4(finalColor, 1.0);
}`;
