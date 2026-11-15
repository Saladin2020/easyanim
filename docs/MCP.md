# Easy Anim MCP server

```bash
npm run mcp                         # stdio
npm run mcp:http                    # http://127.0.0.1:8869/mcp (Streamable HTTP)
node dist/mcp/server.js --workspace /path/to/game --http --port 8869
```

Client config (stdio):

```json
{ "mcpServers": { "easyanim": { "command": "node", "args": ["/path/to/easyanim/dist/mcp/server.js", "--workspace", "/path/to/game"] } } }
```

| Tool | Args | Returns |
| --- | --- | --- |
| `workspace_info` | none | cutscenes, sprite sheets present, tracks/ops, poses, backdrops, the known Easy Sprite / FX / SFX / Music ids and a format cheat sheet with the content rules (call first) |
| `list_cutscenes` | `tag?` | summaries: duration, actors, backdrop, and the music / FX / SFX / dialogue refs used |
| `get_cutscene` | `id`, `t?` | the document, its normalized form and, with `t`, the evaluated state |
| `write_cutscene` | `id`, `doc`, `dryRun?` | errors / warnings (JSON paths); saves `cutscenes/<id>.easyanim.json` unless `dryRun` |
| `render_cutscene` | `id`, `t?` | a PNG frame at `t` (or a contact sheet of 8 frames) as an image, plus the state |
| `export_cutscenes` | `ids?`, `tags?`, `preset?` (`godot`, `pixi`, `video`, `json`, `all`), `out?` | export folders, cutscenes, placeholder sheets used |

Suggested flow: `workspace_info` → `write_cutscene` (dryRun) → `write_cutscene` → `render_cutscene` without `t`
(contact sheet) and at key times → `export_cutscenes`.

Security: binds to `127.0.0.1`; other hosts need the startup bearer token (or `EASYANIM_TOKEN`). Paths stay
inside the workspace plus `EASYANIM_ALLOWED_DIRS`.

Content rules (also in the cheat sheet): never depict the Prophet or sacred figures, never use Quran verses or
Arabic calligraphy as decoration; keep the cast multicultural and everyday.
