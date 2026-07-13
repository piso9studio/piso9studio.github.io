# Piso9 Studio — piso9.studio

Sitio de una sola página del estudio, servido por **GitHub Pages** con dominio custom (`CNAME` → piso9.studio).

## Arquitectura: zero-build

No hay bundler, framework ni `package.json`. HTML/CSS/JS planos; **push a `main` = deploy**. Herramientas puntuales se corren con `pnpm dlx` / `npx` (p. ej. `sharp-cli` para imágenes) — nunca agregan dependencias al repo.

```
index.html      página principal (metadata completa: SEO, OG, JSON-LD)
404.html        "NO SIGNAL ON THIS CHANNEL"
css/main.css    todos los estilos (@font-face incluidos)
js/hero.js      <piso9-hero> — custom element WebGL (wordmark, CRT, mouse trail)
js/main.js      facade click-to-load para embeds en vivo
fonts/          woff2 self-hosted, solo pesos usados
assets/         imágenes webp, og.png, favicons
```

## Design system

**Paleta** (custom properties en `:root` de `main.css`):

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#0a0a0a` | fondo |
| `--fg` | `#fafafa` | texto principal |
| `--accent` | `#ff8c00` | naranja de marca: el "9", eyebrows, hovers, CTAs |
| `--muted` | `#a3a3a3` | texto secundario / párrafos |
| `--dim` | `#808080` | metadata, footer, URLs (subido de `#737373` para pasar AA 4.5:1) |
| `--line` | `#262626` | bordes y separadores |
| `--card` | `#141414` | fondo de cards |

**Tipografías** (self-hosted en `fonts/`, `font-display: swap`):

- **Orbitron 700** (`--font-display`) — wordmark PISO9 y headings. Solo peso 700.
- **Satoshi 400/500/700** (`--font-sans`) — body y UI. Fontshare; su EULA no permite modificar/subsetear los archivos.
- **VT323 400** (`--font-mono`) — acentos estilo terminal/OSD de TV: `[ SEE OUR WORK ]`, botones de embed, 404. Solo subset latin.

Las 4 fuentes críticas van con `<link rel="preload" as="font" crossorigin>` en `index.html` porque el hero las dibuja en canvas en el primer paint.

**Layout y tono**: contenido en columnas de `max-width: 960px` con `padding` lateral de 32px; secciones separadas por ~128px. Estética retro-CRT (canal de TV, scanlines, brackets `[ ]`, labels `>>` en mayúsculas con letter-spacing). Copy en inglés, corto y seco. Email: hello@piso9.studio.

## El hero (`js/hero.js`) — la TV de canales

`<piso9-hero>` ES la página: modo TV-only (clase `p9-tv` en `<html>`, seteada por un script inline en el `<head>`; las secciones DOM de abajo quedan sr-only como fallback SEO/no-JS). Todo se dibuja en dos texturas canvas 2D subidas a WebGL; los controles reales (buttons/links invisibles) se posicionan encima con el mapeo inverso del barrel distortion (`_screenPos`, `k=0.22` debe seguir igual al `0.10*2.2` del shader).

**Canales**: CH 9 home (wordmark + tagline/copy + CTAs), CH 1 hub de proyectos (mini galería con cards clickeables), CH 2..N+1 un canal por proyecto, CH 0 contacto (botón mailto). Se navega con las cajitas ▲/▼ + botón MENU abajo a la derecha (paths — el subset latin de VT323 no tiene ▲▼↗; en home llevan hint "SCROLL / ARROW KEYS"), rueda del mouse, swipe vertical táctil, teclado (ArrowUp/Down), o los links/CTAs del nav (oculto en home; logo PISO9 Orbitron en los demás). El cambio de canal reproduce un burst de static (~400ms, uniform `uSwitch`); el contenido se intercambia en el pico del ruido. Deep-links: `#ch0`/`#ch2`/`#ch9` (+ alias `#work` → hub, `#contact`).

**i18n**: todo el wording vive en dos JSON inline en `index.html` (`#p9-i18n-en` y `#p9-i18n-es`, cada uno con `ui` + `projects`). Default = idioma del navegador (es→ES, resto EN); la última selección persiste en `localStorage['p9-lang']` y se cambia desde el menú OSD (botón MENU → AJUSTES/SETTINGS → EN/ES). La capa UI del shader se compone con alpha (no aditiva) para que el panel del menú pueda tapar contenido.

Atributos: `accent`, `strength`, `grain`, `crt`. `prefers-reduced-motion` salta el boot y hace los cambios de canal instantáneos. Sin WebGL, `_fallback()` quita `p9-tv` y restaura la página scrolleable (fallback solo en inglés). No tocar sin probar en desktop y mobile (el CRT se apaga bajo 720px; ahí proyecto y hub se apilan vertical).

## Reglas de performance

- **Cero requests a terceros en la carga inicial.** Todo self-hosted. Los sitios embebidos (forg1.com) cargan solo al click, vía el facade de `js/main.js`.
- Imágenes: **webp**, con `width`/`height` explícitos y `loading="lazy" decoding="async"`. Convertir con `pnpm dlx sharp-cli --input x.png --output x.webp --format webp --quality 78`.
- Scripts siempre con `defer`.
- Fuentes nuevas: solo woff2, solo los pesos que se usan de verdad, preload únicamente si son above-the-fold.
- Presupuesto: carga inicial (HTML + CSS + JS + fuentes) por debajo de ~150 KB.

## Convenciones

- Para agregar un proyecto (3 pasos): (1) entrada en **ambos** JSON `#p9-i18n-en` y `#p9-i18n-es` de `index.html` con `ch` siguiente, `title` en mayúsculas, `url`, `year`, `desc`, `meta` (traducidos por idioma) y el webp con sus `imgW`/`imgH` reales; (2) el `<article class="project">` fallback en `#work` (head con título Orbitron + año, descripción, `browser-card` con screenshot webp o facade `data-embed`, y `project-meta` en mayúsculas); (3) el screenshot webp en `assets/`. Mantener los tres en sync.
- Los estilos van en `css/main.css` con clases — **no usar estilos inline**.
- Metadata (title, description, OG) vive solo en `index.html`; si cambia el copy del hero/intro, actualizarla también.
- `sitemap.xml`: actualizar `<lastmod>` en cambios de contenido relevantes.
- Assets de marca (og.png, favicons) se regeneran con Chrome headless de Windows (`/mnt/c/Program Files/Google/Chrome/Application/chrome.exe --headless --screenshot=...`) y el glifo "9" viene de Orbitron convertido a path SVG con fonttools.
