import sys, time, shutil; sys.path.insert(0, "/tmp/dos")
import harness as h
from PIL import Image
n = int(sys.argv[1]); mw = int(sys.argv[2]); crops = []
for i in range(n):
    try:
        h.write_cfg(MAX_WIND=mw); h.start(60); h.begin_game(); h.shot("ws")
        im = Image.open("/tmp/dos/shots/ws.png").convert("RGB")
        crops.append(im.crop((h.OX + 520, h.OY + 40, h.OX + 640, h.OY + 58)).resize((360, 54)))
    except Exception as x: print("fail", i, x)
    h.stop(); time.sleep(1.5)
sheet = Image.new("RGB", (360, 54 * len(crops)))
for i, c in enumerate(crops): sheet.paste(c, (0, 54 * i))
sheet.save("/tmp/ws%d.png" % mw); print(len(crops))
