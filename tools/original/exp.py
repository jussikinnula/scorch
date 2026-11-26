import sys, math, time, json; sys.path.insert(0, "/tmp/dos")
import harness as h, numpy as np
RED, GREEN = (255, 40, 40), (142, 223, 40)
G = 0.2; K = 0.02  # measured: gravity and speed per unit of power at 640x480

def mask(img, col): return (img[h.OY:h.OY + 480, h.OX:h.OX + 640] == np.array(col)).all(axis=2)
def tank(img, col):
    m = mask(img, col); m[:60] = False  # not the status bar
    ys, xs = np.nonzero(m)
    return None if len(xs) < 10 else (float(np.median(xs)), float(ys.max()), int(xs.min()), int(xs.max()), int(ys.min()))
def turn(img):
    b = img[h.OY + 6:h.OY + 20, h.OX + 118:h.OX + 150]
    r = (b == np.array(RED)).all(axis=2).sum(); g = (b == np.array(GREEN)).all(axis=2).sum()
    return "r" if r > g and r > 3 else "g" if g > 3 else None

def internal_angle():
    """The angle of the turret from the right horizon, 0-180. The bar shows 0-90, so the side is found by turning."""
    d = h.read(h.shot())["angle"]; h.key("Left"); d2 = h.read(h.shot())["angle"]
    return d2 if d2 > d or d2 == 90 else 180 - d2
def set_angle(target):
    a = internal_angle(); n = target - a
    h.key(*(["Left" if n > 0 else "Right"] * abs(n)))
def set_power(target):
    for _ in range(4):
        p = h.read(h.shot())["power"]; n = target - p
        if n == 0: return
        big, small = divmod(abs(n), 15)
        h.key(*(["Prior" if n > 0 else "Next"] * big), *(["Up" if n > 0 else "Down"] * small))

def power_for(dx, dy, theta):
    """The power that carries a shot dx to the right and dy up, fired at theta (degrees from the horizon towards the target)."""
    t = math.radians(theta); den = 2 * math.cos(t) ** 2 * (abs(dx) * math.tan(t) - dy)
    return None if den <= 0 else math.sqrt(G * dx * dx / den) / K

def fire_and_wait(was, limit=40):
    """Fires, and waits until the shot is over: the bar shows the other player with a real reading, twice in a row."""
    h.key("space", wait=1.0); t0 = time.time(); seen = None
    while time.time() - t0 < limit:
        img = h.shot(); who = turn(img); st = h.read(img)
        ok = who is not None and who != was and st["max"] and st["power"] is not None and st["angle"] is not None
        if ok and seen == (who, st["max"], st["power"]): return img
        seen = (who, st["max"], st["power"]) if ok else None
        time.sleep(0.5)
    return h.shot()

def run(S, V, offsets, cfg, shots=14, dummy=(90, 1000)):
    h.write_cfg(**cfg); h.start(600); h.begin_game()
    img = h.shot(); pos = {"r": tank(img, RED), "g": tank(img, GREEN)}
    print("tanks", {k: v[:2] for k, v in pos.items()}, "first", turn(img), flush=True)
    results = []; energy = {"r": 100.0, "g": 100.0}; offsets = list(offsets)
    for i in range(60):
        img = h.shot(); who = turn(img); st = h.read(img)
        if who is None or st["max"] is None: print("round over", flush=True); break
        if st["max"] / 10 != energy[who] and who == V and results and results[-1]["after"] is None:
            pass
        prev = energy[who]; energy[who] = st["max"] / 10
        if who == V:
            if results and results[-1]["after"] is None: results[-1]["after"] = energy[V]
            elif energy[V] != prev: print("victim changed without a shot at it", prev, energy[V])
            set_angle(dummy[0]); set_power(dummy[1]); fire_and_wait(V); continue
        if energy[S] != prev: print("shooter energy changed", prev, energy[S])
        if not offsets or len(results) >= shots: break
        off = offsets.pop(0)
        sx, sy = pos[S][0], pos[S][4]; vx, vy = pos[V][0], pos[V][1]
        dx = (vx + off) - sx; dy = sy - (vy - 4)
        for theta in (70, 60, 50, 40):
            P = power_for(dx, dy, theta)
            if P and P <= 1000 and (K * P * math.sin(math.radians(theta))) ** 2 / (2 * G) < sy - 40 + 60: break
        set_angle(theta if dx > 0 else 180 - theta); set_power(round(P))
        before = h.shot(); after = fire_and_wait(S)
        col = RED if S == "r" else GREEN
        new = mask(after, col) & ~mask(before, col); new[:40] = False
        ys, xs = np.nonzero(new)
        if len(xs) == 0: print("no new trace"); continue
        j = np.argmax(xs * (1 if dx > 0 else -1)); ex, ey = float(xs[j]), float(ys[xs == xs[j]].max())
        results.append(dict(theta=theta, P=round(P), end=(ex, ey), dx=round(ex - vx, 1), dy=round(ey - vy, 1), before=energy[V], after=None))
        print(results[-1], flush=True)
    h.stop(); return results, pos

