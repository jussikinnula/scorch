# SCORCH – plan

Status: draft 3, 26 November 2026. The skeleton of phase 0 is in the repository; there is no game logic yet.

Sources: the original Scorched Earth 1.5 (its manual and the game itself run in DOSBox-X, see [ORIGINAL.md](ORIGINAL.md)), the tank-duel prototype and sirad-web-app. The original is the source of the rules and the numbers, tank-duel is only a reference for ideas, and sirad-web-app is the model for the server, the tests and the deploys.

## 1. Goal

An artillery game in the browser that follows the original Scorched Earth as far as is sensible: terrain that is destroyed and piles up, wind, a large arsenal, money and a shop between the rounds. It is purely a multiplayer game between people, 2–10 players.

The name is SCORCH and the address is `scorch.mobile`. The game uses its own graphics and texts, nothing from the files of the original.

The deliberate differences to the original:

| The original                                 | This game                                                                  |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| Computer opponents (Moron … Cyborg)          | No computer players at all                                                 |
| Everyone on the same keyboard                | Everyone has a device: a phone or a tablet as a controller, or a browser   |
| Local play only                              | Two ways to join: hotseat (QR code) and online                             |
| Simultaneous mode without reload times       | Live mode, where each weapon has its own reload time                       |
| Buying on the shared screen, one at a time   | The shop is on each player's own device: everyone buys at once, in private |
| Reduced controls in the simultaneous mode    | The full controls in every mode, because nobody shares a keyboard          |
| A dead player waits for the end of the round | A dead player can write speech bubbles above the wreck of the tank         |

## 2. Ways to play

There are two independent choices: how the game is joined and how the turns go. All four combinations are allowed.

### 2.1 Joining

**Hotseat.** One big screen (a TV, a laptop, a projector) shows the playing field. The players scan a QR code on the screen, which opens the controller. The controller does not show the playing field: the eyes are on the shared screen.

- The game is started from the screen. It also starts by itself when the maximum number of players has joined.
- The maximum is set on the screen before the game: 8 by default, at most 10 (see 2.4).
- The room is not listed anywhere, and it cannot be joined with a room code.
- A QR code is technically just a link, so it carries a short-lived token that changes about every 30 seconds. A screenshot or a forwarded link goes stale quickly. Nobody has to approve a player who joins.
- The QR code is shown in the lobby. During the game the playing field has the whole screen, with no QR code, title or list of players, and nobody new can join. That holds for the whole game, the shop between the rounds included: new players come in only in the lobby, before a game.
- A device is one player. The server knows the device and keeps what the player chose before the game (the name, the tank, the equipment), so a device that scans the code again, or whose connection was lost, returns to the player it is and cannot join under another name.
- A player can be removed from the screen in the lobby.

**Online.** Everyone plays on their own device, which shows both the playing field and the controls. The one who creates the room chooses its visibility:

- Public: the room is in the list of open games, and anyone can join.
- Private: the room is not in the list. It can only be joined with a link that can be copied, which has a token that cannot be guessed.

The creator of the room is the host (starts the game, changes the settings, removes players). If the host leaves, the one who has been in the room the longest becomes the host.

### 2.2 Turns

**Classic.** The Sequential mode of the original. One player at a time aims and fires, the projectile flies to the end, the dirt falls, the tanks fall and the turn passes on. An addition is a turn clock (45 s by default), so that the game cannot get stuck: when the time runs out, the turn is skipped. The play order is as in the original: Random, Losers-first, Winners-first or Round-robin.

**Live.** The Simultaneous mode of the original, with reload times. Everyone aims and fires at the same time.

- The reload timer is one per tank. Its length comes from the weapon that was fired.
- While reloading, the player can already change the weapon and aim. Only firing is blocked.
- The wind changes slowly during the round.
- The original lets a player fire again only when the previous projectile has exploded. The reload time replaces that rule: a slow projectile does not block the next shot.

In the original the simultaneous mode is a reduced game, because everyone shares one keyboard: no Tank Control Panel, shields only with Auto Defense, batteries used automatically, no guidance, triggers or fuel. Here everyone has a controller of their own, so the live mode has everything the classic mode has.

The third mode of the original, Synchronous (everyone aims, the shots go off at the same time), suits phone controllers well and is cheap to add on top of the other two. It is optional in phase 5.

### 2.3 The structure of a match

