# TradeCraft corporate website

A static HTML/CSS/JavaScript site for [tradecrafttechnology.com](https://tradecrafttechnology.com). No build step or application dependencies.

## Local preview

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open http://127.0.0.1:8765. Serve over HTTP so the landscape can be uploaded into a WebGL texture.

## The living workshop

- `index.html` contains the accessible page content, product/contact links and motion control.
- `assets/styles.css` controls the responsive layout, sky, two independently drifting cloud layers, and occasional tablet roof trace.
- `assets/scene.js` adds a restrained, masked foliage breeze with WebGL and gentle pointer parallax. It caps rendering at 30 fps and caps pixel density. The static image remains the fallback when WebGL is unavailable.
- `assets/workshop-scene.webp` is a landscape with a genuinely transparent sky. Clouds drift behind its trees and roofline.
- `assets/clouds.webp` is a transparent, repeatable cloud bank. The two layers travel over 170 and 240 seconds; the copy area has quieter clouds to preserve contrast.
- `assets/social-preview.jpg` is a browser capture of the implemented hero for link previews.

The motion control pauses clouds, foliage, parallax and the tablet trace together. The scene respects reduced motion on first visit and when the system setting changes; visitors can explicitly opt in using “Play motion.” Animation pauses in hidden tabs and when the hero is offscreen. Without JavaScript, all content and the still illustration remain usable.

The SVG tablet trace and shader foliage regions are calibrated to this illustration. Update their coordinates if replacing the landscape. On phones, the illustration crops toward the right and the tablet trace is omitted because the tablet is out of frame.

## Verification

Validated in Chromium at 320, 390, 768, 1440 and 1920 CSS pixels. Browser checks cover changing breeze pixels, moving clouds, a fully frozen pause state, viewport suspension/resume, live reduced-motion changes, explicit motion opt-in, no-WebGL and no-JavaScript fallbacks, WebGL context loss/restoration while paused, and delayed image loading while paused. No browser/resource errors or automated axe WCAG A/AA violations were found. Desktop and mobile layouts were also visually inspected.

Syntax check: `node --check assets/scene.js`. This static repository has no configured build, typecheck, lint or test runner. Browser verification used temporary Playwright and axe dependencies outside the repository.

Artwork was generated with the built-in image generation tool and encoded as WebP. Final generation prompts are recorded in [assets/ARTWORK.md](assets/ARTWORK.md).
