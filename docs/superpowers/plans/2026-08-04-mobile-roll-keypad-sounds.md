# Mobile Vertical Roll + Keypad Easter Egg + UI Sounds — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En mobile el canal sigue el dedo como vertical roll de CRT; el keypad del control remoto de la intro sintoniza el canal de arranque; toda la UI suena con cues Web Audio sintetizados y muteables.

**Architecture:** Tres features sobre los dos custom elements existentes. `js/hero.js` gana un mini synth (`makeSfx`, espejo del `makeAudio` de `intro.js` — NO se comparte módulo), un uniform `uDragY` en el fragment shader que desplaza el sampleo de las dos texturas, y una fila SOUND en el panel OSD. `js/intro.js` gana hit-testing por proyección 3D→2D para keypad/d-pad (misma matemática que `_powerScreen`) y pasa el canal elegido por `CustomEvent('p9:power-on', {detail:{ch}})`.

**Tech Stack:** Vanilla JS + WebGL1 + Canvas 2D + Web Audio. **No hay test runner** (zero-build): cada task cierra con verificación manual en browser servida con `npx -y http-server -p 8080 -c-1` desde la raíz del repo.

## Global Constraints

- Zero-build: sin `package.json`, sin dependencias nuevas, sin archivos JS nuevos.
- Estilos solo en `css/main.css` con clases — **no estilos inline** (no aplica: no se anticipa CSS nuevo).
- Wording SIEMPRE en **ambos** JSON `#p9-i18n-en` y `#p9-i18n-es` de `index.html`, mismas keys.
- El hint del home se dibuja con Satoshi (`STACK`) — tildes OK; NUNCA usar ▲▼↗ en strings VT323 (`MONO`), el subset no los tiene.
- El barrel del shader del hero (`0.10*2.2`) debe seguir igual al `k=0.22` de `_screenPos` — este plan no lo toca.
- `localStorage` keys: existente `p9-lang`; nueva `p9-sound` (`'on'`/`'off'`, default on). Todo acceso a localStorage va en `try/catch` (patrón existente).
- Presupuesto: cero requests nuevos; el crecimiento total de JS debe quedar bajo ~6 KB sin minificar.
- Todos los cues de audio < 150 ms, master gain del hero 0.15.
- Probar cada task en desktop (>720px) y mobile (<720px, DevTools device emulation con touch) antes de commitear.

---

### Task 1: SFX kit + cues en `js/hero.js`

**Files:**
- Modify: `js/hero.js` (helpers arriba del class, `connectedCallback`, `switchChannel`, `_setLang`, handler de menú)

**Interfaces:**
- Produces: factory `makeSfx()` (module-level) → `{ resume(), tick(), tune(), pop(), popDown(), confirm() }` o `null`; método `this._sfx(cueName)` que respeta `localStorage['p9-sound']` y crea el kit lazy. Task 2 dibuja el toggle que lo mutea; Task 3 no lo usa; Task 4 no lo usa.

- [ ] **Step 1: Agregar la factory `makeSfx` a nivel módulo**

En `js/hero.js`, después del helper `setF` (línea ~107, antes de `class Piso9Hero`):

```js
  // UI sfx — cues sintetizados estilo intro.js/makeAudio: cortos (<150ms),
  // volumen bajo, cero assets. El AudioContext se crea lazy en el primer
  // gesto con user activation; si quedó suspended (p. ej. wheel), el cue
  // se saltea en silencio hasta el próximo click/tecla.
  const makeSfx = () => {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      const ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = 0.15;
      master.connect(ctx.destination);
      const noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const nd = noiseBuf.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const noise = (dur, type, freq, gain) => {
        const t = ctx.currentTime;
        const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
        const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
        const g = ctx.createGain(); g.gain.value = 0;
        src.connect(f); f.connect(g); g.connect(master);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(gain, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.start(t); src.stop(t + dur + 0.05);
      };
      const tone = (f0, f1, dur, gain, type) => {
        const t = ctx.currentTime;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f0, t);
        if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
        g.gain.setValueAtTime(gain, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g); g.connect(master);
        o.start(t); o.stop(t + dur + 0.02);
      };
      return {
        resume() {
          if (ctx.state === 'suspended') ctx.resume().catch(() => { });
          return ctx.state === 'running';
        },
        tick() { tone(1800, 1400, 0.03, 0.10, 'square'); },
        tune() { tone(220, 880, 0.09, 0.06, 'square'); noise(0.12, 'highpass', 3500, 0.10); },
        pop() { tone(500, 900, 0.06, 0.09, 'triangle'); },
        popDown() { tone(900, 500, 0.06, 0.09, 'triangle'); },
        confirm() { tone(700, 700, 0.05, 0.07, 'square'); setTimeout(() => tone(1050, 1050, 0.06, 0.07, 'square'), 70); }
      };
    } catch (e) { return null; }
  };
```

