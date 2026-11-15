# Easy Anim — studio usage guide

Cutscene timelines for the Easy Suite: Easy Sprite actors that move, face and pose, a camera (pan, zoom, shake),
dialogue lines (inline Thai/English or Easy Dialogue `.ezd` refs), Easy FX spawns, Easy SFX / Easy Music cues,
fades, waits and "press to continue". Agents **write `easyanim/1` JSON, check it, render frames to look at, and
export** to Godot 4.3+, PixiJS v8 or GIF/MP4. Nothing is AI-generated and nothing calls a network.

Install is local only. Do not push or modify the upstream GitHub repo.

## Paths

| What | Path |
|---|---|
| Install (package 0.1.0, `<SHA>` on master) | `/workspace/indie-studio/tools/easyanim` |
| CLI wrapper | `node /workspace/indie-studio/tools/easyanim-cli.mjs` |
| Studio projects | `/workspace/indie-studio/projects/<Name>/` |
| Format | `/workspace/indie-studio/tools/easyanim/docs/FORMAT.md` |

A game's cutscenes (`cutscenes/<id>.easyanim.json`), Easy Sprite sheets (`sprites/<sprite-id>.png`, native side
sheets 1440×144) and exports belong under `/workspace/indie-studio/projects/<Name>/`. Pass
`--workspace /workspace/indie-studio/projects/<Name>` (init that folder once). Ids match `^[a-z0-9][a-z0-9_-]*$`.

```bash
export EASYANIM_HOME=/workspace/indie-studio/tools/easyanim
export EASYANIM_WORKSPACE=/workspace/indie-studio/tools/easyanim
export EASYANIM_ALLOWED_DIRS=/workspace/indie-studio/projects
```

The wrapper sets these. `export --out DIR` (single preset only) writes into DIR without deleting it.

## Install (not applied yet)

```bash
git clone /workspace/easyanim /workspace/indie-studio/tools/easyanim
cd /workspace/indie-studio/tools/easyanim
git checkout --detach <SHA>
npm ci && npm run build && npm test
```

## Samples

| Id | Length | Cast (sprite) | Uses |
|---|---|---|---|
| `village_morning_delivery` | 28.5 s | ton (side_little_boy), pa_daeng (side_market_seller), kru_aisyah (side_hijab_teacher), yai_kaew (side_grandma) | music `village_day`; fx `footstep_dust`, `sparkle_shine`, `heal_plus`; ref `village_delivery.ezd#market` |
| `raya_open_house` | 30.5 s | kru_aisyah, adam (side_kopiah_boy), nur (side_tadika_girl), lung_mee (side_village_farmer), pa_daeng | music `raya_open_house`; fx `pelita_flicker`, `sparkle_shine`, `raya_fireworks` |
| `loy_krathong_night` | 32 s | fon (side_school_girl), ton, pak_hamid (side_pelekat_fisher) | music `loy_krathong`; fx `fireflies`, `krathong_glow`, `khom_loi`; a `wait_input` hold |

## Commands

```bash
CLI="node /workspace/indie-studio/tools/easyanim-cli.mjs"
W=/workspace/indie-studio/projects/<Name>
$CLI init --workspace $W
$CLI new intro --from village_morning_delivery --workspace $W     # or: new intro --backdrop river_night
$CLI check intro --workspace $W                                    # JSON-path errors, exit 1
$CLI state intro --t 12 --workspace $W                             # what is on screen at 12 s
$CLI render intro --out $W/renders/intro.png --contact --workspace $W
$CLI render intro --out $W/renders/intro.mp4 --workspace $W
$CLI export intro --preset godot --workspace $W                    # exports/easyanim-godot
```

Look at the contact sheet (and frames at key times) before exporting: check actors stand where you meant, the
camera frames them and dialogue does not cover faces.

## MCP

`node /workspace/indie-studio/tools/easyanim/dist/mcp/server.js --workspace $W` (stdio) or `--http --port 8869`.
Tools: `workspace_info` (call first: catalogues + cheat sheet), `list_cutscenes {tag?}`, `get_cutscene {id, t?}`,
`write_cutscene {id, doc, dryRun?}`, `render_cutscene {id, t?}` (image), `export_cutscenes {ids?, tags?, preset?, out?}`.

## Engines

* **Godot 4.3+**: `easyanim/scenes/<id>.tscn` is ready to instance (runner `EasyAnimCutscene` with signals
  `started`, `finished`, `line_shown(speaker, text, ref)`, `sfx(id)`, `music(id, fade)`, `music_stop(fade)`,
  `fx_spawned(id, position)`, `waiting_for_input`; methods `play`, `pause`, `seek`, `advance`). Merge the
  `easyanim/` folder into the game. If Easy FX (`res://easyfx/scenes/`), Easy Music (`MusicPlayer` autoload) or an
  `SfxBank` autoload exist, the runner uses them. Headless check: `godot --headless --path . --script res://test_anim.gd`
  (on the box: `xvfb-run -a godot --rendering-driver opengl3 …`; Vulkan hangs).
* **PixiJS v8**: `loadCutscene(PIXI, "cutscenes/<id>.json", { music, fx, sfx })` → `view`, `play`, `pause`,
  `seek`, `update(dt)`, `advance`, `on(event)`.

## Ports

Editor 8868, MCP HTTP 8869, Vite dev 5182.

## Content rules

Never depict the Prophet or sacred figures; never use Quran verses or Arabic calligraphy as decoration. The cast is
ordinary villagers of a multicultural southern Thai village (Muslim, Buddhist and Chinese-Thai neighbours). The
validator enforces this on ids, names, stage images, titles and tags; dialogue text is your responsibility.
