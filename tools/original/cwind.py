import sys, time; sys.path.insert(0, "/tmp/dos")
import harness as h, exp as e
from PIL import Image
tag = sys.argv[1]; mw = int(sys.argv[2]); crops = []
h.write_cfg(MAX_WIND=mw, CHANGING_WIND="On", TRACE="Off"); h.start(170); h.begin_game()
for i in range(26):
    img = h.shot("cw"); who = e.turn(img); st = h.read(img)
    if who is None or not st["max"]: print("over at", i); break
    im = Image.open("/tmp/dos/shots/cw.png").convert("RGB")
    crops.append(im.crop((h.OX + 520, h.OY + 40, h.OX + 640, h.OY + 58)).resize((240, 36)))
    h.key("space", wait=2.2)
h.stop()
cols = 2; rows = (len(crops) + 1) // 2
sheet = Image.new("RGB", (240 * cols, 36 * rows))
for i, c in enumerate(crops): sheet.paste(c, (240 * (i // rows), 36 * (i % rows)))
sheet.save("/tmp/cw%s.png" % tag); print(len(crops))