- [ ] **Step 2: Agregar el método `_sfx` al class**

Después de `_setLang` (línea ~441):

```js
    _sfx(cue) {
      let on = 'on';
      try { on = localStorage.getItem('p9-sound') || 'on'; } catch (e) { }
      if (on === 'off') return;
      if (this._sfxKit === undefined) this._sfxKit = makeSfx();
      const k = this._sfxKit;
      if (k && k.resume()) k[cue]();
    }
```

- [ ] **Step 3: Cablear los cues**

(a) `tune` en `switchChannel` — después de `this._lastNav = performance.now();` (línea ~470) y ANTES del branch `if (this._reduced)` para que suene en ambos caminos:

```js
      this._lastNav = performance.now();
      this._menuOpen = false;
      this._sfx('tune');
```

(b) `tick` en pointerdown de overlays — en `connectedCallback`, después del loop que crea los overlays `proj` (línea ~185, después del `for (let i = 0; i < projCount; i++) {...}`). Excluye `panel` (no clickeable) y `menu` (tiene pop propio); en touch no suena (el swipe empieza con pointerdown y sería ruido):

```js
      // tick sutil al presionar cualquier control clickeable (solo mouse/pen:
      // en touch el pointerdown también inicia swipes y sería ruido)
      for (const key in this._overlays) {
        if (key === 'panel' || key === 'menu') continue;
        this._overlays[key].addEventListener('pointerdown', (e) => {
          if (e.pointerType !== 'touch') this._sfx('tick');
        });
      }
```

(c) `pop`/`popDown` en el handler del menú (línea ~222) — queda así:

```js
      this._overlays.menu.addEventListener('click', (e) => {
        e.preventDefault();
        this._menuOpen = !this._menuOpen;
        this._sfx(this._menuOpen ? 'pop' : 'popDown');
        this._drawChannel();
      });
```

(d) `popDown` en los otros dos cierres del menú — en `_onKey` (Escape, línea ~317):

```js
        else if (e.key === 'Escape' && this._menuOpen) { this._menuOpen = false; this._sfx('popDown'); this._drawChannel(); }
```

y en `_onDocDown` (click afuera, línea ~326):

```js
        this._menuOpen = false;
        this._sfx('popDown');
        this._drawChannel();
```

(e) `confirm` en `_setLang` — después de la línea `if (window.posthog) posthog.capture('language_switched', ...)`:

```js
      this._sfx('confirm');
```

- [ ] **Step 4: Verificar en browser**

Correr `npx -y http-server -p 8080 -c-1` en la raíz y abrir `http://localhost:8080` (la intro aparece: apretar power y esperar el handoff, o agregar `#ch9` a la URL para saltearla). Verificar:
- Cambiar de canal (rueda, flechas, ▲▼): suena el blip de sintonía junto con el burst de static.
- Click en cualquier CTA/nav/▲▼: tick sutil al presionar.
- MENU: pop al abrir, pop descendente al cerrar (botón, Escape y click afuera).
- Cambiar EN↔ES: doble blip.
- `localStorage.setItem('p9-sound','off')` en consola → todo mudo; `'on'` → vuelve.
- Consola sin errores; sin WebGL (forzar con `about:blank`? no — basta chequear que `_fallback` no cambió) no aplica a esta task.

- [ ] **Step 5: Commit**

```bash
git add js/hero.js
git commit -m "Sonidos de UI sintetizados en el hero: sintonia, ticks, menu e idioma"
```

