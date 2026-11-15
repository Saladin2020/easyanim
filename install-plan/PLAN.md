# Easy Anim studio install plan (prepared, NOT applied)

Nothing below has been run against `/workspace/indie-studio`. Apply only after the user approves.

1. `git clone /workspace/easyanim /workspace/indie-studio/tools/easyanim && cd $_ && git checkout --detach <SHA>`
2. `npm ci && npm run build && npm test` (expect 36 passed, 1 skipped; the skipped one is the Godot test without `GODOT`).
3. Copy `install-plan/easyanim-cli.mjs` → `/workspace/indie-studio/tools/easyanim-cli.mjs` (same shape as the other
   `easy*-cli.mjs` wrappers: sets `EASYANIM_HOME`, `EASYANIM_WORKSPACE`, adds `/workspace/indie-studio/projects` to
   `EASYANIM_ALLOWED_DIRS`).
4. Copy `install-plan/EASYANIM.md` → `/workspace/indie-studio/tools/EASYANIM.md` and replace `<SHA>`.
5. Smoke: `node /workspace/indie-studio/tools/easyanim-cli.mjs init --workspace /workspace/indie-studio/projects/_smoke2`
   then `render village_morning_delivery --out .../_smoke2/village.mp4 --workspace .../_smoke2` and
   `export --workspace .../_smoke2`.
6. Optional: copy Easy Sprite native side sheets for a game into `projects/<Name>/sprites/` (not into the install).
7. Shared skill: install `SKILL.draft.md` as `easyanim-cutscenes` (the parent agent does this).
8. Once a GitHub repo exists (user's call): `git remote add github https://github.com/Saladin2020/easyanim.git` in the install.

Needs `ffmpeg` on PATH for GIF/MP4/WebM (present on the box); PNG frames and Godot/Pixi/JSON exports work without it.
