# Intro "control remoto → tele" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Intro interactiva: la home arranca con un control remoto 3D explorable y una tele CRT apagada; apretar power prende la tele con static y hace dolly hasta que la pantalla se convierte en el hero actual.

**Architecture:** Un custom element nuevo `<piso9-intro>` (overlay fixed sobre el hero) con un mini motor WebGL propio: un solo programa (Lambert + rim + emissive + modos "pantalla TV" y "label texturado"), geometría procedural (box/cylinder/quad), cámara con dolly. El hero gana un modo standby (static congelado) hasta recibir el evento `p9:power-on`. Spec: `docs/superpowers/specs/2026-07-27-remote-tv-intro-design.md`.

**Tech Stack:** HTML/CSS/JS planos, WebGL 1, Web Audio API. Sin dependencias, sin build.

## Global Constraints

- Zero-build: sin `package.json`, sin bundler; JS plano con `defer`.
- Cero requests a terceros en la carga inicial; cero assets nuevos (todo procedural/sintetizado).
- Presupuesto: carga inicial total < ~150 KB (el intro suma ~20 KB de JS plano).
- Estilos en `css/main.css` con clases — no estilos inline en el HTML.
- Todo wording nuevo va en **ambos** JSON `#p9-i18n-en` y `#p9-i18n-es` de `index.html`.
- Paleta: usar tokens existentes (`--accent #ff8c00`, `--bg #0a0a0a`, `--dim #808080`, `--font-mono` VT323).
- No tocar el shader del hero salvo lo especificado (uBoot standby); `k=0.22` de `_screenPos` no se toca.
- Probar en desktop y mobile antes de dar por terminado (regla del repo).
- El repo tiene un WIP sin commitear (email de contacto por idioma en `index.html` + `js/hero.js`): se commitea aparte en el Task 1, ANTES de empezar.

**Servidor local para verificar** (los paths son absolutos, servir desde la raíz del repo):

```bash
pnpm dlx serve -l 3010 .
```

Dejarlo corriendo en background durante todo el plan. Verificaciones en `http://localhost:3010`.

---

### Task 1: Arranque, esqueleto del overlay e i18n

**Files:**
- Modify: `index.html` (head script, body, i18n × 2, script tag)
- Modify: `css/main.css` (sección nueva al final)
- Create: `js/intro.js` (esqueleto)

**Interfaces:**
- Produces: clase `p9-intro` en `<html>` (decisión de arranque); elemento `<piso9-intro>` con `_boot()/_bail()/_frame()/_resize()`; claves i18n `ui.introHint`, `ui.introPower`; evento `p9:power-on` (lo despacha `_bail()`; Task 6 lo despacha en el handoff real).
- Consumes: clase `p9-tv` existente; JSON `#p9-i18n-*` existentes.

- [ ] **Step 1: Commitear el WIP preexistente por separado**

```bash
git add index.html js/hero.js
git commit -m "Contact: email por idioma en i18n y mailto dinámico"
```

- [ ] **Step 2: Decisión de arranque en el `<head>`**

En `index.html`, reemplazar:

```html
  <script>document.documentElement.classList.add('p9-tv')</script>
```

por:

```html
  <script>
    document.documentElement.classList.add('p9-tv');
    // Intro control remoto → tele: solo en la home "limpia" (sin deep-link) y
    // con motion habilitado. Si intro.js no puede arrancar (sin WebGL, error),
    // él mismo saca la clase y despacha p9:power-on (ver _bail en intro.js).
    if (!/^#(ch\d+|work|contact)$/.test(location.hash) &&
      !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
      document.documentElement.classList.add('p9-intro');
    }
  </script>
```

- [ ] **Step 3: Elemento y script en el body**

En `index.html`, después del `</div>` que cierra `<div id="top" class="hero">`, agregar:

```html
  <piso9-intro></piso9-intro>
```

Y junto a los otros scripts del head, después de la línea de `hero.js`:

```html
  <script src="/js/intro.js" defer></script>
```

- [ ] **Step 4: Claves i18n en ambos JSON**