---

### Task 2: Fila SOUND ON/OFF en el OSD + gate en la intro

**Files:**
- Modify: `js/hero.js` (`connectedCallback` overlays, `_onDocDown`, `_drawUI` panel OSD, métodos nuevos)
- Modify: `js/intro.js` (`_press` → `_ensureAudio`)
- Modify: `index.html` (keys `sound`/`soundOn`/`soundOff` en ambos JSON)

**Interfaces:**
- Consumes: `this._sfx(cue)` de Task 1.
- Produces: `this._soundOn()` → bool y `this._setSound(bool)` en el hero; `this._ensureAudio()` → objeto audio o `null` en la intro (Task 4 lo consume para beeps del keypad).

- [ ] **Step 1: i18n en `index.html`**

En `#p9-i18n-en` (línea ~214), la línea del menú queda:

```json
      "menu": "MENU", "settings": "SETTINGS", "language": "LANGUAGE",
      "sound": "SOUND", "soundOn": "ON", "soundOff": "OFF"
```

En `#p9-i18n-es` (línea ~242) — ON/OFF quedan igual (jerga de OSD de tele):

```json
      "menu": "MENÚ", "settings": "AJUSTES", "language": "IDIOMA",
      "sound": "SONIDO", "soundOn": "ON", "soundOff": "OFF"
```

- [ ] **Step 2: Overlays y handlers en `js/hero.js`**

(a) En el objeto `this._overlays` (línea ~174, antes de `panel`):

```js
        soundOn: mkOverlay('button', 'sound on'),
        soundOff: mkOverlay('button', 'sound off'),
```

(b) Junto a los handlers de langEn/langEs (línea ~228):

```js
      this._overlays.soundOn.addEventListener('click', (e) => { e.preventDefault(); this._setSound(true); });
      this._overlays.soundOff.addEventListener('click', (e) => { e.preventDefault(); this._setSound(false); });
```

(c) En `_onDocDown` (línea ~325) el whitelist de targets que NO cierran el panel gana los dos botones:

```js
        if (e.target === o.menu || e.target === o.langEn || e.target === o.langEs ||
          e.target === o.soundOn || e.target === o.soundOff || e.target === o.panel) return;
```

(d) Métodos nuevos, después de `_sfx`:

```js
    _soundOn() {
      try { return localStorage.getItem('p9-sound') !== 'off'; } catch (e) { return true; }
    }

    _setSound(on) {
      try { localStorage.setItem('p9-sound', on ? 'on' : 'off'); } catch (e) { }
      if (on) this._sfx('confirm'); // feedback audible solo al prender
      if (window.posthog) posthog.capture('sound_toggled', { on });
      this._drawChannel();
    }
```

- [ ] **Step 3: Dibujar la fila en el panel OSD (`_drawUI`)**

El panel (línea ~920) crece de 72 a 100dpr de alto. `const pw = 210 * dpr, ph = 72 * dpr;` pasa a:

```js
        const pw = 210 * dpr, ph = 100 * dpr;
```

Después del bloque de EN/ES (tras `rects.langEs = ...`, línea ~949) y antes de `rects.panel`, insertar la fila SOUND (mismo patrón visual que LANGUAGE):

```js
        setF(x, '500 ' + (12 * dpr) + 'px ' + STACK, 0.06 * 12 * dpr);
        x.fillStyle = '#a3a3a3';
        x.fillText(ui.sound || 'SOUND', pxl + 14 * dpr, pt + 68 * dpr);
        setF(x, '400 ' + (15 * dpr) + 'px ' + MONO, 0.08 * 15 * dpr);
        const onTxt = ui.soundOn || 'ON', offTxt = ui.soundOff || 'OFF';
        const offW = x.measureText(offTxt).width;
        const onW = x.measureText(onTxt).width;
        const offX = pxl + pw - 14 * dpr - offW;
        const onX = offX - 26 * dpr - onW; // gap ancho: hitboxes sin solaparse
        const oy2 = pt + 66 * dpr;
        const snd = this._soundOn();
        x.fillStyle = snd ? this.accent : '#808080';
        x.fillText(onTxt, onX, oy2);
        x.fillStyle = snd ? '#808080' : this.accent;
        x.fillText(offTxt, offX, oy2);
        rects.soundOn = [onX - 4 * dpr, oy2 - 6 * dpr, onW + 8 * dpr, 26 * dpr];
        rects.soundOff = [offX - 4 * dpr, oy2 - 6 * dpr, offW + 8 * dpr, 26 * dpr];
```

