---
name: easyanim-cutscenes
description: >-
  Use when a game needs a scripted cutscene or intro (characters walking, facing, waving, a camera pan or zoom,
  dialogue lines, FX, sound and music cues, fades, press-to-continue) built from Easy Sprite side-view characters,
  exported to Godot 4.3+ (.tscn + runner), PixiJS v8 or a GIF/MP4 preview; written as easyanim/1 JSON with three
  village samples (morning delivery, Hari Raya open house, Loy Krathong night). Not for drawing sprites or FX.
---
# Easy Anim cutscenes

Easy Anim **sequences, previews and exports** `easyanim/1` timelines. It does not draw characters or effects:
actors are Easy Sprite sheets (placeholders if missing), FX/SFX/music are Easy FX / Easy SFX / Easy Music ids.
Read `/workspace/indie-studio/tools/EASYANIM.md` for paths, commands, MCP args and engine details. Full format:
`/workspace/indie-studio/tools/easyanim/docs/FORMAT.md`.

## When to use

- An intro, story beat, festival scene or quest hand-off that plays itself, with optional "press to continue".
- You need a Godot scene, a Pixi runner or a GIF/MP4 storyboard of it.
- Character art → Easy Sprite; particle art → Easy FX; branching conversations → Easy Dialogue (reference the
  `.ezd` node with `ref`).

## Setup

Install: `/workspace/indie-studio/tools/easyanim`. CLI: `node /workspace/indie-studio/tools/easyanim-cli.mjs`.
Game files go under `/workspace/indie-studio/projects/<Name>/` (init once; sheets in `sprites/`). Ports: editor
8868, MCP HTTP 8869, Vite 5182. Video needs `ffmpeg`.

## Steps

1. **Start from a sample.** `list`, then `new <id> --from <sample>` (or `--backdrop …` for an empty one). Call
   `workspace_info` over MCP to see valid poses, backdrops and sibling ids; never invent ids silently (unknown ids
   are warnings, so check them).
2. **Write the timeline.** Actors with `sprite`, `x`, `face`; events with `t`, `track`, `op`. Let defaults set most
   `dur`s (moves use walking speed, lines use text length). Keep dialogue short (one or two lines per event).
3. **Check.** `check <id>` must print `ok`; fix every error path and read the warnings.
4. **Look.** `render <id> --contact` and frames at key times (`--t`). Fix staging: actors in frame, camera inside
   the world, dialogue box (top of the screen) not covering faces, fades not hiding the action.
5. **Export.** `export <id> --preset godot` (or `pixi`, `video`, `all`). In Godot, run `test_anim.gd` headless.
6. **Report** the file paths, duration, cast and any placeholder sheets or unknown ids that remain.

## Rules

- Content: never depict the Prophet or sacred figures; no Quran verses or Arabic calligraphy as decoration; cast
  everyday multicultural villagers. Respect festivals (Hari Raya, Loy Krathong, Songkran) as community life, not
  ritual. The validator blocks forbidden ids/names/titles; dialogue text is on you.
- Do not bundle Easy Sprite (LPC-derived) sheets in public repos or docs without their credits.
- Do not push, publish or change other repos unless the user asks.
