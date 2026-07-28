/* <piso9-intro>: control remoto → tele, WebGL propio (ver CLAUDE.md). */
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

  // uMode: 0=pieza lit (key+fill+specular+rim+fog), 1=pantalla (uLine→uStatic), 2=label, 3=fondo (glow radial)
  const FRAG = `
precision highp float;
varying vec3 vNrm, vPos, vLocal;
uniform vec3 uColor, uEmissive, uEye;
uniform float uMode, uLine, uStatic, uTime;
uniform sampler2D uTexL;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
void main(){
  if (uMode > 2.5) {
    vec2 q = vLocal.xy;
    float r = length(q * vec2(1.3, 1.0)) * 2.0;
    vec3 bg = mix(vec3(0.075, 0.065, 0.055), vec3(0.028), smoothstep(0.15, 1.05, r));
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
    float n = hash(floor(uv * vec2(320.0, 240.0)) + vec2(fract(uTime*11.3)*291.0, fract(uTime*7.7)*173.0));
    col = mix(col, vec3(n*n*0.85), uStatic);
    gl_FragColor = vec4(col, 1.0);
    return;
  }
  vec3 N = normalize(vNrm);
  vec3 V = normalize(uEye - vPos);
  // key cálida arriba-derecha-frente, fill fría tenue desde la izquierda
  vec3 L1 = normalize(vec3(0.45, 0.75, 0.5));
  vec3 L2 = normalize(vec3(-0.7, 0.15, 0.25));
  float d1 = max(dot(N, L1), 0.0);
  float d2 = max(dot(N, L2), 0.0);
  vec3 H = normalize(L1 + V);
  float spec = pow(max(dot(N, H), 0.0), 40.0);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 col = uColor * (0.16
      + 0.85 * d1 * vec3(1.0, 0.93, 0.82)     // key cálida
      + 0.30 * d2 * vec3(0.55, 0.65, 0.85))   // fill fría
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

  const FOV = 0.87;

  const REMOTE_POS = [0, -0.22, 1.35];
  const REMOTE_POS_P = [0, -0.39, 1.45];
  const REST_PITCH = -1.05, REST_YAW = 0.35, REST_ROLL = -0.3;
  const TV_POS = [-0.55, 0.18, -1.6];   // arriba-izquierda (landscape)
  const TV_POS_P = [-0.12, 0.5, -2.0];  // portrait: más centrada y alta
  const TV_YAW = 0.55;                  // girada: lateral izquierdo hacia cámara;
                                         // el dolly la endereza (yaw*(1-k))
  const SCREEN_W = 1.18, SCREEN_H = 0.82;
  const SCREEN_LOCAL = [0, 0.02, 0.475]; // centro pantalla: 5mm proud del bisel (0.47, caja sólida)
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
      ['uProj', 'uView', 'uModel', 'uColor', 'uEmissive', 'uEye', 'uMode', 'uLine', 'uStatic', 'uTime', 'uTexL'].forEach(n => {
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
        this.setPointerCapture(e.pointerId);
        this._drag = { x: e.clientX, y: e.clientY, t: performance.now() };
        this._vel.yaw = 0; this._vel.pitch = 0;
      });
      this.addEventListener('pointermove', (e) => {
        this._px = e.clientX; this._py = e.clientY;
        if (!this._drag) return;
        const now = performance.now();
        const dt = Math.max(now - this._drag.t, 1) / 1000;
        const dx = (e.clientX - this._drag.x) * 0.005;
        const dy = (e.clientY - this._drag.y) * 0.005;
        this._rot.yaw = clamp(this._rot.yaw + dx, -2.5, 2.5);
        this._rot.pitch = clamp(this._rot.pitch + dy, -1.4, 1.4);
        this._vel.yaw = dx / dt; this._vel.pitch = dy / dt;
        this._drag = { x: e.clientX, y: e.clientY, t: now };
      });
      const endDrag = () => { this._drag = null; };
      this.addEventListener('pointerup', endDrag);
      this.addEventListener('pointercancel', endDrag);

      this._onIntroKey = (e) => {
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
      for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
        r.push(this._mesh(cylinder(0.014, 0.012, 12), {
          color: RUBBER,
          local: M4.mul(T([-0.045 + col * 0.045, -0.055 - row * 0.045, 0.026]), M4.rotX(Math.PI / 2))
        }));
      }
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
      tv.push(this._mesh(cylinder(0.008, 0.7, 6), {
        color: [0.2, 0.2, 0.2], local: M4.mul(T([-0.18, 0.85, -0.1]), M4.rotZ(0.45))
      }));
      tv.push(this._mesh(cylinder(0.008, 0.7, 6), {
        color: [0.2, 0.2, 0.2], local: M4.mul(T([0.18, 0.85, -0.1]), M4.rotZ(-0.45))
      }));
      this._tvMeshes = tv;

      this._bgMesh = this._mesh(quad(), {
        mode: 3,
        local: M4.mul(M4.t([0, 0.1, -4.5]), M4.scl([14, 9, 1]))
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
      pos[1] += Math.sin(t * 1.3) * 0.008 - this._powerAnim.drop;
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
          this._standbyLed.emissive = [0, 0, 0];
          this._standbyLed.color = [0.04, 0.04, 0.04];
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
          const dEnd = Math.min(dH, dW) * 0.96; // 4% de margen: bordes no entran
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
      gl.uniform1f(this._u.uLine, this._uLine);
      gl.uniform1f(this._u.uStatic, this._uStatic);
      gl.uniform1f(this._u.uTime, t);
      const rg = this._remoteGroup(t);
      const tg = this._tvGroup();
      this._draw(this._bgMesh, null);
      for (let i = 0; i < this._tvMeshes.length; i++) this._draw(this._tvMeshes[i], tg);
      for (let i = 0; i < this._remoteMeshes.length; i++) this._draw(this._remoteMeshes[i], rg);

      const ps = this._powerScreen();
      if (ps) {
        const d = ps.r * 2.2;
        this._btn.style.left = (ps.x - d / 2) + 'px';
        this._btn.style.top = (ps.y - d / 2) + 'px';
        this._btn.style.width = d + 'px';
        this._btn.style.height = d + 'px';
        this._hovered = !this._power && this._px >= 0 &&
          Math.hypot(this._px - ps.x, this._py - ps.y) < Math.max(ps.r * 1.4, 24);
      } else {
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
      // radio: proyecta punto +0.026 (radio) en X
      const wc2 = [wc[0] + 0.026, wc[1], wc[2]];
      const c2 = M4.xform(vp, [wc2[0], wc2[1], wc2[2], 1]);
      const r = Math.abs((c2[0] / c2[3] * 0.5 + 0.5) * w - x);
      return { x, y, r: Math.max(r, 10) };
    }

    _press() {
      if (this._power) return;
      this._power = { t0: performance.now(), thunked: false, hissed: false, done: false };
      this._audio = makeAudio();
      if (this._audio) this._audio.click();
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