- [ ] **Step 4: Gate de audio en `js/intro.js`**

(a) Método nuevo después de `_powerScreen` (línea ~601):

```js
    _ensureAudio() {
      if (this._audio === undefined) {
        let on = true;
        try { on = localStorage.getItem('p9-sound') !== 'off'; } catch (e) { }
        this._audio = on ? makeAudio() : null;
      }
      return this._audio;
    }
```

(b) En `_press` (línea ~606), `this._audio = makeAudio();` y la línea siguiente pasan a:

```js
      const audio = this._ensureAudio();
      if (audio) audio.click();
```

(los usos posteriores de `this._audio` en `_frame`/`_handoff` quedan como están: `_ensureAudio` lo setea).

- [ ] **Step 5: Verificar en browser**

- MENU → panel más alto con LANGUAGE y SOUND; ON en naranja por default.
- Click OFF → OFF naranja, todo mudo (canal, ticks, menú). Click ON → confirm + vuelve el sonido.
- Recargar → la elección persiste; con OFF, la intro entera es muda (power incluido).
- Click adentro del panel no lo cierra; click afuera sí; EN/ES sigue funcionando.
- Repetir en <720px (el panel debe seguir entrando en pantalla — verificar que no tape los controles ▲▼; si el panel queda pegado al borde superior de los controles sigue OK porque `pt = pb - ph` crece hacia arriba).

- [ ] **Step 6: Commit**

```bash
git add js/hero.js js/intro.js index.html
git commit -m "Toggle SOUND ON/OFF en el menu OSD, persistido y compartido con la intro"
```

---

### Task 3: Vertical roll follow-finger en mobile

**Files:**
- Modify: `js/hero.js` (FRAG shader, lista de uniforms, `connectedCallback` handlers touch, `disconnectedCallback`, `_frame`, `_drawControls`)
- Modify: `index.html` (key `hintTouch` en ambos JSON)

**Interfaces:**
- Consumes: nada de tasks previas (independiente del sfx).
- Produces: uniform `uDragY` (float, fracción de alto rolleada; + = dedo hacia abajo); estado `this._rollY`, `this._rollAnim`, `this._tDrag`, `this._suppressClick`, `this._coarse`. Nada posterior los consume.

- [ ] **Step 1: Shader — uniform `uDragY` y sampleo rolleado**

(a) En `FRAG`, junto a los otros uniforms (línea ~31):

```glsl
uniform float uSwitch;
uniform float uDragY;
```

(b) Después de la línea del barrel y de `inside` (líneas ~39-40), definir la coordenada rolleada — SOLO para el sampleo de texturas; scanlines/viñeta/glow siguen fijas al tubo:

```glsl
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  // vertical roll (drag táctil): la imagen se desplaza, el tubo queda fijo;
  // la banda fuera de rango se rellena de static más abajo
  float sy = uv.y + uDragY;
  float inBand = step(0.0, sy) * step(sy, 1.0);
  vec2 suv = vec2(uv.x, sy);
```

(c) Reemplazar el sampleo de contenido (líneas ~61-63) para usar `suv`:

```glsl
  col.r = texture2D(uTex, suv - disp - ca).r;
  col.g = texture2D(uTex, suv - disp).g;
  col.b = texture2D(uTex, suv - disp + ca).b;
```

(d) Ídem la capa UI (línea ~67):

```glsl
  vec4 uiC = texture2D(uTexUI, suv);
```

(e) En el cálculo de static (línea ~78), la banda vacía es static puro y todo el cuadro gana un velo de ruido proporcional al drag (la tele "perdiendo la sintonía"):

```glsl
  float stat = max(1.0 - smoothstep(1.2, 1.8, uBoot), uSwitch);
  stat = max(stat, max(1.0 - inBand, min(abs(uDragY) * 0.8, 0.3)));
```

