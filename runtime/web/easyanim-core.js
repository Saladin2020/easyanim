// Easy Anim core: cutscene evaluation shared by the editor, the CLI renderer and the Pixi runner.
// Generated from src/shared/evaluate.ts by scripts/build-core.mjs. MIT.

// src/shared/sprites.ts
var FRAME = 48;
var FRAME_COLUMNS = [
  "idle",
  "walk0",
  "walk1",
  "walk2",
  "run0",
  "run1",
  "run2",
  "run3",
  "jump0",
  "jump1",
  "wave0",
  "wave1",
  "carry0",
  "carry1",
  "farm0",
  "farm1",
  "cheer0",
  "cheer1",
  "attack0",
  "attack1",
  "hurt0",
  "hurt1",
  "fall0",
  "fall1",
  "sleep0",
  "sleep1",
  "tired0",
  "tired1",
  "sit",
  "crouch"
];
var SIDE_ROWS = ["right", "left", "front"];
var ANIMS = {
  idle: { frames: ["idle"], fps: 1, loop: true },
  walk: { frames: ["walk0", "walk1", "walk2", "walk1"], fps: 8, loop: true },
  run: { frames: ["run0", "run1", "run2", "run3"], fps: 10, loop: true },
  jump: { frames: ["jump0", "jump1"], fps: 4, loop: false },
  wave: { frames: ["wave0", "wave1"], fps: 4, loop: true },
  carry: { frames: ["carry0", "carry1"], fps: 6, loop: true },
  farm: { frames: ["farm0", "farm1"], fps: 3, loop: true },
  cheer: { frames: ["cheer0", "cheer1"], fps: 4, loop: true },
  attack: { frames: ["attack0", "attack1"], fps: 8, loop: false },
  hurt: { frames: ["hurt0", "hurt1"], fps: 6, loop: false },
  fall: { frames: ["fall0", "fall1"], fps: 4, loop: false },
  sleep: { frames: ["sleep0", "sleep1"], fps: 1.5, loop: true },
  tired: { frames: ["tired0", "tired1"], fps: 2, loop: true },
  sit: { frames: ["sit"], fps: 1, loop: true },
  crouch: { frames: ["crouch"], fps: 1, loop: true }
};
var ANIM_NAMES = Object.keys(ANIMS);
function columnOf(frame) {
  return Math.max(0, FRAME_COLUMNS.indexOf(frame));
}

