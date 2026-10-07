"""Records the walkthrough film by driving the real page with a moving camera.

    python -X utf8 tools/film.py            (the local server must be running on 9420)
    python -X utf8 tools/film.py music.mp3  (same, and lays a music track under it)

The camera is a CSS transform on the page's #cam wrapper, so close-ups are sharp vector
zooms. Frames come from Chrome's screencast with their own timestamps and are encoded
at 30 fps by ffmpeg. Output: out/countersign-film.mp4 (1920x1080).
"""
import base64, json, shutil, subprocess, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent.parent / "out"
RAW = OUT / "raw"
shutil.rmtree(RAW, ignore_errors=True)
RAW.mkdir(parents=True)
VW, VH, DSF = 1440, 810, 4 / 3
DEAL = "Quote Northwind Logistics for 240 Team seats on a 2 year term with premium support and 18% off, net 60."

FILM_CSS = """
html, body { overflow: hidden !important; height: 100%; }
.say { visibility: hidden; }
#cam { transition: transform 1s cubic-bezier(.3,.1,.2,1); }
.f-card { position: fixed; inset: 0; z-index: 50; background: #04070a; display: grid; place-content: center; text-align: center; gap: 14px; transition: opacity .7s; }
.f-card.off { opacity: 0; pointer-events: none; }
.f-card h2 { font: 700 54px/1.1 "Bricolage Grotesque", sans-serif; letter-spacing: -.02em; margin: 0; color: #eaf1f6; opacity: 0; transform: translateY(14px); transition: opacity .7s, transform .7s; }
.f-card h2.b { color: #a9cbff; transition-delay: .9s; }
.f-card p { font: 500 17px "Plus Jakarta Sans", sans-serif; color: #8fa1b1; margin: 14px 0 0; opacity: 0; transition: opacity .7s 1.6s; letter-spacing: .08em; }
.f-card.in h2, .f-card.in p { opacity: 1; transform: none; }
.f-card .ring { width: 74px; height: 74px; border-radius: 50%; border: 4px solid #a9cbff; margin: 0 auto 10px; position: relative; box-shadow: 0 0 40px rgba(169,203,255,.5); }
.f-card .ring::after { content: ""; position: absolute; left: 24px; top: 10px; width: 18px; height: 34px; border: solid #a9cbff; border-width: 0 5px 5px 0; transform: rotate(40deg); }
.f-cap { position: fixed; left: 0; right: 0; bottom: 50px; z-index: 40; text-align: center; font: 700 34px/1.2 "Bricolage Grotesque", sans-serif; color: #fff; text-shadow: 0 2px 30px #000, 0 0 12px #000; opacity: 0; transform: translateY(10px); transition: opacity .35s, transform .35s; }
.f-cap.in { opacity: 1; transform: none; }
.f-shade { position: fixed; left: 0; right: 0; bottom: 0; height: 210px; z-index: 39; background: linear-gradient(transparent, rgba(4,7,10,.94)); opacity: 0; transition: opacity .35s; }
.f-shade.in { opacity: 1; }
"""

FILM_JS = """
(() => {
  const add = (tag, cls, html) => { const n = document.createElement(tag); n.className = cls; n.innerHTML = html; document.body.append(n); return n; };
  const st = document.createElement('style'); st.textContent = __CSS__; document.head.append(st);
  const title = add('div', 'f-card', '<h2>A sales agent can write a quote in seconds.</h2><h2 class="b">Who checks it before it goes out?</h2><p>COUNTERSIGN &nbsp;·&nbsp; A CONCEPT BY ANGEL VALLE JR.</p>');
  const end = add('div', 'f-card off', '<div class="ring"></div><h2>Countersign</h2><p>A CONCEPT BY ANGEL VALLE JR. &nbsp;·&nbsp; AVJCODES.GITHUB.IO</p>');
  const shade = add('div', 'f-shade', '');
  const cap = add('div', 'f-cap', '');
  const cam = document.getElementById('cam');
  window.film = {
    title: (on) => { title.classList.toggle('in', on); title.classList.toggle('off', !on); },
    end: () => { end.classList.remove('off'); end.getBoundingClientRect(); end.classList.add('in'); },
    cap: (text) => { if (!text) { cap.classList.remove('in'); shade.classList.remove('in'); return; } cap.textContent = text; cap.classList.add('in'); shade.classList.add('in'); },
    cam: (s, cx, cy, dur) => { cam.style.transitionDuration = dur + 's'; cam.style.transform = 'translate(' + (__VW__ / 2 - cx * s) + 'px, ' + (__VH__ / 2 - cy * s) + 'px) scale(' + s + ')'; },
    at: (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width, r.height]; },
    caption: () => document.getElementById('caption').textContent,
  };
})();
""".replace("__CSS__", json.dumps(FILM_CSS)).replace("__VW__", str(VW)).replace("__VH__", str(VH))

frames = []  # (path, timestamp)


