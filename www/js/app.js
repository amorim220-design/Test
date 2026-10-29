'use strict';

const PARAMS = new URLSearchParams(location.search);
const IS_DISPLAY = PARAMS.get('display') === '1';
const LINK_KEY = PARAMS.get('key') || '';

const VISUALS = [
  ['solid', 'Cor sólida'],
  ['gradient', 'Degradê'],
  ['plasma', 'Plasma'],
  ['tunnel', 'Túnel'],
  ['grid', 'Grade neon'],
  ['waves', 'Ondas'],
  ['kaleido', 'Caleidoscópio'],
  ['stars', 'Estrelas'],
  ['rings', 'Anéis'],
  ['sweep', 'Feixe'],
  ['media', 'Vídeo / Foto'],
  ['checker', 'Calibração'],
  ['dots', 'Pontos'],
  ['rainbow', 'Arco-íris']
];

const EFFECTS = { none: 0, kaleido: 1, pixelate: 2, posterize: 3, scanlines: 4, slide: 5, tile: 6, rotate: 7, zoom: 8 };
const VISUAL_INDEX = Object.fromEntries(VISUALS.map(([id], i) => [id, i]));

const stage = document.getElementById('stage');
const overlay = document.getElementById('overlay');
const octx = overlay.getContext('2d');
const gl = stage.getContext('webgl', { alpha: false, antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: false });

if (!gl) {
  document.body.innerHTML = '<p style="color:#fff;font-family:sans-serif;padding:24px">WebGL não está disponível neste navegador.</p>';
  throw new Error('no webgl');
}

const VERT = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform mat3 uHinv;
uniform float uTime;
uniform float uVisual;
uniform float uHue;
uniform float uSat;
uniform float uBright;
uniform float uScale;
uniform float uOpacity;
uniform float uEffect;
uniform float uEffectAmt;
uniform float uInvert;
uniform float uKind;
uniform float uRound;
uniform float uOutRot;
uniform vec3 uColor;
uniform sampler2D uTex;
uniform float uHasTex;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 pal(float t) {
  return 0.5 + 0.5 * cos(6.28318530718 * (vec3(0.0, 0.33, 0.67) + t));
}

vec3 rgb2yiq(vec3 c) {
  return vec3(dot(c, vec3(0.299, 0.587, 0.114)),
              dot(c, vec3(0.596, -0.274, -0.322)),
              dot(c, vec3(0.211, -0.523, 0.312)));
}

vec3 yiq2rgb(vec3 c) {
  return vec3(dot(c, vec3(1.0, 0.956, 0.621)),
              dot(c, vec3(1.0, -0.272, -0.647)),
              dot(c, vec3(1.0, -1.106, 1.703)));
}

vec3 hueShift(vec3 col, float h) {
  vec3 yiq = rgb2yiq(col);
  float a = h * 6.28318530718;
  float cs = cos(a);
  float sn = sin(a);
  yiq = vec3(yiq.x, yiq.y * cs - yiq.z * sn, yiq.y * sn + yiq.z * cs);
  return clamp(yiq2rgb(yiq), 0.0, 1.0);
}

