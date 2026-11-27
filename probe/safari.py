"""Desktop Safari walk of the built site through safaridriver (probe only). Usage: safari.py <output dir>"""
import subprocess
import sys
import time

from selenium import webdriver
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys

BASE = "http://127.0.0.1:4173"
OUT = sys.argv[1]
failures = 0


def check(name, ok, detail=""):
    global failures
    if not ok:
        failures += 1
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  ({detail})" if detail else ""), flush=True)


driver = webdriver.Safari()
js = driver.execute_script


def wait_for(expression, timeout=10.0):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if js("return " + expression):
                return True
        except Exception:
            pass
        time.sleep(0.25)
    return False


def shot(name):
    driver.save_screenshot(f"{OUT}/{name}.png")
    # What is really on the screen, in case the driver's own picture comes out blank.
    subprocess.run(["screencapture", "-x", f"{OUT}/{name}-screen.png"], check=False)


def escape():
    ActionChains(driver).send_keys(Keys.ESCAPE).perform()


def walk(tag, width, height):
    driver.set_window_rect(x=0, y=0, width=width, height=height)
    driver.get(BASE + "/?scene=stone")
    time.sleep(5)
    shot(f"{tag}01-cover")
    # Why a screen capture can show an empty page: hidden document, stalled animations, or nothing painted.
    print(f"[{tag}] paint state", js("return { visibility: document.visibilityState, focus: document.hasFocus(), "
          "h1: getComputedStyle(document.querySelector('h1')).opacity, video: (document.querySelector('video.hero-video') || {}).readyState, "
          "animations: document.getAnimations().map(a => a.playState + ':' + Math.round(a.currentTime || 0)).slice(0, 8) }"), flush=True)
    state = js("return { view: document.documentElement.dataset.view, title: document.title, h1: (document.querySelector('h1') || {}).textContent || '', size: [innerWidth, innerHeight] }")
    check(f"[{tag}] cover first", state["view"] == "cover" and "Renjun" in state["h1"], str(state))
    check(f"[{tag}] title is the name", state["title"] == "Renjun Gao", state["title"])
    early = js("return performance.getEntriesByType('resource').map(e => e.name).filter(u => /\\/media\\/derived\\/pub-|\\/media\\/derived\\/(hero-bus|project-|lc4dvit)/.test(u))")
    check(f"[{tag}] figures below the cover wait", not early, " ".join(early[:3]))

    driver.find_element(By.CSS_SELECTOR, ".scroll-cue").click()
    lifted = wait_for("document.documentElement.dataset.view === 'content'", 8)
    time.sleep(2)
    check(f"[{tag}] the chevron opens the content", lifted and js("return location.hash") == "#about")
    shot(f"{tag}02-about")
    for _ in range(40):
        done = js("window.scrollBy(0, innerHeight * 0.8); return innerHeight + scrollY >= document.documentElement.scrollHeight - 2")
        time.sleep(0.4)
        if done:
            break
    time.sleep(5)
    shot(f"{tag}03-bottom")
    images = js("return [...document.querySelectorAll('main img')].filter(i => i.currentSrc || i.getAttribute('src')).map(i => ({ src: (i.currentSrc || i.src).replace(location.origin, ''), ok: i.complete && i.naturalWidth > 0, done: i.complete }))")
    bad = [image["src"] for image in images if image["done"] and not image["ok"]]
    waiting = [image["src"] for image in images if not image["done"]]
    check(f"[{tag}] all {len(images)} images decode", not bad, " ".join(bad[:4]))
    check(f"[{tag}] no image still loading", not waiting, " ".join(waiting[:4]))

    js("document.getElementById('publications').scrollIntoView({ block: 'start' })")
    time.sleep(1.5)
    driver.find_element(By.CSS_SELECTOR, ".publication-thumbnail").click()
    shown = wait_for("(() => { const i = document.querySelector('dialog[open] img'); return !!i && i.complete && i.naturalWidth > 0; })()", 20)
    time.sleep(1.5)
    shot(f"{tag}04-lightbox")
    check(f"[{tag}] lightbox shows the full figure", shown)
    escape()
    check(f"[{tag}] lightbox closes", wait_for("!document.querySelector('dialog[open]')", 6))

    js("document.getElementById('projects').scrollIntoView({ block: 'start' })")
    time.sleep(1.5)
    driver.find_element(By.CSS_SELECTOR, ".showcase-image").click()
    opened = wait_for("!!document.querySelector('dialog.project-dialog[open]')", 6)
    time.sleep(2)
    shot(f"{tag}05-project")
    check(f"[{tag}] project sheet opens", opened)
    escape()
    check(f"[{tag}] project sheet closes", wait_for("!document.querySelector('dialog[open]')", 6))

    if width > 900:
        driver.find_element(By.CSS_SELECTOR, 'nav.nav-links a[href="/#publications"]').click()
        time.sleep(2.5)
        lens = js("const a = document.querySelector('nav.nav-links a[aria-current]'); const l = document.querySelector('.nav-lens'); return a && l ? [parseFloat(l.style.left), parseFloat(l.style.width), a.offsetLeft, a.offsetWidth] : null")
        check(f"[{tag}] navigation lens rests on the active link", bool(lens) and abs(lens[0] - lens[2]) < 1 and abs(lens[1] - lens[3]) < 1, str(lens))

    driver.get(BASE + "/publications?scene=stone")
    time.sleep(3)
    shot(f"{tag}06-publication-list")
    check(f"[{tag}] /publications lists the papers", js("return document.querySelectorAll('.publication-item').length") >= 5)
    driver.get(BASE + "/no-such-page?scene=stone")
    time.sleep(2)
    shot(f"{tag}07-not-found")
    text = js("return (document.querySelector('main') || document.body).innerText").lower()
    check(f"[{tag}] unknown address shows the not-found page", "not found" in text or "404" in text)
    driver.get(BASE + "/?scene=night-sea#publications")
    time.sleep(4)
    shot(f"{tag}08-dark-publications")


try:
    print("Safari", driver.capabilities.get("browserVersion"), flush=True)
    walk("w-", 1024, 768)
    walk("n-", 700, 768)
    try:
        driver.set_window_rect(x=0, y=0, width=1024, height=768)
        driver.fullscreen_window()
        time.sleep(3)
        driver.get(BASE + "/?scene=stone")
        time.sleep(5)
        shot("f-01-fullscreen-cover")
        driver.get(BASE + "/?scene=stone#about")
        time.sleep(4)
        shot("f-02-fullscreen-about")
        print("fullscreen", js("return [innerWidth, innerHeight, screen.width, screen.height]"), flush=True)
    except Exception as error:
        print("fullscreen not available:", str(error).splitlines()[0], flush=True)
except Exception as error:
    check("walk finished", False, str(error).splitlines()[0][:300])
finally:
    driver.quit()
print(f"\n{failures} check(s) failed" if failures else "\nall checks passed")