En `#p9-i18n-en`, dentro de `"ui"`, después de la línea de `"hint"`:

```json
      "introHint": "[ TURN ON THE TV ]", "introPower": "Turn on the TV",
```

En `#p9-i18n-es`, mismo lugar:

```json
      "introHint": "[ PRENDÉ LA TELE ]", "introPower": "Prender la tele",
```

- [ ] **Step 5: CSS del overlay**

Al final de `css/main.css`:

```css
/* --- Intro: control remoto → tele ------------------------------------------
   <piso9-intro> tapa el hero hasta que el usuario aprieta power (js/intro.js).
   Solo existe bajo html.p9-intro; el propio intro.js saca la clase al terminar. */

piso9-intro {
  display: none;
}

.p9-intro piso9-intro {
  display: block;
  position: fixed;
  inset: 0;
  z-index: 50;
  background: var(--bg);
}

piso9-intro.fade {
  opacity: 0;
  transition: opacity 0.15s;
}

piso9-intro canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

.intro-hint {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 7vh;
  margin: 0;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 24px;
  letter-spacing: 0.08em;
  color: var(--dim);
  pointer-events: none;
  transition: opacity 0.35s;
}

.intro-hint.hidden {
  opacity: 0;
}

.intro-power-btn {
  position: absolute;
  margin: 0;
  padding: 0;
  background: none;
  border: 0;
  cursor: pointer;
  min-width: 44px;
  min-height: 44px;
}

.intro-power-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
  border-radius: 50%;
}
```

- [ ] **Step 6: Esqueleto de `js/intro.js`**

```js
/* <piso9-intro> — intro "control remoto → tele": escena WebGL propia que tapa
   el hero. Drag rota el control; el power dispara la secuencia de encendido
   (línea CRT + static + dolly a la pantalla) y al llenar el viewport despacha
   'p9:power-on' para que el hero corra su boot (static contra static: el corte
   no se ve). Sin dependencias. Diseño:
   docs/superpowers/specs/2026-07-27-remote-tv-intro-design.md */
(function () {
  if (customElements.get('piso9-intro')) return;

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

    _frame(now) {
      const gl = this._gl;
      gl.clearColor(0.039, 0.039, 0.039, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }
  }

  customElements.define('piso9-intro', Piso9Intro);
})();
```

- [ ] **Step 7: Verificar en el browser**

Con el server corriendo, abrir `http://localhost:3010`:

- Se ve un overlay negro con el hint `[ TURN ON THE TV ]` (o `[ PRENDÉ LA TELE ]` si el navegador está en español) abajo al centro, en VT323 gris.
- `http://localhost:3010/#ch2` → NO hay overlay; el hero carga directo en el proyecto (como hoy).
- DevTools → Rendering → "Emulate CSS media feature prefers-reduced-motion: reduce" → recargar la home → NO hay overlay.
- En consola: `document.querySelector('piso9-intro')._bail()` → el overlay desaparece y el hero queda visible y funcionando.

- [ ] **Step 8: Commit**

```bash
git add index.html css/main.css js/intro.js
git commit -m "Intro: arranque p9-intro, overlay esqueleto, i18n y CSS"
```

---

### Task 2: Modo standby del hero

**Files:**
- Modify: `js/hero.js` (líneas ~312, ~367, ~381, ~1017 — anclas exactas abajo)

**Interfaces:**
- Consumes: clase `p9-intro` (Task 1).
- Produces: hero congelado en static (`uBoot = 0`) mientras `p9-intro` esté activa; al recibir `p9:power-on` en `window`, resetea `_t0` y corre su boot normal.

- [ ] **Step 1: Standby en `connectedCallback`**

En `js/hero.js`, reemplazar:

```js
      this._t0 = performance.now();
      this._reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```

por:

```js
      this._t0 = performance.now();
      // Standby: si la intro (js/intro.js) está activa, quedarse en static puro
      // (uBoot congelado en 0) hasta que despache p9:power-on; ahí recién corre
      // el boot. El static de acá y el del final de la intro son el mismo ruido,
      // así que el empalme no se ve.
      this._standby = document.documentElement.classList.contains('p9-intro');
      if (this._standby) {
        this._onPowerOn = () => {
          this._standby = false;
          this._t0 = performance.now();
          this._tPrev = this._t0;
        };
        window.addEventListener('p9:power-on', this._onPowerOn, { once: true });
      }
      this._reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```

- [ ] **Step 2: uBoot congelado en `_frame`**

Reemplazar:

```js
      gl.uniform1f(this._u.uBoot, this._reduced ? 10 : Math.min((now - this._t0) / 1000, 10));
```

por:

```js
      gl.uniform1f(this._u.uBoot, this._standby ? 0 : (this._reduced ? 10 : Math.min((now - this._t0) / 1000, 10)));
```

- [ ] **Step 3: Teclado muerto durante standby**

En `_onKey`, reemplazar:

```js
      this._onKey = (e) => {
        if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
```

por:

```js
      this._onKey = (e) => {
        if (this._standby) return;
        if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
```

- [ ] **Step 4: Cleanup del listener**

En `disconnectedCallback`, después de:

```js
      window.removeEventListener('keydown', this._onKey);
```

agregar:

```js
      if (this._onPowerOn) window.removeEventListener('p9:power-on', this._onPowerOn);
```

- [ ] **Step 5: Verificar en el browser**

En `http://localhost:3010` (home, overlay negro de Task 1 encima):

- En consola: `document.querySelector('piso9-intro').style.display='none'` → detrás se ve el hero en **static puro continuo** (no arranca CH 9, no responde flechas).
- En consola: `window.dispatchEvent(new Event('p9:power-on'))` → el static se disuelve en CH 9 (boot normal) y las flechas vuelven a cambiar de canal.
- Recargar con `#work` → sin intro, hero arranca directo como siempre (sin standby).

- [ ] **Step 6: Commit**

```bash
git add js/hero.js
git commit -m "Hero: modo standby hasta p9:power-on (intro)"
```

---

### Task 3: Motor 3D — math, shaders, mallas, cámara

**Files:**
- Modify: `js/intro.js`

**Interfaces:**
- Consumes: esqueleto de Task 1 (`_boot`, `_frame`, `_resize`).
- Produces (para Tasks 4–6): `M4` (mul/persp/lookAt/rotX/rotY/rotZ/t/scl/trs/xform), `sub3/dot3/cross3/norm3/lerp/lerp3/clamp/ease`, builders `box(w,h,d)/cylinder(r,h,seg)/quad()`, `this._mesh(geo, opts)` → mesh `{vbo,ibo,n,color,emissive,mode,local}`, `this._draw(mesh, groupM)`, uniforms `this._u.{uProj,uView,uModel,uColor,uEmissive,uEye,uMode,uLine,uStatic,uTime,uTexL}`, estado de cámara `this._cam = {eye,tgt}`, `this._uLine/_uStatic` (floats por frame), constante `FOV`.

- [ ] **Step 1: Helpers de matrices y vectores**

Dentro del IIFE, antes de la clase:

```js
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
```

- [ ] **Step 2: Shaders**

Después de los helpers:

```js
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
```

- [ ] **Step 3: Builders de geometría**

```js
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
```

- [ ] **Step 4: Init GL + mesh/draw en la clase**

En `_boot()`, reemplazar el bloque desde `this._hint = ...` hasta el final del método por (el hint queda igual, se agrega lo demás):

```js
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
```

Y agregar los métodos a la clase:

```js
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
```

Y reemplazar `_frame` por:

```js
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
```

Con la constante junto a las otras del IIFE (antes de la clase):

```js
  const FOV = 0.87; // ~50°
```

- [ ] **Step 5: Verificar en el browser**

`http://localhost:3010` → cubo naranja rotando, iluminado (caras con distinta luz, rim sutil), fondo `#0a0a0a`, hint visible. Sin errores en consola. Redimensionar la ventana → el cubo no se deforma.

- [ ] **Step 6: Commit**

