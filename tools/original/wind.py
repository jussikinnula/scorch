import sys, json, time; sys.path.insert(0, "/tmp/dos")
import harness as h, exp as e, numpy as np
tag = sys.argv[1]; powers = [300, 400, 500, 350, 450, 250]
h.write_cfg(MAX_WIND=500, FLATLAND="On"); h.start(200); h.begin_game()
img = h.shot("w" + tag); out = []
import shutil; shutil.copy("/tmp/dos/shots/w%s.png" % tag, "/tmp/wind%s.png" % tag)
for i, P in enumerate(powers):
    img = h.shot(); who = e.turn(img); st = h.read(img)
    if who is None or not st["max"]: print("over"); break
    col = e.RED if who == "r" else e.GREEN; t = e.tank(img, col)
    e.set_angle(90); e.set_power(P); before = h.shot(); st = h.read(before)
    h.key("space", wait=5.0); after = h.shot()
    new = e.mask(after, col) & ~e.mask(before, col); new[:40] = False
    ys, xs = np.nonzero(new)
    if len(xs) < 5: print("no trace", who, P); continue
    top = ys.min(); ax = float(xs[ys == top].mean())
    rec = dict(who=who, P=st["power"], angle=st["angle"], tank=t[:2], top_y=int(top), apex_x=ax, turret_top=t[4],
               pts=[(int(x), int(y)) for x, y in zip(xs[::3], ys[::3])])
    out.append(rec); print({k: v for k, v in rec.items() if k != "pts"}, flush=True)
h.shot("wend" + tag); shutil.copy("/tmp/dos/shots/wend%s.png" % tag, "/tmp/windend%s.png" % tag)
h.stop(); json.dump(out, open("/tmp/wind%s.json" % tag, "w"))
