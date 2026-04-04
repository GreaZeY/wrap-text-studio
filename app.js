// ====== UI Elements ======
const M_CANVAS = document.getElementById('textmodeCanvas');
const H_CANVAS = document.getElementById('canvasDisplay');
const btnPlayPause = document.getElementById('btnPlayPause');
const btnExport = document.getElementById('btnExport');
const btnUpload = document.getElementById('btnUpload');
const fileInput = document.getElementById('fileInput');
const textEditor = document.getElementById('textEditor');
const statusLabel = document.getElementById('statusLabel');
const recordingIndicator = document.getElementById('recordingIndicator');
// ====== Audio & Video Context ======
const y = document.createElement("video");
y.crossOrigin = "anonymous";
y.loop = true;
y.muted = false; // Trust uploaded audio 
y.playsInline = true;
y.preload = "auto";
y.src = "wesker.mov";

// ====== WebGL Setup (ASCII Rendering) ======
const M = M_CANVAS.getContext("webgl", { alpha: false, antialias: false, preserveDrawingBuffer: false });
const H = H_CANVAS.getContext("2d", { willReadFrequently: true });

const y6 = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;
const L6 = `
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
  
  // Dynamically sample background key color from the top corner (handles ANY solid color)
  vec4 bgKey = texture2D(u_video, vec2(0.01, 0.01));
  vec3 diff = abs(vc.rgb - bgKey.rgb);
  
  // Tolerance mask
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
function q5(J, Q) {
    let $ = M.createShader(Q);
    M.shaderSource($, J);
    M.compileShader($);
    if (!M.getShaderParameter($, M.COMPILE_STATUS)) throw Error(M.getShaderInfoLog($));
    return $;
}
const o = M.createProgram();
M.attachShader(o, q5(y6, M.VERTEX_SHADER));
M.attachShader(o, q5(L6, M.FRAGMENT_SHADER));
M.linkProgram(o);
M.useProgram(o);
const W6 = M.createBuffer();
M.bindBuffer(M.ARRAY_BUFFER, W6);
M.bufferData(M.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), M.STATIC_DRAW);
const V5 = M.getAttribLocation(o, "a_pos");
M.enableVertexAttribArray(V5);
M.vertexAttribPointer(V5, 2, M.FLOAT, false, 0, 0);

const k6 = M.getUniformLocation(o, "u_resolution");
const S6 = M.getUniformLocation(o, "u_cellSize");
const I6 = M.getUniformLocation(o, "u_gridSize");
const c6 = M.getUniformLocation(o, "u_silOffset");
const h6 = M.getUniformLocation(o, "u_numChars");
const o6 = M.getUniformLocation(o, "u_bg");
const p6 = M.getUniformLocation(o, "u_video");
const x6 = M.getUniformLocation(o, "u_glyphs");

const X5 = M.createTexture();
const Y5 = M.createTexture();
function U5(J, Q) {
    M.activeTexture(M.TEXTURE0 + Q);
    M.bindTexture(M.TEXTURE_2D, J);
    M.texParameteri(M.TEXTURE_2D, M.TEXTURE_WRAP_S, M.CLAMP_TO_EDGE);
    M.texParameteri(M.TEXTURE_2D, M.TEXTURE_WRAP_T, M.CLAMP_TO_EDGE);
    M.texParameteri(M.TEXTURE_2D, M.TEXTURE_MIN_FILTER, M.NEAREST);
    M.texParameteri(M.TEXTURE_2D, M.TEXTURE_MAG_FILTER, M.NEAREST);
}
U5(X5, 0);
U5(Y5, 1);
M.uniform1i(p6, 0);
M.uniform1i(x6, 1);
M.uniform3f(o6, 0.055, 0.055, 0.055);

// ====== Text Configuration ======
let $5 = ["Rick Astley, born Richard Paul Astley on February 6, 1966, in Newton-le-Willows, Lancashire, England, is a singer, songwriter, and radio personality who became one of the most iconic figures in pop music history. He grew up in a working-class family and developed a passion for music at an early age, joining the local church choir as a boy. At fifteen he joined a local band called Give Way, and by eighteen he was discovered by legendary producer Pete Waterman, who invited him to work at the famous PWL Studios in London. At first, Astley was making tea and learning the ropes, but Waterman quickly recognized his extraordinary baritone voice, which was remarkably deep and soulful for such a young man. In 1987, his debut single Never Gonna Give You Up was released and immediately shot to number one in twenty-five countries, making it one of the best-selling singles of all time. The song was written and produced by the hitmaking trio Stock Aitken Waterman, who crafted its irresistibly catchy synth-pop melody and driving beat. The music video, featuring Astley's now-legendary dance moves in a long trench coat, became one of the most recognizable videos in music history. His debut album Whenever You Need Somebody sold over fifteen million copies worldwide. Astley followed up with more hits including Together Forever, which also reached number one in the United States, making him one of the few artists to have their first two singles both reach the top of the Billboard Hot 100. He continued releasing music throughout the late 1980s with albums like Hold Me in Your Arms and Free, but by the early 1990s he had grown tired of the music industry and the lack of creative control he felt over his own work. In 1993, he made the surprising decision to retire from music at the age of just twenty-seven to focus on raising his daughter, Emilie. He largely disappeared from public life, living quietly in suburban England, gardening, and enjoying family life for over a decade. Then in 2007, something remarkable happened. An internet phenomenon known as Rickrolling emerged, in which unsuspecting internet users would click on a link expecting one thing but would instead be redirected to the music video for Never Gonna Give You Up. The prank spread like wildfire across forums, social media, and even mainstream events. The original music video has since accumulated over a billion views on YouTube, making it one of the most-watched videos on the platform. Astley himself has said he finds the whole thing hilarious and flattering, though he reportedly earned very little from the initial viral surge due to the way his original recording contract was structured. In 2008, he was voted Best Act Ever at the MTV Europe Music Awards through an online campaign that was itself essentially a massive Rickroll. The renewed attention led Astley back into music and performing. He released the album 50 in 2016, which debuted at number one on the UK Albums Chart, his first chart-topping album in nearly thirty years. The album showcased a more mature, soulful sound that demonstrated his growth as an artist and songwriter. He has since become a beloved fixture of British pop culture, performing at festivals, charity events, and television shows. In 2020 he joined Reddit and became one of its most popular users, embracing the internet culture that had adopted him. He is known for being genuinely kind, self-deprecating, and good-humored about his unusual path to lasting fame. His voice remains remarkably powerful and distinctive, and live performances showcase a vocal talent that transcends the bubblegum pop production of his early hits. Astley has spoken openly about how stepping away from fame was the best decision he ever made, as it allowed him to develop as a person and return to music on his own terms. He continues to tour, record, and connect with fans both old and new, bridging generations through the universal appeal of his music and the sheer joy of the Rickroll. Beyond music, Astley is an avid photographer, a passionate gardener, and a devoted family man. He has remained married to his partner Lene Bausager, a Danish film producer, and they live together in London. His story is one of pop culture's great second acts: a man who walked away from global fame, found himself, and then was reclaimed by the internet as an enduring symbol of wholesome mischief and musical nostalgia. The cultural impact of Rickrolling has been analyzed by academics and media theorists as one of the first truly global internet memes, predating the modern era of viral content and influencing how we think about surprise, humor, and shared experience online. Rick Astley did not just become a meme. He became THE meme. And through it all, he never gave us up, never let us down, never ran around, and never deserted us. "];

// Global font tracking dynamically hooks into UI panel!
window.curV0 = '17px "Crimson Pro", serif';
window.curQ0 = 24;

const G6 = 'bold 48px "Georgia", "Palatino Linotype", "Book Antiqua", Palatino, serif';
const A6 = 'italic 14px "Georgia", "Palatino Linotype", "Book Antiqua", Palatino, serif';
const r0 = 'bold 82px "Georgia", "Palatino Linotype", "Book Antiqua", Palatino, serif';
const G0 = " .:-=+*#%@";

let Q5 = 12; 
let a0 = `${Q5}px "Courier New", monospace`;

function l6() {
    a0 = `${Q5}px "Courier New", monospace`;
    const Q = new OffscreenCanvas(100, 100).getContext("2d");
    Q.font = a0;
    let n0 = Q.measureText("@").width;
    let $ = Math.ceil(n0);
    let X = Q5 + 2;
    let q = G0.length;
    let Z = new OffscreenCanvas($ * q, X);
    let Y = Z.getContext("2d");
    Y.font = a0;
    Y.textBaseline = "top";
    Y.fillStyle = "#fff";
    for (let D = 0; D < q; D++) Y.fillText(G0[D], D * $, 1);
    
    M.activeTexture(M.TEXTURE1);
    M.bindTexture(M.TEXTURE_2D, Y5);
    M.texImage2D(M.TEXTURE_2D, 0, M.RGBA, M.RGBA, M.UNSIGNED_BYTE, Z);
    return { charW: $, charH: X };
}

// ====== Sync Loop Elements ======
let Y0, t0 = 0, t = null, D5 = null, v0 = null, P0 = null, e0 = 0, J5 = 0;
let f5 = { charW: 7, charH: 14 };
let forceRedraw = false;

function m6(J, Q, $, X, videoSource = y) {
    let q = Math.ceil(J / $);
    let Z = Math.ceil(Q / X);
    if (!v0 || e0 !== q || J5 !== Z) {
        v0 = new OffscreenCanvas(q, Z);
        P0 = v0.getContext("2d", { willReadFrequently: true });
        e0 = q;
        J5 = Z;
    }
    
    // Sample natively from provided video scope (main `y` or offline `exportVid`)
    P0.drawImage(videoSource, 0, 0, q, Z);
    
    let { data: Y } = P0.getImageData(0, 0, q, Z);
    let D = new Int16Array(Z).fill(-1);
    let N = new Int16Array(Z).fill(-1);
    
    // Sample the solid background color automatically from the top-left pixel!
    const bgR = Y[0];
    const bgG = Y[1];
    const bgB = Y[2];
    const TOL = 15; // Tolerance for slight video compression artifacts
    
    for (let V = 0; V < Z; V++) {
        let U = -1, j = -1;
        for (let f = 0; f < q; f++) {
            let O = (V * q + f) * 4;
            let P = Y[O], G = Y[O + 1], A = Y[O + 2];
            
            // Any solid background correctly evaluates and skips natively
            if (Math.abs(P - bgR) < TOL && Math.abs(G - bgG) < TOL && Math.abs(A - bgB) < TOL) continue;
            
            if (U === -1) U = f;
            j = f;
        }
        
        if (U !== -1) {
            D[V] = U;
            N[V] = j + 1;
        }
    }
    return { rowLeft: D, rowRight: N, rows: Z, cols: q, charW: $, charH: X };
}

function g6(J, Q) {
    if (!t || t.length !== J.length) return true;
    for (let $ = 0; $ < J.length; $ += 4) {
        if (Math.abs(J[$] - t[$]) > 2 || Math.abs(Q[$] - D5[$]) > 2) return true;
    }
    return false;
}

function M5(J, Q, $, X) {
    H.clearRect(0, 0, $, X);
    
    let currentLineHeight = window.curQ0 || 24;
    let D = { segmentIndex: 0, graphemeIndex: 0 };
    let N = currentLineHeight; 
    
    let U = $5[0];
    if (!U) return;
    
    if (!window.g0 || !window.b0 || !Y0) return;
    
    const textOverlay = document.getElementById('textOverlay');
    const frag = document.createDocumentFragment();
    
    while (N + currentLineHeight <= X) {
        let A = Math.max(0, N / J.charH | 0);
        let T = Math.min(J.rows - 1, Math.ceil((N + currentLineHeight) / J.charH));
        let k = 32767, p = -1;
        
        for (let C = A; C <= T; C++) {
            let z = J.rowLeft ? J.rowLeft[C] : -1;
            let b = J.rowRight ? J.rowRight[C] : -1;
            if (z !== -1) {
                if (z < k) k = z;
                if (b > p) p = b;
            }
        }
        
        let E = 0, B = 0, w = 0, F = 0, _ = 0, R = 24;
        const i0 = 6;
        if (p === -1) {
            B = R; w = $ - R; E = 1;
        } else {
            let C = Q + k * J.charW - i0;
            let z = Q + p * J.charW + i0;
            if (C > R + 30) { B = R; w = C; E = 1; }
            if (z < $ - R - 30) {
                if (E === 0) { B = z; w = $ - R; E = 1; }
                else { F = z; _ = $ - R; E = 2; }
            }
        }
        
        for (let C = 0; C < E; C++) {
            let z = (C === 0) ? B : F;
            let b = (C === 0) ? w : _;
            
            let h = b - z;
            if (h < 40) continue;
            let S = window.b0(Y0, D, h);
            if (!S) {
                if (D = { segmentIndex: 0, graphemeIndex: 0 }, S = window.b0(Y0, D, h), !S) break;
            }
            
            // DOM Element Generation Instead of Canvas Direct Stream!
            let span = document.createElement("span");
            span.textContent = S.text;
            span.style.left = z + "px";
            span.style.top = N + "px";
            span.style.position = "absolute";
            span.style.whiteSpace = "pre";
            frag.appendChild(span);
            
            D = S.end;
        }
        N += currentLineHeight;
    }
    
    // Blast fragment identically into container for pristine DOM UI updating
    if (textOverlay) {
        textOverlay.innerHTML = ""; 
        textOverlay.appendChild(frag);
    }
}

// ====== Render Infrastructure ======
let U0 = false;
function N5() {
    const workspace = document.getElementById("videoContainer");
    let J = window.devicePixelRatio || 1;
    let Q = (workspace && workspace.clientWidth) || window.innerWidth;
    let $ = (workspace && workspace.clientHeight) || window.innerHeight;
    
    let isVertical = Q < $;
    
    // Allow scrolling UI on mobile
    if (isVertical) {
        $ = Math.max($, 900);
    }

    M_CANVAS.width = H_CANVAS.width = Math.floor(Q * J);
    M_CANVAS.height = H_CANVAS.height = Math.floor($ * J);
    M_CANVAS.style.width = H_CANVAS.style.width = Q + 'px';
    M_CANVAS.style.height = H_CANVAS.style.height = $ + 'px';
    
    H.scale(J, J);
    M.viewport(0, 0, M_CANVAS.width, M_CANVAS.height);
    f5 = l6();
    t = null;
}

function r6() {
    const workspace = document.getElementById("videoContainer");
    let J = (workspace && workspace.clientWidth) || window.innerWidth;
    let Q = (workspace && workspace.clientHeight) || window.innerHeight;
    
    // Scale tracking identical to the UI resize loop
    let isVertical = J < Q;
    if (isVertical) { Q = Math.max(Q, 900); }

    if (!y.videoWidth) return;
    
    let $ = y.videoWidth / y.videoHeight;
    let X = Q;
    let q = Math.round(X * $);
    let Z = Math.round((J - q) / 2);
    let { charW: Y, charH: D } = f5;
    let N = Math.ceil(q / Y);
    let V = Math.ceil(X / D);
    
    M.activeTexture(M.TEXTURE0);
    M.bindTexture(M.TEXTURE_2D, X5);
    M.texImage2D(M.TEXTURE_2D, 0, M.RGBA, M.RGBA, M.UNSIGNED_BYTE, y);
    M.uniform2f(k6, J, Q);
    M.uniform2f(S6, Y, D);
    M.uniform2f(I6, N, V);
    M.uniform2f(c6, Z, 0); 
    M.uniform1f(h6, G0.length);
    M.drawArrays(M.TRIANGLE_STRIP, 0, 4);
    
    t0++;
    const w6 = 3; 
    if (t0 % w6 === 0 || !t || forceRedraw) {
        let U = m6(q, X, Y, D);
        if (g6(U.rowLeft, U.rowRight) || forceRedraw) {
            M5(U, Z, J, Q);
            t = U.rowLeft.slice();
            D5 = U.rowRight.slice();
            forceRedraw = false;
        }
    }
}

function O5() {
    if (!U0) return;
    r6();
    y.requestVideoFrameCallback(O5);
}

window.addEventListener("resize", () => {
    N5();
    if (Y0) {
        const workspace = document.getElementById("videoContainer");
        if (!U0) K5(workspace.clientWidth, workspace.clientHeight);
    }
});

function K5(J, Q) {
    let isVertical = J < Q;
    if (isVertical) { Q = Math.max(Q, 900); }
    let $ = { rowLeft: new Int16Array(0), rowRight: new Int16Array(0), rows: 0, cols: 0, charW: 1, charH: 1 };
    M5($, 0, J, Q);
}

y.addEventListener("loadeddata", () => {
    N5();
    if (window.g0 && $5[0]) {
        Y0 = window.g0($5[0], window.curV0);
    }
    const workspace = document.getElementById("videoContainer");
    K5(workspace.clientWidth, workspace.clientHeight);
});

// ====== UI Wiring ======
// Setup Dynamic Style Binders
function updateTextStyles() {
    const color = document.getElementById('textColor').value;
    const size = document.getElementById('fontSize').value;
    const family = document.getElementById('fontFamily').value;
    const weight = document.getElementById('fontWeight').value;
    const isItalic = document.getElementById('toggleItalic')?.classList.contains('active');
    
    // Update live DOM overlay via global styles
    const textOverlay = document.getElementById('textOverlay');
    if (textOverlay) {
        textOverlay.style.color = color;
        textOverlay.style.fontFamily = family;
        textOverlay.style.fontSize = size + "px";
        textOverlay.style.fontWeight = weight;
        textOverlay.style.fontStyle = isItalic ? "italic" : "normal";
    }
    // Update display sync outputs on sidebar
    document.getElementById('valSize').textContent = size;
    document.getElementById('valLineHeight').textContent = document.getElementById('lineHeight').value;

    window.curV0 = `${isItalic ? "italic" : "normal"} ${weight} ${size}px ${family}`;
    window.curQ0 = parseInt(document.getElementById('lineHeight').value);
    
    if (window.g0 && $5[0]) Y0 = window.g0($5[0], window.curV0);
    
    forceRedraw = true;
    if (!U0) {
        const workspace = document.getElementById("videoContainer");
        K5(workspace.clientWidth, workspace.clientHeight);
    }
}

['fontFamily', 'textColor', 'fontSize', 'lineHeight', 'fontWeight'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateTextStyles);
});

btnUpload.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const url = URL.createObjectURL(file);
        y.src = url;
        y.play(); // trigger metadata
        setTimeout(() => { y.pause(); playing = false; btnPlayPause.textContent = "▶\u2002PLAY"; }, 100);
    }
});

let playing = false;
const iconPlay = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
const iconPause = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

btnPlayPause.addEventListener('click', () => {
    if (!U0) {
        U0 = true;
        y.play().catch(e => console.error("Playback restriction", e));
        y.requestVideoFrameCallback(O5);
        btnPlayPause.innerHTML = iconPause;
        playing = true;
    } else {
        if (playing) {
            y.pause();
            playing = false;
            U0 = false; // Freeze rendering
            btnPlayPause.innerHTML = iconPlay;
        } else {
            y.play();
            playing = true;
            U0 = true;
            y.requestVideoFrameCallback(O5);
            btnPlayPause.innerHTML = iconPause;
        }
    }
});

// Advanced Player Time Tracking & Scrubbing
const seekSlider = document.getElementById('seekSlider');
const timeDisplay = document.getElementById('timeDisplay');

function formatTime(s) {
    if (isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
}

y.addEventListener('timeupdate', () => {
    if (y.duration && document.activeElement !== seekSlider) {
        const val = (y.currentTime / y.duration) * 100;
        seekSlider.value = val;
        seekSlider.style.setProperty('--seek-val', val + '%');
        timeDisplay.textContent = formatTime(y.currentTime) + " / " + formatTime(y.duration);
    }
});

seekSlider.addEventListener('input', (e) => {
    if (y.duration) {
        y.currentTime = (e.target.value / 100) * y.duration;
        seekSlider.style.setProperty('--seek-val', e.target.value + '%');
        timeDisplay.textContent = formatTime(y.currentTime) + " / " + formatTime(y.duration);
        // Force off-screen redraw if forcefully scrubbing while paused
        if (!playing) y.requestVideoFrameCallback(() => { forceRedraw = true; r6(); });
    }
});

textEditor.addEventListener('input', (e) => {
    $5[0] = e.target.value;
    if (window.g0) Y0 = window.g0($5[0], window.curV0);
    const workspace = document.getElementById("videoContainer");
    if (!U0) {
        K5(workspace.clientWidth, workspace.clientHeight);
    } else {
        forceRedraw = true;
    }
});

const exportModal = document.getElementById('exportModal');
const btnCancelExport = document.getElementById('btnCancelExport');
const btnStartExport = document.getElementById('btnStartExport');
const exportProgressUi = document.getElementById('exportProgressUi');
const exportProgressBar = document.getElementById('exportProgressBar');
const exportStatusText = document.getElementById('exportStatusText');

let exporting = false;
let mediaRecorder = null;
let recordedChunks = [];

btnExport.addEventListener('click', () => {
    if (exporting) return;
    if (playing) btnPlayPause.click(); // Pause core visual engine
    
    exportProgressUi.style.display = 'none';
    btnStartExport.disabled = false;
    btnCancelExport.disabled = false;
    exportProgressBar.style.width = '0%';
    
    exportModal.showModal();
});

btnCancelExport.addEventListener('click', () => {
    if (exporting) return;
    exportModal.close();
});

btnStartExport.addEventListener('click', async () => {
    if (exporting) return;
    exporting = true;
    recordedChunks = [];
    
    btnStartExport.disabled = true;
    btnCancelExport.disabled = true;
    exportProgressUi.style.display = 'block';
    
    const targetHeight = parseInt(document.getElementById('exportRes').value);
    const aspect = y.videoWidth / y.videoHeight;
    const targetWidth = Math.round(targetHeight * aspect);
    const includeAudio = document.getElementById('exportAudio').checked;
    
    const exportVid = document.createElement("video");
    exportVid.crossOrigin = "anonymous";
    exportVid.src = y.src;
    exportVid.muted = !includeAudio;
    exportVid.playsInline = true;
    
    await new Promise(r => { exportVid.onloadeddata = r; if(exportVid.readyState >= 2) r(); });
    
    const originalWidth = M_CANVAS.width;
    const originalHeight = M_CANVAS.height;
    M_CANVAS.width = targetWidth; 
    M_CANVAS.height = targetHeight;
    M.viewport(0, 0, targetWidth, targetHeight);
    
    const compCanvas = document.createElement("canvas");
    compCanvas.width = targetWidth;
    compCanvas.height = targetHeight;
    const cctx = compCanvas.getContext("2d", { willReadFrequently: true });
    
    let stream;
    if (includeAudio) {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const dest = audioCtx.createMediaStreamDestination();
        const srcNode = audioCtx.createMediaElementSource(exportVid);
        srcNode.connect(dest);
        srcNode.connect(audioCtx.destination);
        exportVid.volume = 1;
        
        const vidStream = compCanvas.captureStream();
        const tracks = [...vidStream.getVideoTracks(), ...dest.stream.getAudioTracks()];
        stream = new MediaStream(tracks);
    } else {
        stream = compCanvas.captureStream();
    }
    
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = () => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(recordedChunks, { type: 'video/webm' }));
        a.download = `true-pretext-${targetHeight}p-${Date.now()}.webm`;
        a.click();
        
        exporting = false;
        exportModal.close();
        
        N5();
        const workspace = document.getElementById("videoContainer");
        K5(workspace.clientWidth, workspace.clientHeight);
    };
    
    let fontScale = targetHeight / originalHeight; 
    let baseLineHeight = window.curQ0 || 24;
    let expLineHeight = baseLineHeight * fontScale;
    let expFont = window.curV0.replace(/(\d+)px/, (m, p1) => `${parseFloat(p1)*fontScale}px`);
    let expFontColor = document.getElementById('textColor') ? document.getElementById('textColor').value : "#d4d0c8";

    let Y0_Export = window.g0 ? window.g0($5[0], expFont) : null;
    let D_Exp = { segmentIndex: 0, graphemeIndex: 0 };
    let { charW: Y_c, charH: D_c } = f5;
    
    function burnFrame() {
        if (!exporting) return;
        
        cctx.clearRect(0, 0, targetWidth, targetHeight);
        
        let V_sc = Math.ceil(targetHeight / D_c);
        let N_sc = Math.ceil(targetWidth / Y_c);
        
        M.activeTexture(M.TEXTURE0);
        M.bindTexture(M.TEXTURE_2D, X5);
        M.texImage2D(M.TEXTURE_2D, 0, M.RGBA, M.RGBA, M.UNSIGNED_BYTE, exportVid);
        M.uniform2f(k6, targetWidth, targetHeight);
        M.uniform2f(S6, Y_c, D_c);
        M.uniform2f(I6, N_sc, V_sc);
        M.uniform2f(c6, 0, 0); 
        M.uniform1f(h6, G0.length);
        M.drawArrays(M.TRIANGLE_STRIP, 0, 4);
        
        cctx.drawImage(M_CANVAS, 0, 0);
        
        let U = m6(targetWidth, targetHeight, Y_c, D_c, exportVid); 
        
        cctx.textBaseline = "top";
        cctx.font = expFont;
        cctx.fillStyle = expFontColor;
        cctx.shadowColor = "rgba(0,0,0,0.8)";
        cctx.shadowBlur = 4;
        
        let N_t = expLineHeight;
        while (N_t + expLineHeight <= targetHeight) {
            let A = Math.max(0, N_t / U.charH | 0);
            let T = Math.min(U.rows - 1, Math.ceil((N_t + expLineHeight) / U.charH));
            let k = 32767, p = -1;
            
            for (let C = A; C <= T; C++) {
                let z = U.rowLeft[C], b = U.rowRight[C];
                if (z !== -1) { if (z < k) k = z; if (b > p) p = b; }
            }
            
            let E = 0, B = 0, w = 0, F = 0, _ = 0, R = 24 * fontScale;
            if (p === -1) {
                B = R; w = targetWidth - R; E = 1;
            } else {
                let lb = k * U.charW - (6 * fontScale);
                let rb = p * U.charW + (6 * fontScale);
                if (lb > R + (30*fontScale)) { B = R; w = lb; E = 1; }
                if (rb < targetWidth - R - (30*fontScale)) {
                    if (E === 0) { B = rb; w = targetWidth - R; E = 1; }
                    else { F = rb; _ = targetWidth - R; E = 2; }
                }
            }
            
            for (let C = 0; C < E; C++) {
                let z = (C === 0) ? B : F;
                let b = (C === 0) ? w : _;
                let h = b - z;
                if (h < (40*fontScale)) continue;
                let S = window.b0(Y0_Export, D_Exp, h);
                if (!S) {
                    if (D_Exp = { segmentIndex: 0, graphemeIndex: 0 }, S = window.b0(Y0_Export, D_Exp, h), !S) break;
                }
                cctx.fillText(S.text, z, N_t);
                D_Exp = S.end;
            }
            N_t += expLineHeight;
        }
        
        let pct = (exportVid.currentTime / exportVid.duration) * 100;
        exportProgressBar.style.width = `${pct}%`;
        exportStatusText.textContent = `${Math.floor(pct)}% Compiled`;
        
        exportVid.requestVideoFrameCallback(burnFrame);
    }
    
    mediaRecorder.start();
    exportVid.onended = () => { mediaRecorder.stop(); };
    exportVid.play();
    exportVid.requestVideoFrameCallback(burnFrame);
});

// Start layout
y.src = "wesker.mov";

// We're live.
setTimeout(() => {
    updateTextStyles(); // Bind CSS variables safely into curV0!
    if (window.g0) {
        textEditor.value = $5[0];
        Y0 = window.g0($5[0], window.curV0);
        
        // Hide absolute loader once system is mathematically locked and ready
        if (statusLabel) statusLabel.style.display = 'none';
        
    } else {
        alert("Text engine dependency failed to load!");
    }
}, 500);