```bash
git add js/intro.js
git commit -m "Intro: motor WebGL mínimo (math, shaders, geometría, cámara)"
```

---

### Task 4: Modelado de la escena — control remoto + tele CRT

**Files:**
- Modify: `js/intro.js` (reemplaza `_buildScene` de prueba; agrega constantes de escena y `_labelTex`)

**Interfaces:**
- Consumes: todo lo de Task 3.
- Produces (para Tasks 5–6): constantes `REMOTE_POS/REMOTE_POS_P/REST_PITCH/REST_YAW/TV_POS/SCREEN_W/SCREEN_H/SCREEN_LOCAL` ; `this._remoteMeshes[]`, `this._tvMeshes[]`, refs `this._powerBtn`, `this._irLed`, `this._standbyLed`, `this._screen`; `this._remoteGroup()` → mat4 del grupo control (usa `this._rot = {yaw,pitch}` y `this._powerAnim = {depress, drop}`); `this._portrait` (bool, seteado en `_resize`).

- [ ] **Step 1: Constantes de escena**

Junto a `FOV`:

```js
  // Escena (unidades ~metros). El control "vive" a lo largo de Y con la cara en +Z;
  // en reposo queda acostado mirando a cámara (REST_PITCH) y apenas girado (REST_YAW).
  const REMOTE_POS = [0, -0.18, 1.05];   // landscape
  const REMOTE_POS_P = [0, -0.35, 1.15]; // portrait (<0.9 de aspecto)
  const REST_PITCH = -1.05, REST_YAW = 0.35;
  const TV_POS = [0, 0.05, -1.6];
  const SCREEN_W = 1.18, SCREEN_H = 0.82;
  const SCREEN_LOCAL = [0, 0.02, 0.475]; // centro de pantalla (tele): 5 mm PROUD del
                                         // frente del bisel (0.47) — el bisel es una
                                         // caja sólida; detrás de 0.47 no se vería
  const EYE0 = [0, 0.12, 2.5], TGT0 = [0, -0.05, 0];
  const EYE0_P = [0, 0.05, 3.4];
```

- [ ] **Step 2: `_buildScene` real**

Reemplazar el `_buildScene` de prueba (y borrar `this._testCube` del `_frame`; el render loop de la escena se completa en este mismo task):