def main():
    with sync_playwright() as p:
        br = p.chromium.launch(channel="chrome", headless=True)
        ctx = br.new_context(viewport={"width": VW, "height": VH}, device_scale_factor=DSF)
        pg = ctx.new_page()
        pg.goto("http://localhost:9420/")
        pg.wait_for_load_state("networkidle")
        pg.evaluate("document.fonts.ready")
        js = pg.evaluate
        # Measure the layout once with a real run on screen, before the camera exists.
        js("countersign.setSpeed(0)")
        js("t => countersign.run(t, 'none')", DEAL)
        pg.wait_for_timeout(300)
        js(FILM_JS)
        at = lambda sel: js("s => film.at(s)", sel)
        prompt, sheet, route, trail = at(".prompt"), at("#sheet"), at(".route-wrap"), at("#trail")
        pg.reload()
        pg.wait_for_load_state("networkidle")
        pg.evaluate("document.fonts.ready")
        js(FILM_JS)
        pg.fill("#ask", "")

        cam = lambda s, cx, cy, dur=1.0: js("a => film.cam(a[0], a[1], a[2], a[3])", [s, cx, cy, dur])
        cap = lambda text: js("t => film.cap(t)", text)
        hold = lambda s: pg.wait_for_timeout(int(s * 1000))

        def until(prefix, limit=30, mirror=False):
            # mirror: show each check's name as the film caption while the check runs
            end, last = time.time() + limit, None
            while time.time() < end:
                now = js("film.caption()")
                if now.startswith(prefix):
                    return
                if mirror and now != last and not now.startswith("A separate check"):
                    cap("Check: " + now)
                    last = now
                pg.wait_for_timeout(40)
            raise SystemExit(f"never saw caption starting {prefix!r}; got {js('film.caption()')!r}")

        cdp = ctx.new_cdp_session(pg)

        def on_frame(ev):
            path = RAW / f"f{len(frames):05d}.jpg"
            path.write_bytes(base64.b64decode(ev["data"]))
            frames.append((path, ev["metadata"]["timestamp"]))
            cdp.send("Page.screencastFrameAck", {"sessionId": ev["sessionId"]})

        cdp.on("Page.screencastFrame", on_frame)
        cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 93, "maxWidth": 1920, "maxHeight": 1080, "everyNthFrame": 1})

        # 1. Title
        hold(0.3)
        js("film.title(true)")
        cam(1.0, VW / 2, prompt[1] + 150, 0)
        hold(3.8)
        js("film.title(false)")
        hold(0.5)

        # 2. A rep types the deal
        js("document.getElementById('ask').focus({preventScroll: true})")
        cam(1.07, VW / 2, prompt[1] + 95, 5)
        pg.keyboard.type(DEAL, delay=30)
        hold(0.5)
        js("document.getElementById('form').requestSubmit(); scrollTo(0, 0)")

        # 3. The agent reads it and drafts the quote
        cam(1.45, sheet[0] + 130, sheet[1] - 70, 0.9)
        until("The agent drafts")
        cam(1.4, sheet[0] + 120, sheet[1] - 10, 1.8)
        cap("The agent drafts the quote.")
        until("A separate check")

        # 4. The check
        cap("A separate check works the price out again.")
        cam(1.42, route[0] + 72, route[1] - 12, 1.0)
        hold(1.5)
        until("Held for", mirror=True)
        cam(1.5, route[0] + 80, route[1] - 12, 2.4)
        cap("Held for the sales manager and finance.")
        hold(2.4)

        # 5. People sign
        cap("The agent cannot sign for anyone.")
        cam(1.7, route[0] + 150, route[1] - 10, 1.2)
        hold(1.3)
        js("countersign.decide('Sales manager', 'approved')")
        hold(1.0)
        js("countersign.decide('Finance', 'approved')")
        hold(1.5)
        cap("")
        cap("Signed. Ready to send.")
        cam(1.25, sheet[0] + 190, sheet[1] + 10, 0.9)
        hold(2.3)

        # 6. Make the agent get it wrong
        cap("Now make the agent get it wrong.")
        cam(1.42, route[0] + 72, route[1] - 12, 1.0)
        js("countersign.setSpeed(0.62)")
        js("t => { countersign.run(t, 'doubleDiscount'); }", DEAL)
        until("A separate check")
        cap("It applied the discount twice.")
        until("Caught")
        cap("Caught, and sent back to the agent.")
        cam(1.75, route[0] - 26, route[1] - 40, 1.6)
        until("The agent tries again")
        cam(1.06, VW / 2, sheet[1] - 10, 1.2)
        cap("Draft two passes, and still has to be signed.")
        until("Held for")
        hold(2.2)

        # 7. The trail, then the end card
        trail = at("#trail") if False else trail
        cap("Every step is on the trail.")
        cam(1.3, trail[0] + 60, trail[1] + 60, 1.3)
        hold(3.0)
        cap("")
        js("film.end()")
        hold(4.2)
        cdp.send("Page.stopScreencast")
        hold(0.2)
        br.close()

    listing = RAW / "frames.txt"
    with listing.open("w", encoding="utf-8") as f:
        for i, (path, t) in enumerate(frames):
            nxt = frames[i + 1][1] if i + 1 < len(frames) else t + 0.5
            f.write(f"file '{path.as_posix()}'\nduration {max(nxt - t, 0.001):.4f}\n")
        f.write(f"file '{frames[-1][0].as_posix()}'\n")
    length = frames[-1][1] - frames[0][1] + 0.5
    print(f"{len(frames)} frames over {length:.1f} s ({len(frames) / length:.1f} per second)")

    mp4 = OUT / "countersign-film.mp4"
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(listing)]
    music = sys.argv[1] if len(sys.argv) > 1 else None
    if music:
        cmd += ["-i", music]
    cmd += ["-vf", "fps=30,scale=1920:1080:flags=lanczos,vignette=PI/5.5", "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-map_metadata", "-1"]
    if music:
        cmd += ["-af", f"afade=t=in:d=0.4,afade=t=out:st={length - 3.2:.2f}:d=3.2,loudnorm=I=-16:TP=-1.5", "-c:a", "aac", "-b:a", "192k", "-t", f"{length:.2f}"]
    else:
        cmd += ["-an"]
    subprocess.run(cmd + [str(mp4)], check=True)
    print(mp4)


main()
