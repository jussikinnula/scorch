"""Drives the original game in DOSBox-X: keys in, screenshots out, numbers read from the status bar."""
import subprocess, time, os, re, json
import numpy as np
from PIL import Image

D = "/tmp/dos"; ENV = dict(os.environ, DISPLAY=":7", SDL_AUDIODRIVER="dummy")
OX, OY = 82, 100  # where the 640x480 screen of the game is in the screenshot

CFG = dict(GRAPHICS_MODE="640x480", MAX_WIND=0, TRACE="On", STATUS_BAR="On", FREE_MARKET="Off", TUNNELLING="Off",
           HOSTILE_ENVIRONMENT="Off", SKY="Plain", MTN_PERCENT="0.000000", SOUND="Off", FIRE_DELAY=0, FALLING_DELAY=0)
BASE = open(f"{D}/cfg.base", "rb").read().decode("latin1") if os.path.exists(f"{D}/cfg.base") else None

def write_cfg(**over):
    s = BASE
    for k, v in {**CFG, **over}.items():
        s, n = re.subn(r"(?m)^" + k + r"=[^\r\n]*", f"{k}={v}", s); assert n == 1, k
    open(f"{D}/game/SCORCH.CFG", "wb").write(s.encode("latin1"))

def sh(*a): subprocess.run(a, env=ENV, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
def key(*ks, wait=0.25):
    for k in ks: sh("xdotool", "key", "--delay", "40", k)
    time.sleep(wait)
def typ(t): sh("xdotool", "type", "--delay", "80", t); time.sleep(0.4)
def shot(name="s"):
    p = f"{D}/shots/{name}.png"; sh("import", "-window", "root", p)
    return np.asarray(Image.open(p).convert("RGB")).astype(int)

def stop():
    subprocess.run("pkill -9 dosbox-x; pkill -9 Xvfb", shell=True); time.sleep(0.5)

def start(limit=900):
    stop()
    subprocess.Popen(["Xvfb", ":7", "-screen", "0", "800x600x24"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    subprocess.Popen(["dosbox-x", "-fastlaunch", "-nomenu", "-time-limit", str(limit), "-set", "sdl output=surface",
                      "-set", "dosbox machine=svga_s3", "-set", "cpu cycles=30000", "-set", "mixer nosound=true",
                      "-c", f"mount c {D}/game", "-c", "c:", "-c", "scorch"], env=ENV, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(13)

def begin_game():
    key("s", wait=2.5); typ("a"); key("Return", "Return", wait=1.5); typ("b"); key("Return", "Return", wait=4)

# --- reading numbers of the status bar: glyphs are cut apart at empty columns and looked up by their shape
GLYPHS = json.load(open(f"{D}/glyphs.json")) if os.path.exists(f"{D}/glyphs.json") else {}

def glyphs(img, x0, x1, y0, y1):
    """The shapes of the dark glyphs in a box of the game screen, left to right."""
    box = img[OY + y0:OY + y1, OX + x0:OX + x1]
    dark = (box.sum(axis=2) < 200)
    cols = dark.any(axis=0); out = []; x = 0
    while x < len(cols):
        if cols[x]:
            e = x
            while e < len(cols) and cols[e]: e += 1
            g = dark[:, x:e]; rows = np.nonzero(g.any(axis=1))[0]
            g = g[rows[0]:rows[-1] + 1]
            out.append((x0 + x, "/".join("".join("1" if v else "0" for v in r) for r in g)))
            x = e
        else: x += 1
    return out

def number(img, x0, x1, y0, y1):
    gs = glyphs(img, x0, x1, y0, y1)
    try: return int("".join(GLYPHS[g] for _, g in gs))
    except (KeyError, ValueError): return None

POWER = (36, 66, 8, 18); ANGLE = (100, 122, 8, 18); MAXP = (36, 66, 18, 28)
def read(img): return dict(power=number(img, *POWER), angle=number(img, *ANGLE), max=number(img, *MAXP))
