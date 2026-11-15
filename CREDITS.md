# Credits

## Art

* **Placeholder characters** (`src/shared/sprites.ts`) and the **procedural backdrops** (`src/shared/backdrops.ts`)
  are drawn from code at render time and dedicated to the public domain (CC0 1.0), as are the sample cutscenes
  (`samples/cutscenes/`) and anything you render from them with placeholders.
* **Easy Sprite sheets are not bundled.** Easy Sprite composes characters from LPC-derived parts that carry their
  own licences (CC-BY-SA / GPL and others; see the Easy Sprite repo's credits). When you put such sheets in
  `sprites/`, renders and exports that contain them inherit those terms: credit the LPC artists as Easy Sprite's
  CREDITS describe. The README art, docs images and brand images in this repo use placeholders only.
* FX, sounds and music are referenced by id (Easy FX, Easy SFX, Easy Music); nothing from them is bundled. Without
  them, FX render as simple placeholder particles and audio cues only fire events/signals.

## Fonts

* **Kanit** (SIL Open Font License 1.1, `assets/fonts/OFL.txt`) draws dialogue text in renders and is copied into
  Godot exports (`easyanim/fonts/`) for Thai text. **Press Start 2P** (SIL OFL 1.1) appears only in the brand art.

## Runtimes

* `easyanim-pixi.js` targets PixiJS v8 (MIT), which is not bundled; the demo loads `./pixi.min.js` if present,
  else the jsDelivr CDN. `easyanim-core.js` is bundled from this repo's TypeScript with esbuild.
* Godot exports target Godot 4.3+ (MIT); nothing from the engine is included.
* GIF / MP4 / WebM encoding calls your local `ffmpeg` (not bundled).

Code: MIT © Salahuddin Benno.