1. The lobby: the players join and choose a name, a colour and a type of tank. The host adjusts the settings.
2. The shop: everyone buys equipment on their own device, if they have money.
3. A round: played until one tank is left (or none).
4. The results of the round: points, money and interest.
5. Steps 2–4 are repeated for the agreed number of rounds (10 by default, 1–1000 in the original), then the final results.

"Choosing the weapons before the game" is the shop before the first round. As in the original, there is one only if the cash at start is not zero.

### 2.4 The number of players

2–10, as in the original. The default maximum of a room is 8.

Nothing technical prevents more. The limits are practical: the width of the field per tank, colours that can be told apart on a TV, and in the classic mode the wait between one's own turns. The maximum is one constant, so that larger games are easy to try.

To be tested: the live mode may need a lower maximum than the classic mode, because many simultaneous explosions on a small field can make the round short and chaotic. Until that is tested, the maximum is 10 in both.

## 3. The game

[ORIGINAL.md](ORIGINAL.md) lists what the original has. This chapter says what is taken from it and when.

### 3.1 Terrain

The terrain is a bitmap (each pixel is dirt or air), not a height curve as in tank-duel. The reason: tunnels, Diggers, Sandhogs, dirt that stays in the air and projectiles that tunnel are not possible with a height curve. Inside, it is stored as runs of dirt per column, which makes the falling of the dirt and sending it over the network light.

- A logical playing field of 1280 × 720, scaled to the screen.
- Generated from a seed, with the Bumpiness, Slope and Flatten Peaks of the original as parameters.
- An explosion carves a circle, the dirt weapons add dirt, and loose dirt falls column by column.
- A tank falls if the dirt under it goes, and takes damage from the fall.

### 3.2 Physics

Gravity, wind (a maximum and "changing wind" as settings), air viscosity and the effect of the walls (None, Concrete, Padded, Rubber, Spring, Wraparound, Random, Erratic) follow the Physics and Landscape menus of the original. Phase 1 has gravity, wind and the walls None, Rubber and Wraparound.

### 3.3 Tanks

A tank has an energy of 0–100. As in the original, the maximum firing power is ten times the energy, so a damaged tank shoots shorter. The type of the tank is only its looks in phase 1 (a few bodies). Moving with fuel comes in phase 4, and with it the difference of the original between tanks with treads and fixed emplacements, which cannot move.

### 3.4 Weapons and reload times

The prices, the bundle sizes and the blast radii are those of the original (checked on the buying screen of the game). The reload times of the live mode are our own starting values, to be tuned by playing. The principle: the reload time grows with the destructive power, so that the rate of fire of the Baby Missile really competes with the big weapons.

**Phase 1**

| Weapon                                  | Price / bundle | Radius | Reload (live) |
| --------------------------------------- | -------------- | ------ | ------------- |
| Baby Missile                            | unlimited      | 10     | 3 s           |
| Missile                                 | $1,875 / 5     | 20     | 5 s           |
| Baby Nuke                               | $10,000 / 3    | 40     | 12 s          |
| Nuke                                    | $12,000 / 1    | 75     | 20 s          |
| MIRV (5 warheads, splits at the apogee) | $10,000 / 3    | 20     | 15 s          |
| Baby Roller                             | $5,000 / 10    | 10     | 5 s           |
| Roller                                  | $6,000 / 5     | 20     | 7 s           |
| Heavy Roller                            | $6,750 / 2     | 45     | 14 s          |
| Dirt Clod                               | $5,000 / 10    | 20     | 4 s           |
| Dirt Ball                               | $5,000 / 5     | 35     | 6 s           |
| Ton of Dirt                             | $6,750 / 2     | 70     | 12 s          |
| Riot Bomb                               | $5,000 / 5     | 30     | 5 s           |
| Heavy Riot Bomb                         | $4,750 / 2     | 45     | 8 s           |
| Tracer                                  | $10 / 20       | 0      | 1 s           |

**Phase 4:** Leap Frog, Funky Bomb, Death's Head, Napalm and Hot Napalm, Smoke Tracer, Riot Charge and Riot Blast, the Diggers, the Sandhogs, Liquid Dirt, Dirt Charge, Earth Disrupter, Plasma Blast, Laser.

