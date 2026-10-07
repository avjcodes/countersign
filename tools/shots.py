"""Stills of the page at desktop and phone width, for checking the look.

    python -X utf8 tools/shots.py        (the local server must be running on 9420)
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent.parent / "out"
OUT.mkdir(exist_ok=True)
URL = "http://localhost:9420/"
DEAL = "Quote Northwind Logistics for 240 Team seats on a 2 year term with premium support and 18% off, net 60."

with sync_playwright() as p:
    br = p.chromium.launch(channel="chrome", headless=True)
    for name, w, h in (("desktop", 1440, 810), ("phone", 375, 812)):
        pg = br.new_page(viewport={"width": w, "height": h})
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(URL)
        pg.wait_for_load_state("networkidle")
        pg.screenshot(path=str(OUT / f"{name}-0-empty.png"), full_page=True)
        pg.evaluate("countersign.setSpeed(0)")
        shots = [("1-held", DEAL, "none"), ("3-caught", DEAL, "doubleDiscount"),
                 ("4-blocked", "Quote 600 Team seats for Kite Freight, 3 year, 28% off.", "none"),
                 ("5-questions", "Harbor Dental wants a quote with SSO.", "none"),
                 ("6-vp", "Quote 600 Enterprise seats for Alder Health, 3 year, 25% off, with API, net 45.", "none"),
                 ("7-clean", "Quote 40 Starter seats for Pine Street Bakery, annual, 5% off.", "none")]
        for tag, text, slip in shots:
            pg.evaluate("([t, s]) => countersign.run(t, s)", [text, slip])
            pg.wait_for_timeout(1200)
            pg.screenshot(path=str(OUT / f"{name}-{tag}.png"), full_page=True)
            if tag == "1-held":
                pg.click(".sign .btn:not(.ghost) >> nth=0")
                pg.click(".sign .btn:not(.ghost) >> nth=0")
                pg.wait_for_timeout(900)
                pg.screenshot(path=str(OUT / f"{name}-2-signed.png"), full_page=True)
        overflow = pg.evaluate("document.documentElement.scrollWidth - innerWidth")
        print(name, "horizontal overflow px:", overflow, "errors:", errors)
        pg.close()
    br.close()