(f) En la lista de uniforms de JS (línea ~267), agregar `'uDragY'`:

```js
      ['uTex', 'uTexUI', 'uRes', 'uTime', 'uStrength', 'uGrain', 'uMouse', 'uPts', 'uAges', 'uAccent', 'uCrt', 'uBoot', 'uSwitch', 'uDragY'].forEach(n => {
```

- [ ] **Step 2: Reemplazar los handlers touch en `connectedCallback`**

Las líneas ~343-352 (`this._onPDown = ...` hasta `this.addEventListener('pointerup', this._onPUp);`) se reemplazan enteras por:

```js
      // touch: el canal sigue el dedo (vertical roll de tele vieja). Al soltar,
      // conmuta si superó ~15% del alto o fue un flick rápido; si no, spring a 0.
      // Cualquier drag >10px suprime el click de los overlays (fase captura).
      this._rollY = 0;
      this._rollAnim = null;
      this._suppressClick = false;
      this._onPDown = (e) => {
        if (e.pointerType !== 'touch') return;
        this._tDrag = { y0: e.clientY, y: e.clientY, t: performance.now(), v: 0, moved: false };
        this._rollAnim = null;
      };
      this._onPMove = (e) => {
        const d = this._tDrag;
        if (!d || e.pointerType !== 'touch') return;
        const now = performance.now();
        d.v = 0.8 * d.v + 0.2 * ((e.clientY - d.y) / Math.max(now - d.t, 1)); // px/ms suavizado
        d.y = e.clientY; d.t = now;
        if (Math.abs(e.clientY - d.y0) > 10) d.moved = true;
        const h = Math.max(this.clientHeight, 1);
        let f = (e.clientY - d.y0) / h;
        const lim = 0.4; // rubber-band pasando ±40%
        if (Math.abs(f) > lim) f = Math.sign(f) * (lim + (Math.abs(f) - lim) * 0.35);
        if (!this._reduced && this._switchT0 < 0) this._rollY = f;
      };
      this._onPUp = (e) => {
        const d = this._tDrag;
        this._tDrag = null;
        if (!d || e.pointerType !== 'touch') return;
        if (d.moved) {
          this._suppressClick = true;
          setTimeout(() => { this._suppressClick = false; }, 80);
        }
        const h = Math.max(this.clientHeight, 1);
        const f = (e.clientY - d.y0) / h;
        if (Math.abs(f) > 0.15 || Math.abs(d.v) > 0.5) {
          this.switchChannel(this._chIndex + (f < 0 ? 1 : -1)); // arriba = siguiente
        }
        this._rollAnim = { from: this._rollY, t0: performance.now() };
      };
      this._onPCancel = () => {
        // cancel (p. ej. el browser se queda el gesto): sin commit, solo spring
        if (!this._tDrag) return;
        this._tDrag = null;
        this._rollAnim = { from: this._rollY, t0: performance.now() };
      };
      this._onClickCap = (e) => {
        if (this._suppressClick) { e.preventDefault(); e.stopPropagation(); }
      };
      this.addEventListener('pointerdown', this._onPDown);
      this.addEventListener('pointermove', this._onPMove);
      this.addEventListener('pointerup', this._onPUp);
      this.addEventListener('pointercancel', this._onPCancel);
      this.addEventListener('click', this._onClickCap, true);
```

- [ ] **Step 3: Cleanup en `disconnectedCallback`**

Las dos removals existentes de `_onPDown`/`_onPUp` (líneas ~399-400) pasan a:

```js
      this.removeEventListener('pointerdown', this._onPDown);
      this.removeEventListener('pointermove', this._onPMove);
      this.removeEventListener('pointerup', this._onPUp);
      this.removeEventListener('pointercancel', this._onPCancel);
      this.removeEventListener('click', this._onClickCap, true);
```

- [ ] **Step 4: Spring + uniform en `_frame`**

Después del bloque del switch burst (tras `gl.uniform1f(this._u.uSwitch, sw);`, línea ~1027):

