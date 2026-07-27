# Intro "control remoto → tele" — diseño

**Fecha:** 2026-07-27
**Estado:** aprobado en conversación, pendiente de plan de implementación

## Qué es

Una intro interactiva para piso9.studio inspirada en el video de Builders OFF the
Record (tuit 2081860911552168228): la página arranca a oscuras con un **control
remoto 3D explorable** y una **tele CRT apagada** detrás. El usuario aprieta el
botón power del control → la tele se prende con static → la cámara hace zoom a la
pantalla hasta que se convierte en la página actual (el hero WebGL `<piso9-hero>`).

Decisiones cerradas con Maxi:

- La intro se muestra **siempre** al entrar a la home (sin localStorage, sin SKIP).
- Control **explorable**: drag para rotarlo, hay que apretar el power.
- Escena con **control + tele CRT visibles** (fiel a la referencia).
- **Mobile también** tiene la intro (touch drag + tap).
- **Sonido sintetizado** con Web Audio (cero assets).
- Render: **mini motor WebGL propio + modelos procedurales low-poly** (enfoque A;
  se descartó Three.js por presupuesto/zero-deps y sprites por no ser explorable).

## Experiencia

**Escena inicial.** Viewport negro `#0a0a0a`. Control remoto low-poly en primer
plano: cuerpo gris oscuro redondeado, botones de goma, D-pad, botón power
**naranja `--accent #ff8c00`** (único color de la escena), grabado "PISO9" en
Orbitron, LED IR en la punta. Detrás, en penumbra, una tele CRT apagada con LED
rojo de standby. Hint VT323 abajo: `[ PRENDÉ LA TELE ]` / `[ TURN ON THE TV ]`.

**Exploración.** Drag (mouse/touch) rota el control con inercia; al soltar vuelve
lento a su orientación de reposo. Idle: bob sutil de flotación. Hover en power:
cursor pointer + glow naranja del botón.

**Secuencia de power-on (~2.5 s).**

1. Botón se hunde + **click** + parpadeo del LED IR.
2. ~150 ms después: **línea blanca horizontal** que se expande verticalmente en la
   tele (power-on CRT clásico) + **thunk de degauss**, LED standby se apaga.
3. La pantalla se llena de **static** (mismo `hash()` del shader del hero) + hiss.
4. **Dolly hacia la pantalla** (~1.2 s con easing); el control sale de cuadro; la
   pantalla crece hasta llenar el viewport con la misma distorsión barrel del hero
   (`k = 0.22` ≡ `0.10 * 2.2` del shader).
5. En el pico del static el overlay se remueve y el hero corre su boot normal
   (static → disolución a CH 9). El corte es static contra static: invisible.

**Sonido.** Web Audio API, todo sintetizado (~2 KB de código): click (noise burst
+ tick), thunk de degauss (sweep grave 120→40 Hz + ruido), hiss del static que se
apaga durante el zoom. Solo suena tras el gesto del usuario (sin problema de
autoplay). Sin assets de audio.

**Mobile (<720 px).** Misma escena con encuadre más cerrado sobre el control.
Touch drag rota, tap en power. Como abajo de 720 px no hay CRT, el zoom al static
termina en un fade a la página apilada actual.

## Arquitectura

```
js/intro.js      NUEVO — <piso9-intro>: motor 3D + sonido (~600 líneas, ~20 KB)
index.html       + <piso9-intro> antes del hero, + decisión inline en <head>,
                 + claves i18n en #p9-i18n-en y #p9-i18n-es
css/main.css     + estilos del overlay (canvas fixed, z-index sobre el hero)
js/hero.js       mínimo: modo standby hasta el evento p9:power-on
```

**`js/intro.js`.** Custom element `<piso9-intro>` en IIFE, sin dependencias,
`defer`, mismo patrón que `hero.js`:

- Helpers mat4/quat mínimos (~80 líneas). Geometría procedural: `roundedBox()` y
  `cylinder()` arman control (cuerpo, botones, D-pad) y tele (caja, pantalla
  inset, patas).
- Un solo programa WebGL: flat/Lambert + rim light; uniform `uEmissive` para LEDs
  y la pantalla (negro → línea blanca → static con el `hash()` del hero).
- Hit-test del power: proyección del centro del botón a pantalla + radio (un solo
  botón; no hace falta raycasting).
- Sonido Web Audio inline.

**Decisión de arranque.** El script inline del `<head>` (el que setea `p9-tv`)
agrega también `p9-intro` **solo si**: no hay hash de deep-link (`#ch*`, `#work`,
`#contact`), no hay `prefers-reduced-motion` y hay WebGL. Sin la clase, la página
carga exactamente como hoy.

**Handoff con el hero.** Con `p9-intro` presente, `connectedCallback` del hero
arranca el render loop pero congela `uBoot` en 0 (static continuo bajo el
overlay). La intro dispara `p9:power-on` al completar el zoom; el hero setea
`_t0 = now` y corre su boot. El static final de la intro y el del boot del hero
son el mismo ruido → empalme perfecto. Cualquier error runtime de la intro hace
`try/catch` → saca la clase y dispara el evento igual: la página nunca queda en
negro.

**Accesibilidad.** `<button>` real invisible sobre el power (patrón de controles
invisibles del hero) con `aria-label` i18n; Enter/Space activan con foco en el
overlay. El contenido sr-only de la página sigue accesible. Reduced-motion nunca
ve la intro.

**i18n.** Claves nuevas `ui.introHint` y `ui.introPower` en ambos JSON. El hint se
dibuja en canvas con VT323 (ya preloaded).

**Presupuesto.** ~20 KB de JS plano extra, cero assets ni requests nuevos; dentro
de los ~150 KB del repo.

## Casos que saltean la intro

| Caso | Comportamiento |
|---|---|
| Deep-link `#ch*` / `#work` / `#contact` | Sin intro, canal directo como hoy |
| `prefers-reduced-motion` | Sin intro (el hero ya salta su boot) |
| Sin WebGL | Sin intro; `_fallback()` del hero como hoy |
| Error runtime en intro | Clase fuera + `p9:power-on` forzado |

## Testing (manual, regla del repo)

- Desktop y mobile (arriba/abajo de 720 px), EN y ES.
- Deep-links saltean; reduced-motion saltea; sin WebGL saltea.
- Empalme static→static sin corte visible en ambos tamaños.
- Sonido solo tras el gesto; nada de audio en carga.
- Drag/inercia con mouse y touch; hover y foco del power.

## Fuera de alcance

- Botón "volver al control" post-power-on (la referencia lo tiene; acá no —
  YAGNI, la intro reaparece con recargar).
- Persistencia de "ya la viste" (decisión: siempre se muestra).
- Cambios de metadata/OG (no cambia el copy de la página).
