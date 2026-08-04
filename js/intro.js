(function () {
  if (customElements.get('piso9-intro')) return;

  const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  const M4 = {
    mul(a, b) {
      const o = new Float32Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      return o;
    },
    persp(fov, asp, n, f) {
      const t = 1 / Math.tan(fov / 2), o = new Float32Array(16);
      o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f);
      return o;
    },
    lookAt(e, c, u) {
      const z = norm3(sub3(e, c)), x = norm3(cross3(u, z)), y = cross3(z, x);
      return new Float32Array([
        x[0], y[0], z[0], 0,
        x[1], y[1], z[1], 0,
        x[2], y[2], z[2], 0,
        -dot3(x, e), -dot3(y, e), -dot3(z, e), 1]);
    },
    rotX(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); },
    rotY(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); },
    rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
    t(v) { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, v[0], v[1], v[2], 1]); },
    scl(v) { return new Float32Array([v[0], 0, 0, 0, 0, v[1], 0, 0, 0, 0, v[2], 0, 0, 0, 0, 1]); },
    trs(pos, rx, ry, rz) {
      let m = M4.t(pos);
      if (ry) m = M4.mul(m, M4.rotY(ry));
      if (rx) m = M4.mul(m, M4.rotX(rx));
      if (rz) m = M4.mul(m, M4.rotZ(rz));
      return m;
    },
    xform(m, v) {
      return [
        m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
        m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
        m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
        m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15]];
    }
  };

  const VERT = `
attribute vec3 aPos; attribute vec3 aNrm;
uniform mat4 uProj, uView, uModel;
varying vec3 vNrm, vPos, vLocal;
void main(){
  vec4 wp = uModel * vec4(aPos, 1.0);
  vPos = wp.xyz;
  vNrm = mat3(uModel) * aNrm;
  vLocal = aPos;
  gl_Position = uProj * uView * wp;
}`;

  const FRAG = `
precision highp float;
varying vec3 vNrm, vPos, vLocal;
uniform vec3 uColor, uEmissive, uEye, uSpot, uWall;
uniform float uMode, uLine, uStatic, uTime, uCrtI, uFade;
uniform sampler2D uTexL;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
void main(){
  if (uMode > 3.5) {
    gl_FragColor = vec4(uColor, uFade);
    return;
  }
  if (uMode > 2.5) {
    vec2 q = vec2(vPos.x - uSpot.x, (vPos.y - (uSpot.y - 1.9)) * 1.3);
    float r = length(q) * 0.28;
    vec3 bg = mix(uWall, uWall * 0.38, smoothstep(0.15, 1.05, r));
    float dx = vPos.x - uSpot.x;
    float shaft = exp(-dx * dx * 0.8) * smoothstep(-3.0, 2.2, vPos.y) * 0.085;
    bg += vec3(1.0, 0.96, 0.86) * shaft;
    gl_FragColor = vec4(bg, 1.0);
    return;
  }
  if (uMode > 1.5) {
    vec4 tc = texture2D(uTexL, vLocal.xy + 0.5);
    gl_FragColor = vec4(tc.rgb, tc.a);
    return;
  }
  if (uMode > 0.5) {
    vec2 uv = vLocal.xy + 0.5;
    vec3 col = vec3(0.02);
    if (uLine > 0.0) {
      float band = 0.5 * max(uLine, 0.03);
      float line = 1.0 - smoothstep(band * 0.7, band, abs(uv.y - 0.5));
      col = mix(col, vec3(1.0 + 2.0 * (1.0 - uLine)), line * (1.0 - uStatic));
    }
    float n = hash(floor(gl_FragCoord.xy * 0.5) + vec2(fract(uTime*11.3)*291.0, fract(uTime*7.7)*173.0));
    vec3 st = vec3(n * n * 0.85);
    st *= 1.0 - uCrtI * 0.10 * (0.5 + 0.5 * sin(gl_FragCoord.y * 1.7));
    st *= 1.0 - uCrtI * 0.03 * step(2.0, mod(gl_FragCoord.x, 3.0));
    st += 0.0392;
    col = mix(col, st, uStatic);
    gl_FragColor = vec4(col, 1.0);
    return;
  }
  vec3 N = normalize(vNrm);
  vec3 V = normalize(uEye - vPos);
  vec3 L1 = normalize(vec3(0.45, 0.75, 0.5));
  vec3 L2 = normalize(vec3(-0.7, 0.15, 0.25));
  float d1 = max(dot(N, L1), 0.0);
  float d2 = max(dot(N, L2), 0.0);
  vec3 H = normalize(L1 + V);
  float spec = pow(max(dot(N, H), 0.0), 40.0);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 sv = vPos - uSpot;
  float sdist = length(sv);
  vec3 SL = sv / sdist;
  float cone = smoothstep(0.70, 0.90, -SL.y);
  float att = 1.0 / (1.0 + 0.15 * sdist * sdist);
  float dspot = max(dot(N, -SL), 0.0);
  vec3 col = uColor * (0.12
      + 0.60 * d1 * vec3(1.0, 0.93, 0.82)
      + 0.26 * d2 * vec3(0.55, 0.65, 0.85)
      + 1.55 * dspot * cone * att * vec3(1.0, 0.96, 0.88))
    + vec3(1.0, 0.95, 0.85) * spec * 0.18
    + vec3(0.6, 0.65, 0.75) * rim * 0.22
    + uEmissive;
  float fog = clamp((length(uEye - vPos) - 2.8) / 6.0, 0.0, 0.55);
  col = mix(col, vec3(0.035), fog);
  gl_FragColor = vec4(col, 1.0);
}`;

  function box(w, h, d) {
    const x = w / 2, y = h / 2, z = d / 2, P = [], I = [];
    const face = (a, b, c, dd, n) => {
      const s = P.length / 6;
      [a, b, c, dd].forEach(p => P.push(p[0], p[1], p[2], n[0], n[1], n[2]));
      I.push(s, s + 1, s + 2, s, s + 2, s + 3);
    };
    face([-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z], [0, 0, 1]);
    face([x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z], [0, 0, -1]);
    face([x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z], [1, 0, 0]);
    face([-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z], [-1, 0, 0]);
    face([-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z], [0, 1, 0]);
    face([-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z], [0, -1, 0]);
    return { pos: new Float32Array(P), idx: new Uint16Array(I) };
  }

  function cylinder(r, h, seg) {
    const P = [], I = [];
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      let s = P.length / 6;
      P.push(r * c0, -h / 2, r * s0, c0, 0, s0, r * c1, -h / 2, r * s1, c1, 0, s1,
        r * c1, h / 2, r * s1, c1, 0, s1, r * c0, h / 2, r * s0, c0, 0, s0);
      I.push(s, s + 1, s + 2, s, s + 2, s + 3);
      s = P.length / 6;
      P.push(0, h / 2, 0, 0, 1, 0, r * c0, h / 2, r * s0, 0, 1, 0, r * c1, h / 2, r * s1, 0, 1, 0);
      I.push(s, s + 1, s + 2);
      s = P.length / 6;
      P.push(0, -h / 2, 0, 0, -1, 0, r * c1, -h / 2, r * s1, 0, -1, 0, r * c0, -h / 2, r * s0, 0, -1, 0);
      I.push(s, s + 1, s + 2);
    }
    return { pos: new Float32Array(P), idx: new Uint16Array(I) };
  }

  function quad() {
    return {
      pos: new Float32Array([-0.5, -0.5, 0, 0, 0, 1, 0.5, -0.5, 0, 0, 0, 1, 0.5, 0.5, 0, 0, 0, 1, -0.5, 0.5, 0, 0, 0, 1]),
      idx: new Uint16Array([0, 1, 2, 0, 2, 3])
    };
  }

  function cone(r0, r1, h, seg) {
    const P = [], I = [];
    const sl = Math.atan2(r0 - r1, h);
    const cs = Math.cos(sl), sn = Math.sin(sl);
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      let s = P.length / 6;
      P.push(
        r0 * c0, -h / 2, r0 * s0, c0 * cs, sn, s0 * cs,
        r0 * c1, -h / 2, r0 * s1, c1 * cs, sn, s1 * cs,
        r1 * c1, h / 2, r1 * s1, c1 * cs, sn, s1 * cs,
        r1 * c0, h / 2, r1 * s0, c0 * cs, sn, s0 * cs);
      I.push(s, s + 1, s + 2, s, s + 2, s + 3);
      s = P.length / 6;
      P.push(0, h / 2, 0, 0, 1, 0, r1 * c0, h / 2, r1 * s0, 0, 1, 0, r1 * c1, h / 2, r1 * s1, 0, 1, 0);
      I.push(s, s + 1, s + 2);
      s = P.length / 6;
      P.push(0, -h / 2, 0, 0, -1, 0, r0 * c1, -h / 2, r0 * s1, 0, -1, 0, r0 * c0, -h / 2, r0 * s0, 0, -1, 0);
      I.push(s, s + 1, s + 2);
    }
    return { pos: new Float32Array(P), idx: new Uint16Array(I) };
  }

  function lathe(prof, seg) {
    const P = [], I = [];
    const N = prof.length;
    const nrm = prof.map((p, i) => {
      const a = prof[Math.max(i - 1, 0)], b = prof[Math.min(i + 1, N - 1)];
      const dy = b[1] - a[1], dr = b[0] - a[0];
      const l = Math.hypot(dy, dr) || 1;
      return [dy / l, -dr / l];
    });
    for (let j = 0; j <= seg; j++) {
      const a = j / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      for (let i = 0; i < N; i++) {
        P.push(prof[i][0] * c, prof[i][1], prof[i][0] * s,
          nrm[i][0] * c, nrm[i][1], nrm[i][0] * s);
      }
    }
    for (let j = 0; j < seg; j++) for (let i = 0; i < N - 1; i++) {
      const a = j * N + i, b = a + N;
      I.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const s0 = P.length / 6;
    P.push(0, prof[0][1], 0, 0, -1, 0);
    for (let j = 0; j < seg; j++) {
      const a0 = j / seg * Math.PI * 2, a1 = (j + 1) / seg * Math.PI * 2;
      const b0 = P.length / 6;
      P.push(prof[0][0] * Math.cos(a1), prof[0][1], prof[0][0] * Math.sin(a1), 0, -1, 0,
        prof[0][0] * Math.cos(a0), prof[0][1], prof[0][0] * Math.sin(a0), 0, -1, 0);
      I.push(s0, b0, b0 + 1);
    }
    return { pos: new Float32Array(P), idx: new Uint16Array(I) };
  }

  function leaf() {
    const ROWS = 13, COLS = 9, P = [], I = [];
    const wAt = (s) => 0.56 * Math.pow(Math.sin(Math.min(s * 1.05, 1) * Math.PI), 0.65) * (1 - 0.22 * s);
    const pt = (s, u) => {
      const w = wAt(s);
      return [u * w, s,
        0.22 * s * s + 0.10 * u * u * w - 0.05 * Math.abs(u) * (1 - s)
        - 0.028 * Math.sin(Math.PI * s) * (1 - Math.abs(u))];
    };
    for (let r = 0; r < ROWS; r++) {
      const s = r / (ROWS - 1);
      for (let c = 0; c < COLS; c++) {
        const u = c / (COLS - 1) * 2 - 1;
        const p = pt(s, u);
        const e = 0.01;
        const ts = pt(Math.min(s + e, 1), u), tu = pt(s, u + e);
        const n = norm3(cross3(
          [tu[0] - p[0], tu[1] - p[1], tu[2] - p[2]],
          [ts[0] - p[0], ts[1] - p[1], ts[2] - p[2]]));
        P.push(p[0], p[1], p[2], n[0], n[1], n[2]);
      }
    }
    for (let r = 0; r < ROWS - 1; r++) for (let c = 0; c < COLS - 1; c++) {
      const a = r * COLS + c, b = a + COLS;
      I.push(a, a + 1, b, a + 1, b + 1, b);
    }
    return { pos: new Float32Array(P), idx: new Uint16Array(I) };
  }

  const FOV = 0.87;

  const REMOTE_POS = [0, -0.22, 1.35];
  const REMOTE_POS_P = [0, -0.39, 1.45];
  const REST_PITCH = -1.05, REST_YAW = 0.35, REST_ROLL = -0.3;
  const TV_POS = [-0.55, 0.18, -1.6];
  const TV_POS_P = [-0.12, 0.5, -2.0];
  const TV_YAW = 0.55;
  const SCREEN_W = 1.18, SCREEN_H = 0.82;
  const SCREEN_LOCAL = [0, 0.02, 0.475];
  const EYE0 = [0, 0.12, 2.5], TGT0 = [0, -0.05, 0];
  const EYE0_P = [0, 0.05, 3.4];

  function makeAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      const ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const nd = noiseBuf.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const burst = (dur, type, freq, gain) => {
        const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
        const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
        const g = ctx.createGain(); g.gain.value = 0;
        src.connect(f); f.connect(g); g.connect(master);
        const t = ctx.currentTime;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(gain, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.start(t); src.stop(t + dur + 0.1);
      };
      const a = {
        click() { burst(0.05, 'highpass', 2200, 0.35); },
        beep(row, col) {
          const t = ctx.currentTime;
          [[697, 770, 852][row], [1209, 1336, 1477][col]].forEach(fr => {
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.type = 'sine'; o.frequency.value = fr;
            g.gain.setValueAtTime(0.12, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
            o.connect(g); g.connect(master);
            o.start(t); o.stop(t + 0.1);
          });
        },
        pluck() {
          const t = ctx.currentTime;
          [523, 784].forEach((fr, i) => {
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.type = 'sine'; o.frequency.value = fr;
            const t0 = t + i * 0.07;
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.linearRampToValueAtTime(0.16, t0 + 0.015);
            g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.16);
            o.connect(g); g.connect(master);
            o.start(t0); o.stop(t0 + 0.2);
          });
        },
        tap() {
          const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
          o.type = 'sine';
          o.frequency.setValueAtTime(180, t);
          o.frequency.exponentialRampToValueAtTime(70, t + 0.08);
          g.gain.setValueAtTime(0.3, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
          o.connect(g); g.connect(master);
          o.start(t); o.stop(t + 0.12);
        },
        thunk() {
          const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
          o.type = 'sine';
          o.frequency.setValueAtTime(130, t);
          o.frequency.exponentialRampToValueAtTime(38, t + 0.22);
          g.gain.setValueAtTime(0.6, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
          o.connect(g); g.connect(master);
          o.start(t); o.stop(t + 0.32);
          burst(0.15, 'lowpass', 400, 0.25);
        },
        hissOn() {
          a._h = ctx.createBufferSource(); a._h.buffer = noiseBuf; a._h.loop = true;
          const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 4200; f.Q.value = 0.4;
          a._hg = ctx.createGain(); a._hg.gain.value = 0;
          a._h.connect(f); f.connect(a._hg); a._hg.connect(master);
          a._h.start();
          a._hg.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.25);
        },
        hissOff(dur) {
          if (!a._hg) { try { ctx.close(); } catch (e) { } return; }
          a._hg.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + dur);
          setTimeout(() => { try { a._h.stop(); ctx.close(); } catch (e) { } }, dur * 1000 + 120);
        }
      };
      return a;
    } catch (e) { return null; }
  }

  class Piso9Intro extends HTMLElement {
    connectedCallback() {
      if (this._init) return;
      this._init = true;
      if (!document.documentElement.classList.contains('p9-intro')) { this.remove(); return; }
      try { this._boot(); } catch (e) { this._bail(); }
    }

    disconnectedCallback() {
      cancelAnimationFrame(this._raf);
      if (this._ro) this._ro.disconnect();
      window.removeEventListener('keydown', this._onIntroKey);
    }

    _bail() {
      document.documentElement.classList.remove('p9-intro');
      window.dispatchEvent(new Event('p9:power-on'));
      this.remove();
    }

    _boot() {
      let lang = null;
      try { lang = localStorage.getItem('p9-lang'); } catch (e) { }
      if (lang !== 'en' && lang !== 'es') {
        lang = (navigator.language || '').toLowerCase().indexOf('es') === 0 ? 'es' : 'en';
      }
      this._lang = lang;
      let ui = {};
      try { ui = (JSON.parse(document.getElementById('p9-i18n-' + lang).textContent) || {}).ui || {}; } catch (e) { }
      this._ui = ui;

      this._canvas = document.createElement('canvas');
      this.appendChild(this._canvas);
      const gl = this._canvas.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'high-performance' });
      if (!gl) { this._bail(); return; }
      this._gl = gl;

      const compile = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      const prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);

      this._u = {};
      ['uProj', 'uView', 'uModel', 'uColor', 'uEmissive', 'uEye', 'uSpot', 'uWall', 'uMode', 'uLine', 'uStatic', 'uTime', 'uTexL', 'uCrtI', 'uFade'].forEach(n => {
        this._u[n] = gl.getUniformLocation(prog, n);
      });
      this._aPos = gl.getAttribLocation(prog, 'aPos');
      this._aNrm = gl.getAttribLocation(prog, 'aNrm');
      gl.enableVertexAttribArray(this._aPos);
      gl.enableVertexAttribArray(this._aNrm);
      gl.enable(gl.DEPTH_TEST);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      this._texL = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this._texL);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(this._u.uTexL, 0);

      this._uLine = 0;
      this._uStatic = 0;
      this._cam = { eye: [0, 0.12, 2.5], tgt: [0, -0.05, 0] };

      this._buildScene();

      this._shownAt = performance.now();
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(this);
      this._resize();

      this._btn = document.createElement('button');
      this._btn.className = 'intro-power-btn';
      this._btn.setAttribute('aria-label', ui.introPower || 'Turn on the TV');
      this._btn.addEventListener('pointerdown', (e) => e.stopPropagation());
      this._btn.addEventListener('click', () => this._press());
      this.appendChild(this._btn);

      this._drag = null;
      this._vel = { yaw: 0, pitch: 0 };
      this._px = -1; this._py = -1;
      this.addEventListener('pointerdown', (e) => {
        try { this.setPointerCapture(e.pointerId); } catch (err) { }
        this._drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: 0, t: performance.now() };
        this._vel.yaw = 0; this._vel.pitch = 0;
      });
      this.addEventListener('pointermove', (e) => {
        this._px = e.clientX; this._py = e.clientY;
        if (!this._drag) return;
        const now = performance.now();
        const dt = Math.max(now - this._drag.t, 1) / 1000;
        const dx = (e.clientX - this._drag.x) * 0.005;
        const dy = (e.clientY - this._drag.y) * 0.005;
        if (this._inspect && this._inspect.active) {
          this._inspect.ry += dx * 1.5;
          this._inspect.rx += dy * 1.5;
        } else {
          this._rot.yaw = clamp(this._rot.yaw + dx, -2.5, 2.5);
          this._rot.pitch = clamp(this._rot.pitch + dy, -1.4, 1.4);
          this._vel.yaw = dx / dt; this._vel.pitch = dy / dt;
        }
        this._drag.x = e.clientX; this._drag.y = e.clientY; this._drag.t = now;
        this._drag.moved = Math.max(this._drag.moved, Math.hypot(e.clientX - this._drag.x0, e.clientY - this._drag.y0));
      });
      this.addEventListener('pointerup', (e) => {
        const d = this._drag;
        this._drag = null;
        if (!d || d.moved >= 6 || this._power) return;
        if (this._inspect && this._inspect.active) { this._plantToggle(false); return; }
        this._remoteTap(e.clientX, e.clientY);
      });
      this.addEventListener('pointercancel', () => { this._drag = null; });

      this._onIntroKey = (e) => {
        if (this._inspect && this._inspect.active) {
          if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this._plantToggle(false);
          }
          return;
        }
        if ((e.key === 'Enter' || e.key === ' ') && document.activeElement !== this._btn) {
          e.preventDefault();
          this._press();
        }
      };
      window.addEventListener('keydown', this._onIntroKey);

      this._t0 = performance.now();
      const loop = (now) => { this._raf = requestAnimationFrame(loop); this._frame(now); };
      this._raf = requestAnimationFrame(loop);
    }

    _resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = this.clientWidth, h = this.clientHeight;
      if (!w || !h) return;
      this._portrait = w / h < 0.9;
      this._canvas.width = Math.round(w * dpr);
      this._canvas.height = Math.round(h * dpr);
      this._gl.viewport(0, 0, this._canvas.width, this._canvas.height);
    }

    _mesh(geo, opts) {
      const gl = this._gl;
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, geo.pos, gl.STATIC_DRAW);
      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.idx, gl.STATIC_DRAW);
      return Object.assign(
        { vbo, ibo, n: geo.idx.length, color: [1, 1, 1], emissive: [0, 0, 0], mode: 0, blend: false, local: M4.t([0, 0, 0]) },
        opts);
    }

    _draw(mesh, group) {
      const gl = this._gl, u = this._u;
      gl.uniformMatrix4fv(u.uModel, false, group ? M4.mul(group, mesh.local) : mesh.local);
      gl.uniform3fv(u.uColor, mesh.color);
      gl.uniform3fv(u.uEmissive, mesh.emissive);
      gl.uniform1f(u.uMode, mesh.mode);
      if (mesh.blend) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
      gl.vertexAttribPointer(this._aPos, 3, gl.FLOAT, false, 24, 0);
      gl.vertexAttribPointer(this._aNrm, 3, gl.FLOAT, false, 24, 12);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
      gl.drawElements(gl.TRIANGLES, mesh.n, gl.UNSIGNED_SHORT, 0);
    }

    _buildScene() {
      const T = (v) => M4.t(v);
      const CHARCOAL = [0.11, 0.11, 0.11], RUBBER = [0.19, 0.19, 0.19], DARK = [0.15, 0.15, 0.15];
      const ACCENT = [1.0, 0.549, 0.0];

      const r = [];
      r.push(this._mesh(box(0.16, 0.42, 0.045), { color: CHARCOAL }));
      this._powerBtn = this._mesh(cylinder(0.026, 0.02, 20), {
        color: ACCENT, emissive: [0.12, 0.05, 0],
        local: M4.mul(T([0.045, 0.155, 0.028]), M4.rotX(Math.PI / 2))
      });
      this._powerLocalPos = [0.045, 0.155, 0.028];
      r.push(this._powerBtn);
      this._irLed = this._mesh(box(0.02, 0.012, 0.012), { color: [0.12, 0.02, 0.02], local: T([0, 0.215, 0.01]) });
      r.push(this._irLed);
      r.push(this._mesh(box(0.09, 0.03, 0.018), { color: RUBBER, local: T([0, 0.04, 0.026]) }));
      r.push(this._mesh(box(0.03, 0.09, 0.018), { color: RUBBER, local: T([0, 0.04, 0.026]) }));
      this._keyBtns = [];
      for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
        const pos = [-0.045 + col * 0.045, -0.055 - row * 0.045, 0.026];
        const m = this._mesh(cylinder(0.014, 0.012, 12), {
          color: RUBBER,
          local: M4.mul(T(pos), M4.rotX(Math.PI / 2))
        });
        m._key = { digit: row * 3 + col + 1, row, col, pos, t0: 0 };
        this._keyBtns.push(m);
        r.push(m);
      }
      this._dpadZones = [
        { dir: [0, -1], pos: [0, 0.072, 0.026] },
        { dir: [0, 1], pos: [0, 0.008, 0.026] },
        { dir: [-1, 0], pos: [-0.032, 0.04, 0.026] },
        { dir: [1, 0], pos: [0.032, 0.04, 0.026] }
      ];
      r.push(this._mesh(quad(), {
        mode: 2, blend: true,
        local: M4.mul(T([0, -0.185, 0.0235]), M4.scl([0.1, 0.025, 1]))
      }));
      this._remoteMeshes = r;

      const tv = [];
      tv.push(this._mesh(box(1.5, 1.05, 0.9), { color: DARK }));
      tv.push(this._mesh(box(1.34, 0.94, 0.06), { color: [0.05, 0.05, 0.05], local: T([0, 0.02, 0.44]) }));
      this._screen = this._mesh(quad(), {
        mode: 1,
        local: M4.mul(T(SCREEN_LOCAL.slice()), M4.scl([SCREEN_W, SCREEN_H, 1]))
      });
      tv.push(this._screen);
      this._standbyLed = this._mesh(box(0.03, 0.015, 0.01), {
        color: [0.1, 0.02, 0.02], emissive: [0.45, 0.03, 0.02], local: T([-0.6, -0.44, 0.474])
      });
      tv.push(this._standbyLed);
      tv.push(this._mesh(box(0.2, 0.06, 0.5), { color: [0.06, 0.06, 0.06], local: T([-0.55, -0.555, 0]) }));
      tv.push(this._mesh(box(0.2, 0.06, 0.5), { color: [0.06, 0.06, 0.06], local: T([0.55, -0.555, 0]) }));

      this._shelfY = -0.585;
      const WOOD = [0.50, 0.27, 0.12], WOOD_DARK = [0.20, 0.10, 0.045], WOOD_LEG = [0.55, 0.32, 0.15];
      tv.push(this._mesh(box(3.1, 0.05, 0.84), { color: WOOD, local: T([0, -0.61, 0]) }));
      tv.push(this._mesh(box(3.0, 0.5, 0.76), { color: WOOD_DARK, local: T([0, -0.885, 0]) }));
      for (let i = 0; i < 36; i++) {
        tv.push(this._mesh(box(0.05, 0.44, 0.02), {
          color: WOOD,
          local: T([-1.41 + i * (2.82 / 35), -0.885, 0.388])
        }));
      }
      [[-1.35, -0.28], [-1.35, 0.28], [1.35, -0.28], [1.35, 0.28]].forEach(([lx, lz]) => {
        tv.push(this._mesh(cylinder(0.022, 0.26, 10), { color: WOOD_LEG, local: T([lx, -1.265, lz]) }));
      });
      tv.push(this._mesh(quad(), {
        color: [0.062, 0.053, 0.045],
        local: M4.mul(M4.mul(T([0, -1.398, 0]), M4.rotX(-Math.PI / 2)), M4.scl([28, 28, 1]))
      }));
      this._wall = [0.048, 0.066, 0.048];
      this._sideWall = this._mesh(quad(), {
        color: [this._wall[0] * 0.85, this._wall[1] * 0.85, this._wall[2] * 0.85],
        local: M4.mul(M4.mul(T([3.4, 0.9, 4.1]), M4.rotY(-Math.PI / 2)), M4.scl([12, 13, 1]))
      });
      tv.push(this._sideWall);
      const SKIRT = [0.125, 0.115, 0.105];
      tv.push(this._mesh(box(26.6, 0.09, 0.03), { color: SKIRT, local: T([-9.9, -1.353, -1.885]) }));
      tv.push(this._mesh(box(0.03, 0.09, 12), { color: SKIRT, local: T([3.385, -1.353, 4.1]) }));
      tv.push(this._mesh(box(4.1, 0.012, 3.0), {
        color: [0.155, 0.11, 0.07],
        local: T([0.15, -1.392, 0.55])
      }));

      const CH = M4.mul(T([1.9, -1.398, 2.2]), M4.rotY(-2.43));
      const FABRIC = [0.34, 0.155, 0.085], FABRIC2 = [0.42, 0.20, 0.10];
      const chPart = (geo, opts, m) => tv.push(this._mesh(geo, Object.assign(opts, { local: M4.mul(CH, m) })));
      [[-0.36, -0.30], [-0.36, 0.30], [0.36, -0.30], [0.36, 0.30]].forEach(([lx, lz]) => {
        chPart(cylinder(0.022, 0.22, 10), { color: WOOD_LEG }, T([lx, 0.11, lz]));
      });
      chPart(box(0.88, 0.16, 0.78), { color: FABRIC }, T([0, 0.30, 0]));
      chPart(box(0.82, 0.11, 0.70), { color: FABRIC2 }, T([0, 0.435, 0.02]));
      chPart(box(0.82, 0.52, 0.15), { color: FABRIC }, M4.mul(T([0, 0.66, -0.36]), M4.rotX(-0.18)));
      chPart(box(0.13, 0.32, 0.72), { color: FABRIC }, T([-0.375, 0.44, 0]));
      chPart(box(0.13, 0.32, 0.72), { color: FABRIC }, T([0.375, 0.44, 0]));
      chPart(box(0.15, 0.03, 0.74), { color: WOOD }, T([-0.375, 0.615, 0]));
      chPart(box(0.15, 0.03, 0.74), { color: WOOD }, T([0.375, 0.615, 0]));

      this._plantPos = [-1.25, this._shelfY, 0.12];
      const pl = [];
      const AMBER = { color: [0.66, 0.20, 0.05], emissive: [0.10, 0.025, 0.004] };
      pl.push(this._mesh(lathe([
        [0.055, 0], [0.085, 0.008], [0.105, 0.025], [0.113, 0.05], [0.110, 0.075],
        [0.098, 0.10], [0.082, 0.122], [0.068, 0.142], [0.056, 0.165], [0.047, 0.192],
        [0.041, 0.22], [0.037, 0.25], [0.035, 0.28], [0.035, 0.305], [0.038, 0.322], [0.040, 0.33]
      ], 32), Object.assign({}, AMBER)));
      pl.push(this._mesh(cylinder(0.0465, 0.010, 32), {
        color: [0.42, 0.10, 0.02], emissive: [0.05, 0.01, 0], local: T([0, 0.20, 0])
      }));
      const STEM = [0.30, 0.44, 0.14], STEM2 = [0.42, 0.55, 0.20];
      const LEAF = [0.13, 0.30, 0.09], LEAF2 = [0.30, 0.42, 0.14], LEAF3 = [0.095, 0.235, 0.07];
      const addStem = (rz0, rx0, bz, bx, segs, segLen) => {
        let m = M4.mul(M4.mul(T([0, 0.315, 0]), M4.rotZ(rz0)), M4.rotX(rx0));
        for (let i = 0; i < segs; i++) {
          const k = i / Math.max(segs - 1, 1);
          pl.push(this._mesh(cone(0.007 * (1 - i * 0.07), 0.007 * (1 - (i + 1) * 0.07), segLen, 8), {
            color: lerp3(STEM, STEM2, k), local: M4.mul(m, T([0, segLen / 2, 0]))
          }));
          m = M4.mul(M4.mul(M4.mul(m, T([0, segLen, 0])), M4.rotZ(bz)), M4.rotX(bx));
        }
        return m;
      };
      const addLeaf = (end, rz, rx, s, c) => {
        pl.push(this._mesh(leaf(), {
          color: c, local: M4.mul(M4.mul(M4.mul(end, M4.rotZ(rz)), M4.rotX(rx)), M4.scl([s, s * 1.5, s]))
        }));
      };
      addLeaf(addStem(0.50, 0.15, 0.10, -0.04, 5, 0.055), 0.35, -0.75, 0.13, LEAF);
      addLeaf(addStem(-0.30, -0.30, -0.10, -0.05, 5, 0.060), -0.30, -0.80, 0.155, LEAF2);
      addLeaf(addStem(0.05, 0.30, 0.02, 0.10, 4, 0.050), 0.10, -1.00, 0.12, LEAF);
      addLeaf(addStem(-0.85, 0.10, -0.14, 0.02, 5, 0.050), -0.50, -0.55, 0.14, LEAF2);
      addLeaf(addStem(0.20, -0.45, 0.06, -0.12, 4, 0.045), 0.15, -1.05, 0.11, LEAF3);
      addLeaf(addStem(-0.55, -0.10, -0.16, -0.06, 6, 0.050), -0.70, -0.60, 0.125, LEAF2);
      addLeaf(addStem(0.75, -0.10, 0.14, -0.06, 5, 0.048), 0.55, -0.85, 0.10, LEAF3);
      addLeaf(addStem(-1.15, 0.05, -0.22, 0.04, 7, 0.055), -0.85, -0.35, 0.15, LEAF);
      this._plantMeshes = pl;
      this._fadeMesh = this._mesh(quad(), { mode: 4, blend: true, color: [0.012, 0.012, 0.015] });
      tv.push(this._mesh(cylinder(0.008, 0.7, 6), {
        color: [0.2, 0.2, 0.2], local: M4.mul(T([-0.18, 0.85, -0.1]), M4.rotZ(0.45))
      }));
      tv.push(this._mesh(cylinder(0.008, 0.7, 6), {
        color: [0.2, 0.2, 0.2], local: M4.mul(T([0.18, 0.85, -0.1]), M4.rotZ(-0.45))
      }));
      this._tvMeshes = tv;

      this._bgMesh = this._mesh(quad(), {
        mode: 3,
        local: M4.mul(M4.t([-9.9, 0.9, -1.9]), M4.scl([26.6, 13, 1]))
      });

      this._rot = { yaw: 0, pitch: 0 };
      this._dollyK = 0;
      this._powerAnim = { depress: 0, drop: 0 };

      this._labelTex();
      if (document.fonts) {
        document.fonts.load('700 44px "Orbitron"').then(() => this._labelTex()).catch(() => { });
      }
    }

    _labelTex() {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 64;
      const x = c.getContext('2d');
      x.clearRect(0, 0, 256, 64);
      x.font = '700 40px "Orbitron", sans-serif';
      x.textBaseline = 'middle';
      const wP = x.measureText('PISO').width, w9 = x.measureText('9').width;
      const x0 = (256 - wP - w9) / 2;
      x.fillStyle = 'rgba(250,250,250,0.5)';
      x.fillText('PISO', x0, 34);
      x.fillStyle = 'rgba(255,140,0,0.75)';
      x.fillText('9', x0 + wP, 34);
      const gl = this._gl;
      gl.bindTexture(gl.TEXTURE_2D, this._texL);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }

    _remoteGroup(t) {
      const pos = (this._portrait ? REMOTE_POS_P : REMOTE_POS).slice();
      pos[1] += Math.sin(t * 1.3) * 0.008 - this._powerAnim.drop - (this._inspDrop || 0);
      const wobble = Math.sin(t * 0.7) * 0.02;
      return M4.trs(pos, REST_PITCH + this._rot.pitch, REST_YAW + this._rot.yaw + wobble, REST_ROLL);
    }

    _tvGroup() {
      return M4.trs(this._portrait ? TV_POS_P : TV_POS, 0, TV_YAW * (1 - this._dollyK), 0);
    }

    _frame(now) {
      const gl = this._gl;
      const w = this._canvas.width, h = this._canvas.height;
      const t = (now - this._t0) / 1000;
      const dt = Math.min((now - (this._tPrev || now)) / 1000, 0.05);
      this._tPrev = now;
      if (!this._drag && !this._power) {
        this._vel.yaw += -this._rot.yaw * 4 * dt;
        this._vel.pitch += -this._rot.pitch * 4 * dt;
        const damp = Math.exp(-2.2 * dt);
        this._vel.yaw *= damp; this._vel.pitch *= damp;
        this._rot.yaw = clamp(this._rot.yaw + this._vel.yaw * dt, -2.5, 2.5);
        this._rot.pitch = clamp(this._rot.pitch + this._vel.pitch * dt, -1.4, 1.4);
      }
      const insp = this._inspect || (this._inspect = { active: false, k: 0, rx: 0, ry: 0 });
      insp.k = clamp(insp.k + (insp.active ? dt * 2.5 : -dt * 2.5), 0, 1);
      const ik = ease(insp.k);
      this._inspDrop = 1.6 * ik;
      for (let i = 0; i < this._keyBtns.length; i++) {
        const k = this._keyBtns[i]._key;
        if (!k.t0) continue;
        const tk = (now - k.t0) / 1000;
        const dep = tk < 0.06 ? tk / 0.06 : Math.max(0, 1 - (tk - 0.06) / 0.1);
        if (tk > 0.16) k.t0 = 0;
        this._keyBtns[i].local = M4.mul(
          M4.t([k.pos[0], k.pos[1], k.pos[2] - 0.008 * dep]), M4.rotX(Math.PI / 2));
      }
      if (this._irT0) {
        const ti = (now - this._irT0) / 1000;
        this._irLed.emissive = ti < 0.12 ? [0.5, 0.06, 0.03] : [0, 0, 0];
        if (ti >= 0.12) this._irT0 = 0;
      }
      if (this._power) {
        const tp = (now - this._power.t0) / 1000;
        this._powerAnim.depress = tp < 0.06 ? tp / 0.06 : Math.max(0, 1 - (tp - 0.06) / 0.1);
        this._powerBtn.local = M4.mul(
          M4.t([this._powerLocalPos[0], this._powerLocalPos[1], this._powerLocalPos[2] - 0.01 * this._powerAnim.depress]),
          M4.rotX(Math.PI / 2));
        this._irLed.emissive = tp < 0.3 && Math.floor(tp * 25) % 2 === 0 ? [0.5, 0.06, 0.03] : [0, 0, 0];
        if (tp >= 0.15 && !this._power.thunked) {
          this._power.thunked = true;
          if (this._audio) this._audio.thunk();
          this._standbyLed.emissive = [0.08, 0.5, 0.12];
          this._standbyLed.color = [0.04, 0.16, 0.05];
        }
        this._uLine = clamp((tp - 0.15) / 0.3, 0, 1);
        this._uStatic = clamp((tp - 0.45) / 0.15, 0, 1);
        if (this._uStatic > 0 && !this._power.hissed) {
          this._power.hissed = true;
          if (this._audio) this._audio.hissOn();
        }
        const k = ease(clamp((tp - 0.7) / 1.2, 0, 1));
        this._dollyK = k;
        if (k > 0) {
          this._cam.dolly = true;
          const cw = this.clientWidth, chh = this.clientHeight;
          const asp = cw / chh;
          const tp0 = this._portrait ? TV_POS_P : TV_POS;
          const sc = [tp0[0] + SCREEN_LOCAL[0], tp0[1] + SCREEN_LOCAL[1], tp0[2] + SCREEN_LOCAL[2]];
          const dH = (SCREEN_H / 2) / Math.tan(FOV / 2);
          const dW = (SCREEN_W / 2) / (Math.tan(FOV / 2) * asp);
          const dEnd = Math.min(dH, dW) * 0.96;
          const eye0 = (this._portrait ? EYE0_P : EYE0);
          this._cam.eye = lerp3(eye0, [sc[0], sc[1], sc[2] + dEnd], k);
          this._cam.tgt = lerp3(TGT0, sc, k);
          this._powerAnim.drop = 1.3 * k * k;
        }
        if (tp >= 1.95 && !this._power.done) {
          this._power.done = true;
          this._handoff();
        }
      }
      if (!this._cam.dolly) {
        this._cam.eye = (this._portrait ? EYE0_P : EYE0).slice();
        this._cam.tgt = TGT0.slice();
      }
      gl.clearColor(0.039, 0.039, 0.039, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix4fv(this._u.uProj, false, M4.persp(FOV, w / h, 0.05, 20));
      gl.uniformMatrix4fv(this._u.uView, false, M4.lookAt(this._cam.eye, this._cam.tgt, [0, 1, 0]));
      gl.uniform3fv(this._u.uEye, this._cam.eye);
      const tvp = this._portrait ? TV_POS_P : TV_POS;
      gl.uniform3fv(this._u.uSpot, [tvp[0], tvp[1] + 2.2, tvp[2] + 1.5]);
      gl.uniform3fv(this._u.uWall, this._wall);
      gl.uniform1f(this._u.uLine, this._uLine);
      let shiver = 0;
      if (this._shiverT0) {
        const ts = (now - this._shiverT0) / 1000;
        if (ts < 0.25) shiver = 0.25 * (1 - ts / 0.25) * (0.55 + 0.45 * Math.sin(ts * 110));
        else this._shiverT0 = 0;
      }
      gl.uniform1f(this._u.uStatic, Math.max(this._uStatic, shiver));
      gl.uniform1f(this._u.uTime, t);
      gl.uniform1f(this._u.uCrtI, this.clientWidth < 720 ? 0 : 1);
      const rg = this._remoteGroup(t);
      const tg = this._tvGroup();
      this._draw(this._bgMesh, tg);
      for (let i = 0; i < this._tvMeshes.length; i++) this._draw(this._tvMeshes[i], tg);
      for (let i = 0; i < this._remoteMeshes.length; i++) this._draw(this._remoteMeshes[i], rg);

      const cE = this._cam.eye, cT = this._cam.tgt;
      const cz = norm3(sub3(cE, cT)), cx = norm3(cross3([0, 1, 0], cz)), cy = cross3(cz, cx);
      const centerShelf = M4.xform(tg, [this._plantPos[0], this._plantPos[1] + 0.28, this._plantPos[2]]);
      const centerInsp = [cE[0] - cz[0] * 0.9, cE[1] - cz[1] * 0.9, cE[2] - cz[2] * 0.9];
      const pp = lerp3(centerShelf, centerInsp, ik);
      const yawNow = TV_YAW * (1 - this._dollyK);
      const pScale = 1 + 0.12 * ik;
      const pg2 = M4.mul(
        M4.mul(M4.t(pp), M4.mul(M4.rotX(insp.rx * ik), M4.rotY(yawNow * (1 - ik) + insp.ry * ik))),
        M4.mul(M4.scl([pScale, pScale, pScale]), M4.t([0, -0.28, 0])));
      if (ik > 0.001) {
        gl.uniform1f(this._u.uFade, 0.82 * ik);
        gl.disable(gl.DEPTH_TEST);
        const cam = new Float32Array([cx[0], cx[1], cx[2], 0, cy[0], cy[1], cy[2], 0, cz[0], cz[1], cz[2], 0, cE[0], cE[1], cE[2], 1]);
        this._fadeMesh.local = M4.mul(cam, M4.mul(M4.t([0, 0, -0.2]), M4.scl([2, 2, 1])));
        this._draw(this._fadeMesh, null);
        gl.enable(gl.DEPTH_TEST);
        gl.clear(gl.DEPTH_BUFFER_BIT);
      }
      for (let i = 0; i < this._plantMeshes.length; i++) this._draw(this._plantMeshes[i], pg2);

      const ps = this._powerScreen();
      if (ps && ik < 0.01) {
        this._btn.style.display = 'block';
        const d = ps.r * 2.2;
        this._btn.style.left = (ps.x - d / 2) + 'px';
        this._btn.style.top = (ps.y - d / 2) + 'px';
        this._btn.style.width = d + 'px';
        this._btn.style.height = d + 'px';
        this._hovered = !this._power && this._px >= 0 &&
          Math.hypot(this._px - ps.x, this._py - ps.y) < Math.max(ps.r * 1.4, 24);
      } else {
        this._btn.style.display = 'none';
        this._hovered = false;
      }
      const glow = this._hovered ? 0.35 : 0.12;
      const e0 = this._powerBtn.emissive;
      this._powerBtn.emissive = [lerp(e0[0], glow, 0.2), lerp(e0[1], glow * 0.42, 0.2), lerp(e0[2], 0, 0.2)];
    }

    _powerScreen() {
      const w = this.clientWidth, h = this.clientHeight;
      if (!w || !h) return null;
      const vp = M4.mul(M4.persp(FOV, w / h, 0.05, 20), M4.lookAt(this._cam.eye, this._cam.tgt, [0, 1, 0]));
      const g = this._remoteGroup((performance.now() - this._t0) / 1000);
      const wc = M4.xform(g, this._powerLocalPos);
      const c = M4.xform(vp, [wc[0], wc[1], wc[2], 1]);
      if (c[3] <= 0) return null;
      const x = (c[0] / c[3] * 0.5 + 0.5) * w;
      const y = (1 - (c[1] / c[3] * 0.5 + 0.5)) * h;
      const wc2 = [wc[0] + 0.026, wc[1], wc[2]];
      const c2 = M4.xform(vp, [wc2[0], wc2[1], wc2[2], 1]);
      const r = Math.abs((c2[0] / c2[3] * 0.5 + 0.5) * w - x);
      return { x, y, r: Math.max(r, 10) };
    }

    _remotePointScreen(local, g, vp) {
      const w = this.clientWidth, h = this.clientHeight;
      const wc = M4.xform(g, local);
      const c = M4.xform(vp, [wc[0], wc[1], wc[2], 1]);
      if (c[3] <= 0) return null;
      return { x: (c[0] / c[3] * 0.5 + 0.5) * w, y: (1 - (c[1] / c[3] * 0.5 + 0.5)) * h };
    }

    _remoteTap(px, py) {
      const w = this.clientWidth, h = this.clientHeight;
      if (!w || !h) return;
      const vp = M4.mul(M4.persp(FOV, w / h, 0.05, 20), M4.lookAt(this._cam.eye, this._cam.tgt, [0, 1, 0]));
      const g = this._remoteGroup((performance.now() - this._t0) / 1000);
      const mobile = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || this.clientWidth < 720;
      if (!mobile) {
        const tg = this._tvGroup();
        const pcL = [this._plantPos[0], this._plantPos[1] + 0.28, this._plantPos[2]];
        const pc = this._remotePointScreen(pcL, tg, vp);
        if (pc) {
          const pe = this._remotePointScreen([pcL[0] + 0.28, pcL[1], pcL[2]], tg, vp);
          const pr = Math.max(pe ? Math.hypot(pe.x - pc.x, pe.y - pc.y) : 0, 26);
          if (Math.hypot(px - pc.x, py - pc.y) < pr) { this._plantToggle(true); return; }
        }
      }
      let best = null;
      const consider = (pos, payload) => {
        const s = this._remotePointScreen(pos, g, vp);
        if (!s) return;
        const edge = this._remotePointScreen([pos[0] + 0.02, pos[1], pos[2]], g, vp);
        const rr = Math.max(edge ? Math.hypot(edge.x - s.x, edge.y - s.y) : 0, 18);
        const dd = Math.hypot(px - s.x, py - s.y);
        if (dd < rr && (!best || dd < best.d)) best = { d: dd, payload };
      };
      for (const m of this._keyBtns) consider(m._key.pos, { key: m });
      for (const z of this._dpadZones) consider(z.pos, { dpad: z });
      if (!best) return;
      const audio = this._ensureAudio();
      this._shiverT0 = performance.now();
      if (best.payload.key) {
        const k = best.payload.key._key;
        k.t0 = performance.now();
        this._irT0 = performance.now();
        if (audio) audio.beep(k.row, k.col);
      } else {
        const z = best.payload.dpad;
        this._vel.yaw += z.dir[0] * 1.6;
        this._vel.pitch += z.dir[1] * 1.2;
        this._irT0 = performance.now();
        if (audio) audio.tap();
      }
    }

    _ensureAudio() {
      if (this._audio === undefined) {
        let on = true;
        try { on = localStorage.getItem('p9-sound') !== 'off'; } catch (e) { }
        this._audio = on ? makeAudio() : null;
      }
      return this._audio;
    }

    _plantToggle(on) {
      const insp = this._inspect || (this._inspect = { active: false, k: 0, rx: 0, ry: 0 });
      if (insp.active === on) return;
      insp.active = on;
      if (on) { insp.rx = 0; insp.ry = 0; }
      const audio = this._ensureAudio();
      if (audio) { if (on) audio.pluck(); else audio.tap(); }
    }

    _press() {
      if (this._power || (this._inspect && this._inspect.active)) return;
      this._power = { t0: performance.now(), thunked: false, hissed: false, done: false };
      const audio = this._ensureAudio();
      if (audio) audio.click();
      if (window.posthog) posthog.capture('intro_power_on', {
        lang: this._lang,
        ms_to_press: Math.round(performance.now() - this._shownAt)
      });
      this._btn.disabled = true;
    }

    _handoff() {
      window.dispatchEvent(new Event('p9:power-on'));
      if (this._audio) this._audio.hissOff(0.5);
      this.classList.add('fade');
      setTimeout(() => {
        document.documentElement.classList.remove('p9-intro');
        this.remove();
      }, 160);
    }
  }

  customElements.define('piso9-intro', Piso9Intro);
})();