```js
      if (this._rollAnim) {
        const ta = (now - this._rollAnim.t0) / 150;
        this._rollY = ta >= 1 ? 0 : this._rollAnim.from * (1 - sstep(0, 1, ta));
        if (ta >= 1) this._rollAnim = null;
      }
      gl.uniform1f(this._u.uDragY, this._rollY);
```

- [ ] **Step 5: Hint touch**

(a) En `connectedCallback`, junto a `this._reduced` (línea ~382):

```js
      this._coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
```

(b) En `_drawControls` (línea ~610), la línea del hint pasa a:

```js
        const t = (this._coarse && ui.hintTouch) || ui.hint || 'SCROLL / ARROW KEYS';
```

(c) `index.html`, en ambos JSON junto a `"hint"`:

EN (línea ~212): `"hint": "SCROLL / ARROW KEYS", "hintTouch": "SWIPE UP / DOWN",`

ES (línea ~240): `"hint": "SCROLL / FLECHAS", "hintTouch": "DESLIZÁ ARRIBA / ABAJO",`

- [ ] **Step 6: Verificar en browser**

Desktop primero: rueda, flechas y clicks intactos, sin roll (pointerType mouse no entra). Después DevTools device emulation (touch, <720px):
- Arrastrar despacio: el contenido sigue el dedo, banda de static entra por el borde, velo de ruido crece con el drag.
- Soltar antes del 15%: spring de vuelta, sin cambio de canal.
- Soltar pasado el 15% (o flick): burst de static + canal nuevo; el roll se disuelve dentro del burst.
- Swipe que arranca encima de una card/CTA: NO navega (click suprimido).
- Tap seco en una card: navega como siempre.
- Hint del home dice SWIPE UP / DOWN (EN) / DESLIZÁ ARRIBA / ABAJO (ES).
- Con "Emulate CSS prefers-reduced-motion": sin roll visual; soltar pasado el umbral conmuta instantáneo.
- Desktop >720px con CRT: sin regresión visual (uDragY queda 0).

- [ ] **Step 7: Commit**

```bash
git add js/hero.js index.html
git commit -m "Mobile: el canal sigue el dedo con vertical roll CRT y static en la banda"
```

---

### Task 4: Easter egg — keypad y d-pad del control remoto

**Files:**
- Modify: `js/intro.js` (`makeAudio`, `_buildScene`, handlers pointer, `_frame`, `_powerScreen` helpers, `_press`, `_handoff`)
- Modify: `js/hero.js` (`_onPowerOn`)

**Interfaces:**
- Consumes: `this._ensureAudio()` de Task 2.
- Produces: `p9:power-on` pasa a `CustomEvent` con `detail.ch` (número 1-9 o `null`); el `_bail()` sigue despachando `Event` pelado, así que el hero debe tolerar `detail` ausente.

- [ ] **Step 1: Cues nuevos en `makeAudio` (`js/intro.js`)**

Dentro del objeto `a` (línea ~206), después de `click()`:

```js
        beep(row, col) { // DTMF real: filas 697/770/852 Hz, columnas 1209/1336/1477 Hz
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
        tap() { // thunk suave para el d-pad
          const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
          o.type = 'sine';
          o.frequency.setValueAtTime(180, t);
          o.frequency.exponentialRampToValueAtTime(70, t + 0.08);
          g.gain.setValueAtTime(0.3, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
          o.connect(g); g.connect(master);
          o.start(t); o.stop(t + 0.12);
        },
```

- [ ] **Step 2: Metadata de teclas y zonas d-pad en `_buildScene`**

El doble loop del keypad (líneas ~416-421) se reemplaza por (dígitos 1-9, filas de arriba a abajo):

```js
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
      // d-pad: 4 zonas lógicas sobre la cruz (centro [0, 0.04]); dir empuja el wiggle
      this._dpadZones = [
        { dir: [0, -1], pos: [0, 0.072, 0.026] },
        { dir: [0, 1], pos: [0, 0.008, 0.026] },
        { dir: [-1, 0], pos: [-0.032, 0.04, 0.026] },
        { dir: [1, 0], pos: [0.032, 0.04, 0.026] }
      ];
```

- [ ] **Step 3: Helpers de proyección**

