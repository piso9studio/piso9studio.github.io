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
