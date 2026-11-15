import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { drawBackdrop } from "../../src/shared/backdrops";
import { resolveDoc } from "../../src/shared/cutscene";
import { drawFrame, type Ctx2D } from "../../src/shared/draw";
import { evaluate } from "../../src/shared/evaluate";
import { TRACK_OPS, type Cutscene, type CutsceneDoc, type CutsceneEvent, type Diagnostic, type Track } from "../../src/shared/types";
import { exportCutscenes, fetchCutscene, fetchWorkspace, loadImage, saveCutscene, type WorkspaceSummary } from "./api";

const SCALE = 2;
const PX_PER_SEC = 34;
const TRACK_COLORS: Record<Track, string> = { actor: "#f4ae3d", camera: "#8fc7e8", dialogue: "#f7ebd3", fx: "#e5806c", audio: "#a99be0", screen: "#79c48a" };

const EXPORTS = [
  { id: "godot", label: "Godot 4.3+", hint: "runner + .tscn + .tres" },
  { id: "pixi", label: "PixiJS v8", hint: "easyanim-pixi.js + demo" },
  { id: "video", label: "GIF / MP4", hint: "+ contact sheet" },
  { id: "all", label: "All", hint: "godot · pixi · video · json" },
] as const;

/** Default fields for a new event of track/op at time t. */
function newEvent(track: Track, op: string, t: number, doc: CutsceneDoc): CutsceneEvent {
  const actor = doc.actors[0]?.id ?? "hero";
  const base = { t: Math.round(t * 10) / 10, track, op } as Record<string, unknown>;
  const extra: Record<string, Record<string, unknown>> = {
    "actor.move": { actor, to: [160, doc.stage?.ground ?? 158] },
    "actor.face": { actor, dir: "left" },
    "actor.anim": { actor, anim: "wave", dur: 1 },
    "actor.show": { actor },
    "actor.hide": { actor },
    "camera.pan": { to: [160, 90], dur: 1.5 },
    "camera.zoom": { to: 1.5, dur: 1 },
    "camera.shake": { dur: 0.4, amp: 3 },
    "dialogue.line": { speaker: actor, th: "สวัสดีครับ", en: "Hello!" },
    "fx.spawn": { fx: "sparkle_shine", actor },
    "audio.sfx": { sfx: "coin" },
    "audio.music": { music: "village_day", fade: 1 },
    "audio.music_stop": { fade: 1 },
    "screen.fade": { to: 1, dur: 0.6 },
    "screen.wait": { dur: 1 },
    "screen.wait_input": { dur: 0.5 },
  };
  return { ...base, ...(extra[`${track}.${op}`] ?? {}) } as unknown as CutsceneEvent;
}

function label(e: CutsceneEvent): string {
  const r = e as unknown as Record<string, unknown>;
  switch (`${e.track}.${e.op}`) {
    case "dialogue.line":
      return `${r.speaker ?? "…"}: ${String(r.th ?? r.en ?? r.ref ?? "")}`;
    case "fx.spawn":
      return `✦ ${r.fx}`;
    case "audio.sfx":
      return `♪ ${r.sfx}`;
    case "audio.music":
      return `♫ ${r.music}`;
    case "actor.anim":
      return `${r.anim}`;
    case "actor.face":
      return `face ${r.dir}`;
    case "camera.zoom":
      return `zoom ${r.to}`;
    case "screen.fade":
      return `fade ${r.to}`;
    default:
      return e.op;
  }
}

interface Lane {
  key: string;
  title: string;
  track: Track;
  match: (e: CutsceneEvent) => boolean;
}