Después de `_powerScreen` (línea ~601), reusando su misma matemática:

```js
    // punto local del control → px CSS de pantalla; null si quedó detrás de cámara
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
      let best = null;
      const consider = (pos, payload) => {
        const s = this._remotePointScreen(pos, g, vp);
        if (!s) return;
        const edge = this._remotePointScreen([pos[0] + 0.02, pos[1], pos[2]], g, vp);
        const rr = Math.max(edge ? Math.hypot(edge.x - s.x, edge.y - s.y) : 0, 18); // piso táctil 18px
        const dd = Math.hypot(px - s.x, py - s.y);
        if (dd < rr && (!best || dd < best.d)) best = { d: dd, payload };
      };
      for (const m of this._keyBtns) consider(m._key.pos, { key: m });
      for (const z of this._dpadZones) consider(z.pos, { dpad: z });
      if (!best) return;
      const audio = this._ensureAudio();
      if (best.payload.key) {
        const k = best.payload.key._key;
        k.t0 = performance.now();
        this._pendingCh = k.digit;
        this._keyPresses = (this._keyPresses || 0) + 1;
        this._irT0 = performance.now();
        if (audio) audio.beep(k.row, k.col);
      } else {
        const z = best.payload.dpad;
        this._vel.yaw += z.dir[0] * 1.6;
        this._vel.pitch += z.dir[1] * 1.2;
        if (audio) audio.tap();
      }
    }
```

- [ ] **Step 4: Click vs drag en los handlers pointer**

Los handlers de `connectedCallback`/`_boot` (líneas ~328-347) pasan a distinguir tap de drag (<6px). Reemplazar `pointerdown`, `pointerup` y `pointercancel` (el `pointermove` gana una línea):

```js
      this.addEventListener('pointerdown', (e) => {
        this.setPointerCapture(e.pointerId);
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
        this._rot.yaw = clamp(this._rot.yaw + dx, -2.5, 2.5);
        this._rot.pitch = clamp(this._rot.pitch + dy, -1.4, 1.4);
        this._vel.yaw = dx / dt; this._vel.pitch = dy / dt;
        this._drag = Object.assign(this._drag, { x: e.clientX, y: e.clientY, t: now,
          moved: Math.max(this._drag.moved, Math.hypot(e.clientX - this._drag.x0, e.clientY - this._drag.y0)) });
      });
      this.addEventListener('pointerup', (e) => {
        const d = this._drag;
        this._drag = null;
        // tap seco (no drag, no power en curso): probar keypad/d-pad
        if (d && d.moved < 6 && !this._power) this._remoteTap(e.clientX, e.clientY);
      });
      this.addEventListener('pointercancel', () => { this._drag = null; });
```

(El botón power DOM hace `stopPropagation` en su pointerdown, así que sus taps nunca llegan acá: `_drag` queda null y `_remoteTap` no corre.)

- [ ] **Step 5: Animación de hundido + blink IR en `_frame`**

Antes del bloque `if (this._power) {` (línea ~510):

```js
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
```

(El blink del power dentro de `if (this._power)` queda después y pisa este — correcto.)

- [ ] **Step 6: `detail.ch` en el handoff + PostHog**

(a) En `_press` (línea ~608), el capture gana dos propiedades:

```js
      if (window.posthog) posthog.capture('intro_power_on', {
        lang: this._lang,
        ms_to_press: Math.round(performance.now() - this._shownAt),
        ch: this._pendingCh != null ? this._pendingCh : null,
        keypad_presses: this._keyPresses || 0
      });
```

(b) En `_handoff` (línea ~616):

```js
      window.dispatchEvent(new CustomEvent('p9:power-on', {
        detail: { ch: this._pendingCh != null ? this._pendingCh : null }
      }));
```

(`_bail()` NO se toca: sigue con `Event` pelado.)

- [ ] **Step 7: El hero se sintoniza en standby (`js/hero.js`)**

`this._onPowerOn` (línea ~375) pasa a:

```js
        this._onPowerOn = (e) => {
          // easter egg: un dígito del keypad de la intro pre-sintoniza el canal
          const ch = e && e.detail ? e.detail.ch : null;
          if (ch != null) {
            const i = this._channels.findIndex(c => c.id === ch);
            if (i >= 0 && i !== this._chIndex) {
              this._chIndex = i;
              this._drawChannel();
              this._afterSwap();
            }
          }
          this._standby = false;
          this._t0 = performance.now();
          this._tPrev = this._t0;
        };
```

- [ ] **Step 8: Verificar en browser**

Recargar sin hash (la intro debe aparecer; borrar `p9-sound` si quedó off):
- Tap en cada tecla del keypad: se hunde, suena DTMF distinto por tecla, LED IR titila.
- Tap en las 4 puntas del d-pad: el control se sacude hacia ese lado + thunk suave.
- Drag para rotar el control: sigue funcionando; un drag que termina sobre una tecla NO la aprieta.
- Tecla 2 → power: la tele prende directo en CH 2 (proyecto), hash `#ch2`, evento `project_viewed` en consola de red de PostHog (o al menos sin errores).
- Tecla 5 (sin canal) → power: prende en CH 9 normal.
- Power sin tecla previa: flujo idéntico al actual.
- Enter/Espacio siguen prendiendo; `_bail` (simular: `document.documentElement.classList.remove('p9-intro')` antes de cargar no — basta revisar que el listener del hero tolera `Event` sin detail, cosa que el código hace con `e.detail ? ... : null`).
- En <720px (touch emulation): taps del keypad funcionan (piso de 18px de hit).

- [ ] **Step 9: Commit**

```bash
git add js/intro.js js/hero.js
git commit -m "Easter egg: el keypad del control beepea DTMF y pre-sintoniza el canal; d-pad con wiggle"
```

---

### Task 5: Docs + regresión final

**Files:**
- Modify: `CLAUDE.md` (sección hero: roll táctil, sonidos, `p9-sound`; sección intro: keypad/d-pad)
- Modify: `sitemap.xml` (`<lastmod>` → `2026-08-04`)

**Interfaces:**
- Consumes: todo lo anterior. Produces: nada.

- [ ] **Step 1: Actualizar `CLAUDE.md`**

En la sección del hero, al párrafo de **Canales** (donde lista wheel/swipe/teclado) reflejar el cambio: el swipe táctil pasa a ser "drag con vertical roll (el contenido sigue el dedo; static en la banda; suelta > 15% o flick conmuta)". Agregar al final de la sección hero un párrafo breve:

```markdown
**Sonidos**: cues de UI sintetizados con Web Audio en `hero.js` (`makeSfx`:
sintonía al cambiar de canal, tick en botones, pop del menú, confirm de
idioma), lazy y muteables desde el menú OSD (fila SOUND, persiste en
`localStorage['p9-sound']`; `intro.js` respeta la misma key).
```

En la sección de la intro, después del párrafo existente:

```markdown
Easter egg: el keypad 3×3 del control (dígitos 1-9) beepea DTMF, se hunde y
titila el LED IR; el último dígito pre-sintoniza el canal al prender
(`p9:power-on` es CustomEvent con `detail.ch`). El d-pad sacude el control.
```

- [ ] **Step 2: `sitemap.xml` lastmod**

Cambiar el/los `<lastmod>` existentes a `2026-08-04`.

- [ ] **Step 3: Regresión final completa**

Con el server corriendo, una pasada entera:
- Desktop: intro → power → boot → navegar todos los canales (wheel, flechas, nav, ▲▼, MENU, EN/ES, SOUND on/off) — sonidos correctos, cero errores de consola.
- Mobile emulado (<720px, touch): intro (drag + keypad + power con dígito) → roll follow-finger → taps limpios en cards/CTAs → menú.
- `#ch2` directo: sin intro, canal correcto.
- Reduced motion: sin roll, cambios instantáneos, intro salteada (clase `p9-intro` no se setea — comportamiento preexistente).
- Presupuesto: `git diff main~N --stat` sobre js/*.js — crecimiento total < ~6 KB.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md sitemap.xml
git commit -m "Docs: roll tactil, easter egg del keypad y sonidos de UI en CLAUDE.md; sitemap lastmod"
```
