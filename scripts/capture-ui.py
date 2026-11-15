"""Screenshot the web editor (needs `easyanim serve` running). Usage: python3 scripts/capture-ui.py [url] [out.png] [cutscene-id] [seconds]"""
import sys
from playwright.sync_api import sync_playwright

url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8868/"
out = sys.argv[2] if len(sys.argv) > 2 else "docs/assets/editor.png"
pick = sys.argv[3] if len(sys.argv) > 3 else "raya_open_house"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
    pg.goto(url)
    pg.wait_for_timeout(1200)
    loc = pg.get_by_text(pick, exact=False).first
    if loc.count():
        loc.click()
    pg.wait_for_timeout(1500)
    at = sys.argv[4] if len(sys.argv) > 4 else "15.5"
    # set the scrubber through the native setter so React sees the change
    pg.evaluate("""(at) => { const el = document.querySelector('input[type=range]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, at);
      el.dispatchEvent(new Event('input', { bubbles: true })); }""", at)
    pg.wait_for_timeout(1200)
    pg.screenshot(path=out)
    b.close()
    print("errors:", errors)
    print(out)