```js
    _buildScene() {
      const T = (v) => M4.t(v);
      const CHARCOAL = [0.11, 0.11, 0.11], RUBBER = [0.19, 0.19, 0.19], DARK = [0.15, 0.15, 0.15];
      const ACCENT = [1.0, 0.549, 0.0];

      // --- control remoto (coords locales del grupo) ---------------------------
      const r = [];
      r.push(this._mesh(box(0.16, 0.42, 0.045), { color: CHARCOAL }));                       // cuerpo
      this._powerBtn = this._mesh(cylinder(0.026, 0.02, 20), {
        color: ACCENT, emissive: [0.12, 0.05, 0],
        local: M4.mul(T([0.045, 0.155, 0.028]), M4.rotX(Math.PI / 2))
      });
      this._powerLocalPos = [0.045, 0.155, 0.028];
      r.push(this._powerBtn);
      this._irLed = this._mesh(box(0.02, 0.012, 0.012), { color: [0.12, 0.02, 0.02], local: T([0, 0.215, 0.01]) });
      r.push(this._irLed);
      r.push(this._mesh(box(0.09, 0.03, 0.018), { color: RUBBER, local: T([0, 0.04, 0.026]) }));   // d-pad horiz
      r.push(this._mesh(box(0.03, 0.09, 0.018), { color: RUBBER, local: T([0, 0.04, 0.026]) }));   // d-pad vert
      for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
        r.push(this._mesh(cylinder(0.014, 0.012, 12), {
          color: RUBBER,
          local: M4.mul(T([-0.045 + col * 0.045, -0.055 - row * 0.045, 0.026]), M4.rotX(Math.PI / 2))
        }));
      }
      // grabado PISO9 (textura canvas con Orbitron, se pinta en _labelTex)
      r.push(this._mesh(quad(), {
        mode: 2, blend: true,
        local: M4.mul(T([0, -0.185, 0.0235]), M4.scl([0.1, 0.025, 1]))
      }));
      this._remoteMeshes = r;

      // --- tele CRT -------------------------------------------------------------
      const tv = [];
      tv.push(this._mesh(box(1.5, 1.05, 0.9), { color: DARK }));                              // caja
      tv.push(this._mesh(box(1.34, 0.94, 0.06), { color: [0.05, 0.05, 0.05], local: T([0, 0.02, 0.44]) })); // bisel
      this._screen = this._mesh(quad(), {
        mode: 1,
        local: M4.mul(T(SCREEN_LOCAL.slice()), M4.scl([SCREEN_W, SCREEN_H, 1]))
      });
      tv.push(this._screen);
      this._standbyLed = this._mesh(box(0.03, 0.015, 0.01), {
        color: [0.1, 0.02, 0.02], emissive: [0.45, 0.03, 0.02], local: T([0.6, -0.44, 0.474]) // proud del bisel (0.47), si no queda oculto
      });
      tv.push(this._standbyLed);
      tv.push(this._mesh(box(0.2, 0.06, 0.5), { color: [0.06, 0.06, 0.06], local: T([-0.55, -0.555, 0]) })); // pata
      tv.push(this._mesh(box(0.2, 0.06, 0.5), { color: [0.06, 0.06, 0.06], local: T([0.55, -0.555, 0]) }));  // pata
      tv.push(this._mesh(cylinder(0.008, 0.7, 6), {                                          // antena izq
        color: [0.2, 0.2, 0.2], local: M4.mul(T([-0.18, 0.85, -0.1]), M4.rotZ(0.45))
      }));
      tv.push(this._mesh(cylinder(0.008, 0.7, 6), {                                          // antena der
        color: [0.2, 0.2, 0.2], local: M4.mul(T([0.18, 0.85, -0.1]), M4.rotZ(-0.45))
      }));
      this._tvMeshes = tv;
      this._tvGroup = M4.t(TV_POS);

      this._rot = { yaw: 0, pitch: 0 };          // offsets del drag sobre el reposo
      this._powerAnim = { depress: 0, drop: 0 }; // Task 6 los anima

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

    // grupo del control: reposo + drag + bob de flotación + caída del power-on
    _remoteGroup(t) {
      const pos = (this._portrait ? REMOTE_POS_P : REMOTE_POS).slice();
      pos[1] += Math.sin(t * 1.3) * 0.008 - this._powerAnim.drop;
      const wobble = Math.sin(t * 0.7) * 0.02;
      return M4.trs(pos, REST_PITCH + this._rot.pitch, REST_YAW + this._rot.yaw + wobble, 0);
    }
```

- [ ] **Step 3: `_resize` con flag portrait y `_frame` de escena**

En `_resize`, después de `if (!w || !h) return;` agregar:

```js
      this._portrait = w / h < 0.9;
```

Reemplazar el cuerpo de `_frame` (sacando el cubo de prueba):

```js
    _frame(now) {
      const gl = this._gl;
      const w = this._canvas.width, h = this._canvas.height;
      const t = (now - this._t0) / 1000;
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
      for (let i = 0; i < this._tvMeshes.length; i++) this._draw(this._tvMeshes[i], this._tvGroup);
      for (let i = 0; i < this._remoteMeshes.length; i++) this._draw(this._remoteMeshes[i], rg);
    }
```

(`this._cam.dolly` lo setea Task 6; acá siempre es falsy.)

- [ ] **Step 4: Verificar en el browser**

`http://localhost:3010`:

- Control remoto flotando abajo al centro, acostado mirando a cámara: se distinguen power naranja, d-pad, 9 botones, grabado "PISO9" (el 9 naranja).
- Tele CRT detrás en penumbra: caja, bisel, pantalla casi negra, LED rojo de standby abajo a la derecha, dos patas, antenitas.
- El control "respira" (bob + wobble sutil).
- En consola: `document.querySelector('piso9-intro')._uStatic = 1` → la pantalla de la tele se llena de static animado. Volver con `._uStatic = 0`.
- DevTools responsive 390×844 → encuadre portrait: control más abajo, tele completa visible. Ajustar a ojo `REMOTE_POS_P`/`EYE0_P` si algo se corta.

