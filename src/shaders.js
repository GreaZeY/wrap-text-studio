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
uniform int u_styleId; // 0 = ASCII, 1 = Original, 2 = Grayscale

vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

void main() {
  vec2 px = vec2(v_uv.x, 1.0 - v_uv.y) * u_resolution;
  vec2 localPx = px - u_silOffset;
  
  vec2 continuousUV = localPx / (u_gridSize * u_cellSize);
  vec2 cellIdx = floor(localPx / u_cellSize);
  vec2 cellFrac = fract(localPx / u_cellSize);

  if (continuousUV.x < 0.0 || continuousUV.y < 0.0 || continuousUV.x >= 1.0 || continuousUV.y >= 1.0) {
    gl_FragColor = vec4(u_bg, 1.0);
    return;
  }

  vec2 videoUV = (u_styleId == 0) ? ((cellIdx + 0.5) / u_gridSize) : continuousUV;
  vec4 vc = texture2D(u_video, videoUV);

  float lum = dot(vc.rgb, vec3(0.2126, 0.7152, 0.0722));
  float clampedLum = clamp(lum * 2.4, 0.0, 1.0);

  // Background Keying
  vec3 chromaKey = texture2D(u_video, vec2(0.01, 0.01)).rgb;
  vec3 bgHSV = rgb2hsv(chromaKey);
  vec3 pxHSV = rgb2hsv(vc.rgb);

  float hueDist = abs(pxHSV.x - bgHSV.x);
  hueDist = min(hueDist, 1.0 - hueDist);

  bool isBg = false;
  if (bgHSV.y > 0.15) {
     if (hueDist < 0.12 && pxHSV.y > 0.1) isBg = true;
  }
  if (distance(vc.rgb, chromaKey) < 0.15) {
      isBg = true;
  }

  if (isBg) {
    gl_FragColor = vec4(u_bg, 1.0);
    return;
  }

  // Despill logic for slightly fringed edge pixels
  vec3 colorData = vc.rgb;
  if (bgHSV.y > 0.15 && hueDist < 0.2) {
     colorData = mix(vc.rgb, vec3(lum), 0.7);
  }

  if (u_styleId == 1) { // Original
     gl_FragColor = vec4(colorData, 1.0);
     return;
  } else if (u_styleId == 2) { // Grayscale
     float gray = dot(colorData, vec3(0.2126, 0.7152, 0.0722));
     gray = clamp((gray * 1.2 - 0.5) * 1.1 + 0.5, 0.0, 1.0);
     gl_FragColor = vec4(gray, gray, gray, 1.0);
     return;
  }

  // ASCII Mode (0)
  if (lum < 0.05) {
    gl_FragColor = vec4(u_bg, 1.0);
    return;
  }

  float charF = floor(pow(clampedLum, 0.9) * (u_numChars - 1.0));
  float atlasU = (charF + cellFrac.x) / u_numChars;
  float glyphA = texture2D(u_glyphs, vec2(atlasU, cellFrac.y)).a;

  vec3 contrastColor = pow(colorData, vec3(1.2)); 
  vec3 tint = mix(u_asciiColor, contrastColor, 0.35) * (lum * 1.5 + 0.1);
  vec3 finalColor = mix(u_bg, tint, glyphA * 1.1);
  finalColor = mix(vec3(dot(finalColor, vec3(0.333))), finalColor, 1.3); 
  finalColor *= 1.2; 
  
  gl_FragColor = vec4(finalColor, 1.0);
}`;