**Accessories (phase 4):** Parachute, Battery, Mag Deflector, Shield, Force Shield, Heavy Shield, Super Mag, Auto Defense, Fuel Tank, Contact Trigger and the guidance systems Heat, Ballistic, Horizontal, Vertical and Lazy Boy. The target of a guidance system is chosen on the controller by tapping the name of an opponent.

### 3.5 Economy and scoring

The economy of the original is taken as it is, with all of its settings for the host (the Economics menu, see ORIGINAL.md):

| Setting       | Range                            | Default of the original |
| ------------- | -------------------------------- | ----------------------- |
| Cash at Start | $0 – $1,000,000, steps of $5,000 | $0                      |
| Interest Rate | 0 – 30 %                         | 5 %                     |
| Scoring Mode  | Basic, Standard, Greedy          | Standard                |
| Free Market   | on / off                         | off                     |
| Arms Level    | 0 – 4                            | 4                       |

- Unspent money earns interest between the rounds.
- Items can be sold back, usually at a loss. The offer depends on the quantity.
- At most 99 of an item. A bundle that does not fit is sold partly, with a markup of about 20 %.
- With Free Market on, the prices follow the demand: what is bought a lot gets more expensive, what nobody buys gets cheaper. The market of a room lives for the match; whether it should live longer, as the `scorch.mkt` file of the original does, is decided in phase 5.
- The price of some items is not fixed. Auto Defense is listed at $1,500 in the manual, but the game asked $12,161 with ten rounds left and an interest of 5 %: the price depends on the rounds left and on the interest rate.

Phase 1 has Cash at Start, Interest Rate, the Standard scoring, selling and Arms Level. Basic and Greedy scoring come in phase 4 and Free Market in phase 5.

The manual tells the principles of the scoring but no numbers, and nothing about how selling prices, the free market or the price of Auto Defense are calculated. These are measured from the original before they are implemented (see ORIGINAL.md, "To be measured").

### 3.6 Speech bubbles

A dead player can write short texts, which are shown as a speech bubble above the wreck of the tank, both on the big screen and to the online players. This gives the dead something to do until the round ends, and it is the place of the Talking Tanks of the original (the comments of the tanks when they fire and die), with texts of our own and of the players.

It is free text in front of other people, so in public online games it is limited (see 4.8).

### 3.7 Sounds

The original makes its sounds with the PC speaker: beeps, and optionally a tone in flight whose pitch follows the height or the speed of the projectile (the Flight Sounds setting). Here the sounds are made properly, with the Web Audio API:

- A launch sound when a weapon is fired and an explosion when it hits, both of which vary by weapon: a Baby Missile is a pop, a Nuke is not.
- Sounds for the other events of a round: a tank falling, a shield hit, dirt landing, a death.
- The flight tone of the original, as a setting.

The sounds are played on the device that shows the playing field (the TV in a hotseat game), from the events the server sends (see PROTOCOL.md). A browser lets a page make sound only after the user has touched it, so the sound is unlocked by the click that creates or starts the game. Sounds come last, in phase 5.

### 3.8 What is left out

Computer players, the scanned mountains of the original (the `.MTN` files are under copyright), everything about registering, the hardware settings and saving a game to a file.

## 4. Architecture

### 4.1 Overview

An authoritative Node server owns the state of each room and runs the simulation. The browsers are thin: they send inputs and draw what the server tells. The same server and the same simulation serve both hotseat and online; the difference is only which views the clients open and how a room is joined.

```
            ┌────────────────── Node server ─────────────────┐
            │  Rooms · join tokens                            │
            │  Room = state machine + simulation (shared/sim) │
            └───────▲───────────────▲───────────────▲─────────┘
                    │ WebSocket     │               │
        ┌───────────┴───┐   ┌───────┴──────┐  ┌─────┴──────────┐
        │ Screen (TV)   │   │ Controller   │  │ Online player  │
        │ field + QR    │   │ (phone)      │  │ field+controls │
        └───────────────┘   └──────────────┘  └────────────────┘
```

### 4.2 Technology

The skeleton follows the structure and the tools of sirad-web-app, so that both projects work the same way:

- One npm package, TypeScript everywhere, Node 22.
- The server: Express and `ws`, a WebSocket API at `/ws`, a health check at `/health`, the allowed origins in `ALLOWED_ORIGINS`. It is run with `ts-node`, without a separate build.
- The browser: Vite + React for the user interfaces (lobby, shop, controller), Canvas 2D for drawing the playing field. WebGL is not needed for these graphics.
- The connection: the `ApiConnection` of sirad-web-app as it is (reconnects with a growing delay, ping/pong).
- The messages are described in one place (`shared/protocol.ts`, explained in [PROTOCOL.md](PROTOCOL.md)), and the server checks every message it receives with a type guard, because in online play no input can be trusted.
- The tests are run with Vitest; the browser and the server are tested together against the real server (`test/backend.ts`), not a mock.
- ESLint, Prettier and husky with the settings of sirad-web-app.

### 4.3 The structure of the repository

```
client/    the frontend: the views, the controller, drawing the playing field
server/    the rooms, joining, the WebSocket API, running the simulation
shared/    what both use: the protocol, the data of the weapons, the simulation
test/      helpers of the tests
docs/      this plan and the notes about the original
```

The difference to sirad-web-app is the `shared` folder. The simulation (`shared/sim`) is plain TypeScript with no dependencies on Node or the browser, so it can be tested alone and run as the same code on the server and in the browser.

The frontend is a static site in GitHub Pages, which cannot serve the same page for every path. That is why the view is in the hash of the address: `#/screen/<room>` (the big screen), `#/join/<token>` (the controller, where the QR code leads) and `#/play/<room>` (an online player).

### 4.4 Simulation and synchronisation

- A fixed step of 60 Hz and a seeded random number generator of our own, no calls to `Math.random`.
- The terrain is sent compressed at the start of a round. After that only the operations on it are sent (carve a circle, add dirt, let the columns fall), and the client repeats them with the same `sim` code. The operations are integer rasterisation, so the result is the same on every device.
- The projectiles, the tanks and the effects are sent as snapshots 20–30 times a second, and the client interpolates between them.
- As a safeguard the server sends a checksum of the terrain during the round; a client whose checksum differs asks for the whole terrain again.

Latency matters little: the input of a player is turning the turret, setting the power and firing, and none of these needs prediction on the client. The movement of one's own turret is shown at once, everything else comes from the server.

### 4.5 The state machine of a room

`lobby → shop → round → results → (shop … ) → end`

Inside a round in the classic mode: `aiming → flight → settling → next turn`. In the live mode a round is one continuous state, where each player has a reload timer.

### 4.6 Identifying a player and losing the connection

No user accounts. When joining, the browser gets a player token for the room, which is stored on the device. If the phone locks or the network drops, the same token returns the player to the same tank.

- Classic: the turn of an absent player is skipped when the turn clock runs out.
- Live: the tank stays on the field where it is.
- Hotseat: if the screen is gone, the game pauses until it is back.
- An empty room is removed after a few minutes.

### 4.7 The controller (a phone)

Designed for portrait and one thumb:

- Angle: a large arc that is dragged; fine adjustment of ±1° with buttons.
- Power: a slider and fine adjustment.
- Weapon: a list with the number left and, in the live mode, the reload time.
- A fire button, which in the live mode shows how the reload proceeds. The other controls work during the reload.
- One's own energy, money and the wind are visible; in the classic mode a clear "your turn" state and a vibration.
- When dead: a text field for the speech bubbles.
- Later (phase 5): the controller shows the damage of one's own tank. The picture of the tank gets holes, scratches and wreckage as the energy goes down, and a DANGER light blinks on the gauges when the damage is critical.
- The screen is kept awake (Wake Lock), because the player looks at the TV for long stretches.

In the online view the same controls are below the playing field, and on a desktop the keys work as well (the arrows, the space bar), as in the original.

**The look of the original** (phase 5). The menus and the controls are to look like those of the original game, instead of the plain dark pages of today. What that look is, from the screens of the original (ORIGINAL.md):

- Light grey panels with bevelled edges, as if raised from the screen: the status bar, the dialogs (Rankings, Inventory) and the buttons are all of this kind. A pressed or chosen button looks sunk.
- A small bitmap font, in black on the grey, with the key of a button picked out in another colour.
- The status bar of a round: two rows of small text and icons on a grey bar above the field. The bar of the online view already has its content and place.
- The shop: a list of rows, each with how many the player has, a small icon of the weapon, its name and its price for a bundle.
- Plain, strong colours on the field itself, and the tanks in the colours of the players.

Two things belong to this:

- **The weapon menu.** The weapon is chosen from a plain dropdown of the browser now. It becomes a menu of our own in the same style: the icon of the weapon, its name and how many are left, as in the status bar and the shop of the original, opened by a tap on the phone and usable with the keys (Tab) on a desktop.
- **Everything else in the same style:** the front page, the lobby and its settings, the shop, the standings, the bar of the online view and the controller of the phone.

It comes late on purpose: the pages still change with every feature, and restyling them all is best done once.

### 4.8 Protecting public online games

Because anyone can join a public game: a limit on the length and the characters of names and a word filter, a limit on the number of messages per connection, a limit on rooms and connections per IP address, the right of the host to remove a player, and a check of every input on the server (the number of projectiles, the reload time, the turn).

The speech bubbles are the only free text between the players. They are short (at most about 60 characters), rate limited, go through the same word filter as the names, and the host can mute a player. There is no other chat.

### 4.9 Running it

The same model as sirad-web-app:

- The server is a web service in Render.com (`render.yaml`, Frankfurt). It is deployed only from `main` by a GitHub Action, and only when the code of the server (`server`, `shared`, the dependencies) changes.
- The frontend is in GitHub Pages at `https://scorch.mobile`: production from `main` and a preview for each pull request (`/pr-XX/`). The address of the server is given to the build in `API_URL`.
- The server is at the address Render gives it at first. `api.scorch.mobile` can be pointed to it later.

Both are behind HTTPS, which the phones require (Wake Lock, vibration). Three things follow from this model:

1. **The rooms are in the memory of the server.** A deploy or a restart of the server ends the games in progress. This is accepted at first: the deploys are timed, and the state is not stored on disk.
2. **The free plan of Render sleeps.** The service stops when there has been no traffic for a while, and waking up typically takes tens of seconds. The front page must show "the server is starting", not an error. The free plan also has little processing power, so a 60 Hz simulation of several live rooms at once must be measured before the public online phase; a paid plan is likely by phase 3 at the latest.
3. **The previews use the production server, and the frontend and the server are deployed separately.** So a frontend and a server of different versions of the protocol do meet. They do not try to talk then: the versions must match (see PROTOCOL.md, "The version of the protocol"), the page tells what is going on, and the version is raised whenever the protocol changes.

In development the phones reach the Vite server of the computer over the local network or with ngrok.

## 5. Phases

**Phase 0 – Skeleton (done).** The package, the build, lint, the tests, the CI and deploy workflows, `render.yaml`. The server greets a client and answers a ping, the page shows the state of the connection and knows the addresses of the views. The data of the weapons of phase 1 is in `shared/weapons.ts`.
Left to do by hand: creating the Render service, the secret and the variables in GitHub, and taking Pages into use (the instructions are in the README).

**Phase 1 – Hotseat + Classic.** The measurements of the original (ORIGINAL.md), the core of the simulation (terrain, ballistics, wind, the weapons of phase 1, fall damage), rooms, joining with a QR code and a changing token, the lobby, the shop, rounds, points and money, returning after a lost connection.
Done when: four people play a match of ten rounds from a TV with phones, from start to end.
Done so far: rooms, joining with the QR code, the lobby, returning after a lost connection, the playing field, turning the turret, speech bubbles, the ballistics measured from the original, firing one weapon with craters and falling dirt, energy and damage (a direct hit destroys a tank, as measured from the original; how the damage falls with the distance is still to be measured), destroyed tanks, rounds that end when one tank is left, and a game of a set number of rounds with standings by the rounds won. Both ways of taking turns work: the classic mode with a turn clock, which is the default, and the live mode with reloading. All the weapons of this phase can be chosen on the phone and fired: the missiles and the nukes, the MIRV, the Rollers, the dirt weapons, the riot bombs and the tracer, each with its own blast radius and, in the live mode, reload time. The weapons are bought in a shop that opens on the phones before a round, with the money a round pays: the amounts for winning a round and for damaging oneself are measured from the original, those for damaging and destroying others are our own until they are measured. The host sets the cash at the start, the interest that unspent money earns and the arms level. Nobody new joins once the game has started, not in the shop either. Each round has a wind, measured from the original, up to a strongest wind the host sets. A tank whose ground goes falls and is hurt by the fall. A Tracer leaves a trace of its path, and the host can make every shot leave one (Trace Paths); a projectile outside the field is shown on its edge. On the phone everything needed to aim and fire fits on the screen at once. The host can turn on Changing Wind, which moves the wind a little after every shot, as measured from the original. The host chooses the walls of the field: none, rubber or wraparound. Weapons can be sold back in the shop at a loss. The damage of a weapon falls with the distance from the middle of a tank, and each weapon has a most of its own, so that a Baby Missile takes a few hits to destroy a tank. An idea for later: a mode where the Baby Missiles are not endless, e.g. 99 for a round, as the original gives 99 of them. Still to do: the measured damage (by distance and by fall), scoring and selling price, which now have values of our own.