// src/shared/evaluate.ts
var CPS = 28;
function ease(kind, k) {
  if (k <= 0) return 0;
  if (k >= 1) return 1;
  if (kind === "in") return k * k;
  if (kind === "out") return 1 - (1 - k) * (1 - k);
  if (kind === "inOut") return k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k);
  return k;
}
var progress = (ev, t) => ev.dur > 0 ? Math.min(1, (t - ev.t) / ev.dur) : 1;
function isThaiCombining(code) {
  return code === 3633 || code >= 3636 && code <= 3642 || code >= 3655 && code <= 3662;
}
function isThaiLeading(code) {
  return code >= 3648 && code <= 3652;
}
function safeCount(text, n) {
  let c = Math.max(0, Math.min(text.length, n));
  if (c > 0 && c < text.length && isThaiLeading(text.charCodeAt(c - 1))) c++;
  while (c < text.length && c > 0 && isThaiCombining(text.charCodeAt(c))) c++;
  return c;
}
function frameOf(anim, start, t) {
  const a = ANIMS[anim] ?? ANIMS.idle;
  const n = Math.floor((t - start) * a.fps + 1e-6);
  const len = a.frames.length;
  const idx = a.loop ? (n % len + len) % len : Math.max(0, Math.min(n, len - 1));
  return a.frames[idx];
}
function actorsAt(cs, t) {
  const work = /* @__PURE__ */ new Map();
  for (const a of cs.actors) work.set(a.id, { id: a.id, x: a.x, y: a.y, face: a.face, anim: a.anim, start: 0, rest: a.anim, visible: a.visible });
  for (const ev of cs.events) {
    if (ev.t > t) break;
    if (ev.track !== "actor") continue;
    const a = work.get(ev.actor);
    if (!a) continue;
    if (ev.op === "move") {
      const to = ev.to;
      const k = progress(ev, t);
      const e = ease(ev.ease, k);
      if (typeof ev.face === "string") a.face = ev.face;
      else if (to[0] > a.x) a.face = "right";
      else if (to[0] < a.x) a.face = "left";
      a.x = a.x + (to[0] - a.x) * e;
      a.y = a.y + (to[1] - a.y) * e;
      if (k < 1) {
        a.anim = ev.anim;
        a.start = ev.t;
      } else {
        a.anim = a.rest;
        a.start = ev.t + ev.dur;
      }
    } else if (ev.op === "face") {
      a.face = ev.dir;
    } else if (ev.op === "anim") {
      if (ev.dur > 0) {
        if (t < ev.t + ev.dur) {
          a.anim = ev.anim;
          a.start = ev.t;
        } else {
          a.anim = a.rest;
          a.start = ev.t + ev.dur;
        }
      } else {
        a.anim = ev.anim;
        a.rest = ev.anim;
        a.start = ev.t;
      }
    } else if (ev.op === "show") a.visible = true;
    else if (ev.op === "hide") a.visible = false;
  }
  return [...work.values()].map((a) => ({ id: a.id, x: a.x, y: a.y, face: a.face, anim: a.anim, frame: frameOf(a.anim, a.start, t), visible: a.visible }));
}
function evaluate(cs, t) {
  const st = cs.stage;
  const cam = { x: st.camera.x, y: st.camera.y, zoom: st.camera.zoom, sx: 0, sy: 0 };
  const fade = { a: 0, color: "#000000" };
  let line = null;
  const fx = [];
  let music = null;
  for (const ev of cs.events) {
    if (ev.t > t) break;
    const k = progress(ev, t);
    if (ev.track === "camera") {
      if (ev.op === "pan") {
        const to = ev.to;
        const e = ease(ev.ease, k);
        cam.x = cam.x + (to[0] - cam.x) * e;
        cam.y = cam.y + (to[1] - cam.y) * e;
      } else if (ev.op === "zoom") {
        cam.zoom = cam.zoom + (ev.to - cam.zoom) * ease(ev.ease, k);
      } else if (ev.op === "shake" && t < ev.t + ev.dur) {
        const u = t - ev.t;
        const amp = ev.amp * (1 - k);
        cam.sx = amp * Math.sin(u * 94.2477796);
        cam.sy = amp * Math.cos(u * 69.1150384);
      }
    } else if (ev.track === "screen" && ev.op === "fade") {
      fade.a = fade.a + (ev.to - fade.a) * k;
      fade.color = ev.color;
    } else if (ev.track === "dialogue" && t < ev.t + ev.dur) {
      const text = (cs.lang === "th" ? ev.th ?? ev.en : ev.en ?? ev.th) ?? "";
      const speaker = ev.speaker ?? null;
      const actor = speaker ? cs.actors.find((a) => a.id === speaker) : void 0;
      const name = actor ? (cs.lang === "th" ? actor.name?.th ?? actor.name?.en : actor.name?.en ?? actor.name?.th) ?? actor.id : "";
      const shown = safeCount(text, Math.floor((t - ev.t) * CPS + 1e-6));
      line = { i: ev.i, speaker, name, text, shown, ref: ev.ref ?? null, done: shown >= text.length };
    } else if (ev.track === "fx" && t < ev.t + ev.dur) {
      let x = 0;
      let y = 0;
      const off = ev.offset;
      if (Array.isArray(ev.at)) {
        x = ev.at[0];
        y = ev.at[1];
      } else if (typeof ev.actor === "string") {
        const a = actorsAt(cs, ev.t).find((s) => s.id === ev.actor);
        if (a) {
          x = a.x;
          y = a.y;
        }
      }
      fx.push({ i: ev.i, fx: ev.fx, x: x + off[0], y: y + off[1], age: t - ev.t, dur: ev.dur });
    } else if (ev.track === "audio") {
      if (ev.op === "music") music = ev.music;
      else if (ev.op === "music_stop") music = null;
    }
  }
  const halfW = st.width / (2 * cam.zoom);
  const halfH = st.height / (2 * cam.zoom);
  cam.x = st.worldWidth <= 2 * halfW ? st.worldWidth / 2 : Math.max(halfW, Math.min(st.worldWidth - halfW, cam.x));
  cam.y = st.worldHeight <= 2 * halfH ? st.worldHeight / 2 : Math.max(halfH, Math.min(st.worldHeight - halfH, cam.y));
  return { t, actors: actorsAt(cs, t), camera: cam, fade, line, fx, music };
}
function cuesBetween(cs, t0, t1) {
  return cs.events.filter((ev) => ev.t > t0 && ev.t <= t1);
}
function waitInputIn(cs, t0, t1) {
  return cs.events.find((ev) => ev.op === "wait_input" && ev.t >= t0 && ev.t <= t1);
}
export {
  ANIMS,
  CPS,
  FRAME,
  FRAME_COLUMNS,
  SIDE_ROWS,
  actorsAt,
  columnOf,
  cuesBetween,
  ease,
  evaluate,
  frameOf,
  safeCount,
  waitInputIn
};
