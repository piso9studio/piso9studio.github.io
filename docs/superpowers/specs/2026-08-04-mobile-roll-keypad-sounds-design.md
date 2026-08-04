# Mobile vertical roll + keypad easter egg + sonidos de UI

**Fecha:** 2026-08-04 · **Aprobado por:** Maxi (opciones recomendadas en las tres decisiones)

Tres features sobre la TV (`js/hero.js`) y la intro (`js/intro.js`), manteniendo
zero-build, cero assets nuevos y cero requests a terceros.

## 1. Mobile: drag con "vertical roll" CRT (`js/hero.js`)

**Problema.** En mobile el swipe actual es seco (umbral 48px en `pointerup`) y
los taps caen en overlays invisibles: la gente quiere deslizar y "pasan cosas
raras" (canales que saltan sin feedback, clicks fantasma).

**Diseño.** El contenido del canal sigue el dedo como el vertical hold de una
tele vieja, sin refactorizar el dibujado: un uniform nuevo `uDragY` desplaza
verticalmente el sampleo de las dos texturas (`uTex` y `uTexUI`) en el shader;
la banda que entra por el borde muestra static puro (reusa la función de ruido
existente).

- **Durante el drag** (solo `pointerType === 'touch'`): `uDragY = dy / alto`,
  con resistencia rubber-band más allá de ±40%.
- **Al soltar:**
  - Pasó el umbral (~15% del alto **o** flick con velocidad > ~0.5 px/ms):
    se dispara `switchChannel` (burst de static existente) y el roll continúa
    dentro del burst para que la transición lea continua. Respeta el lockout
    propio de `switchChannel`.
  - No llegó: la imagen vuelve a 0 con un spring corto (~150ms).
- **Taps:** un drag >10px marca `_dragging` y suprime el click de los overlays
  (listener en fase captura). Un tap sin movimiento se comporta como hoy.
- **Hint del home:** en dispositivos touch (`(pointer: coarse)`) el hint pasa a
  una key i18n nueva (EN "SWIPE UP / DOWN", ES "DESLIZÁ ARRIBA / ABAJO" — sin
  glifos ▲▼, el subset de VT323 no los tiene). Se agrega en **ambos** JSON
  `#p9-i18n-en` / `#p9-i18n-es` de `index.html`.
- **`prefers-reduced-motion`:** sin roll (`uDragY` queda en 0); soltar pasado
  el umbral conmuta instantáneo, como ya hacen los cambios de canal reducidos.
- **Desktop:** wheel, teclado y clicks no cambian.

## 2. Easter egg: el keypad del control sintoniza el canal (`js/intro.js`)

El keypad 3×3 y el d-pad del control remoto dejan de ser decoración. Sin DOM
nuevo y sin tocar el tab order: hit-testing por proyección de los centros de
cada botón a pantalla (la misma matemática de `_powerScreen`), eligiendo el más
cercano dentro de un radio, solo en clicks que no fueron drag (<6px de
movimiento). El botón power conserva su DOM button.

- **Keypad (dígitos 1–9, filas de arriba a abajo: 1 2 3 / 4 5 6 / 7 8 9):**
  al apretar, la tecla se hunde (misma animación que el power), suena un beep
  corto tipo DTMF (dual-tone, ~90ms) y el LED IR titila (~120ms de emissive).
  Se guarda el **último** dígito (`_pendingCh`); no hay multi-dígito (los
  canales son de un dígito).
- **Power después de un dígito:** `p9:power-on` pasa a ser
  `CustomEvent` con `detail: { ch }`. El hero en standby, antes de correr el
  boot, busca el canal por id y se sintoniza (`_chIndex` + `_drawChannel`).
  Dígito sin canal (p. ej. 5 con un solo proyecto): beep igual, prende en CH 9
  como siempre.
- **D-pad (4 zonas: arriba/abajo/izq/der):** impulso rotacional corto al
  control en la dirección apretada (wiggle que decae) + thunk suave (reusa el
  `thunk` existente a menor ganancia). Sin función.
- **PostHog:** `intro_power_on` gana las propiedades `ch` (número o null) y
  `keypad_presses` (contador de la sesión de intro).
- El audio de la intro respeta `localStorage['p9-sound']` (sección 3).

## 3. Sonidos de UI estilo Cuelume (`js/hero.js`)

Mini synth Web Audio self-contained en `hero.js` (~40 líneas, espejo del patrón
`makeAudio` de `intro.js`; **no** se extrae módulo compartido — cada custom
element sigue autónomo). Master gain bajo (~0.15), todos los cues <150ms:

| Cue | Cuándo | Carácter |
|---|---|---|
| `tune` | commit de `switchChannel` (cualquier input) | blip de sintonía con glide de pitch + tick de static, sincronizado con el arranque del burst |
| `tick` | `pointerdown` en overlays clickeables (CTAs, ▲▼, cards, nav, menú) | tick sutil ~30ms |
| `pop` / `popDown` | abrir / cerrar el menú OSD | pop corto, pitch arriba/abajo |
| `confirm` | cambio de idioma | doble blip breve |

- **Autoplay:** el `AudioContext` se crea lazy en el primer gesto con user
  activation (click/keydown/touch). Si está `suspended` (p. ej. wheel), se
  intenta `resume()` y si no, el cue se saltea en silencio.
- **Mute:** fila **SOUND ON/OFF** en el panel OSD (mismo patrón de overlays y
  dibujo que EN/ES), persistida en `localStorage['p9-sound']`, default `on`.
  Strings nuevos en ambos JSON i18n. `intro.js` lee la misma key: si está
  `off`, la intro es muda (incluidos power y keypad).

## Alcance de archivos

`js/hero.js`, `js/intro.js`, `index.html` (dos JSON i18n), `css/main.css` solo
si hiciera falta (no se anticipa), `sitemap.xml` (`lastmod`), `CLAUDE.md`
(documentar roll, easter egg, sonidos y la key `p9-sound`).

## Criterios de éxito

- En emulación mobile: arrastrar mueve el contenido con el dedo, soltar snapea
  o vuelve; ningún tap dispara navegación tras un drag.
- Intro: cada botón del control responde (hundido + sonido); dígito + power
  prende la tele en ese canal.
- Sonidos en cada cambio de canal y click de UI; SOUND OFF silencia todo
  (hero e intro) y persiste entre visitas.
- Sin regresiones: desktop wheel/teclado/menú, deep-links, `_fallback()` sin
  WebGL, `prefers-reduced-motion`, presupuesto de carga (~+4-5 KB JS, cero
  requests nuevos).

## Fuera de alcance

- Validación en dispositivo real (queda como followup, igual que la intro).
- Hum de fondo del CRT, sonidos de hover, variaciones por canal (opción "full"
  descartada).
- Canal 0 desde el keypad (no hay tecla 0 en la grilla 3×3).
