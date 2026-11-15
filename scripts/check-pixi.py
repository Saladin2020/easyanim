"""Headless Chrome sanity check of a Pixi export: the runner loads, plays, fires cues, waits for input and seeks.

  python3 scripts/check-pixi.py <pixi-export-dir> [screenshot.png]

Serves the folder on 127.0.0.1:8991, waits for window.__ready, lets the first cutscene play for a few seconds
(time advances, dialogue and music cues fire), seeks and compares the runner state with easyanim-core's
evaluate(), opens loy_krathong_night (if exported) to check wait_input pauses until advance(), and screenshots.
Prints a JSON report; exit 1 on any failure.
"""
import asyncio, json, os, subprocess, sys, time
from playwright.async_api import async_playwright

DIR = sys.argv[1]
SHOT = sys.argv[2] if len(sys.argv) > 2 else None
PORT = 8991
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"], cwd=DIR, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)


async def main():
    man = json.load(open(os.path.join(DIR, "easyanim.json")))
    ids = [c["id"] for c in man["cutscenes"]]
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get("CHROME_PATH", "/usr/bin/google-chrome"), args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 1100, "height": 760})
        errs = []
        # resource failures are reported (with their URL) by the response handler below
        pg.on("console", lambda m: errs.append(f"{m.type}: {m.text}") if m.type == "error" and "Failed to load resource" not in m.text else None)
        pg.on("pageerror", lambda e: errs.append(str(e)))
        # the page probes ./pixi.min.js before the CDN — that 404 is expected
        pg.on("response", lambda r: errs.append(f"http {r.status}: {r.url}") if r.status >= 400 and not r.url.endswith("/pixi.min.js") else None)
        await pg.goto(f"http://127.0.0.1:{PORT}/index.html")
        await pg.wait_for_function("window.__ready === true", timeout=45000)
        report = {"cutscenes": ids}
        t0 = await pg.evaluate("() => window.__anim.cs.time")
        first = json.load(open(os.path.join(DIR, "cutscenes", ids[0] + ".json")))
        first_line = min(e["t"] for e in first["events"] if e["op"] == "line")
        wait = min(first_line + 1.0, first["duration"])
        await pg.wait_for_timeout(int(wait * 1000))
        report["played_for"] = wait
        report["time"] = await pg.evaluate("() => window.__anim.cs.time")
        report["advancing"] = report["time"] > t0 + wait * 0.6
        report["lines_fired"] = await pg.evaluate("() => window.__anim.lines.length")
        report["music_fired"] = await pg.evaluate("() => window.__anim.music")
        parity = await pg.evaluate("""async () => {
          const core = await import('./easyanim-core.js');
          const cs = window.__anim.cs; cs.pause();
          const out = [];
          for (const t of [3, 9.5, 14, 22, 27]) { if (t > cs.duration) continue; cs.seek(t);
            out.push(JSON.stringify(core.evaluate(cs.data, cs.time)) === JSON.stringify(cs.state)); }
          return out; }""")
        report["seek_parity"] = parity
        await pg.evaluate("() => { const cs = window.__anim.cs; cs.seek(9.5); }")
        if SHOT:
            await pg.wait_for_timeout(300)
            await pg.screenshot(path=SHOT)
        if "loy_krathong_night" in ids:
            await pg.evaluate("() => window.__anim.open('loy_krathong_night')")
            await pg.evaluate("() => { const cs = window.__anim.cs; cs.seek(20.5); cs.play(); }")
            await pg.wait_for_timeout(2500)
            w = await pg.evaluate("() => ({ waiting: window.__anim.cs.waiting, time: window.__anim.cs.time })")
            await pg.evaluate("() => window.__anim.cs.advance()")
            await pg.wait_for_timeout(1000)
            after = await pg.evaluate("() => window.__anim.cs.time")
            report["wait_input"] = {"waiting": w["waiting"], "held_at": w["time"], "after_advance": after}
            report["wait_ok"] = w["waiting"] and abs(w["time"] - 21.8) < 0.01 and after > 22.3
        report["errors"] = errs
        await b.close()
    ok = report["advancing"] and report["lines_fired"] > 0 and len(report["music_fired"]) > 0 and all(report["seek_parity"]) and report.get("wait_ok", True) and not errs
    report["ok"] = ok
    print(json.dumps(report, indent=2))
    return ok


try:
    ok = asyncio.run(main())
finally:
    srv.terminate()
sys.exit(0 if ok else 1)
