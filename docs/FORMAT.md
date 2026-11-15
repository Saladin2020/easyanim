# `easyanim/1` cutscene format

A cutscene is one JSON file, `cutscenes/<id>.easyanim.json` (id: `^[a-z0-9][a-z0-9_-]*$`). Times are seconds,
positions are **world pixels** (x to the right, y down; an actor's y is its feet).

```json
{
  "format": "easyanim/1",
  "th": "ชื่อไทย", "en": "English title", "tags": ["festival"], "lang": "th",
  "stage": { … },
  "actors": [ … ],
  "events": [ … ]
}
```

## Stage (all optional)

| Field | Default | Notes |
|---|---|---|
| `width`, `height` | 320, 180 | viewport; renders scale it by an integer (`--scale`, editor 2×, Pixi demo 3×) |
| `worldWidth`, `worldHeight` | viewport | the camera never shows outside the world |
| `backdrop` | `village_morning` | procedural: `village_morning`, `raya_house`, `river_night`, `plain` (uses `color`) |
| `image` | none | workspace PNG used instead of the procedural backdrop (e.g. an Easy Scene render) |
| `color` | `#2e2014` | colour of `plain` |
| `ground` | 158 | default actor y |
| `camera` | `{ "x": width/2, "y": height/2, "zoom": 1 }` | initial camera centre and zoom (0.25–8) |

## Actors

| Field | Default | Notes |
|---|---|---|
| `id` | required | used by events and as `speaker` |
| `sprite` | required | Easy Sprite side sheet id; `sprites/<sprite>.png` in the workspace (1440×144 native side sheet). Unknown ids warn; missing files render as a placeholder chibi |
| `name` | none | `{ "th": "ครูไอซะห์", "en": "Kru Aisyah" }`, shown on dialogue lines |
| `colors` | from the sprite id | placeholder colours `{ skin, hair, top, bottom }` |
| `x`, `y` | 0, `stage.ground` | start position |
| `face` | `right` | `right`, `left`, `front` (rows of the sheet) |
| `anim` | `idle` | resting pose |
| `visible` | true | |

Poses (`anim`, Easy Sprite side columns): `idle`, `walk`, `run`, `jump`, `wave`, `carry`, `farm`, `cheer`,
`attack`, `hurt`, `fall`, `sleep`, `tired`, `sit`, `crouch`. `jump`, `attack`, `hurt` and `fall` play once and hold
the last frame; the rest loop.

## Events

Every event has `t` (start time), `track`, `op`, and optionally `note` (editor only). Order in the file does not
matter; events are sorted by `t` (stable). `dur` is optional where a default exists.

| Track · op | Fields | Default `dur` |
|---|---|---|
| `actor` · `move` | `actor`, `to: [x, y]`, `anim` (`walk`), `ease` (`linear`), `face` (auto from direction) | distance ÷ speed: walk 40, run 90, carry 32, tired 24 px/s (others 40) |
| `actor` · `face` | `actor`, `dir` | 0 |
| `actor` · `anim` | `actor`, `anim` | 0 = becomes the resting pose; `dur > 0` = play, then return to rest |
| `actor` · `show` / `hide` | `actor` | 0 |
| `camera` · `pan` | `to: [x, y]` (centre), `ease` (`inOut`) | 1.2 |
| `camera` · `zoom` | `to` (0.25–8), `ease` (`inOut`) | 1 |
| `camera` · `shake` | `amp` (3 px) | 0.4 |
| `dialogue` · `line` | `speaker` (actor id or null for narration), `th`, `en`, `ref` (`file.ezd#node`) | 1.6 s + 0.06 s per character, clamped to 2–7 s |
| `fx` · `spawn` | `fx` (Easy FX id), `at: [x, y]` or `actor` + `offset` (default `[0, -20]` on an actor) | 1.2 |
| `audio` · `sfx` | `sfx` (Easy SFX id) | 0 |
| `audio` · `music` | `music` (Easy Music id), `fade` (1 s) | 0 |
| `audio` · `music_stop` | `fade` (1 s) | 0 |
| `screen` · `fade` | `to` (0 clear … 1 covered), `color` (`#000000`) | 0.6 |
| `screen` · `wait` | `dur` (required) | |
| `screen` · `wait_input` | | 0.5 (runtimes hold here until `advance()`) |

Eases: `linear`, `in`, `out`, `inOut`. The cutscene ends at the latest `t + dur`.

Dialogue text types out at 28 characters per second and never splits a Thai consonant from its vowel or tone
marks (or a leading vowel from its consonant). The box shows the speaker's `name` in the cutscene's `lang`.

## Normalized form

`normalize()` (CLI `show`, MCP `get_cutscene`, every export) fills every default, sorts events, numbers them (`i`)
and makes every `dur` explicit. Godot and Pixi read this shape; the state at any time is
`evaluate(cutscene, t)` → actors (x, y, face, anim, frame, visible), camera (x, y, zoom + shake offset, clamped to
the world), fade, current line (with characters shown), live FX and the current music id.

## Validation

`easyanim check` / `write_cutscene` / the editor report **errors** as JSON paths (`events[3].actor: unknown actor
"ghost"`) and **warnings** for ids that are not in the built-in Easy Sprite / FX / SFX / Music catalogues (your own
assets are fine) and for overlapping moves of the same actor.

## Content rules

Easy Anim cutscenes show ordinary villagers in a multicultural southern Thai village. The validator rejects actor
ids, sprites and names, stage images, titles and tags that would depict the Prophet or other sacred figures, or use
Quran verses or Arabic calligraphy as decoration (for example `prophet`, `nabi`, `quran`, `calligraphy`, `ศาสดา`,
`อัลกุรอาน`, `พระพุทธรูป`). Ordinary given names (Muhammad, Aisyah, Hamid…) and everyday talk about the mosque,
temple or shrine are fine. Dialogue text is not filtered; write it with the same care.
