# The original game

What Scorched Earth 1.5 (Wendell Hicken, 1995, shareware) can do, as a reference for [PLAN.md](PLAN.md). It is collected from the manual of the game (`SCORCH.DOC`), from the names of the settings inside `SCORCH.EXE`, and from running the game.

Each fact is marked by where it comes from only when it is not the manual: **(seen)** means it was checked in the running game.

## Running the original

The game runs in [DOSBox-X](https://dosbox-x.com). Keep the files of the game in the folder `reference/` of the repository, which is in `.gitignore`: the game is not ours to redistribute.

```
dosbox-x -fastlaunch -time-limit 120 \
  -set "dosbox machine=svga_s3" -set "cpu cycles=20000" \
  -c "mount c reference" -c "c:" -c "scorch"
```

`-time-limit` (seconds) ends the run by itself, which makes a measurement repeatable: the same keys at the same times, and screenshots at known moments. On a machine without a display the same works under Xvfb, with the keys sent by `xdotool` and the screenshots taken with ImageMagick (`import -window root`). This is how the facts marked (seen) were checked.

Useful keys **(seen)**: in the main menu the highlighted letter of an entry opens it (`e` Economics, `y` Physics, `l` Landscape, `t` Play Options, `w` Weapons, `h` Hardware, `s` Start) and Escape closes a menu. In a menu the highlighted letter of a setting steps its value up or to the next choice; how to step down has not been found yet (Alt with the letter did nothing). When the game starts, each player types a name and presses Enter twice. On the buying screen Tab changes between weapons and accessories; by the manual Page Down shows the next page.

## Game settings

The settings are stored in `SCORCH.CFG` under the names in the last column.

### Main menu

| Setting | Range  | Default | Key          |
| ------- | ------ | ------- | ------------ |
| Players | 2–10   | 2       | `MAXPLAYERS` |
| Rounds  | 1–1000 | 10      | `MAXROUNDS`  |

### Economics

| Setting       | Range                   | Default  | Key             | Meaning                                                                                                                                                                                                                                 |
| ------------- | ----------------------- | -------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interest Rate | 0–0.30                  | 0.05     | `INTEREST_RATE` | Unspent money earns interest at the start of each round. Also affects the price of Auto Defense.                                                                                                                                        |
| Cash at Start | $0–$1,000,000           | $0       | `INITIAL_CASH`  | If not zero, everyone gets to buy before the first round. One step is $5,000 **(seen)**.                                                                                                                                                |
| Computers Buy | on/off                  | on       | `COMPUTERS_BUY` | Whether the computer players buy.                                                                                                                                                                                                       |
| Free Market   | on/off                  | off      | `FREE_MARKET`   | The prices follow the demand, and the market is remembered between games in `SCORCH.MKT`.                                                                                                                                               |
| Scoring Mode  | Basic, Standard, Greedy | Standard | `SCORING`       | Basic: points only for kills and for surviving. Standard: fewer points for a kill, points for all damage to tanks and shields. Greedy: as Standard, but the ranking is by net worth (cash plus the depreciated value of the inventory). |

Points are money: what a player scores in a round is what there is to spend after it. A player loses points for hitting itself, and in team games for hitting a teammate.

### Physics

| Setting         | Range                                                               | Default | Key             |
| --------------- | ------------------------------------------------------------------- | ------- | --------------- |
| Air Viscosity   | 0–20                                                                | 0       | `AIR_VISCOSITY` |
| Gravity         | 0.05–10                                                             | 0.2     | `GRAVITY`       |
| Suspend Dirt    | 0–100 %                                                             | 0       | `SUSPEND_DIRT`  |
| Tanks Fall      | on/off                                                              | on      | `FALLING_TANKS` |
| Borders Extend  | 0–10000                                                             | 75      | `EDGES_EXTEND`  |
| Effect of Walls | None, Concrete, Padded, Rubber, Spring, Wraparound, Random, Erratic | None    | `ELASTIC`       |

- Suspend Dirt lets dirt stay in the air. The manual describes the number as the chance, per shot, that the dirt falls, which does not fit the default of 0 (dirt always falls); to be checked. SCORCH takes the number as the chance, for each explosion, that the dirt stays in the air (`suspendDirt`), without having measured it.
- Borders Extend is how far outside the screen a projectile is followed before it counts as a miss.
- Walls: Concrete stops a shot, Padded reflects it with a loss of energy, Rubber reflects it, Spring reflects it with a kick, Wraparound joins the left and the right edge. Random picks one for each round, Erratic for each shot. The colour of the border tells which is in effect.

### Landscape

| Setting                   | Range                                                       | Default | Key                   |
| ------------------------- | ----------------------------------------------------------- | ------- | --------------------- |
| Sky                       | Plain, Stormy, Stars, Shaded, Sunset, Cavern, Black, Random | Random  | `SKY`                 |
| Max. Wind                 | 0–500                                                       | 200     | `MAX_WIND`            |
| Changing Wind             | on/off                                                      | off     | `CHANGING_WIND`       |
| Hostile Environment       | on/off                                                      | on      | `HOSTILE_ENVIRONMENT` |
| Bumpiness                 | 0–100                                                       | 20      |                       |
| Slope                     | 0–100                                                       | 20      |                       |
| Flatten Peaks             | on/off                                                      | off     | `FLATLAND`            |
| Random Land               | on/off                                                      | off     | `RANDOM_LAND`         |
| Percent Scanned Mountains | 0–100                                                       | 20      | `MTN_PERCENT`         |

Some skies attack by themselves (lightning in Stormy) when Hostile Environment is on. Cavern has a ceiling. Changing Wind changes the wind a little between each shot.

### Play options

| Setting          | Range                                            | Default    | Key                |
| ---------------- | ------------------------------------------------ | ---------- | ------------------ |
| Mode             | Sequential, Synchronous, Simultaneous            | Sequential | `PLAY_MODE`        |
| Teams            | None, Standard, Corporate, Vicious               | None       | `TEAM_MODE`        |
| Play Order       | Random, Losers-First, Winners-First, Round-Robin | Random     | `PLAY_ORDER`       |
| Status Bar       | on/off                                           | off        | `STATUS_BAR`       |
| Fast Computers   | on/off                                           | off        | `FAST_COMPUTERS`   |
| Talking Tanks    | Off, Computers, All                              | Off        | `TALKING_TANKS`    |
| Talk Probability | 0–100                                            | 100        | `TALK_PROBABILITY` |
| Attack File      | a file                                           | talk1.cfg  | `ATTACK_COMMENTS`  |
| Die File         | a file                                           | talk2.cfg  | `DIE_COMMENTS`     |

**The modes**

- _Sequential_: the players take turns.
- _Synchronous_: everyone sets a shot, and when all are ready the shots go off at the same time. Everyone gets the same number of shots.
- _Simultaneous_: everyone aims and fires at once on the same keyboard, six keys each (turret left and right, power up and down, fire, change weapon). A player cannot fire again until the previous projectile has exploded, but can aim meanwhile. The Tank Control Panel, the inventory and the mouse are not available, so guidance, triggers and fuel cannot be used, shields only with Auto Defense, and parachutes are always deployed. Batteries are used automatically when the energy falls below 91. The manual does not recommend more than three players.

**The teams**

- _Standard_: teams against each other.
- _Corporate_: as Standard, but a team has one bank account.
- _Vicious_: as Standard until one team is left, then everyone against everyone.

**The play order**: Random draws the order for each turn. Losers-First lets the last in the ranking go first, Winners-First the opposite. Round-Robin is random, but the first shot of a round passes from one player to the next.

**Talking Tanks**: a tank says a line from the attack file when it fires and from the die file when it dies. Each line of the files is one comment; a blank line means saying nothing.

### Weapons

| Setting       | Range                 | Default | Key                      | Meaning                                                                                              |
| ------------- | --------------------- | ------- | ------------------------ | ---------------------------------------------------------------------------------------------------- |
| Arms Level    | 0–4                   | 4       | `ARMS`                   | The highest arms level of the items that can be bought (see the tables below).                       |
| Bomb Icon     | Invisible, Small, Big | Big     | `BOMB_ICON`              | How a projectile looks in flight.                                                                    |
| Tunneling     | on/off                | on      | `TUNNELLING`             | Projectiles burrow into dirt before they explode, and can come out of the other side of a thin pile. |
| Scale         | Normal, Medium, Large | Normal  | `EXPLOSION_SCALE`        | The size of the explosions.                                                                          |
| Trace Paths   | on/off                | off     | `TRACE`                  | Projectiles leave a trail in the colour of the tank.                                                 |
| Extra Dirt    | on/off                | off     | `EXTRA_DIRT`             | Dirt Charges let out more dirt.                                                                      |
| Useless Items | on/off                | off     | `USELESS_ITEMS`          | Show the items that the other settings make useless.                                                 |
| Impact Damage | on/off                | on      | `DAMAGE_TANKS_ON_IMPACT` | Fall damage when landing, or while falling. Only in the file, not in the menu.                       |

## Players and tanks

- 2–10 tanks, each a human or one of the computer players (Moron, Shooter, Poolshark, Tosser, Chooser, Spoiler, Cyborg, Unknown).
- Each player has a fixed colour and chooses a name and one of seven tank icons **(seen)**. An icon without wheels or treads is a fixed emplacement, which cannot buy or use fuel. One icon, the triple-turreted tank, is for computer players only in the shareware version: it fires three Missiles or Baby Missiles at a time.
- The energy of a tank is 0–100. The maximum firing power is ten times the energy (1000 at full strength), and a tank with no energy is dead.
- The angle is 0–90 from the horizon, to either side.
- A tank falls when the dirt under it goes, and takes damage from the fall. A tank that lands on another damages it.

### What a player can do on a turn

- Turn the turret, set the power, change the weapon, fire.
- Use a battery: +10 energy each, up to 100.
- Set the parachutes passive or deployed, and their safety threshold (1–100, 5 by default): a parachute opens only if the fall would do more damage than the threshold.
- Choose a shield and energise it. Energising replaces the shield that was on, which is lost.
- Arm a contact trigger for the next shot.
- Choose a guidance system for the next shot. It is reset to none after the shot.
- Move the tank with fuel: one unit per pixel, more uphill. Too steep a hill cannot be climbed, and down too steep a hill the tank slips and falls.

## Buying and selling

- Between the rounds everyone with money gets to buy. Items are bought in bundles.
- Items that the player cannot afford are not shown.
- At most 99 of an item. A bundle that does not fit is sold partly, with a markup of about 20 %.
- Everyone always has 99 Baby Missiles.
- An item can be sold back from the inventory. The offer depends on the quantity, is usually a loss, and does not change before the next round.
- With Free Market on, an item that is bought a lot gets more expensive and one that nobody buys gets cheaper. The prices move with a delay and bounce a little.
- The buying screen shows the cash, the rounds left and, with Update, the interest earned so far.

## Equipment

The prices are per bundle. The arms level is the lowest Arms Level setting with which the item can be bought.

### Weapons

| Weapon          | Price   | Bundle | Radius     | Arms | What it does                                                                       |
| --------------- | ------- | ------ | ---------- | ---- | ---------------------------------------------------------------------------------- |
| Baby Missile    | $400    | 10     | 10         | 0    | The basic weapon; everyone has an unlimited supply                                 |
| Missile         | $1,875  | 5      | 20         | 0    | A larger explosion                                                                 |
| Baby Nuke       | $10,000 | 3      | 40         | 0    |                                                                                    |
| Nuke            | $12,000 | 1      | 75         | 1    |                                                                                    |
| Leap Frog       | $10,000 | 2      | 20, 25, 30 | 3    | Three warheads one after another; good against shields                             |
| Funky Bomb      | $7,000  | 2      | 80         | 4    | A chain of explosions scattered around where it hits                               |
| MIRV            | $10,000 | 3      | 20         | 2    | Splits into five Missile warheads at the apogee; a dud if it hits before that      |
| Death's Head    | $20,000 | 1      | 35         | 4    | As MIRV, with nine larger warheads                                                 |
| Napalm          | $10,000 | 10     | –          | 2    | Flows and burns; hotter in deep pools                                              |
| Hot Napalm      | $20,000 | 2      | –          | 4    | Hotter Napalm                                                                      |
| Tracer          | $10     | 20     | 0          | 0    | No damage; for finding the aim                                                     |
| Smoke Tracer    | $500    | 10     | 0          | 1    | A Tracer that leaves a trail                                                       |
| Baby Roller     | $5,000  | 10     | 10         | 2    | Rolls downhill to a valley or a tank, then explodes; rolls off a shield            |
| Roller          | $6,000  | 5      | 20         | 2    |                                                                                    |
| Heavy Roller    | $6,750  | 2      | 45         | 3    |                                                                                    |
| Riot Charge     | $2,000  | 10     | 36         | 2    | Destroys a wedge of dirt from around the turret; for digging oneself out           |
| Riot Blast      | $5,000  | 5      | 60         | 3    | A wider and thicker wedge                                                          |
| Riot Bomb       | $5,000  | 5      | 30         | 3    | A projectile that destroys a sphere of dirt; no damage to tanks                    |
| Heavy Riot Bomb | $4,750  | 2      | 45         | 3    |                                                                                    |
| Baby Digger     | $3,000  | 10     | –          | 0    | Tunnels into the dirt; fizzles on a tank                                           |
| Digger          | $2,500  | 5      | –          | 0    |                                                                                    |
| Heavy Digger    | $6,750  | 2      | –          | 1    |                                                                                    |
| Baby Sandhog    | $10,000 | 10     | –          | 0    | Tunnelling warheads with a charge; attacks from below, under a shield              |
| Sandhog         | $16,750 | 5      | –          | 0    | More warheads                                                                      |
| Heavy Sandhog   | $25,000 | 2      | –          | 1    |                                                                                    |
| Dirt Clod       | $5,000  | 10     | 20         | 0    | Explodes into a sphere of dirt                                                     |
| Dirt Ball       | $5,000  | 5      | 35         | 0    |                                                                                    |
| Ton of Dirt     | $6,750  | 2      | 70         | 1    |                                                                                    |
| Liquid Dirt     | $5,000  | 10     | –          | 2    | Oozes out, fills holes and smooths the terrain                                     |
| Dirt Charge     | $5,000  | 5      | –          | 1    | Throws a wedge of dirt into the air                                                |
| Earth Disrupter | $5,000  | 10     | –          | 0    | Makes suspended dirt fall                                                          |
| Plasma Blast    | $9,000  | 5      | 10–75      | 3    | Energy around the tank; the size by the batteries used; the turret does not matter |
| Laser           | $5,000  | 5      | –          | 2    | A straight beam through dirt and shields; uses batteries                           |

The prices from Baby Missile to Digger were checked on the buying screen **(seen)**; the rest of the weapons are on its second page, which was not looked at.

### Accessories

| Item               | Price   | Bundle | Arms | What it does                                                                                       |
| ------------------ | ------- | ------ | ---- | -------------------------------------------------------------------------------------------------- |
| Heat Guidance      | $10,000 | 6      | 2    | Near an enemy tank the projectile flies straight to it                                             |
| Ballistic Guidance | $10,000 | 2      | 2    | Sets the power to hit the chosen target at the current angle; corrects for wind, not for viscosity |
| Horz Guidance      | $15,000 | 5      | 1    | Flies horizontally to the target once level with it                                                |
| Vert Guidance      | $20,000 | 5      | 1    | Drops straight down once above the target                                                          |
| Lazy Boy           | $20,000 | 2      | 3    | Flies to the chosen point                                                                          |
| Parachute          | $10,000 | 8      | 2    | Prevents the damage of a fall                                                                      |
| Battery            | $5,000  | 10     | 2    | +10 energy, or power for the energy weapons                                                        |
| Mag Deflector      | $10,000 | 2      | 2    | Pushes projectiles above the tank upwards; weak                                                    |
| Shield             | $20,000 | 3      | 3    | Absorbs the damage of explosions; a direct hit does not explode                                    |
| Force Shield       | $25,000 | 3      | 3    | Deflects projectiles; lasts longer                                                                 |
| Heavy Shield       | $30,000 | 2      | 4    | Lasts a lot, and does not fail                                                                     |
| Super Mag          | $40,000 | 2      | 4    | A Heavy Shield that also deflects and is immune to lasers                                          |
| Auto Defense       | $1,500  | 1      | 3    | Lets the player set up the defences before each round, for the rest of the game                    |
| Fuel Tank          | $10,000 | 10     | 3    | 10 units of fuel each                                                                              |
| Contact Trigger    | $1,000  | 25     | 3    | The projectile explodes on contact instead of tunnelling; one covers all warheads of a shot        |

All of these prices were checked on the buying screen **(seen)**, and they match the manual except for one: Auto Defense cost $12,161, not $1,500, with ten rounds left and an interest rate of 5 %. The manual says its price is based on the number of rounds left.

Guidance does not work with MIRV, Death's Head, Riot Charge, Riot Blast or Plasma Blast. A shield never protects from one's own shot.

## Measured

### The settings file

`SCORCH.CFG` is written when Save Changes is chosen in the main menu (the key `c`). It is a text file of `KEY=value` lines with DOS line endings, and the game reads it at start. Editing it is the easy way to set up a measurement: e.g. `MAX_WIND=0`, `TRACE=On` and `GRAPHICS_MODE=640x480`. The default graphics mode is `360x480`; the others are `320x200`, `320x240`, `320x400`, `320x480`, `640x400`, `640x480`, `800x600` and `1024x768`.

In the game, Up and Down change the power by 1 and Page Up and Page Down by 15, Left and Right turn the turret by a degree, and Space fires. The turret turns through 180 degrees: Left turns it anticlockwise, from pointing right (0) over straight up (90) to pointing left, and the status bar shows the angle from the horizon on the side the turret is on. A new tank has a power of 200. With `FIRE_DELAY=0` a shot is over at once, and its trace is drawn as dots.

The scripts of the measurements are in `tools/original`.

### Ballistics

Measured with Trace Paths on and no wind: the trace of each shot was read from a screenshot and a parabola was fitted to it (fourteen shots, at angles of 39, 46 and 70 degrees and powers of 290–560; the fit was within about a pixel).

- A projectile flies a parabola: gravity is the only force when there is no wind and no air viscosity.
- **The speed is proportional to the power**, at every angle that was tried. With the default gravity of 0.2 pixels a step squared, the speed is 0.0200 pixels a step for each unit of power at 640x480, and 0.0110 at 360x480.
- **The speed depends on the graphics mode, the gravity does not.** The speed for a unit of power is the width of the screen divided by 32,000, within the accuracy of the measurement (640 / 32,000 = 0.0200; 360 / 32,000 = 0.0113). So the same power carries a shot further across a wider screen: at full power and 45 degrees, 3.1 widths of the screen at 640x480 but 1.7 at 360x480. The same game is a different game in each graphics mode.
- The angle in the status bar is the angle of the turret from the horizon in degrees, and the pixels are square in the calculation.
- A projectile that leaves the screen at the top or the side is still followed, and comes back (Borders Extend).

SCORCH takes 640x480 as its reference: a pixel of the original is two pixels of the 1280 wide playing field, and a shot at full power and 45 degrees flies 3.125 widths of the field. How long a step of the original takes was not measured, because it depends on the Firing Delay setting and on the speed of the computer; SCORCH chooses it so that a shot across the whole field at 45 degrees is in the air for three seconds (`shared/sim/shots.ts`).

### Wind

Measured with shots straight up (angle 90) at powers of 250–500, Trace Paths on, in two games with winds of 97 and 120 (nine shots; the fit was within a pixel):

- The wind is a constant push sideways on everything in the air: an acceleration, like gravity turned on its side. The trace of a shot straight up is a parabola lying on its side.
- At 640x480 the push is **0.0005 pixels a step squared for each unit of wind**. A wind of 400 pushes sideways as hard as gravity (0.2) pulls down, and the default Max. Wind of 200 half as hard.
- The game shows the wind in the top right corner as an arrow and a number, e.g. `◀ Wind: 97`.
- **The wind of a round is mostly light.** Fourteen new games with the default Max. Wind of 200 had winds of 30, 0, 42, 29, 22, 19, 46, 24, 9, 52, 98, 4, 34 and 8: 30 on average, half of them under 27, the strongest 98, eight to the right and five to the left. So Max. Wind is a ceiling that is rarely near, not the usual strength. SCORCH draws the wind so that it is the rarer the stronger it is, with an average of 0.15 times the strongest allowed (`drawWind` in `shared/sim/field.ts`); the exact rule of the original is not known. (`tools/original/windsample.py`)
- **Changing Wind moves the wind a few units after every shot.** In a game with it on, the wind before each of 26 shots was 19, 17, 18, 23, 18, 16, 18, 18, 22, 26, 25, 24, 25, 22, 24, 26, 30, 35, 36, 35, 37, 34, 32, 37, 39 and 38: each change was between -5 and 5, and the wind wandered rather than jumped. SCORCH changes it by a whole number from -5 to 5, any of them as often (`changeWind` in `shared/sim/field.ts`). (`tools/original/cwind.py`)
- Not measured: whether the push grows with the resolution as the speed of a shot does (SCORCH scales it with the field, as it does gravity).

### Damage

Measured with Baby Missiles and Tanks Fall off, reading the energy of a tank from the status bar on its turn (Max is ten times the energy).

- **A Baby Missile that comes down on a tank destroys it**, at full energy: a tank that fired straight up at a power of 100 was destroyed by its own shot, and the round ended.
- **A Baby Missile that lands beside a tank takes part of its energy**: two such hits took 21 and 31 of the 100.
- A hit on a mountain 60 pixels or more from the tank took nothing.
- The crater of a Baby Missile at 640x480 is about 180 pixels of dirt when it hits a slope, which fits half a circle of a radius of 10: the blast radius of the equipment list is in pixels of the screen at this graphics mode.

SCORCH does not follow the first of these (`shared/sim/shots.ts`, `shared/weapons.ts`). Its damage falls evenly with the distance from the middle of the tank to nothing a blast radius away, which fits the one hit whose distance is known (see below), and each weapon has a most that it takes at the middle: 50 for a Baby Missile, 75 for a Missile, all 100 for the nukes. So a Baby Missile takes a few hits to destroy a tank, where in the original one that comes down on a tank destroys it. This is a choice for the sake of the game: with the damage of the original the weapon that everyone has no end of decided the rounds.

A later try to get the distance, with shots a degree off straight up (they come down a few pixels from the tank that fires them, with no wind), did not settle it. One clean hit took 37 of the energy with the middle of the crater about 7 pixels from the middle of the tank, which is less than the rule above gives (about 80) and close to a damage that falls evenly with the distance from the middle of the tank (33). Other hits did not fit either rule: the tanks stood on slopes and peaks, the shots fell past them into earlier craters, and Tanks Fall off did not seem to keep a tank from coming down. Level ground would make this measurable, but neither Flatten Peaks nor Bumpiness and Slope at 0 gave any.

### Scoring (first finding)

With the Standard scoring and no cash at start, the rankings after a round that a tank ended by destroying itself were: the survivor one win and $5,000, the one that destroyed itself no wins and $-1,500. So surviving a round is worth money, destroying oneself costs, and the money of a player can be negative.

A second try, with three and four players, got nothing: the keys of the script closed the rankings before the screenshot. The rankings stay on the screen until a key is pressed, so a measurement must stop pressing keys when the status bar cannot be read any more.

The same result came again in two more games of two players: $5,000 and one win for the survivor, $-1,500 for the one who destroyed itself. What a player gets for damaging or destroying another tank is still not measured: the aimed shots it needs keep ending in mountains.

SCORCH uses the two measured amounts and its own for the rest (`shared/economy.ts`): $20 for each point of energy taken from another tank, $2,000 more for destroying it, and $15 off for each point taken from one's own tank, which makes the measured $1,500 for a whole tank.

## To be measured

The manual does not give these, and the simulation needs them. They are measured by running the game, and the results are added to this file.

**Before phase 1**

- The damage of an explosion by the distance from the tank, for each weapon of phase 1. The energy before and after a hit can be read; what is missing is a good enough place for the explosion. The dotted trace ends several pixels short, and a circle fitted to the crater is thrown off by the traces drawn over the dirt. Next: traces off, and the circle fitted only to the dirt that went.
- How the weapons of phase 4 behave. SCORCH has its own values for all of this: how far and how high a Leap Frog leaps, how many bombs a Funky Bomb throws (six; the original throws five to ten) and where, how wide the wedges of the Riot Charge and the Riot Blast are (30 and 40 degrees to each side), and how the nine warheads of a Death's Head spread; how many tunnels the Diggers and the Sandhogs make, how long they are and which way they go, and how strong the charges of the Sandhogs are; and how far a Dirt Charge throws its dirt; how much there is of Liquid Dirt and of Napalm, how runny they are, how hot Napalm is and for how long it burns; how many batteries the Plasma Blast and the Laser use and how they are chosen (by the power of the shot), how much they do with each, and that a Plasma Blast leaves the dirt as it is. The radius of 80 that the manual gives the Funky Bomb is taken as how far its bombs are scattered; each of its explosions is of the size of that of a Missile.
- Fall damage by height. SCORCH takes a point of energy for each pixel of the original that a tank falls (`FALL_DAMAGE`), as its own value.
- The points of the Standard scoring: for damage, for a kill, for surviving, and the penalty for hitting oneself. This also decides the default of Cash at Start in PLAN.md.
- How interest is paid (on what amount, at which moment, how it is rounded).
- The selling price of an item by quantity. The shop of the original could not be driven from a script: it has the buttons Update, Inventory and Done, the Inventory button opens a list of what the player has, but buying and selling take the mouse, which did not reach the game under Xvfb. SCORCH buys items back at four fifths of their price (`SELL_RATE`), as its own value.
- Whether the Baby Missile should run out. The shop of the original shows a new player with 99 Baby Missiles and sells more at $400 for 10; in SCORCH there is no end of them.
- The shape of the terrain at different values of Bumpiness and Slope, and how fast dirt falls.
- How exactly Rollers, the MIRV and the dirt weapons behave. SCORCH has them and the riot bombs by the descriptions of the manual, with values of our own where the manual has none: how fast and how far a roller rolls and how much of a hill it climbs (the `ROLLER_` values), how far the warheads of a MIRV spread (`MIRV_SPREAD`), what a MIRV does when it hits something before it splits (explodes as one warhead), how much a buried tank is hurt when it fires, and whether a riot bomb really does no damage at all.

**Before phase 4**

- The Basic and Greedy scoring, and how the inventory is depreciated in Greedy.
- The price of Auto Defense by the rounds left and the interest rate.
- How long each shield lasts, and how the shields deflect. SCORCH has the Shield and the Heavy Shield with strengths of its own (100 and 200 of damage), and they only take damage. The Force Shield (150) also throws back the projectiles of others, at a cost of 30 to itself for each: how the original deflects, and how much it costs the shield, is not measured. The Mag Deflector and the Super Mag are not in the game yet.
- The fuel a slope takes, and the steepest slope that can be climbed.
- The damage of Napalm by the depth of the pool, and of the energy weapons by the batteries used.

**Before phase 5**

- How fast and how far the prices of the Free Market move.
- How the points are shared in each of the team modes.
- What each sky does when the environment is hostile.
