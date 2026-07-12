/* <piso9-hero> — fullscreen WebGL TV: the whole page lives inside the tube.
   Channels: CH 9 home (wordmark), CH 1..N projects (from #p9-channels JSON),
   CH 0 contact. Switching channels replays the boot static burst (uSwitch).
   Attributes: accent (hex), strength (float), grain ("on"|"off"), crt,
   caption-left (tagline), caption-copy (longer copy under the tagline). */
(function () {
  if (customElements.get('piso9-hero')) return;

  const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.,1.); }`;

  const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform sampler2D uTexUI;
uniform vec2 uRes;
uniform float uTime;
uniform float uStrength;
uniform float uGrain;
uniform vec2 uMouse;
uniform vec4 uPts[16];
uniform float uAges[16];
uniform vec3 uAccent;
uniform float uCrt;
uniform float uBoot;
uniform float uSwitch;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }

void main(){
  vec2 uv = vUv;
  // subtle CRT barrel distortion — 0.10*2.2 must match k=0.22 in _screenPos
  vec2 cc = uv - 0.5;
  uv = 0.5 + cc * (1.0 + uCrt * 0.10 * dot(cc, cc) * 2.2);
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  // tv power-on: picture opens from a bright horizontal line
  float openY = max(smoothstep(0.05, 0.55, uBoot), 0.004);
  float openX = max(smoothstep(0.0, 0.30, uBoot), 0.30);
  vec2 bc = uv - 0.5;
  uv = 0.5 + vec2(bc.x / openX, bc.y / openY);
  float insideBoot = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  float aspect = uRes.x/uRes.y;
  vec2 disp = vec2(0.0);
  float energy = 0.0;
  for(int i=0;i<16;i++){
    float age = uAges[i];
    if(age < 1.0){
      vec2 d = uv - uPts[i].xy;
      d.x *= aspect;
      float k = exp(-dot(d,d)*55.0) * (1.0-age)*(1.0-age);
      disp += uPts[i].zw * k;
      energy += k;
    }
  }
  disp += 0.0035 * vec2(
    sin(uv.y*8.0 + uTime*0.6) * sin(uTime*0.35),
    cos(uv.x*6.0 - uTime*0.5) * cos(uTime*0.27)
  );
  disp *= uStrength;
  vec2 ca = disp * 0.35 + vec2(0.0012, 0.0) * uStrength * (0.4 + energy);
  vec3 col;
  col.r = texture2D(uTex, uv - disp - ca).r;
  col.g = texture2D(uTex, uv - disp).g;
  col.b = texture2D(uTex, uv - disp + ca).b;

  // UI layer: takes the tube shape but not the mouse distortion
  col += texture2D(uTexUI, uv).rgb;
  vec2 m = uv - uMouse; m.x *= aspect;
  col += uAccent * exp(-dot(m,m)*7.0) * 0.045;
  col += uAccent * energy * 0.035;

  vec2 q = uv - 0.5;
  col *= 1.0 - dot(q,q)*0.55;

  // boot: power-on line is pure white — no content visible until static clears
  col = mix(col, vec3(0.95), 1.0 - smoothstep(0.38, 0.55, uBoot));
  // static: boot phase + channel-switch burst share the same noise
  float stat = (1.0 - smoothstep(1.4, 2.1, uBoot)) * smoothstep(0.22, 0.38, uBoot);
  stat = max(stat, uSwitch);
  float n1 = hash(floor(uv*uRes*0.5) + vec2(fract(uTime*11.3)*291.0, fract(uTime*7.7)*173.0));
  col = mix(col, vec3(n1*n1*0.85), stat);

  // CRT: scanlines + slow flicker + faint phosphor stripes
  float scan = 1.0 - uCrt * 0.10 * (0.5 + 0.5 * sin(uv.y * uRes.y * 1.7));
  float flick = 1.0 - uCrt * 0.012 * sin(uTime * 47.0);
  col *= scan * flick;
  float px = mod(gl_FragCoord.x, 3.0);
  col *= 1.0 - uCrt * 0.03 * step(2.0, px);

  col += (hash(uv*uRes + fract(uTime)*137.0) - 0.5) * 0.05 * uGrain;

  col = (col + vec3(0.0392)) * mix(1.0, inside, uCrt) * insideBoot;
  gl_FragColor = vec4(col, 1.0);
}`;

  const N = 16;
  const SWITCH_S = 0.4; // channel-switch static burst duration (s)
  const STACK = '"Satoshi", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  const MONO = '"VT323", ui-monospace, Menlo, Consolas, monospace';
  const sstep = (a, b, t) => {
    const k = Math.min(Math.max((t - a) / (b - a), 0), 1);
    return k * k * (3 - 2 * k);
  };
  // set font + letterSpacing (px) in one go; letterSpacing lacks old-Safari support
  const setF = (x, font, lsp) => {
    x.font = font;
    try { x.letterSpacing = (lsp || 0) + 'px'; } catch (e) { }
  };

  class Piso9Hero extends HTMLElement {
    static get observedAttributes() { return ['accent', 'strength', 'grain', 'crt', 'caption-left', 'caption-copy', 'captionleft', 'captioncopy']; }

    connectedCallback() {
      if (this._booted) return;
      this._booted = true;
      this.style.display = 'block';
      this.style.width = '100%';
      this.style.height = '100%';
      this.style.position = this.style.position || 'relative';
      this.style.overflow = 'hidden';

      this._canvas = document.createElement('canvas');
      this._canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
      this.appendChild(this._canvas);

      // channels: CH 9 home, CH 1..N projects (from inline JSON), CH 0 contact
      let projects = [];
      try {
        const data = document.getElementById('p9-channels');
        if (data) projects = JSON.parse(data.textContent).projects || [];
      } catch (e) { }
      this._channels = [
        { id: 9, type: 'home' },
        ...projects.map(p => ({ id: p.ch, type: 'project', data: p })),
        { id: 0, type: 'contact' }
      ];
      this._chIndex = this._initialIndex();
      this._switchT0 = -1;
      this._pendingIdx = -1;
      this._swapped = true;
      this._lastNav = 0;

      // invisible hit targets that track the barrel-mapped positions of drawn UI
      const mkOverlay = (tag, label, href) => {
        const el = document.createElement(tag);
        if (href) el.href = href;
        el.setAttribute('aria-label', label);
        el.style.cssText = 'position:absolute;display:block;cursor:pointer;z-index:5;margin:0;padding:0;background:none;border:0';
        this.appendChild(el);
        return el;
      };
      this._overlays = {
        home: mkOverlay('button', 'piso9 studio — channel 9'),
        work: mkOverlay('button', 'work — channel 1'),
        contact: mkOverlay('button', 'contact — channel 0'),
        cta: mkOverlay('button', 'see our work'),
        cta2: mkOverlay('button', 'contact us — channel 0'),
        prev: mkOverlay('button', 'channel down'),
        next: mkOverlay('button', 'channel up'),
        visit: mkOverlay('a', 'visit project site'),
        mailto: mkOverlay('a', 'email hola@piso9.studio', 'mailto:hola@piso9.studio')
      };
      this._overlays.visit.target = '_blank';
      this._overlays.visit.rel = 'noopener';
      const wire = (key, target) => this._overlays[key].addEventListener('click', (e) => {
        e.preventDefault();
        this.switchChannel(typeof target === 'string' ? this._indexOf(target) : this._chIndex + target);
      });
      wire('home', 'home'); wire('work', 'project'); wire('cta', 'project');
      wire('contact', 'contact'); wire('cta2', 'contact');
      wire('prev', -1); wire('next', +1);

      // screen-reader announcement of the active channel
      this._live = document.createElement('div');
      this._live.setAttribute('aria-live', 'polite');
      this._live.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';
      this.appendChild(this._live);

      this._mouse = { x: 0.5, y: 0.5 };
      this._pts = new Float32Array(N * 4);
      this._ages = new Float32Array(N).fill(1);
      this._head = 0;
      this._last = null;

      const gl = this._canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
      if (!gl) { this._fallback(); return; }
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
      gl.useProgram(prog);
      this._prog = prog;

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'aPos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      this._u = {};
      ['uTex', 'uTexUI', 'uRes', 'uTime', 'uStrength', 'uGrain', 'uMouse', 'uPts', 'uAges', 'uAccent', 'uCrt', 'uBoot', 'uSwitch'].forEach(n => {
        this._u[n] = gl.getUniformLocation(prog, n);
      });

      const mkTex = (unit, uniform) => {
        const t = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.uniform1i(this._u[uniform], unit);
        return t;
      };
      this._tex = mkTex(0, 'uTex');
      this._texUI = mkTex(1, 'uTexUI');
      gl.activeTexture(gl.TEXTURE0);

      this._onMove = (e) => {
        const r = this.getBoundingClientRect();
        if (r.width === 0) return;
        const x = (e.clientX - r.left) / r.width;
        const y = 1 - (e.clientY - r.top) / r.height;
        const now = performance.now();
        if (this._last) {
          const dt = Math.max(now - this._last.t, 1);
          let vx = (x - this._last.x) / dt * 24;
          let vy = (y - this._last.y) / dt * 24;
          const mag = Math.hypot(vx, vy);
          const cap = 0.09;
          if (mag > cap) { vx = vx / mag * cap; vy = vy / mag * cap; }
          if (mag > 0.0004) {
            const i = this._head;
            this._pts[i * 4] = x; this._pts[i * 4 + 1] = y;
            this._pts[i * 4 + 2] = vx; this._pts[i * 4 + 3] = vy;
            this._ages[i] = 0;
            this._head = (i + 1) % N;
          }
        }
        this._last = { x, y, t: now };
        this._mouse.x = x; this._mouse.y = y;
      };
      window.addEventListener('pointermove', this._onMove, { passive: true });

      this._onKey = (e) => {
        if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
        if (e.key === 'ArrowUp') { e.preventDefault(); this.switchChannel(this._chIndex + 1); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); this.switchChannel(this._chIndex - 1); }
      };
      window.addEventListener('keydown', this._onKey);

      // wheel + vertical touch swipe also change channels (with a cooldown so
      // trackpad inertia doesn't skip several channels per flick)
      this._onWheel = (e) => {
        e.preventDefault();
        if (performance.now() - this._lastNav < 700) { this._wAcc = 0; return; }
        this._wAcc = (this._wAcc || 0) + e.deltaY;
        if (Math.abs(this._wAcc) > 90) {
          this.switchChannel(this._chIndex + (this._wAcc > 0 ? 1 : -1));
          this._wAcc = 0;
        }
      };
      this.addEventListener('wheel', this._onWheel, { passive: false });
      this._onPDown = (e) => { if (e.pointerType === 'touch') this._tY = e.clientY; };
      this._onPUp = (e) => {
        if (e.pointerType === 'touch' && this._tY != null) {
          const dy = e.clientY - this._tY;
          if (Math.abs(dy) > 48) this.switchChannel(this._chIndex + (dy < 0 ? 1 : -1));
        }
        this._tY = null;
      };
      this.addEventListener('pointerdown', this._onPDown);
      this.addEventListener('pointerup', this._onPUp);
      this.style.touchAction = 'pinch-zoom';

      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(this);
      this._resize();

      // redraw once the webfonts (Orbitron / VT323 / Satoshi) arrive
      if (document.fonts) {
        Promise.all([
          document.fonts.load('700 100px "Orbitron"'),
          document.fonts.load('400 20px "VT323"'),
          document.fonts.load('500 17px "Satoshi"')
        ]).then(() => this._drawChannel()).catch(() => { });
        document.fonts.ready.then(() => this._drawChannel()).catch(() => { });
      }

      this._t0 = performance.now();
      this._reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this._tPrev = this._t0;
      const loop = (now) => {
        this._raf = requestAnimationFrame(loop);
        this._frame(now);
      };
      this._raf = requestAnimationFrame(loop);
    }

    disconnectedCallback() {
      cancelAnimationFrame(this._raf);
      if (this._ro) this._ro.disconnect();
      window.removeEventListener('pointermove', this._onMove);
      window.removeEventListener('keydown', this._onKey);
      this.removeEventListener('wheel', this._onWheel);
      this.removeEventListener('pointerdown', this._onPDown);
      this.removeEventListener('pointerup', this._onPUp);
      this._booted = false;
    }

    attributeChangedCallback() {
      if (this._gl) this._drawChannel();
    }

    get accent() { return this.getAttribute('accent') || '#ff8c00'; }
    get strengthVal() { const v = parseFloat(this.getAttribute('strength')); return isNaN(v) ? 1 : v; }
    get grainVal() { return this.getAttribute('grain') === 'off' ? 0 : 1; }
    get crtVal() {
      // TV effect off on small screens — the barrel + scanlines don't read well on mobile
      if (this.clientWidth < 720) return 0;
      return this.getAttribute('crt') === 'off' ? 0 : 1;
    }

    // --- channels ---------------------------------------------------------

    _initialIndex() {
      const h = (location.hash || '').toLowerCase();
      const m = h.match(/^#ch(\d+)$/);
      if (m) {
        const i = this._channels.findIndex(c => c.id === +m[1]);
        if (i >= 0) return i;
      }
      if (h === '#work') return Math.max(this._indexOf('project'), 0);
      if (h === '#contact') return Math.max(this._indexOf('contact'), 0);
      return 0;
    }

    _indexOf(type) {
      return this._channels.findIndex(c => c.type === type);
    }

    switchChannel(idx) {
      const n = this._channels.length;
      idx = ((idx % n) + n) % n;
      if (idx === this._chIndex && this._swapped) return;
      if (this._switchT0 >= 0 && performance.now() - this._switchT0 < SWITCH_S * 1000 + 50) return;
      // prefetch the target's screenshot and its neighbors'
      [idx, idx - 1, idx + 1].forEach(i => {
        const c = this._channels[((i % n) + n) % n];
        if (c.type === 'project') this._loadImage(c.data);
      });
      this._lastNav = performance.now();
      if (this._reduced) {
        this._chIndex = idx;
        this._drawChannel();
        this._afterSwap();
        return;
      }
      this._switchT0 = performance.now();
      this._pendingIdx = idx;
      this._swapped = false;
    }

    _afterSwap() {
      const ch = this._channels[this._chIndex];
      const p = ch.data;
      this._live.textContent = 'CH ' + ch.id + (p ? ' — ' + p.title : ch.type === 'contact' ? ' — CONTACT' : ' — PISO9 STUDIO');
      if (history.replaceState) history.replaceState(null, '', '#ch' + ch.id);
    }

    _loadImage(p) {
      if (p._img || p._loading) return;
      p._loading = true;
      const img = new Image();
      img.decoding = 'async';
      img.src = p.img;
      const done = () => {
        p._img = img;
        const ch = this._channels[this._chIndex];
        if (ch && ch.data === p && this._gl) this._drawChannel();
      };
      if (img.decode) img.decode().then(done).catch(() => {
        if (img.complete && img.naturalWidth) done();
        else img.onload = done;
      });
      else img.onload = done;
    }

    _accentVec() {
      const h = this.accent.replace('#', '');
      const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
      return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }

    _resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(this.clientWidth, 2), h = Math.max(this.clientHeight, 2);
      this._canvas.width = Math.round(w * dpr);
      this._canvas.height = Math.round(h * dpr);
      this._gl.viewport(0, 0, this._canvas.width, this._canvas.height);
      this._drawChannel();
    }

    _wrap(x, text, maxW) {
      const lines = [];
      let cur = '';
      for (const wd of text.split(' ')) {
        const t = cur ? cur + ' ' + wd : wd;
        if (x.measureText(t).width > maxW && cur) { lines.push(cur); cur = wd; }
        else cur = t;
      }
      if (cur) lines.push(cur);
      return lines;
    }

    // screenshot box for a project channel, aspect-fitted from JSON dimensions
    _projectImgRect(p, w, h, dpr, narrow) {
      const bx = narrow ? 36 * dpr : w * 0.53;
      const by = narrow ? h * 0.14 : h * 0.22;
      const bw = narrow ? w - 72 * dpr : w * 0.38;
      const bh = narrow ? h * 0.34 : h * 0.56;
      const iw = p.imgW || 4, ih = p.imgH || 3;
      const s = Math.min(bw / iw, bh / ih);
      return [bx + (bw - iw * s) / 2, by + (bh - ih * s) / 2, iw * s, ih * s];
    }

    // boxed ▲/▼ channel controls, bottom-right; returns their hit rects
    _drawArrowBoxes(x, w, h, dpr, hint) {
      const bs = 26 * dpr, gap = 8 * dpr, pad = 36 * dpr;
      const bx = w - pad - bs;
      const dnY = h - pad - bs;
      const upY = dnY - gap - bs;
      x.strokeStyle = '#262626';
      x.lineWidth = Math.max(1, Math.round(dpr));
      x.strokeRect(bx + 0.5, upY + 0.5, bs - 1, bs - 1);
      x.strokeRect(bx + 0.5, dnY + 0.5, bs - 1, bs - 1);
      x.fillStyle = '#a3a3a3';
      const tw = 10 * dpr, th = 6 * dpr, cx = bx + bs / 2;
      let cy = upY + bs / 2;
      x.beginPath();
      x.moveTo(cx, cy - th / 2); x.lineTo(cx - tw / 2, cy + th / 2); x.lineTo(cx + tw / 2, cy + th / 2);
      x.closePath(); x.fill();
      cy = dnY + bs / 2;
      x.beginPath();
      x.moveTo(cx - tw / 2, cy - th / 2); x.lineTo(cx + tw / 2, cy - th / 2); x.lineTo(cx, cy + th / 2);
      x.closePath(); x.fill();
      if (hint) {
        const prevBase = x.textBaseline;
        x.textBaseline = 'alphabetic';
        setF(x, '500 ' + (10 * dpr) + 'px ' + STACK, 0.16 * 10 * dpr);
        x.fillStyle = '#808080';
        const t = 'SCROLL';
        x.fillText(t, bx + bs - x.measureText(t).width, upY - 12 * dpr);
        x.textBaseline = prevBase;
      }
      return { next: [bx, upY, bs, bs], prev: [bx, dnY, bs, bs] };
    }

    _drawChannel() {
      if (!this._gl) return;
      const ch = this._channels[this._chIndex];
      if (ch.type === 'project') this._loadImage(ch.data);
      this._drawTex(ch);
      this._drawUI(ch);
    }

    // content layer (uTex): gets the mouse-trail distortion + chromatic aberration
    _drawTex(ch) {
      const gl = this._gl;
      const w = this._canvas.width, h = this._canvas.height;
      if (!w || !h) return;
      const c = this._txtCanvas || (this._txtCanvas = document.createElement('canvas'));
      c.width = w; c.height = h;
      const x = c.getContext('2d');
      x.fillStyle = '#000';
      x.fillRect(0, 0, w, h);
      const dpr = w / Math.max(this.clientWidth, 1);
      const narrow = this.clientWidth < 720;

      if (ch.type === 'home') {
        const T = 'PISO9';
        setF(x, '700 100px "Orbitron", ' + STACK);
        const base = x.measureText(T).width;
        const size = Math.min(100 * (w * (narrow ? 0.84 : 0.74)) / base, h * 0.36);
        setF(x, '700 ' + size + 'px "Orbitron", ' + STACK);
        x.textBaseline = 'middle';
        const total = x.measureText(T).width;
        const wPiso = x.measureText('PISO').width;
        const x0 = (w - total) / 2, y0 = h * 0.42;
        x.fillStyle = '#fafafa';
        x.fillText('PISO', x0, y0);
        x.fillStyle = this.accent;
        x.fillText('9', x0 + wPiso, y0);
        x.textBaseline = 'alphabetic';
        this._wmBottom = y0 + size * 0.40; // for the tagline/copy drawn in _drawUI
      } else if (ch.type === 'project') {
        const p = ch.data;
        const [fx, fy, fw, fh] = this._projectImgRect(p, w, h, dpr, narrow);
        if (p._img) {
          x.drawImage(p._img, fx, fy, fw, fh);
        } else {
          x.fillStyle = '#141414';
          x.fillRect(fx, fy, fw, fh);
          setF(x, '400 ' + (19 * dpr) + 'px ' + MONO);
          x.fillStyle = '#808080';
          x.textBaseline = 'middle';
          const lt = 'LOADING ...';
          x.fillText(lt, fx + (fw - x.measureText(lt).width) / 2, fy + fh / 2);
          x.textBaseline = 'alphabetic';
        }
        x.strokeStyle = '#262626';
        x.lineWidth = Math.max(1, Math.round(dpr));
        x.strokeRect(fx + 0.5, fy + 0.5, fw - 1, fh - 1);
      }

      gl.bindTexture(gl.TEXTURE_2D, this._tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    }

    // UI layer (uTexUI): drawn into its own texture — gets the tube shape
    // (barrel, scanlines, vignette) but is never displaced by the mouse trail
    _drawUI(ch) {
      const gl = this._gl;
      const w = this._canvas.width, h = this._canvas.height;
      if (!w || !h) return;
      const c = this._uiCanvas || (this._uiCanvas = document.createElement('canvas'));
      c.width = w; c.height = h;
      const x = c.getContext('2d');
      x.fillStyle = '#000';
      x.fillRect(0, 0, w, h);
      const dpr = w / Math.max(this.clientWidth, 1);
      const narrow = this.clientWidth < 720;
      const padX = 36 * dpr;
      const rects = {};

      // nav — hidden on home; PISO9 wordmark as logo, roomier vertical padding
      if (ch.type !== 'home') {
        x.textBaseline = 'top';
        const navY = 44 * dpr;
        const logoSize = 20 * dpr;
        setF(x, '700 ' + logoSize + 'px "Orbitron", ' + STACK);
        x.fillStyle = '#fafafa';
        x.fillText('PISO', padX, navY);
        const wP = x.measureText('PISO').width;
        x.fillStyle = this.accent;
        x.fillText('9', padX + wP, navY);
        const wLogo = wP + x.measureText('9').width;
        rects.home = [padX, navY - 6 * dpr, wLogo, 32 * dpr];

        setF(x, '500 ' + (16 * dpr) + 'px ' + STACK);
        x.fillStyle = '#a3a3a3';
        const gap = 36 * dpr;
        const linkY = navY + 3 * dpr;
        const wc = x.measureText('contact').width;
        const ww = x.measureText('work').width;
        x.fillText('contact', w - padX - wc, linkY);
        x.fillText('work', w - padX - wc - gap - ww, linkY);
        rects.work = [w - padX - wc - gap - ww, linkY - 4 * dpr, ww, 24 * dpr];
        rects.contact = [w - padX - wc, linkY - 4 * dpr, wc, 24 * dpr];
      }

      if (ch.type === 'home') {
        // tagline + copy under the wordmark, like a standard hero
        const capL = this.getAttribute('caption-left') || this.getAttribute('captionleft') || '';
        const capC = this.getAttribute('caption-copy') || this.getAttribute('captioncopy') || '';
        let cy = (this._wmBottom || h * 0.55) + 44 * dpr;
        x.textBaseline = 'alphabetic';
        if (capL) {
          setF(x, '500 ' + (16 * dpr) + 'px ' + STACK, 0.02 * 16 * dpr);
          x.fillStyle = '#a3a3a3';
          x.fillText(capL, (w - x.measureText(capL).width) / 2, cy);
          cy += 30 * dpr;
        }
        if (capC && !(narrow && this.clientHeight < 620)) {
          setF(x, '400 ' + (13.5 * dpr) + 'px ' + STACK);
          x.fillStyle = '#808080';
          const cmw = Math.min(520 * dpr, w - 2 * padX);
          for (const ln of this._wrap(x, capC, cmw)) {
            x.fillText(ln, (w - x.measureText(ln).width) / 2, cy);
            cy += 13.5 * 1.6 * dpr;
          }
        }

        // CTA row — 00s TV OSD-style bracketed menu items (primary + secondary)
        const ctaTxt = '[ SEE OUR WORK ]', cta2Txt = '[ CONTACT US ]';
        setF(x, '400 ' + (19 * dpr) + 'px ' + MONO, 0.1 * 19 * dpr);
        const w1c = x.measureText(ctaTxt).width;
        const w2c = x.measureText(cta2Txt).width;
        const pillH = 20 * dpr;
        x.textBaseline = 'middle';
        if (narrow) {
          const y1 = h * 0.72, y2 = y1 + 40 * dpr;
          x.fillStyle = this.accent;
          x.fillText(ctaTxt, (w - w1c) / 2, y1 + pillH / 2);
          x.fillStyle = '#a3a3a3';
          x.fillText(cta2Txt, (w - w2c) / 2, y2 + pillH / 2);
          rects.cta = [(w - w1c) / 2, y1, w1c, pillH];
          rects.cta2 = [(w - w2c) / 2, y2, w2c, pillH];
        } else {
          const gapC = 48 * dpr;
          const x1 = (w - w1c - gapC - w2c) / 2, y1 = h * 0.74;
          x.fillStyle = this.accent;
          x.fillText(ctaTxt, x1, y1 + pillH / 2);
          x.fillStyle = '#a3a3a3';
          x.fillText(cta2Txt, x1 + w1c + gapC, y1 + pillH / 2);
          rects.cta = [x1, y1, w1c, pillH];
          rects.cta2 = [x1 + w1c + gapC, y1, w2c, pillH];
        }
        x.textBaseline = 'alphabetic';
      } else if (ch.type === 'project') {
        const p = ch.data;
        const [fx, fy, fw, fh] = this._projectImgRect(p, w, h, dpr, narrow);
        const lx = narrow ? padX : w * 0.09;
        const colW = narrow ? w - 2 * padX : Math.min(w * 0.38, 560 * dpr);
        let yy = narrow ? fy + fh + 26 * dpr : h * 0.22;
        x.textBaseline = 'top';

        setF(x, '500 ' + (13 * dpr) + 'px ' + STACK, 0.14 * 13 * dpr);
        x.fillStyle = this.accent;
        x.fillText('>> SELECTED WORK', lx, yy);
        yy += 36 * dpr;

        let tSize = (narrow ? 22 : 30) * dpr;
        setF(x, '700 ' + tSize + 'px "Orbitron", ' + STACK, 0.02 * tSize);
        const tw = x.measureText(p.title).width;
        if (tw > colW) {
          tSize = tSize * colW / tw;
          setF(x, '700 ' + tSize + 'px "Orbitron", ' + STACK, 0.02 * tSize);
        }
        x.fillStyle = '#fafafa';
        x.fillText(p.title, lx, yy);
        yy += tSize * 1.5;

        setF(x, '500 ' + (12 * dpr) + 'px ' + STACK, 0.08 * 12 * dpr);
        x.fillStyle = '#808080';
        x.fillText(p.year || '', lx, yy);
        yy += 34 * dpr;

        const dSize = narrow ? 15 : 16;
        setF(x, '400 ' + (dSize * dpr) + 'px ' + STACK);
        x.fillStyle = '#a3a3a3';
        for (const ln of this._wrap(x, p.desc || '', colW)) { x.fillText(ln, lx, yy); yy += dSize * 1.6 * dpr; }
        yy += 14 * dpr;

        setF(x, '500 ' + (12 * dpr) + 'px ' + STACK, 0.06 * 12 * dpr);
        x.fillStyle = '#808080';
        for (const ln of this._wrap(x, p.meta || '', colW)) { x.fillText(ln, lx, yy); yy += 12 * 1.7 * dpr; }
        yy += 24 * dpr;

        const vTxt = '[ VISIT SITE ]';
        setF(x, '400 ' + (19 * dpr) + 'px ' + MONO, 0.1 * 19 * dpr);
        x.fillStyle = this.accent;
        x.fillText(vTxt, lx, yy);
        rects.visit = [lx, yy, x.measureText(vTxt).width, 22 * dpr];
        this._overlays.visit.href = p.url;
        x.textBaseline = 'alphabetic';
      } else if (ch.type === 'contact') {
        x.textBaseline = 'top';
        const cy0 = h * 0.28;
        setF(x, '500 ' + (13 * dpr) + 'px ' + STACK, 0.14 * 13 * dpr);
        x.fillStyle = this.accent;
        let t = '>> CONTACT';
        x.fillText(t, (w - x.measureText(t).width) / 2, cy0);

        const tSize = (narrow ? 26 : 34) * dpr;
        setF(x, '700 ' + tSize + 'px "Orbitron", ' + STACK, 0.01 * tSize);
        const t1 = "Let's build together";
        const w1 = x.measureText(t1).width;
        const cx0 = (w - w1 - x.measureText('.').width) / 2;
        const ty = cy0 + 36 * dpr;
        x.fillStyle = '#fafafa';
        x.fillText(t1, cx0, ty);
        x.fillStyle = this.accent;
        x.fillText('.', cx0 + w1, ty);

        setF(x, '400 ' + (16 * dpr) + 'px ' + STACK);
        x.fillStyle = '#a3a3a3';
        t = 'One project at a time. Tell us about yours.';
        x.fillText(t, (w - x.measureText(t).width) / 2, ty + tSize * 1.6);

        // mailto CTA button + the address itself in small type below it
        const bTxt = '[ CONTACT US ]';
        setF(x, '400 ' + (21 * dpr) + 'px ' + MONO, 0.1 * 21 * dpr);
        x.fillStyle = this.accent;
        const bW = x.measureText(bTxt).width;
        const bY = ty + tSize * 1.6 + 58 * dpr;
        x.fillText(bTxt, (w - bW) / 2, bY);

        setF(x, '500 ' + (13 * dpr) + 'px ' + STACK, 0.06 * 13 * dpr);
        x.fillStyle = '#808080';
        t = 'hola@piso9.studio';
        const eW = x.measureText(t).width;
        const eY = bY + 42 * dpr;
        x.fillText(t, (w - eW) / 2, eY);
        x.textBaseline = 'alphabetic';
        const mW = Math.max(bW, eW);
        rects.mailto = [(w - mW) / 2, bY - 6 * dpr, mW, eY + 20 * dpr - bY];
      }

      // channel up/down: small boxed arrows, bottom-right (paths — VT323's
      // latin subset has no ▲▼); on home a SCROLL hint sits above them
      Object.assign(rects, this._drawArrowBoxes(x, w, h, dpr, ch.type === 'home'));

      // channel indicator, bottom-left
      const pad = 36 * dpr;
      x.textBaseline = 'alphabetic';
      setF(x, '600 ' + (13 * dpr) + 'px ' + STACK, 0.18 * 13 * dpr);
      x.fillStyle = this.accent;
      x.fillText('CH ' + ch.id, pad, h - pad - 14 * dpr);

      this._uiRects = rects;
      this._placeLinks();

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this._texUI);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      gl.activeTexture(gl.TEXTURE0);
    }

    // texture px -> screen CSS px through the inverse of the shader's barrel map
    _screenPos(px, py) {
      const w = this._canvas.width, h = this._canvas.height;
      const k = 0.22 * this.crtVal; // must match the shader's 0.10*2.2 barrel factor
      const ux = px / w, uy = 1 - py / h;
      let sx = ux, sy = uy;
      for (let i = 0; i < 4; i++) {
        const cx = sx - 0.5, cy = sy - 0.5;
        const f = 1 + k * (cx * cx + cy * cy);
        sx = 0.5 + (ux - 0.5) / f;
        sy = 0.5 + (uy - 0.5) / f;
      }
      const dpr = w / Math.max(this.clientWidth, 1);
      return [sx * w / dpr, (1 - sy) * h / dpr];
    }

    _placeLinks() {
      if (!this._overlays || !this._uiRects) return;
      for (const key in this._overlays) {
        const a = this._overlays[key];
        const r = this._uiRects[key];
        if (!r) { a.style.display = 'none'; continue; }
        const [x1, y1] = this._screenPos(r[0], r[1]);
        const [x2, y2] = this._screenPos(r[0] + r[2], r[1] + r[3]);
        const padHit = (key === 'prev' || key === 'next') ? 14 : 8;
        a.style.display = 'block';
        a.style.left = (Math.min(x1, x2) - padHit) + 'px';
        a.style.top = (Math.min(y1, y2) - padHit) + 'px';
        a.style.width = (Math.abs(x2 - x1) + padHit * 2) + 'px';
        a.style.height = (Math.abs(y2 - y1) + padHit * 2) + 'px';
      }
    }

    _frame(now) {
      const gl = this._gl;
      const dt = Math.min((now - this._tPrev) / 1000, 0.05);
      this._tPrev = now;
      for (let i = 0; i < N; i++) {
        if (this._ages[i] < 1) this._ages[i] = Math.min(this._ages[i] + dt * 0.9, 1);
      }
      // channel-switch static burst: envelope on CPU, swap content at the peak
      let sw = 0;
      if (this._switchT0 >= 0) {
        const ts = (now - this._switchT0) / 1000;
        if (!this._swapped && ts >= 0.15) {
          this._chIndex = this._pendingIdx;
          this._swapped = true;
          this._drawChannel();
          this._afterSwap();
        }
        if (ts < SWITCH_S) sw = sstep(0, 0.10, ts) * (1 - sstep(0.28, SWITCH_S, ts));
        else if (this._swapped) this._switchT0 = -1;
      }
      gl.uniform1f(this._u.uSwitch, sw);
      gl.uniform2f(this._u.uRes, this._canvas.width, this._canvas.height);
      gl.uniform1f(this._u.uTime, (now - this._t0) / 1000);
      gl.uniform1f(this._u.uStrength, this.strengthVal);
      gl.uniform1f(this._u.uGrain, this.grainVal);
      gl.uniform1f(this._u.uCrt, this.crtVal);
      gl.uniform1f(this._u.uBoot, this._reduced ? 10 : Math.min((now - this._t0) / 1000, 10));
      gl.uniform2f(this._u.uMouse, this._mouse.x, this._mouse.y);
      gl.uniform4fv(this._u.uPts, this._pts);
      gl.uniform1fv(this._u.uAges, this._ages);
      const a = this._accentVec();
      gl.uniform3f(this._u.uAccent, a[0], a[1], a[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    _fallback() {
      // no WebGL: restore the plain scrollable page hidden by the tv-only class
      document.documentElement.classList.remove('p9-tv');
      this.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:600 14vw ui-sans-serif,system-ui,sans-serif;letter-spacing:-0.03em;color:#fafafa">PISO<span style="color:' + this.accent + '">9</span></div>';
    }
  }

  customElements.define('piso9-hero', Piso9Hero);
})();