void main() {
  vec3 hp = uHinv * vec3(gl_FragCoord.xy, 1.0);
  vec2 uv = hp.xy / hp.z;
  vec2 uv0 = uv;
  uv = (uv - 0.5) / max(uScale, 0.001) + 0.5;

  float shapeMask = 1.0;
  if (uKind > 0.5) {
    float d = length(uv0 - 0.5);
    shapeMask = 1.0 - smoothstep(0.47, 0.5, d);
  } else if (uRound > 0.001) {
    vec2 p = abs(uv0 - 0.5) - (0.5 - uRound);
    float d = length(max(p, 0.0)) + min(max(p.x, p.y), 0.0) - uRound;
    float aa = 1.5 / max(uRes.y, 1.0) + 0.002;
    shapeMask = 1.0 - smoothstep(-aa, aa, d);
  }

  if (abs(uOutRot) > 0.5) {
    float ra = radians(uOutRot);
    vec2 rq = uv - 0.5;
    uv = 0.5 + vec2(cos(ra) * rq.x - sin(ra) * rq.y, sin(ra) * rq.x + cos(ra) * rq.y);
  }

  if (uEffect > 0.5 && uEffect < 1.5) {
    vec2 q = uv - 0.5;
    float r = length(q);
    float a = atan(q.y, q.x);
    float seg = 3.14159265 / max(2.0, floor(mix(2.0, 12.0, uEffectAmt)));
    a = abs(mod(a + seg, seg * 2.0) - seg);
    uv = 0.5 + vec2(cos(a), sin(a)) * r;
  } else if (uEffect > 1.5 && uEffect < 2.5) {
    float res = mix(240.0, 6.0, uEffectAmt);
    uv = floor(uv * res) / res + 0.5 / res;
  } else if (uEffect > 4.5 && uEffect < 5.5) {
    uv.x = fract(uv.x + uEffectAmt);
  } else if (uEffect > 5.5 && uEffect < 6.5) {
    uv = fract(uv * mix(1.0, 4.0, uEffectAmt));
  } else if (uEffect > 6.5 && uEffect < 7.5) {
    float ra = uEffectAmt * 6.28318530718;
    vec2 rq = uv - 0.5;
    uv = 0.5 + vec2(cos(ra) * rq.x - sin(ra) * rq.y, sin(ra) * rq.x + cos(ra) * rq.y);
  } else if (uEffect > 7.5) {
    uv = fract((uv - 0.5) / mix(1.0, 3.0, uEffectAmt) + 0.5);
  }

  int v = int(uVisual + 0.5);
  float t = uTime;
  vec3 col = vec3(0.0);

  if (v == 0) {
    col = uColor;
  } else if (v == 1) {
    float w = 0.5 + 0.5 * sin(t * 0.4 + uv.y * 3.0 + uv.x * 1.5);
    col = mix(uColor * 0.22, pal(uHue + uv.x * 0.15 + t * 0.03), w);
  } else if (v == 2) {
    float n = sin(uv.x * 7.0 + t) + sin(uv.y * 9.0 - t * 1.3)
            + sin((uv.x + uv.y) * 6.0 + t * 0.7)
            + sin(length(uv - 0.5) * 14.0 - t * 1.7);
    col = pal(uHue + n * 0.12 + t * 0.02);
  } else if (v == 3) {
    vec2 q = uv - 0.5;
    float r = max(length(q), 0.001);
    float a = atan(q.y, q.x);
    float z = 0.22 / r + t * 0.6 + a * 1.1;
    col = pal(uHue + z * 0.08 + 0.1 * sin(a * 3.0 + t));
    col *= 0.25 + 0.75 * smoothstep(0.0, 0.55, r * 2.4);
  } else if (v == 4) {
    vec2 gv = uv * vec2(16.0, 9.0);
    vec2 g = abs(fract(gv) - 0.5);
    float m = max(g.x, g.y);
    float line = smoothstep(0.455, 0.5, m);
    float glow = exp(-(0.5 - m) * 14.0);
    col = uColor * (line * 1.1 + glow * 0.25) + pal(uHue + t * 0.05 + uv.x * 0.2) * 0.07;
  } else if (v == 5) {
    float band = 0.5 + 0.5 * sin(uv.y * 24.0 + sin(uv.x * 6.0 + t) * 2.0 + t * 2.0);
    col = mix(uColor * 0.12, pal(uHue + uv.y * 0.2 + t * 0.05), smoothstep(0.0, 0.35, band));
  } else if (v == 6) {
    vec2 q = uv - 0.5;
    float r = length(q);
    float a = atan(q.y, q.x);
    float seg = 6.28318530718 / 8.0;
    a = abs(mod(a, seg) - seg * 0.5);
    col = pal(uHue + r * 2.2 - t * 0.08 + 0.25 * sin(a * 5.0 + r * 8.0));
    col *= 0.35 + 0.65 * smoothstep(0.0, 0.15, r);
  } else if (v == 7) {
    vec2 gv = uv * vec2(60.0, 34.0);
    vec2 id = floor(gv);
    vec2 f = fract(gv) - 0.5;
    float h = hash21(id);
    vec2 off = vec2(hash21(id + 1.0), hash21(id + 2.0)) - 0.5;
    float s = smoothstep(0.14, 0.0, length(f - off * 0.6));
    float tw = 0.45 + 0.55 * sin(t * 3.0 + h * 22.0);
    col = uColor * s * tw + pal(uHue + h) * 0.04;
  } else if (v == 8) {
    float r = length(uv - 0.5);
    float w = 0.5 + 0.5 * sin(r * 45.0 - t * 3.0);
    col = mix(uColor * 0.08, pal(uHue + r * 0.6 + t * 0.03), smoothstep(0.25, 0.6, w));
  } else if (v == 9) {
    vec2 q = uv - 0.5;
    float a = atan(q.y, q.x);
    float beam = pow(0.5 + 0.5 * cos(a - t * 0.8), 8.0);
    col = uColor * beam + pal(uHue + a * 0.2) * 0.06;
  } else if (v == 10) {
    vec2 muv = vec2(uv.x, 1.0 - uv.y);
    if (uHasTex > 0.5) {
      col = texture2D(uTex, clamp(muv, 0.0, 1.0)).rgb;
    } else {
      vec2 c = floor(clamp(muv, 0.0, 1.0) * vec2(10.0, 10.0));
      col = mix(vec3(0.06), vec3(0.14), mod(c.x + c.y, 2.0));
    }
  } else if (v == 11) {
    vec2 c = floor(uv * vec2(12.0, 12.0));
    col = mix(vec3(0.02), vec3(0.32), mod(c.x + c.y, 2.0));
    float cross = smoothstep(0.004, 0.0, abs(uv.x - 0.5)) + smoothstep(0.004, 0.0, abs(uv.y - 0.5));
    col += vec3(0.62, 0.22, 0.95) * clamp(cross, 0.0, 1.0);
  } else if (v == 12) {
    vec2 gv = uv * vec2(14.0, 14.0);
    vec2 f = fract(gv) - 0.5;
    float d = length(f);
    float pulse = 0.5 + 0.5 * sin(t * 2.0 + floor(gv.x) + floor(gv.y));
    float s = smoothstep(0.36, 0.18, d) * (0.35 + 0.65 * pulse);
    col = mix(vec3(0.02), pal(uHue + uv.x * 0.3 + t * 0.05), s);
  } else {
    col = pal(uHue + uv.x * 0.5 + uv.y * 0.5 + t * 0.05);
  }

  if (uEffect > 2.5 && uEffect < 3.5) {
    float levels = mix(32.0, 3.0, uEffectAmt);
    col = floor(col * levels) / levels;
  } else if (uEffect > 3.5 && uEffect < 4.5) {
    float s = 0.5 + 0.5 * sin(gl_FragCoord.y * 1.5);
    col *= mix(1.0, s, uEffectAmt);
  }

  col = hueShift(col, uHue);
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, uSat);
  col *= uBright;

  float a = uOpacity;
  if (uInvert > 0.5) {
    col = vec3(0.0);
    a = uOpacity * (1.0 - shapeMask);
  } else {
    a *= shapeMask;
  }

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), a);
}
`;

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(s) || 'shader error');
  }
  return s;
}

const program = gl.createProgram();
gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
gl.linkProgram(program);
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
  throw new Error(gl.getProgramInfoLog(program) || 'link error');
}
gl.useProgram(program);

const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(12), gl.DYNAMIC_DRAW);
const aPos = gl.getAttribLocation(program, 'aPos');
gl.enableVertexAttribArray(aPos);
gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

const U = {};
['uRes', 'uHinv', 'uTime', 'uVisual', 'uHue', 'uSat', 'uBright', 'uScale', 'uOpacity',
 'uEffect', 'uEffectAmt', 'uInvert', 'uKind', 'uRound', 'uOutRot', 'uColor', 'uTex', 'uHasTex']
  .forEach(n => { U[n] = gl.getUniformLocation(program, n); });

gl.uniform1i(U.uTex, 0);

const TRI = [0, 1, 2, 0, 2, 3];

const state = {
  shapes: [],
  selected: null,
  playing: false,
  time: 0,
  media: new Map(),
  drag: null
};

let uid = 1;
function nextId() { return 's' + (uid++); }

function defaultCorners(cx, cy, w, h) {
  return [
    [cx - w / 2, cy - h / 2],
    [cx + w / 2, cy - h / 2],
    [cx + w / 2, cy + h / 2],
    [cx - w / 2, cy + h / 2]
  ];
}

function makeShape(kind, patch) {
  return Object.assign({
    id: nextId(),
    name: kind === 'ellipse' ? 'Elipse' : 'Retângulo',
    kind,
    corners: kind === 'ellipse' ? defaultCorners(0.5, 0.5, 0.45, 0.45) : defaultCorners(0.5, 0.5, 0.6, 0.6),
    visual: kind === 'ellipse' ? 'rings' : 'plasma',
    mediaName: null,
    color: '#8b5cf6',
    scale: 1,
    opacity: 1,
    hue: 0,
    sat: 1,
    bright: 1,
    speed: 1,
    effect: 'none',
    effectAmt: 0.5,
    round: 0,
    outRot: 0,
    blend: 'normal',
    invert: false,
    visible: true
  }, patch || {});
}

function selectedShape() {
  return state.shapes.find(s => s.id === state.selected) || null;
}

function homography(quad) {
  const dst = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const x = quad[i][0];
    const y = quad[i][1];
    const u = dst[i][0];
    const v = dst[i][1];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solve(A, b);
  if (!h) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function solve(A, b) {
  const n = b.length;
  const m = A.map((row, i) => row.concat([b[i]]));
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) {
      if (Math.abs(m[r][c]) > Math.abs(m[piv][c])) piv = r;
    }
    if (Math.abs(m[piv][c]) < 1e-12) return null;
    [m[c], m[piv]] = [m[piv], m[c]];
    const d = m[c][c];
    for (let k = c; k <= n; k++) m[c][k] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c];
      if (!f) continue;
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  return m.map(row => row[n]);
}

function toColumnMajor(h) {
  return new Float32Array([h[0], h[3], h[6], h[1], h[4], h[7], h[2], h[5], h[8]]);
}

function getMedia(name) {
  if (!name) return null;
  const m = state.media.get(name);
  if (!m || !m.ready) return null;
  return m;
}

function ensureTexture(m) {
  if (m.tex) return m.tex;
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  m.tex = tex;
  return tex;
}

function uploadMedia(m) {
  const tex = ensureTexture(m);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  try {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, m.el);
  } catch (e) {
    return false;
  }
  return true;
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(window.innerWidth * dpr);
  const h = Math.round(window.innerHeight * dpr);
  if (stage.width !== w || stage.height !== h) {
    stage.width = w;
    stage.height = h;
    overlay.width = w;
    overlay.height = h;
  }
  overlay.style.width = window.innerWidth + 'px';
  overlay.style.height = window.innerHeight + 'px';
}

function draw(time) {
  resize();
  gl.viewport(0, 0, stage.width, stage.height);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(program);
  gl.enable(gl.BLEND);

  for (const s of state.shapes) {
    if (!s.visible) continue;
    const media = s.visual === 'media' ? getMedia(s.mediaName) : null;
    let hasTex = 0;
    if (media) {
      const tex = ensureTexture(media);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (media.kind === 'video' || media.dirty) {
        if (uploadMedia(media)) media.dirty = false;
      }
      hasTex = 1;
    }

    if (s.blend === 'add') gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const W = stage.width;
    const H = stage.height;
    const px = s.corners.map(c => [c[0] * W, (1 - c[1]) * H]);
    const h = homography(px);

    const verts = new Float32Array(12);
    for (let i = 0; i < 6; i++) {
      const c = s.corners[TRI[i]];
      verts[i * 2] = c[0] * 2 - 1;
      verts[i * 2 + 1] = 1 - c[1] * 2;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts);

    const rgb = hexToRgb(s.color);
    gl.uniform2f(U.uRes, W, H);
    gl.uniformMatrix3fv(U.uHinv, false, toColumnMajor(h));
    gl.uniform1f(U.uTime, time * s.speed);
    gl.uniform1f(U.uVisual, VISUAL_INDEX[s.visual] ?? 2);
    gl.uniform1f(U.uHue, s.hue);
    gl.uniform1f(U.uSat, s.sat);
    gl.uniform1f(U.uBright, s.bright);
    gl.uniform1f(U.uScale, s.scale);
    gl.uniform1f(U.uOpacity, s.opacity);
    gl.uniform1f(U.uEffect, EFFECTS[s.effect] ?? 0);
    gl.uniform1f(U.uEffectAmt, s.effectAmt);
    gl.uniform1f(U.uInvert, s.invert ? 1 : 0);
    gl.uniform1f(U.uKind, s.kind === 'ellipse' ? 1 : 0);
    gl.uniform1f(U.uRound, s.round || 0);
    gl.uniform1f(U.uOutRot, s.outRot || 0);
    gl.uniform3f(U.uColor, rgb[0], rgb[1], rgb[2]);
    gl.uniform1f(U.uHasTex, hasTex);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  gl.disable(gl.BLEND);
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '#ffffff');
  if (!m) return [1, 1, 1];
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}

let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  state.time += dt;
  draw(state.time);
  drawOverlay();
  requestAnimationFrame(loop);
}

function cssSize() {
  return { w: window.innerWidth, h: window.innerHeight };
}

function drawOverlay() {
  const { w, h } = cssSize();
  const dpr = overlay.width / Math.max(w, 1);
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  octx.clearRect(0, 0, w, h);
  if (state.playing) return;

  for (const s of state.shapes) {
    const isSel = s.id === state.selected;
    const pts = s.corners.map(c => [c[0] * w, c[1] * h]);
    octx.beginPath();
    octx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < 4; i++) octx.lineTo(pts[i][0], pts[i][1]);
    octx.closePath();
    octx.lineWidth = isSel ? 2 : 1;
    octx.strokeStyle = isSel ? '#a855f7' : 'rgba(255,255,255,.28)';
    octx.stroke();

    if (isSel) {
      for (let i = 0; i < 4; i++) {
        octx.beginPath();
        octx.arc(pts[i][0], pts[i][1], 9, 0, Math.PI * 2);
        octx.fillStyle = 'rgba(168,85,247,.9)';
        octx.fill();
        octx.lineWidth = 2;
        octx.strokeStyle = '#fff';
        octx.stroke();
      }
    }
  }
}

function pointInQuad(p, quad) {
  let inside = false;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const xi = quad[i][0], yi = quad[i][1];
    const xj = quad[j][0], yj = quad[j][1];
    const hit = ((yi > p[1]) !== (yj > p[1])) &&
      (p[0] < (xj - xi) * (p[1] - yi) / ((yj - yi) || 1e-9) + xi);
    if (hit) inside = !inside;
  }
  return inside;
}

function onPointerDown(e) {
  if (IS_DISPLAY) return;
  if (state.playing) { exitPlay(); return; }
  if (e.target !== stage) return;
  const { w, h } = cssSize();
  const p = [e.clientX, e.clientY];
  const sel = selectedShape();

  if (sel) {
    const pts = sel.corners.map(c => [c[0] * w, c[1] * h]);
    for (let i = 0; i < 4; i++) {
      if (Math.hypot(pts[i][0] - p[0], pts[i][1] - p[1]) < 26) {
        state.drag = { mode: 'corner', index: i, id: sel.id };
        return;
      }
    }
  }

  for (let i = state.shapes.length - 1; i >= 0; i--) {
    const s = state.shapes[i];
    const pts = s.corners.map(c => [c[0] * w, c[1] * h]);
    if (pointInQuad(p, pts)) {
      state.selected = s.id;
      state.drag = { mode: 'move', id: s.id, start: p, orig: s.corners.map(c => c.slice()) };
      syncControls();
      renderShapeList();
      return;
    }
  }
  state.drag = null;
}

function onPointerMove(e) {
  if (!state.drag) return;
  const s = state.shapes.find(x => x.id === state.drag.id);
  if (!s) { state.drag = null; return; }
  const { w, h } = cssSize();
  const c = [e.clientX / w, e.clientY / h];

  if (state.drag.mode === 'corner') {
    s.corners[state.drag.index] = [c[0], c[1]];
  } else {
    const dx = (e.clientX - state.drag.start[0]) / w;
    const dy = (e.clientY - state.drag.start[1]) / h;
    s.corners = state.drag.orig.map(o => [o[0] + dx, o[1] + dy]);
  }
  hideHint();
}

function onPointerUp() {
  if (state.drag) { persistSoon(); }
  state.drag = null;
}

function addShape(kind, data) {
  const s = data ? Object.assign(makeShape(kind), data, { id: nextId() }) : makeShape(kind);
  state.shapes.push(s);
  state.selected = s.id;
  syncControls();
  renderShapeList();
  persistSoon();
  return s;
}

function renderShapeList() {
  const el = document.getElementById('shapeList');
  el.innerHTML = '';
  if (!state.shapes.length) {
    el.innerHTML = '<p class="muted small">Nenhuma forma. Adicione um retângulo ou elipse.</p>';
    return;
  }
  for (const s of state.shapes) {
    const d = document.createElement('div');
    d.className = 'list-item' + (s.id === state.selected ? ' active' : '');
    const sw = document.createElement('span');
    sw.className = 'dot';
    sw.style.background = s.color;
    sw.style.opacity = s.visible ? 1 : 0.25;
    const nm = document.createElement('span');
    nm.className = 'name';
    nm.textContent = s.name;
    const kd = document.createElement('span');
    kd.className = 'kind';
    kd.textContent = s.visual;
    d.append(sw, nm, kd);
    d.addEventListener('click', () => {
      state.selected = s.id;
      renderShapeList();
      syncControls();
    });
    el.appendChild(d);
  }
}

function setValue(id, v) { document.getElementById(id).value = v; }

function syncControls() {
  const s = selectedShape();
  const disabled = !s;
  document.querySelectorAll('#panel button, #panel select, #panel input').forEach(el => {
    if (el.id === 'btnAddQuad' || el.id === 'btnAddEllipse') return;
    el.disabled = disabled;
  });
  if (!s) return;

  setValue('visualSelect', s.visual);
  setValue('scaleRange', s.scale);
  setValue('colorPicker', s.color);
  setValue('opacityRange', s.opacity);
  setValue('hueRange', s.hue);
  setValue('speedRange', s.speed);
  setValue('effectSelect', s.effect);
  setValue('effectRange', s.effectAmt);
  setValue('roundRange', s.round || 0);
  setValue('outRotSelect', String(s.outRot || 0));
  setValue('blendSelect', s.blend);
  document.getElementById('invertChk').checked = !!s.invert;
  document.getElementById('mediaBox').classList.toggle('hidden', s.visual !== 'media');
  const mn = document.getElementById('mediaName');
  const loaded = s.mediaName && state.media.get(s.mediaName);
  mn.textContent = !s.mediaName
    ? 'Nenhum arquivo importado'
    : (loaded ? ('Arquivo: ' + s.mediaName) : ('Arquivo: ' + s.mediaName + ' (reimporte)'));
  mn.classList.toggle('warn', !!s.mediaName && !loaded);
}

function bindControl(id, ev, fn) {
  document.getElementById(id).addEventListener(ev, e => {
    const s = selectedShape();
    if (!s) return;
    fn(s, e.target);
    persistSoon();
  });
}

bindControl('visualSelect', 'change', (s, t) => {
  s.visual = t.value;
  document.getElementById('mediaBox').classList.toggle('hidden', s.visual !== 'media');
  renderShapeList();
});
bindControl('scaleRange', 'input', (s, t) => { s.scale = parseFloat(t.value); });
bindControl('colorPicker', 'input', (s, t) => { s.color = t.value; renderShapeList(); });
bindControl('opacityRange', 'input', (s, t) => { s.opacity = parseFloat(t.value); });
bindControl('hueRange', 'input', (s, t) => { s.hue = parseFloat(t.value); });
bindControl('speedRange', 'input', (s, t) => { s.speed = parseFloat(t.value); });
bindControl('effectSelect', 'change', (s, t) => { s.effect = t.value; });
bindControl('effectRange', 'input', (s, t) => { s.effectAmt = parseFloat(t.value); });
bindControl('roundRange', 'input', (s, t) => { s.round = parseFloat(t.value); });
bindControl('outRotSelect', 'change', (s, t) => { s.outRot = parseFloat(t.value) || 0; });
bindControl('blendSelect', 'change', (s, t) => { s.blend = t.value; });
document.getElementById('invertChk').addEventListener('change', e => {
  const s = selectedShape();
  if (!s) return;
  s.invert = e.target.checked;
  persistSoon();
});

document.getElementById('btnCloseHint').addEventListener('click', hidePlayHint);
document.getElementById('btnCopyLink').addEventListener('click', async () => {
  const url = displayUrl();
  if (!url) {
    toast('Link indisponível: rode node server.js no celular');
    return;
  }
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(url);
    } else {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast('Endereço da tela do projetor copiado');
  } catch (e) {
    toast('Copie manualmente: ' + url);
  }
});

const visualSelect = document.getElementById('visualSelect');
for (const [id, label] of VISUALS) {
  const o = document.createElement('option');
  o.value = id;
  o.textContent = label;
  visualSelect.appendChild(o);
}

document.getElementById('btnAddQuad').addEventListener('click', () => addShape('quad'));
document.getElementById('btnAddEllipse').addEventListener('click', () => addShape('ellipse'));

document.getElementById('btnDup').addEventListener('click', () => {
  const s = selectedShape();
  if (!s) return;
  const copy = JSON.parse(JSON.stringify(s));
  copy.corners = copy.corners.map(c => [c[0] + 0.03, c[1] + 0.03]);
  addShape(copy.kind, copy);
});

document.getElementById('btnDel').addEventListener('click', () => {
  const s = selectedShape();
  if (!s) return;
  state.shapes = state.shapes.filter(x => x.id !== s.id);
  state.selected = state.shapes.length ? state.shapes[state.shapes.length - 1].id : null;
  renderShapeList();
  syncControls();
  persistSoon();
});

document.getElementById('btnCenter').addEventListener('click', () => {
  const s = selectedShape();
  if (!s) return;
  s.corners = defaultCorners(0.5, 0.5, 0.6, 0.6);
  persistSoon();
});

document.getElementById('fileMedia').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const s = selectedShape();
  if (!s) return;
  const name = f.name;
  const url = URL.createObjectURL(f);
  if (f.type.startsWith('video')) {
    const v = document.createElement('video');
    v.src = url;
    v.loop = true;
    v.muted = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    const rec = { kind: 'video', el: v, ready: false, tex: null, name, dirty: false };
    v.addEventListener('loadeddata', () => { rec.ready = true; });
    v.addEventListener('error', () => { alert('Não foi possível abrir o vídeo.'); });
    v.play().catch(() => {});
    state.media.set(name, rec);
  } else if (f.type.startsWith('image')) {
    const img = new Image();
    img.src = url;
    const rec = { kind: 'image', el: img, ready: false, tex: null, name, dirty: true };
    img.onload = () => { rec.ready = true; rec.dirty = true; };
    img.onerror = () => alert('Não foi possível abrir a imagem.');
    state.media.set(name, rec);
  } else {
    alert('Formato não suportado.');
    return;
  }
  s.visual = 'media';
  s.mediaName = name;
  renderShapeList();
  syncControls();
  persistSoon();
});

document.getElementById('btnImportMedia').addEventListener('click', () => {
  document.getElementById('fileMedia').click();
});

function serialize() {
  return {
    app: 'prism-mapper',
    version: 1,
    shapes: state.shapes.map(s => Object.assign({}, s))
  };
}

function persistSoon() {
  clearTimeout(persistSoon._t);
  persistSoon._t = setTimeout(() => {
    try { localStorage.setItem('prism.project', JSON.stringify(serialize())); } catch (e) {}
    pushToLink();
  }, 300);
}

function loadProject(data) {
  if (!data || !Array.isArray(data.shapes)) return false;
  state.shapes = data.shapes.map(s => {
    const base = makeShape(s.kind === 'ellipse' ? 'ellipse' : 'quad');
    return Object.assign(base, s, { id: nextId() });
  });
  state.selected = state.shapes.length ? state.shapes[0].id : null;
  renderShapeList();
  syncControls();
  return true;
}

function restore() {
  try {
    const raw = localStorage.getItem('prism.project');
    if (raw && loadProject(JSON.parse(raw))) return;
  } catch (e) {}
  const s = makeShape('quad', { name: 'Forma 1', visual: 'plasma' });
  state.shapes = [s];
  state.selected = s.id;
}

document.getElementById('btnSave').addEventListener('click', () => {
  try {
    localStorage.setItem('prism.project', JSON.stringify(serialize()));
    toast('Projeto salvo neste dispositivo');
  } catch (e) {
    toast('Falha ao salvar');
  }
});

document.getElementById('btnExport').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(serialize(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'prism-projeto.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  closeMenu();
});

document.getElementById('btnImport').addEventListener('click', () => {
  document.getElementById('fileProject').click();
  closeMenu();
});

document.getElementById('fileProject').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      if (loadProject(JSON.parse(String(r.result)))) {
        persistSoon();
        toast('Projeto importado. Reimporte os vídeos/fotos se necessário.');
      } else {
        toast('Arquivo inválido');
      }
    } catch (err) {
      toast('Arquivo inválido');
    }
  };
  r.readAsText(f);
});

document.getElementById('btnReset').addEventListener('click', () => {
  if (!confirm('Apagar o projeto atual?')) return;
  localStorage.removeItem('prism.project');
  const s = makeShape('quad', { name: 'Forma 1', visual: 'plasma' });
  state.shapes = [s];
  state.selected = s.id;
  state.media.clear();
  renderShapeList();
  syncControls();
  closeMenu();
});

let hintTimer = null;
function hideHint() {
  const h = document.getElementById('hint');
  h.style.opacity = '0';
}
function toast(msg) {
  const h = document.getElementById('hint');
  h.textContent = msg;
  h.style.opacity = '1';
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { h.style.opacity = '0'; }, 2200);
}

function displayUrl() {
  if (!link.info) return null;
  const key = link.info.key || '';
  const urls = link.info.urls || [];
  if (urls.length) return urls[0] + '/?display=1&key=' + key;
  return 'http://localhost:' + (location.port || 8080) + '/?display=1&key=' + key;
}

function showPlayHint() {
  const el = document.getElementById('playHint');
  if (!el) return;
  const target = document.getElementById('playLink');
  if (target) {
    target.textContent = displayUrl() ||
      'rode "node server.js" no celular para liberar o Link sem fio';
  }
  el.classList.remove('hidden');
}

function hidePlayHint() {
  const el = document.getElementById('playHint');
  if (el) el.classList.add('hidden');
}

function enterPlay() {
  state.playing = true;
  document.body.classList.add('playing');
  document.getElementById('menu').classList.add('hidden');
  showPlayHint();
  const el = document.documentElement;
  try {
    if (el.requestFullscreen) {
      const p = el.requestFullscreen();
      if (p && p.catch) p.catch(() => {});
    }
  } catch (e) {}
  try {
    if (screen.orientation && screen.orientation.lock) {
      const p = screen.orientation.lock('landscape');
      if (p && p.catch) p.catch(() => {});
    }
  } catch (e) {}
}

function exitPlay() {
  state.playing = false;
  document.body.classList.remove('playing');
  hidePlayHint();
  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      const p = document.exitFullscreen();
      if (p && p.catch) p.catch(() => {});
    }
  } catch (e) {}
  try {
    if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
  } catch (e) {}
}

document.getElementById('btnPlay').addEventListener('click', () => {
  if (state.playing) exitPlay(); else enterPlay();
});
document.getElementById('btnFullscreen').addEventListener('click', () => {
  enterPlay();
  closeMenu();
});

function closeMenu() {
  document.getElementById('menu').classList.add('hidden');
}
document.getElementById('btnMenu').addEventListener('click', e => {
  e.stopPropagation();
  document.getElementById('menu').classList.toggle('hidden');
});
document.addEventListener('click', e => {
  const menu = document.getElementById('menu');
  if (!menu.classList.contains('hidden') && !menu.contains(e.target)) closeMenu();
});

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) state.playing = false;
  document.body.classList.toggle('playing', state.playing);
});

document.addEventListener('keydown', e => {
  if (IS_DISPLAY) {
    if (e.key === 'f' || e.key === 'F') { if (state.playing) exitPlay(); else enterPlay(); }
    return;
  }
  if (e.key === 'Escape') exitPlay();
  if (e.key === 'f' || e.key === 'F') { if (state.playing) exitPlay(); else enterPlay(); }
  if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('ui-hidden');
});

stage.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointermove', onPointerMove);
window.addEventListener('pointerup', onPointerUp);
window.addEventListener('pointercancel', onPointerUp);
window.addEventListener('resize', resize);

const nativeShell = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
if (!nativeShell && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

const link = { info: null, es: null };

async function probeLink() {
  if (IS_DISPLAY) return;
  try {
    const r = await fetch('/api/link', { cache: 'no-store' });
    if (!r.ok) return;
    link.info = await r.json();
    renderLinkInfo();
  } catch (e) {}
}

function renderLinkInfo() {
  const box = document.getElementById('linkBox');
  if (!box || !link.info) return;
  box.classList.remove('hidden');
  const key = link.info.key || '';
  const urls = (link.info.urls || []).map(u => u + '/?display=1&key=' + key);
  const fallback = 'http://localhost:' + (location.port || 8080) + '/?display=1&key=' + key;
  document.getElementById('linkUrl').textContent = urls.length ? urls.join('    ') : fallback;
  document.getElementById('linkStatus').textContent =
    'Código ' + key + ' · telas conectadas: ' + (link.info.displays || 0);
}

function pushToLink() {
  if (!link.info || IS_DISPLAY) return;
  const body = JSON.stringify(serialize());
  fetch('/api/state?key=' + encodeURIComponent(link.info.key), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body
  }).catch(() => {});
}

function applyRemote(project) {
  const list = Array.isArray(project.shapes) ? project.shapes : [];
  state.shapes = list.map(s => {
    const base = makeShape(s.kind === 'ellipse' ? 'ellipse' : 'quad');
    return Object.assign(base, s, { id: nextId(), mediaName: null });
  });
  state.selected = state.shapes.length ? state.shapes[0].id : null;
}

function startDisplayLink() {
  document.body.classList.add('display-mode');
  const es = new EventSource('/api/stream?key=' + encodeURIComponent(LINK_KEY));
  link.es = es;
  es.onmessage = ev => {
    try {
      const data = JSON.parse(ev.data);
      if (data && data.project) applyRemote(data.project);
    } catch (e) {}
  };
  es.onopen = () => setLinkHint('ligado ao controle');
  es.onerror = () => setLinkHint('sem sinal do controle — reconectando');
}

function setLinkHint(text) {
  const h = document.getElementById('hint');
  if (h) h.textContent = text;
}

if (IS_DISPLAY) {
  startDisplayLink();
  stage.addEventListener('pointerdown', () => { if (!state.playing) enterPlay(); });
} else {
  restore();
  probeLink();
}
renderShapeList();
syncControls();
setTimeout(hideHint, 6000);
requestAnimationFrame(loop);
