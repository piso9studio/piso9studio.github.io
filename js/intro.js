/* <piso9-intro> — intro "control remoto → tele": escena WebGL propia que tapa
   el hero. Drag rota el control; el power dispara la secuencia de encendido
   (línea CRT + static + dolly a la pantalla) y al llenar el viewport despacha
   'p9:power-on' para que el hero corra su boot (static contra static: el corte
   no se ve). Sin dependencias. Diseño:
   docs/superpowers/specs/2026-07-27-remote-tv-intro-design.md */
(function () {
  if (customElements.get('piso9-intro')) return;

  // --- math ------------------------------------------------------------------
  const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // cubic in-out

  // column-major, como espera WebGL
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

  // --- shaders -----------------------------------------------------------------
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

  // uMode: 0 = pieza lit (Lambert + rim + fog), 1 = pantalla de la tele
  // (apagada → línea blanca uLine → static uStatic, mismo hash del hero),
  // 2 = label texturado (grabado PISO9)
  const FRAG = `
precision highp float;
varying vec3 vNrm, vPos, vLocal;
uniform vec3 uColor, uEmissive, uEye;
uniform float uMode, uLine, uStatic, uTime;
uniform sampler2D uTexL;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
void main(){
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
  vec3 L = normalize(vec3(0.35, 0.8, 0.55));
  vec3 V = normalize(uEye - vPos);
  float d = max(dot(N, L), 0.0);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 col = uColor * (0.22 + 0.78 * d) + vec3(0.5, 0.55, 0.6) * rim * 0.12 + uEmissive;
  float fog = clamp((length(uEye - vPos) - 2.5) / 6.0, 0.0, 0.6);
  col = mix(col, vec3(0.04), fog);
  gl_FragColor = vec4(col, 1.0);
}`;

  // --- geometría procedural: [px,py,pz,nx,ny,nz] intercalado + índices ---------
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

  function cylinder(r, h, seg) { // eje Y, tapas incluidas
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

  function quad() { // unitario en XY, normal +Z; tamaño vía M4.scl en el local
    return {
      pos: new Float32Array([-0.5, -0.5, 0, 0, 0, 1, 0.5, -0.5, 0, 0, 0, 1, 0.5, 0.5, 0, 0, 0, 1, -0.5, 0.5, 0, 0, 0, 1]),
      idx: new Uint16Array([0, 1, 2, 0, 2, 3])
    };
  }

  const FOV = 0.87; // ~50°

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
    }

    // La página nunca queda en negro: sin WebGL o ante cualquier error se
    // suelta el overlay y el hero arranca como si la intro no existiera.
    _bail() {
      document.documentElement.classList.remove('p9-intro');
      window.dispatchEvent(new Event('p9:power-on'));
      this.remove();
    }

    _boot() {
      // i18n: mismo mecanismo que el hero (localStorage p9-lang o idioma del navegador)
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

      this._hint = document.createElement('p');
      this._hint.className = 'intro-hint';
      this._hint.textContent = ui.introHint || '[ TURN ON THE TV ]';
      this.appendChild(this._hint);

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

      // textura del label (se dibuja en Task 4; 1x1 negro mientras tanto)
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

      this._t0 = performance.now();
      const loop = (now) => { this._raf = requestAnimationFrame(loop); this._frame(now); };
      this._raf = requestAnimationFrame(loop);
    }

    _resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = this.clientWidth, h = this.clientHeight;
      if (!w || !h) return;
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

    // Task 4 lo reemplaza con la escena real; por ahora un cubo de prueba
    _buildScene() {
      this._testCube = this._mesh(box(0.5, 0.5, 0.5), { color: [1, 0.549, 0], local: M4.t([0, 0, 0]) });
    }

    _frame(now) {
      const gl = this._gl;
      const w = this._canvas.width, h = this._canvas.height;
      const t = (now - this._t0) / 1000;
      gl.clearColor(0.039, 0.039, 0.039, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix4fv(this._u.uProj, false, M4.persp(FOV, w / h, 0.05, 20));
      gl.uniformMatrix4fv(this._u.uView, false, M4.lookAt(this._cam.eye, this._cam.tgt, [0, 1, 0]));
      gl.uniform3fv(this._u.uEye, this._cam.eye);
      gl.uniform1f(this._u.uLine, this._uLine);
      gl.uniform1f(this._u.uStatic, this._uStatic);
      gl.uniform1f(this._u.uTime, t);
      this._draw(this._testCube, M4.trs([0, 0, 0], t * 0.7, t * 0.9, 0));
    }
  }

  customElements.define('piso9-intro', Piso9Intro);
})();
