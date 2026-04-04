const fs = require('fs');
let code = fs.readFileSync('text-engine.js', 'utf8');

// Polyfill Canvas for Node.js using 'canvas' package if available, or mock it!
// `text-engine.js` inherently requires Canvas `measureText`.
try {
    const { createCanvas } = require('canvas');
    global.OffscreenCanvas = class OffscreenCanvas {
        constructor(w, h) {
            this.canvas = createCanvas(w, h);
        }
        getContext(type) {
            return this.canvas.getContext(type);
        }
    };
    global.document = {
        createElement: (tag) => {
            if (tag === 'canvas') return createCanvas(100, 100);
            return {};
        }
    };
} catch(e) {
    console.log("Canvas module not found, mocking measureText.");
    global.OffscreenCanvas = class OffscreenCanvas {
        constructor(w, h) {}
        getContext(type) {
            return { measureText: (str) => ({ width: str.length * 10 }) };
        }
    };
    global.document = {
        createElement: (tag) => {
            if (tag === 'canvas') return { getContext: () => ({ measureText: (str) => ({ width: str.length * 10 }) }) };
            return {};
        }
    };
}

const window = {};
global.window = window;

eval(code);

let V0 = '17px "Georgia", "Palatino Linotype", "Book Antiqua", Palatino, serif';
let $5 = ["Rick Astley, born Richard Paul Astley on February 6, 1966, in Newton-le-Willows, Lancashire, England, is a singer, songwriter, and radio personality who became one of the most iconic figures in pop music history..."];

let Y0 = window.g0($5[0], V0);
console.log("Y0 success:", !!Y0);
console.log("Chunks len:", Y0.chunks.length);

let D = { segmentIndex: 0, graphemeIndex: 0 };
let S = window.b0(Y0, D, 400); // 400px width available
console.log("First line:", S);