- [ ] **Step 5: Commit**

```bash
git add js/intro.js
git commit -m "Intro: escena control remoto + tele CRT modelada procedural"
```

---

### Task 5: Interacción — drag, inercia, hover y accesibilidad

**Files:**
- Modify: `js/intro.js`

**Interfaces:**
- Consumes: escena de Task 4 (`this._rot`, `this._powerBtn`, `this._powerLocalPos`, `_remoteGroup`).
- Produces (para Task 6): `this._btn` (button DOM sobre el power), `this._press()` (stub que Task 6 completa: acá solo loguea), `this._hovered` (bool por frame), `this._powerScreen()` → `{x,y,r}` en px CSS.

- [ ] **Step 1: Estado y listeners de puntero**

Al final de `_boot()` (antes de `this._t0 = ...`), agregar:

```js
      // botón real (a11y): se reposiciona cada frame sobre el power proyectado
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
```

Y en `disconnectedCallback`, agregar:

```js
      window.removeEventListener('keydown', this._onIntroKey);
```

- [ ] **Step 2: Física + hover + botón proyectado en `_frame`**

En `_frame`, después de `const t = ...` agregar:

```js
      const dt = Math.min((now - (this._tPrev || now)) / 1000, 0.05);
      this._tPrev = now;
      if (!this._drag && !this._power) {
        // inercia + resorte suave de vuelta al reposo
        this._vel.yaw += -this._rot.yaw * 4 * dt;
        this._vel.pitch += -this._rot.pitch * 4 * dt;
        const damp = Math.exp(-2.2 * dt);
        this._vel.yaw *= damp; this._vel.pitch *= damp;
        this._rot.yaw = clamp(this._rot.yaw + this._vel.yaw * dt, -2.5, 2.5);
        this._rot.pitch = clamp(this._rot.pitch + this._vel.pitch * dt, -1.4, 1.4);
      }
```

Y al final de `_frame` (después de los draws):

```js
      // proyectar el power → botón a11y + hover
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
```

Y el método de proyección (px CSS, con el mismo viewProj del frame):

```js
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
      // radio: proyectar un punto desplazado 0.026 (radio del botón) hacia la derecha de cámara
      const wc2 = [wc[0] + 0.026, wc[1], wc[2]];
      const c2 = M4.xform(vp, [wc2[0], wc2[1], wc2[2], 1]);
      const r = Math.abs((c2[0] / c2[3] * 0.5 + 0.5) * w - x);
      return { x, y, r: Math.max(r, 10) };
    }
```

`M4.xform` recibe `[x,y,z]` y asume w=1 (los índices 12–14 suman la traslación); pasarle el array de 3 componentes está bien.

- [ ] **Step 3: Stub de `_press`**

```js
    _press() {
      if (this._power) return;
      console.log('[intro] power!'); // Task 6 lo reemplaza por la secuencia real
    }
```

- [ ] **Step 4: Verificar en el browser**

`http://localhost:3010`:

- Drag con el mouse → el control rota en yaw/pitch siguiendo el gesto; al soltar conserva inercia y vuelve suave al reposo.
- Pasar el mouse sobre el power → glow naranja sube; el cursor cambia a pointer (el botón DOM está encima).
- Click en el power → consola: `[intro] power!`. Enter en el teclado → ídem.
- Tab → el botón recibe foco visible (outline naranja); Enter/Espacio → `[intro] power!`.
- DevTools responsive táctil: drag rota, tap en el power dispara.
- El botón DOM sigue al power cuando el control rota (inspeccionar con el overlay de DevTools si hace falta).

- [ ] **Step 5: Commit**

```bash
git add js/intro.js
git commit -m "Intro: drag con inercia, hover del power y botón accesible"
```