export function App() {
  const [ws, setWs] = useState<WorkspaceSummary | null>(null);
  const [id, setId] = useState("village_morning_delivery");
  const [doc, setDoc] = useState<CutsceneDoc | null>(null);
  const [source, setSource] = useState("sample");
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [eventText, setEventText] = useState("");
  const [castText, setCastText] = useState("");
  const [images, setImages] = useState<{ backdrop: HTMLCanvasElement | HTMLImageElement; sheets: Record<string, HTMLImageElement> } | null>(null);
  const [addTrack, setAddTrack] = useState<Track>("dialogue");
  const [addOp, setAddOp] = useState("line");
  const [search, setSearch] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ index: number; x0: number; t0: number } | null>(null);

  useEffect(() => {
    fetchWorkspace().then(setWs).catch((e) => setStatus(String(e)));
  }, []);

  useEffect(() => {
    fetchCutscene(id)
      .then((r) => {
        setDoc(r.doc);
        setSource(r.source);
        setT(0);
        setSel(null);
        setPlaying(false);
      })
      .catch((e) => setStatus(String(e)));
  }, [id]);

  const resolved = useMemo(() => (doc ? resolveDoc(id, doc) : null), [doc, id]);
  const cs: Cutscene | null = resolved?.cutscene ?? null;
  const diags: Diagnostic[] = resolved ? [...resolved.errors, ...resolved.warnings] : [];

  useEffect(() => {
    if (doc) setCastText(JSON.stringify({ stage: doc.stage ?? {}, actors: doc.actors }, null, 2));
  }, [doc]);
  useEffect(() => {
    if (doc && sel !== null && doc.events[sel]) setEventText(JSON.stringify(doc.events[sel], null, 2));
  }, [sel, doc]);

  // backdrop + sheets for the current cast
  const assetKey = cs ? JSON.stringify([cs.stage, cs.actors.map((a) => [a.sprite, a.colors])]) : "";
  useEffect(() => {
    if (!cs) return;
    let alive = true;
    (async () => {
      const st = cs.stage;
      let backdrop: HTMLCanvasElement | HTMLImageElement;
      if (st.image) backdrop = await loadImage(`/api/file?path=${encodeURIComponent(st.image)}`);
      else {
        const b = drawBackdrop(st.backdrop, st.worldWidth, st.worldHeight, st.ground, st.color);
        const c = document.createElement("canvas");
        c.width = b.width;
        c.height = b.height;
        c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(b.data), b.width, b.height), 0, 0);
        backdrop = c;
      }
      const sheets: Record<string, HTMLImageElement> = {};
      for (const a of cs.actors) {
        if (sheets[a.sprite]) continue;
        const q = new URLSearchParams(Object.entries(a.colors ?? {}) as Array<[string, string]>).toString();
        sheets[a.sprite] = await loadImage(`/api/sprites/${a.sprite}.png${q ? `?${q}` : ""}`);
      }
      if (alive) setImages({ backdrop, sheets });
    })().catch((e) => setStatus(String(e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetKey]);

  // draw
  useEffect(() => {
    const c = canvas.current;
    if (!c || !cs || !images) return;
    drawFrame(c.getContext("2d") as unknown as Ctx2D, cs, evaluate(cs, Math.min(t, cs.duration)), images, SCALE, { font: '"IBM Plex Sans Thai", Kanit, sans-serif' });
  }, [cs, images, t]);

  // play loop
  useEffect(() => {
    if (!playing || !cs) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setT((v) => {
        const n = v + dt;
        if (n >= cs.duration) {
          setPlaying(false);
          return cs.duration;
        }
        return n;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, cs]);

  const lanes: Lane[] = useMemo(() => {
    const out: Lane[] = (doc?.actors ?? []).map((a) => ({ key: `actor:${a.id}`, title: a.name?.th ? `${a.id} · ${a.name.th}` : a.id, track: "actor" as Track, match: (e: CutsceneEvent) => e.track === "actor" && (e as { actor?: string }).actor === a.id }));
    for (const tr of ["camera", "dialogue", "fx", "audio", "screen"] as Track[]) out.push({ key: tr, title: tr, track: tr, match: (e) => e.track === tr });
    return out;
  }, [doc]);

  const updateEvents = useCallback((fn: (ev: CutsceneEvent[]) => CutsceneEvent[]) => setDoc((d) => (d ? { ...d, events: fn([...d.events]) } : d)), []);

  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dt = (e.clientX - drag.current.x0) / PX_PER_SEC;
    const nt = Math.max(0, Math.round((drag.current.t0 + dt) * 10) / 10);
    const idx = drag.current.index;
    updateEvents((evs) => {
      evs[idx] = { ...evs[idx]!, t: nt };
      return evs;
    });
  };

  const durOf = (i: number) => cs?.events.find((n) => n.i === i)?.dur ?? 0;
  const total = cs?.duration ?? 10;
  const filtered = (ws?.cutscenes ?? []).filter((c) => !search || c.id.includes(search) || c.th.includes(search) || c.en.toLowerCase().includes(search.toLowerCase()));

  async function save() {
    if (!doc) return;
    try {
      const r = await saveCutscene(id, doc);
      setStatus(r.ok ? `saved ${r.file}` : `not saved: ${r.errors.map((d) => `${d.path} ${d.message}`).join("; ")}`);
      if (r.ok) {
        setSource("workspace");
        setWs(await fetchWorkspace());
      }
    } catch (e) {
      setStatus(String(e));
    }
  }

  async function runExport(preset: string) {
    setStatus(`exporting ${preset}…`);
    try {
      const r = await exportCutscenes([id], preset);
      setStatus(`exported ${r.files} files → ${r.dirs.join(", ")}${r.warnings.length ? ` · ${r.warnings.join("; ")}` : ""}`);
    } catch (e) {
      setStatus(String(e));
    }
  }

  const st = cs ? evaluate(cs, Math.min(t, cs.duration)) : null;

  return (
    <>
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark" />
          <div>
            <h1 className="brand">
              Easy <span>Anim</span>
            </h1>
            <p className="brand-th">คัตซีนไทม์ไลน์ · cutscene timelines for Easy Sprite, Dialogue, FX and Music</p>
          </div>
        </div>
        <div className="status">{status || (cs ? `${cs.events.length} events · ${cs.duration.toFixed(1)} s · ${source}` : "")}</div>
      </header>
      <main className="layout anim-layout">
        <aside className="panel list">
          <input className="search" placeholder="search cutscenes…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <h3>Cutscenes</h3>
          {filtered.map((c) => (
            <button key={c.id} className={`item-btn${c.id === id ? " on" : ""}`} onClick={() => setId(c.id)}>
              <b>{c.id}</b>
              <small>
                {c.th} · {c.duration.toFixed(1)} s{c.source === "workspace" ? " · ws" : ""}
              </small>
            </button>
          ))}
          <h3>Sprites</h3>
          <p className="hint">{ws?.sprites.length ? `sprites/: ${ws.sprites.join(", ")}` : "No sprites/<id>.png in the workspace: actors use placeholder chibis. Drop Easy Sprite side sheets there."}</p>
        </aside>

        <section className="panel preview">
          <div className="toolbar">
            <button className="primary" onClick={() => (t >= total ? (setT(0), setPlaying(true)) : setPlaying(!playing))}>{playing ? "❚❚ Pause" : "▶ Play"}</button>
            <button onClick={() => (setPlaying(false), setT(0))}>⏮</button>
            <input type="range" min={0} max={total} step={0.01} value={Math.min(t, total)} onChange={(e) => (setPlaying(false), setT(Number(e.target.value)))} aria-label="scrub" />
            <span className="mono clock">
              {t.toFixed(2)} / {total.toFixed(2)} s
            </span>
          </div>
          <div className="stage-wrap">
            <canvas ref={canvas} className="stage-canvas" width={(cs?.stage.width ?? 320) * SCALE} height={(cs?.stage.height ?? 180) * SCALE} />
          </div>
          <div className="timeline" onPointerMove={onMove} onPointerUp={() => (drag.current = null)} onPointerLeave={() => (drag.current = null)}>
            <div className="ruler" style={{ width: total * PX_PER_SEC + 140 }} onClick={(e) => {
              const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
              setPlaying(false);
              setT(Math.max(0, Math.min(total, (e.clientX - r.left - 120) / PX_PER_SEC)));
            }}>
              {Array.from({ length: Math.ceil(total) + 1 }, (_, s) => (
                <span key={s} style={{ left: 120 + s * PX_PER_SEC }}>{s % 2 === 0 ? `${s}s` : ""}</span>
              ))}
            </div>
            {lanes.map((lane) => (
              <div className="lane" key={lane.key} style={{ width: total * PX_PER_SEC + 140 }}>
                <span className="lane-title" style={{ color: TRACK_COLORS[lane.track] }}>{lane.title}</span>
                {doc?.events.map((e, i) =>
                  lane.match(e) ? (
                    <div
                      key={i}
                      className={`block${sel === i ? " on" : ""}`}
                      title={`${e.track}.${e.op} @ ${e.t}s${e.note ? ` · ${e.note}` : ""}`}
                      style={{ left: 120 + e.t * PX_PER_SEC, width: Math.max(8, durOf(i) * PX_PER_SEC), borderColor: TRACK_COLORS[e.track], background: `${TRACK_COLORS[e.track]}33` }}
                      onPointerDown={(pe) => {
                        setSel(i);
                        drag.current = { index: i, x0: pe.clientX, t0: e.t };
                      }}
                    >
                      {label(e)}
                    </div>
                  ) : null,
                )}
              </div>
            ))}
            <div className="playhead" style={{ left: 120 + Math.min(t, total) * PX_PER_SEC }} />
          </div>
          <div className="export-grid">
            {EXPORTS.map((x) => (
              <button key={x.id} onClick={() => void runExport(x.id)} disabled={!cs}>
                {x.label}
                <small>{x.hint}</small>
              </button>
            ))}
          </div>
        </section>

        <aside className="panel params">
          <h2>
            {doc?.th ?? id} <small>{doc?.en}</small>
          </h2>
          <div className="row">
            <button className="primary" onClick={() => void save()} disabled={!cs}>
              Save
            </button>
            <span className="hint">{source === "sample" ? "sample: saving writes a workspace copy" : "workspace file"}</span>
          </div>
          <h4>Now · {t.toFixed(2)} s</h4>
          <div className="state mono">
            {st?.actors.map((a) => (
              <div key={a.id}>
                {a.id} {Math.round(a.x)},{Math.round(a.y)} {a.face} {a.frame}
                {a.visible ? "" : " (hidden)"}
              </div>
            ))}
            <div>
              cam {Math.round(st?.camera.x ?? 0)},{Math.round(st?.camera.y ?? 0)} ×{st?.camera.zoom.toFixed(2)} · fade {st?.fade.a.toFixed(2)} · ♫ {st?.music ?? "-"}
            </div>
          </div>
          <h4>Add event at playhead</h4>
          <div className="row">
            <select value={addTrack} onChange={(e) => (setAddTrack(e.target.value as Track), setAddOp(TRACK_OPS[e.target.value as Track][0]!))}>
              {Object.keys(TRACK_OPS).map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
            <select value={addOp} onChange={(e) => setAddOp(e.target.value)}>
              {TRACK_OPS[addTrack].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
            <button
              onClick={() => {
                if (!doc) return;
                updateEvents((evs) => [...evs, newEvent(addTrack, addOp, t, doc)]);
                setSel(doc.events.length);
              }}
            >
              + Add
            </button>
          </div>
          {sel !== null && doc?.events[sel] && (
            <>
              <h4>
                Event #{sel} · {doc.events[sel]!.track}.{doc.events[sel]!.op}
              </h4>
              <textarea className="json" rows={9} value={eventText} onChange={(e) => setEventText(e.target.value)} spellCheck={false} />
              <div className="row">
                <button
                  onClick={() => {
                    try {
                      const v = JSON.parse(eventText) as CutsceneEvent;
                      updateEvents((evs) => ((evs[sel] = v), evs));
                    } catch (err) {
                      setStatus(`event JSON: ${String(err)}`);
                    }
                  }}
                >
                  Apply
                </button>
                <button onClick={() => (setT(doc.events[sel]!.t), setPlaying(false))}>Go to</button>
                <button onClick={() => (updateEvents((evs) => evs.filter((_, i) => i !== sel)), setSel(null))}>Delete</button>
              </div>
            </>
          )}
          <h4>Stage + cast</h4>
          <textarea className="json" rows={10} value={castText} onChange={(e) => setCastText(e.target.value)} spellCheck={false} />
          <button
            onClick={() => {
              try {
                const v = JSON.parse(castText) as Pick<CutsceneDoc, "stage" | "actors">;
                setDoc((d) => (d ? { ...d, stage: v.stage, actors: v.actors } : d));
              } catch (err) {
                setStatus(`cast JSON: ${String(err)}`);
              }
            }}
          >
            Apply stage + cast
          </button>
          <h4>Check · {resolved?.errors.length ?? 0} errors · {resolved?.warnings.length ?? 0} warnings</h4>
          <div className="diag">
            {diags.length === 0 && <p className="hint">valid easyanim/1 · content rules ok</p>}
            {diags.map((d, i) => (
              <p key={i} className={d.severity === "error" ? "err" : "warn"}>
                {d.path}: {d.message}
              </p>
            ))}
          </div>
        </aside>
      </main>
    </>
  );
}