**Phase 2 – Live.** Playing at the same time, reload times, continuous settling of the terrain, changing wind, the reload on the controller, the speech bubbles of the dead.
Done when: the same match of four works in the live mode, the reload times have been tuned after at least one play test, and the maximum number of players of the live mode has been tested.

**Phase 3 – Online.** The combined field + controls view, the list of public games, private links, passing on the host, the protections, the limits of the speech bubbles.
Done when: the game works between players in different networks and stands the basic cases of deliberate disruption.
Done so far (phase 3): online rooms on the server (a public or a private room, whose creator is its first player and its host; the link; the list of public games; the host passing on; a game that goes on with those who are left), and the view of an online player with the field and the controls on one page. Still to do: the layout for phones and the keys for desktops, the limits per address, the word filter and muting. The design is in ONLINE.md.

**Phase 4 – The whole arsenal.** The rest of the weapons, shields, guidance systems, parachutes, batteries, fuel and moving, tunnelling and the Contact Trigger, the rest of the walls, air viscosity, the Basic and Greedy scoring.

**Phase 5 – Finishing.** Teams (Standard, Corporate, Vicious), the Synchronous mode, Free Market, the skies and the hostile environment (lightning), sound effects (launches and explosions by weapon, see 3.7), the ready-made comments of the tanks, a spectator mode, the damage of the tank and the DANGER light on the controller (see 4.7). The look of the original for the whole user interface, and a weapon menu of our own in place of the plain dropdown (see 4.7, "The look of the original").

Online is phase 3 on purpose: with hotseat the core of the game can be played and tuned in the same room before the demands of a public service come along. The architecture is still the same from the start, so phase 3 is new views and joining logic, not a rewrite.

## 6. Testing

- Unit tests of the simulation: trajectories, the carving of explosions, the falling of dirt, the behaviour of each weapon.
- A determinism test: the same seed and the same inputs give the same checksum of the terrain on the server and in the browser.
- Tests of the browser and the server together against the real server, as in sirad-web-app.
- Scripted test clients that join a room and fire at random. They are for load and regression testing, not a feature of the game.
- Returning after a lost connection: a player whose connection is lost stays in the game, shown as disconnected, and a device that returns must get everything it shows (see PROTOCOL.md, "Losing a connection"). To do with every feature that adds something a device shows: a test that loses the connection in the middle of it and returns, for the screen and for a controller. So far this covers the lobby; the playing field, the aim, the turn, the reload, the shop and the inventory each need theirs.
- By hand: real phones (iOS Safari and Android Chrome) against a TV at the end of each phase.

## 7. Open decisions

1. **The look.** A VGA retro style after the original, or a modern one? Either way the graphics are our own.
2. **The default of Cash at Start.** The original starts with $0, so the first round is played with Baby Missiles only and there is no shop before it. The setting is the host's in any case; the question is only what a new room starts with. To be decided after ORIGINAL.md has the numbers of the scoring, which tell how fast money comes in.
3. **The maximum number of players in the live mode.** 10 for now; to be tested in phase 2 (see 2.4).

## 8. Decided

| Question                          | Decision                                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------------------- |
| The name                          | SCORCH                                                                                              |
| The address                       | `scorch.mobile`                                                                                     |
| The language of the documentation | English                                                                                             |
| The economy                       | The settings and the modes of the original; what the manual does not tell is measured from the game |
| The reload in the live mode       | One timer per tank, its length by the weapon fired; changing the weapon and aiming work meanwhile   |
| A dead player                     | Writes speech bubbles above the wreck of the tank                                                   |
| Joining a hotseat game            | With the QR code, no approval; started from the screen or automatically when the room is full       |
| The number of players             | 2–10, a default maximum of 8                                                                        |
| The server and the frontend       | Render.com and GitHub Pages, as in sirad-web-app                                                    |