---

### Task 6: Power-on — timeline, sonido y handoff al hero

**Files:**
- Modify: `js/intro.js`

**Interfaces:**
- Consumes: todo lo anterior; hero standby (Task 2) escuchando `p9:power-on`.
- Produces: secuencia completa y traspaso; `makeAudio()` (factory Web Audio: `click()`, `thunk()`, `hissOn()`, `hissOff(dur)`); `this._power = {t0,...}`; `this._handoff()`.

- [ ] **Step 1: Audio sintetizado**

En el IIFE, antes de la clase:

```js
  // --- sonido sintetizado (cero assets). Se crea recién al apretar power,
  // así el AudioContext nace dentro de un gesto del usuario. -------------------
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
```

- [ ] **Step 2: `_press` real**

Reemplazar el stub:

```js
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
      this._hint.classList.add('hidden');
    }
```

- [ ] **Step 3: Timeline en `_frame`**

En `_frame`, después del bloque de inercia (que ya chequea `!this._power`), agregar:

```js
      if (this._power) {
        const tp = (now - this._power.t0) / 1000;
        // botón: se hunde y vuelve
        this._powerAnim.depress = tp < 0.06 ? tp / 0.06 : Math.max(0, 1 - (tp - 0.06) / 0.1);
        this._powerBtn.local = M4.mul(
          M4.t([this._powerLocalPos[0], this._powerLocalPos[1], this._powerLocalPos[2] - 0.01 * this._powerAnim.depress]),
          M4.rotX(Math.PI / 2));
        // LED IR parpadea mandando la señal
        this._irLed.emissive = tp < 0.3 && Math.floor(tp * 25) % 2 === 0 ? [0.5, 0.06, 0.03] : [0, 0, 0];
        // la tele responde: thunk + línea + standby off
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
        // dolly a la pantalla + el control cae fuera de cuadro
        const k = ease(clamp((tp - 0.7) / 1.2, 0, 1));
        if (k > 0) {
          this._cam.dolly = true;
          const cw = this.clientWidth, chh = this.clientHeight;
          const asp = cw / chh;
          const sc = [TV_POS[0] + SCREEN_LOCAL[0], TV_POS[1] + SCREEN_LOCAL[1], TV_POS[2] + SCREEN_LOCAL[2]];
          const dH = (SCREEN_H / 2) / Math.tan(FOV / 2);
          const dW = (SCREEN_W / 2) / (Math.tan(FOV / 2) * asp);
          const dEnd = Math.min(dH, dW) * 0.96; // 4% de sobrellenado: los bordes nunca entran
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
```

- [ ] **Step 4: Handoff**

```js
    _handoff() {
      // primero arranca el boot del hero abajo del overlay; después un fade
      // cortito de static contra static y afuera
      window.dispatchEvent(new Event('p9:power-on'));
      if (this._audio) this._audio.hissOff(0.5);
      this.classList.add('fade');
      setTimeout(() => {
        document.documentElement.classList.remove('p9-intro');
        this.remove();
      }, 160);
    }
```

- [ ] **Step 5: Verificar el flujo completo**

`http://localhost:3010` (recarga limpia, sin hash):

- Click en power → click sonoro, botón se hunde, LED IR titila.
- La tele: thunk grave, LED standby se apaga, línea blanca horizontal se expande, static + hiss.
- Dolly ~1.2 s: la pantalla crece hasta llenar el viewport, el control cae fuera de cuadro, el hint se desvanece.
- Al llegar: continuidad static → static → el hero disuelve a CH 9. **No debe verse ningún salto ni flash negro.**
- Después: flechas, rueda, MENU, deep-links internos — todo el hero funciona normal.
- Repetir con el sitio en ES (`localStorage.setItem('p9-lang','es')` + recarga): hint y aria-label en español.
- DevTools responsive 390×844: flujo completo en portrait; la pantalla debe llenar el alto (el `Math.min(dH,dW)` elige el eje que llena).
- `#ch2`, reduced-motion y `_bail()` desde consola: siguen salteando/soltando la intro.
- Consola sin errores en todo el flujo.

