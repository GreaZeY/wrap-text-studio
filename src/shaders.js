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

float getMaxDiff(vec3 a, vec3 b) {
    vec3 d = abs(a - b);
    return max(max(d.r, d.g), d.b);
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
  float maxDiff = getMaxDiff(vc.rgb, chromaKey);
  float distRGB = distance(vc.rgb, chromaKey);

  // Dynamic Skin-Safe Masking Engine
  if (bgHSV.y > 0.25) {
      if (maxDiff < 0.12 || distRGB < 0.18) isBg = true;
      if (hueDist < 0.09 && pxHSV.y > 0.18 && distRGB < 0.35) {
          isBg = true;
      }
  } else {
      if (maxDiff < 0.05 || distRGB < 0.08) isBg = true;
  }

  // Active Boundary Erosion (Shaves off fuzzy antialiased outlines natively)
  if (!isBg && maxDiff < 0.24) {
      vec2 uvOffset = (u_styleId == 0) ? (vec2(1.0) / u_gridSize) : (vec2(1.5) / u_resolution);
      float dN = getMaxDiff(texture2D(u_video, videoUV + vec2(0, uvOffset.y)).rgb, chromaKey);
      float dS = getMaxDiff(texture2D(u_video, videoUV - vec2(0, uvOffset.y)).rgb, chromaKey);
      float dE = getMaxDiff(texture2D(u_video, videoUV + vec2(uvOffset.x, 0)).rgb, chromaKey);
      float dW = getMaxDiff(texture2D(u_video, videoUV - vec2(uvOffset.x, 0)).rgb, chromaKey);
      
      // If ANY adjacent cell is perfectly the background, this cell is just a blended outline!
      if (dN < 0.05 || dS < 0.05 || dE < 0.05 || dW < 0.05) {
          isBg = true;
      }
  }

  if (isBg) {
    gl_FragColor = vec4(u_bg, 1.0);
    return;
  }

  // Target leftover fringe edge pixels and seamlessly despill their saturation
  vec3 colorData = vc.rgb;
  if (bgHSV.y > 0.2) {
     if (hueDist < 0.14 && pxHSV.y > 0.15) {
         colorData = mix(vc.rgb, vec3(lum), 0.7);
     }
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
