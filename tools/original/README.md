# Measuring the original game

Scripts that run the original Scorched Earth 1.5 in DOSBox-X without a display, press its keys and read the result from screenshots. They are how the numbers in [docs/ORIGINAL.md](../../docs/ORIGINAL.md) were measured. They are rough tools of a measurement, not part of the game.

They need Linux with `dosbox-x`, `Xvfb`, `xdotool`, ImageMagick (`import`) and Python with `numpy` and `Pillow`, and the files of the game in `/tmp/dos/game` (the path is written into the scripts).

- `harness.py` starts the game with a settings file of its own (640x480, no wind, traces on), sends keys, takes screenshots and reads the numbers of the status bar. The digits are recognised by their shape, which is learned once by stepping the power from 200 to 209 (`glyphs.json`).
- `exp.py` plays a game of two players to measure the damage of an explosion: it finds the tanks by their colours, sets the angle and the power for a shot that lands at a wanted place (with the measured ballistics), fires, and reads the energy of the other tank on its turn.

What was learned about driving the game is in docs/ORIGINAL.md, "The settings file".