- [ ] **Step 6: Commit**

```bash
git add js/intro.js
git commit -m "Intro: secuencia de power-on, sonido sintetizado y handoff al hero"
```

---

### Task 7: Pulido final, presupuesto y docs

**Files:**
- Modify: `CLAUDE.md` (mapa de archivos + párrafo de la intro)
- Modify: `sitemap.xml` (`<lastmod>`)
- Verify: tamaños de `js/*.js`, `css/main.css`

**Interfaces:**
- Consumes: todo lo anterior, funcionando.

- [ ] **Step 1: Documentar en CLAUDE.md**

En el árbol de archivos de `CLAUDE.md`, después de la línea de `js/hero.js`, agregar:

```
js/intro.js     <piso9-intro> — intro control remoto → tele (WebGL propio, sin deps)
```

Y al final de la sección del hero, un párrafo corto:

```markdown
**Intro (`js/intro.js`)**: overlay `<piso9-intro>` con un control remoto 3D
explorable (drag) y una tele CRT; apretar power dispara static + dolly y el
evento `p9:power-on`, con el que el hero (en standby, `uBoot` congelado) corre
su boot. Solo aparece sin deep-link, con motion y con WebGL (clase `p9-intro`
del script inline del head); ante cualquier error hace `_bail()` y la página
carga normal. Sonido sintetizado con Web Audio, cero assets.
```

- [ ] **Step 2: sitemap lastmod**

En `sitemap.xml`, actualizar `<lastmod>` de la home a `2026-07-27`.

- [ ] **Step 3: Presupuesto**

```bash
wc -c js/intro.js js/hero.js js/main.js css/main.css index.html
```

Esperado: `intro.js` ≤ ~25 KB. La suma HTML+CSS+JS (sin fuentes) debe seguir dejando la carga inicial < 150 KB con las 4 woff2. Si `intro.js` pasó de 25 KB, recortar comentarios/redundancia antes de cerrar.

- [ ] **Step 4: Matriz de verificación final**

Pasar una vez más, en este orden:

| Caso | Esperado |
|---|---|
| Home desktop EN | intro → power → handoff limpio a CH 9 |
| Home desktop ES | textos ES, mismo flujo |
| Mobile 390×844 (DevTools táctil) | drag/tap funcionan, pantalla llena el alto |
| `#ch2` / `#work` / `#contact` | sin intro, canal directo |
| prefers-reduced-motion | sin intro, hero instantáneo |
| Tab + Enter | power por teclado, foco visible |
| Consola completa | cero errores en todos los casos |

- [ ] **Step 5: Commit final**

```bash
git add CLAUDE.md sitemap.xml
git commit -m "Intro: docs en CLAUDE.md y sitemap lastmod"
```

**Nota:** NO pushear — push a `main` = deploy. El push lo decide Maxi después de probarlo en local.

---

## Riesgos conocidos / decisiones tomadas

- **`intro.js` 404 o roto** deja el hero en standby indefinido (static). Se decidió NO poner timeout de auto-power-on: dispararía mientras el usuario explora el control (idle largo es esperable) y un asset propio same-origin que falla es la misma clase de riesgo que `hero.js` fallando hoy. El `try/catch` + `_bail()` cubre errores de runtime.
- **Barrel distortion en el empalme**: el hero distorsiona su static con barrel; la intro llena el viewport con static plano. Como es ruido, la diferencia geométrica es invisible — no se replica el barrel en la intro (más simple que lo que insinuaba el spec; mismo resultado).
- **Hint en DOM, no en canvas**: el spec decía dibujar el hint en el canvas con
  VT323; el plan usa un `<p class="intro-hint">` con `--font-mono` — mismo look,
  texto nítido a cualquier DPR y menos código. Desviación deliberada.
- **Valores de encuadre** (`REMOTE_POS*`, `EYE0*`, dims de la tele) son punto de partida: se ajustan a ojo en las verificaciones de Task 4/6. Eso es esperado, no scope creep.