SKY = (36, 36, 125)
def field(img): return img[h.OY:h.OY + 480, h.OX:h.OX + 640]
def terrain_colour(img):
    from collections import Counter
    c = Counter(map(tuple, field(img)[40:478, 2:638].reshape(-1, 3)))
    return next(col for col, _ in c.most_common(4) if tuple(int(v) for v in col) != SKY)
def crater(before, after, ground):
    """The centre and the radius of the hole a shot made: a circle fitted to the edge of the dirt that went."""
    b = (field(before) == np.array(ground)).all(axis=2); a = (field(after) == np.array(ground)).all(axis=2)
    gone = b & ~a; gone[:40] = False
    if gone.sum() < 12: return None
    edge = gone & (np.roll(a, 1, 0) | np.roll(a, -1, 0) | np.roll(a, 1, 1) | np.roll(a, -1, 1))
    ys, xs = np.nonzero(edge)
    if len(xs) < 8: return None
    A = np.c_[2 * xs, 2 * ys, np.ones(len(xs))]; sol = np.linalg.lstsq(A, xs ** 2 + ys ** 2, rcond=None)[0]
    cx, cy = sol[0], sol[1]; r = math.sqrt(sol[2] + cx * cx + cy * cy)
    return round(float(cx), 1), round(float(cy), 1), round(r, 1), int(gone.sum())

def run2(S, V, offsets, cfg, dummy=(90, 1000)):
    h.write_cfg(**cfg); h.start(700); h.begin_game()
    img = h.shot(); pos = {"r": tank(img, RED), "g": tank(img, GREEN)}; ground = terrain_colour(img)
    print("tanks", {k: v[:2] for k, v in pos.items()}, "first", turn(img), flush=True)
    results = []; energy = {"r": 100.0, "g": 100.0}; offsets = list(offsets); pending = None
    for i in range(80):
        img = h.shot(); who = turn(img); st = h.read(img)
        if who is None or not st["max"]: print("round over", who, st, flush=True); break
        prev = energy[who]; energy[who] = st["max"] / 10
        if who == V:
            if pending: pending["after"] = energy[V]; results.append(pending); print(pending, flush=True); pending = None
            elif energy[V] != prev: print("victim changed by its own shot", prev, energy[V], flush=True)
            away = 45 if pos[V][0] > pos[S][0] else 135
            set_angle(away); set_power(175); h.key("space", wait=2.0); continue
        if energy[S] != prev: print("shooter energy changed", prev, energy[S], flush=True)
        if not offsets: break
        off = offsets.pop(0)
        sx, sy = pos[S][0], pos[S][4]; vx, vy = pos[V][0], pos[V][1]
        dx = (vx + off) - sx; dy = sy - (vy - 4); theta = P = None
        for theta in (75, 65, 55, 45):
            P = power_for(dx, dy, theta)
            if P and P <= 1000 and (K * P * math.sin(math.radians(theta))) ** 2 / (2 * G) < sy - 40 + 60: break
        if not P or P > 1000: print("cannot reach"); break
        set_angle(theta if dx > 0 else 180 - theta); set_power(round(P))
        before = h.shot(); h.key("space", wait=2.0); after = h.shot()
        c = crater(before, after, ground)
        vt = tank(after, RED if V == "r" else GREEN)
        pending = dict(P=round(P), theta=theta, crater=c, victim=vt and vt[:2], before=energy[V], after=None,
                       d=c and vt and round(math.hypot(c[0] - vt[0], c[1] - (vt[1] - 4)), 1))
        if c is None: print("no crater", flush=True)
    h.stop(); return results
