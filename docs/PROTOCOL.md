# The protocol

How the clients and the server talk to each other. The types of the messages and the limits are in [`shared/protocol.ts`](../shared/protocol.ts), which both sides import; this document tells how they are used and why.

Status: everything up to "Later" is implemented (protocol version 6): the rooms (creating one, joining it with the QR code, the lobby, returning after a lost connection), the playing field, turning the turret, firing in the classic and the live mode, damage, rounds, the end of a game and the speech bubbles.

The scope is the first playable slice of [PLAN.md](PLAN.md): a hotseat room, joining with the QR code, tanks on the screen, turning the turret and the speech bubbles. Firing, the shop and online rooms are sketched at the end, so that this design leaves room for them.

## Principles

- **One WebSocket per device**, at `/ws`. Everything goes through it: there is no HTTP API besides the health check.
- **JSON messages with a `type`.** They are small and easy to read while the game is being built. A binary format for the snapshots of a round is a later optimisation, if it is needed.
- **The server owns the state.** A client sends what the player wants to do, the server decides what happens and tells everyone.
- **Nothing a client sends is trusted.** Every message is checked with `isClientMessage` before it is looked at. A message from a client is at most 1024 bytes.
- **The state of a room is sent whole**, not as changes. It is small (at most ten players) and changes rarely, and a whole state cannot get out of step.
- **Only those who show the playing field get the messages about it.** A controller shows no field, so it is not sent the terrain or the aims of the others.

## Who is who

| Role       | Device              | Opens                                        | Sees                               |
| ---------- | ------------------- | -------------------------------------------- | ---------------------------------- |
| Screen     | A TV, a laptop      | `#/screen/<room>`                            | The playing field, the QR code     |
| Controller | A phone, a tablet   | `#/join/<token>`, then `#/controller/<room>` | The controls of its own tank       |
| Player     | Any (online, later) | `#/play/<room>`                              | The playing field and the controls |

A connection has at most one role in one room at a time. The screen is the host of a hotseat room: it starts the game, changes the settings and removes players.

### Rooms, tokens and keys

| What       | Looks like            | Who knows it             | What it is for                                                      |
| ---------- | --------------------- | ------------------------ | ------------------------------------------------------------------- |
| Room id    | 8 characters          | Everyone in the room     | Names the room. Knowing it does not let anyone in.                  |
| Join token | 10 characters         | Whoever sees the QR code | Lets a controller join. Changes every 30 seconds.                   |
| Host key   | 22 characters, random | The screen               | Lets the screen return to its room after a reload.                  |
| Player key | 22 characters, random | One controller           | Lets a controller return to its player after losing the connection. |

The keys are secrets: they are sent once, to the device they belong to, and never to anyone else. The device stores them in `localStorage` by the id of the room.

**The join token.** The server makes a new random token every 30 seconds (`JOIN_TOKEN_PERIOD`) and sends it to the screen. The newest token and the one before it are accepted, so a code that is scanned just before it changes still works: a token is good for 30–60 seconds. Joining needs nothing else, and nobody approves it.

A token is short on purpose, to keep the QR code coarse enough to scan from across a room: `https://scorch.mobile/#/join/a1b2c3d4e5` is 40 characters. Ten characters cannot be guessed in a minute when the attempts are rate limited.

## Connecting

```
client                              server
  │ ── /ws?protocol=2 ────────────────▶ │
  │ ◀──────── hello { protocol } ────── │
  │ ── ping ──────────────────────────▶ │   every 25 s
  │ ◀──────────────────────── pong ──── │
```

### The version of the protocol

A client and a server talk only if they have the same version of the protocol (`PROTOCOL_VERSION`). The two are deployed separately, and the previews of pull requests use the production server, so they do meet each other in different versions.

- The client tells its version in the address it connects to: `/ws?protocol=2`.
- The server tells its version in the greeting: `hello { protocol }`.
- **The server** greets a client of another version (or one that does not tell its version), so that the client learns the version of the server, and answers its pings. Everything else it sends is refused with the error `wrong-version`, and nothing is done.
- **The client** sends nothing before the greeting, and nothing at all if the version of the greeting is not its own. To the views this is the same as having no connection. The page tells which way it is: if the server is older, it is being updated, and the game goes on by itself when the server comes back with the right version; if the server is newer, the page is an old one and offers to reload itself.

**The version is raised by one whenever the protocol changes**: a message, a field, a limit, or what a message means. A test (`shared/protocol.test.ts`) keeps a fingerprint of the messages, the limits and the checks of each version, and fails when they change without the version being raised. It cannot see a change that is only in what the server does with a message: for those the version is raised by hand.

A client reconnects by itself when the connection is lost (`client/api/connection.ts`). After each `hello` it tells the server again who it is, with `host` or `resume`.

## A hotseat room

### The screen creates the room

```
screen                              server
  │ ── create { mode: "hotseat" } ───▶ │
  │ ◀── created { room, hostKey } ──── │
  │ ◀── room { state } ─────────────── │
  │ ◀── token { token, expiresIn } ─── │   again every 30 s
```

The screen stores the host key, moves to `#/screen/<room>` and draws the QR code of `<address of the site>#/join/<token>`.

When the screen is opened again at `#/screen/<room>` (a reload, a lost connection), it sends `host { room, hostKey }` and gets the same three answers. Without the right key the answer is the error `no-session`, and the screen offers to create a new room.

### A controller joins

```
controller                          server                          screen
  │ ── join { token, name } ─────────▶ │
  │ ◀── joined { room, id, playerKey } │
  │ ◀── room { state } ─────────────── │ ── room { state } ───────────▶ │
```

- The name is 1–16 characters. If it is taken in the room, the server adds a number to it ("Sprig 2") instead of refusing.
- `id` is the number of the player in the room, from 0, in the order of joining. It picks the colour of the tank from a fixed palette, as in the original.
- The controller stores the player key and moves to `#/controller/<room>`, so that a reload of the page does not depend on a token that has gone stale.

When the controller is opened again, or its connection returns, it sends `resume { room, playerKey }` and gets `joined` and `room` again. If the room is gone the answer is `no-room`; if the key is not of a player of the room (e.g. the player was removed), `no-session`. In both cases the controller asks the player to scan the QR code.

**A device is one player.** The server knows a device by its player key, and what the player chose before the game (the name, later the tank and the equipment) is kept on the server with the player, not on the device. A device that opens the address of the QR code first asks whether it already is a player of that room: `rejoin { token, playerKey }`, with the key it got last. If it is, the answer is `joined` for the player it is, and the device is not asked for a name; if not, the error `no-session`, and the device shows the form for joining as a new player. So the same device cannot be in a game twice or under another name. A player who wants to change something leaves the game and joins again.

**Nobody new joins once the game has started.** A `join` after that is refused with `wrong-phase`, during a round and in the shop between two rounds alike, and the screen does not show the QR code then. Those who are players return with `resume` or `rejoin` at any time. The front page of the site offers a device a way back to the game it was last in, for when its page was closed.

If a second connection takes over a screen or a player with the right key, the first one gets the error `replaced` and is closed. That is what happens when the same phone opens the page in two tabs.

### The lobby

The state of the room (`RoomState`) is sent to everyone in the room whenever it changes: someone joins, leaves, loses or regains the connection, the settings change, or the phase changes.

| From       | Message                 | When          | What happens                                                                                                                                                                                                                                                                                   |
| ---------- | ----------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Screen     | `lobby`                 | When finished | Back to the lobby for a new game.                                                                                                                                                                                                                                                              |
| Screen     | `settings { settings }` | In the lobby  | Changes the settings: the maximum number of players (2–10, 8 by default; not below the number already in the room), the rounds, the turns, the strongest wind, the cash at the start, the interest, the arms level, whether every shot leaves a trace, whether the wind changes and the walls. |
| Screen     | `kick { id }`           | Any time      | Removes the player; its key stops working. The controller of the player gets the error `no-session`.                                                                                                                                                                                           |
| Screen     | `start`                 | In the lobby  | Starts the game, if there are at least two players.                                                                                                                                                                                                                                            |
| Controller | `leave`                 | Any time      | The player leaves for good. There is no answer.                                                                                                                                                                                                                                                |

The game also starts by itself when the room becomes full.

Joining is open again between the rounds, once the game has rounds.

### Losing a connection

- **A controller**: the player stays in the room with `connected: false`, and the tank stays on the field. `resume` brings the player back. The others see the player as disconnected, not as gone: only the screen removing the player, or the player leaving, takes the player out of the game.
- **The screen**: the room stays, with `screen: false`. The controllers show that the screen is away. `host` brings it back. A room without a screen is removed after five minutes, and with it the keys of its players. The controllers that are connected get the error `no-room`.

**A device that returns is told everything it needs.** After `host` or `resume` the server sends the whole of what that role shows, not only what has changed since: a device that returns may have missed anything, or may be a page that was just reloaded and knows nothing. Today that is the state of the room, for the screen also the join token and the playing field as it is now with the aims of all the tanks, and for a controller the aim of its own tank, how long it still reloads, its energy and its weapons. Each later feature adds its part to this: the playing field for those who show it, and for a player its own aim, energy, money, inventory, turn and reload. Every such addition gets a test that returns in the middle of it (see PLAN.md, Testing).

## Playing: the first slice

### The field

The server sends the playing field to the screen when the game starts, when the screen returns in the middle of it, and when the tanks on it change (a player leaves or is removed):

```
field { field: { width, height, terrain, tanks } }
```

- The field is 1280 × 720 pixels, the origin in the top left corner.
- `terrain` is the dirt column by column: each column is a list of pairs of y coordinates, dirt from the first (inclusive) to the second (exclusive). This is already the format of the bitmap terrain of PLAN.md, which has tunnels and dirt in the air; in the first slice each column has one pair. The terrain of a round is about 12 kB as JSON.
- `tanks` has the place and the aim of each tank. The server places the tanks evenly across the field.

The terrain is sent, not generated on each client from a seed, so that the clients do not have to calculate it exactly alike.

### Turning the turret

```
controller                          server                          screen
  │ ── aim { angle?, power? } ───────▶ │ ── aim { id, angle, power } ─▶ │
```

- The angle is a whole number of degrees: 0 points right, 90 straight up and 180 left. The original shows 0–90 and a direction; one number from 0 to 180 is the same thing and simpler to send.
- The power is a whole number from 0 to 1000. Later the maximum of a tank is ten times its energy, and the server clamps the power to it.
- A message has the angle, the power or both; what is left out stays as it was.
- The controller shows its own aim at once and does not wait for the server. It sends at most one `aim` every 50 ms (`AIM_INTERVAL`), always the latest value, so dragging a dial does not flood the connection.
- The server stores the aim and passes it on to those who show the field, not back to the controller.
- The server sends an `aim` to a controller only when the controller cannot know the aim of its tank: when the tank is made (the game starts) and when the controller returns with `resume` or `rejoin`. A controller never gets the aims of the other tanks.
- An `aim` before the game has started is refused with `wrong-phase`.

This is the first input that has to feel immediate, so it is the test of the whole chain: phone → server in Frankfurt → TV. The goal is that the turret on the TV follows the thumb with no delay that the player notices (under about 100 ms).

### Firing

```
controller                          server                          screen
  │ ── fire ─────────────────────────▶ │
  │ ◀── weapons { selected, counts } ─ │
  │ ◀── reload { time: 3000 } ──────── │ ── shots { shots } ──────────▶ │   every 50 ms
  │                                    │ ── explode { x, y, radius, weapon } ▶ │
  │                                    │ ── terrain { changes, tanks }▶ │
  │                                    │ ── shots { shots: [] } ──────▶ │
```

- `fire` has nothing in it: the tank fires with the aim and the weapon the server has. The controller sends an aim it has not sent yet just before the `fire`.
- **Reloading.** After a shot the tank reloads, the longer the bigger the weapon was (`reload` in `shared/weapons.ts`: three seconds for a Baby Missile, twenty for a Nuke). The server tells the player how long with `reload { time }`, and refuses a `fire` during it with the error `reloading`. Turning the turret works meanwhile. This is the live mode; the classic mode has turns instead (see below).
- **The flight is calculated on the server** (`shared/sim/shots.ts`), 60 steps a second. Every 50 ms (`SHOTS_INTERVAL`) the screen is sent the places of all the projectiles in the air, as whole pixels of the field. A projectile can be outside the field, above it or past its sides. When the last one is gone, an empty list is sent once, and then nothing until the next shot.
- **The screen draws a projectile between two places it was told**, on the way from the earlier to the later one, so the flight is smooth although the places come twenty times a second. A projectile that is not in a list any more is gone.
- **A projectile outside the field**, above it or past a side, is shown as a white dot on the edge of the field, as in the original.
- **Traces.** The screen draws the path of a Tracer as a row of dots that stays for the rest of the round, from the places it is told in `shots`. With `settings.traces` on (Trace Paths of the original) it does so for every projectile. A screen that returns in the middle of a round has lost the traces drawn so far.
- **An explosion** is told once, when it happens: where, how large, and of which weapon. The weapon picks the look (fire, a ball of dirt, the flash of a riot bomb) and later the sound. Each projectile in `shots` also has the id of its weapon.
- **A change to the terrain** is told as what was done to it, not as a new terrain: `carve` (the dirt inside a circle is destroyed), `fill` (a ball of dirt is made) and `settle` (the dirt that has nothing under it falls). The screen makes the same changes to its own copy with the code of `shared/sim/terrain.ts`, which uses only whole numbers and gives the same result everywhere. With the changes come the tanks as they are after them, because a tank comes down with the ground under it. The server moves such a tank straight to where it lands; the screen shows it falling there. The fall takes energy from the tank by its height (`FALL_DAMAGE` in `shared/sim/shots.ts`), which counts as damage by the shot that took the ground.
- A screen that returns gets the whole `field` as it is now, craters and all, and the projectiles that are in the air in the next `shots`. A controller that returns gets a `reload` with the time that is left.

### Wind

- The host sets the strongest wind of the room in the lobby: `settings.maxWind`, 0–500, 200 by default as in the original. 0 is no wind.
- Each round has a wind of its own, to either side, at most the strongest allowed and mostly much less, as in the original: on average 0.15 times the strongest. It is a whole number with a sign: positive blows to the right.
- The wind is in the state of the room (`wind`), because everyone aims by it: the screen shows it in a corner and a phone above the energy of the tank. It is also in the `field`. Outside a round it is 0.
- With `settings.changingWind` on (Changing Wind of the original, off by default), the wind moves by -5 to 5 whenever the air has cleared after a shot: after every turn in the classic mode, and in the live mode whenever nothing is flying. The new wind comes in the state of the room.
- The wind pushes everything in the air sideways, as measured from the original (`WIND_PER_UNIT` in `shared/sim/shots.ts`): a wind of 400 pushes as hard as gravity pulls.

### Walls

- `settings.walls` tells what the edges of the field do to a projectile: `none` (the default, as in the original), `rubber` or `wraparound`. It is also in the `field`.
- **None**: a projectile flies out. Past a side it is followed for a while and then gone; above the field it comes back down.
- **Rubber**: the sides and the top of the field throw a projectile back as fast as it came. A roller turns back at the edge.
- **Wraparound**: what leaves from one side comes in from the other, at the same height and speed. The top is open. A roller rolls on from the other side.
- The other walls of the original (Concrete, Padded, Spring, Random, Erratic) come later. How exactly the original bounces a projectile is not measured.

### Weapons

```
controller                          server
  │ ◀── weapons { selected, counts } ─ │   at the start of a round, after a shot, on return
  │ ── weapon { weapon: "missile" } ─▶ │
  │ ◀── weapons { selected, counts } ─ │
```

- The weapons are data that both sides have: `shared/weapons.ts`. The messages carry only their ids.
- **What a player has** is told only to that player: `weapons { selected, counts }`. `counts` has how many the player has of each weapon, by its id. A weapon there is no end of (the Baby Missile) is not in it, nor one the player has none of.
- **Choosing**: `weapon { weapon }` sets what the tank fires next. It is always answered with `weapons`; a weapon that does not exist or that the player has none of is also refused with the error `no-weapon`. A weapon can be chosen at any time during a game, also while the tank reloads and on someone else's turn.
- **Firing** takes one from the count. When it was the last one, the tank goes back to the Baby Missile.
- A player starts a game with no weapons but the Baby Missile. The rest are bought in the shop (see below). What is left is kept from round to round.
- What the weapons do (`shared/sim/shots.ts`):
  - Baby Missile, Missile, Baby Nuke, Nuke: an explosion of the radius of the weapon, which destroys dirt and damages tanks.
  - MIRV: at the top of its flight it becomes five warheads that spread sideways, each of which explodes like a Missile. One that hits something on its way up explodes as a single warhead.
  - Dirt Clod, Dirt Ball, Ton of Dirt: a ball of dirt (`fill`), which then falls. A tank under it is buried but not harmed; when it fires, its shot goes off at the turret and hurts it.
  - Riot Bomb, Heavy Riot Bomb: destroys dirt, does not damage tanks.
  - Tracer: flies and does nothing.
  - Baby Roller, Roller, Heavy Roller: where it lands it starts to roll like a ball, faster downhill and slower uphill, and explodes when it reaches a tank or stops in a valley (or after six seconds). One that comes down on a tank explodes at once. A rolling projectile is in `shots` like one in the air.

### Money and the shop

```
controller                          server                          everyone
  │                                    │ ── room { phase: "shop", shop: { time, ready } } ─▶
  │ ◀── weapons { selected, counts } ─ │
  │ ── buy { weapon: "missile" } ────▶ │
  │ ◀── weapons { selected, counts } ─ │ ── room { players[].money } ─▶
  │ ── ready ────────────────────────▶ │ ── room { shop: { ready } } ──▶
  │                                    │ ── room { phase: "playing" } ─▶   when everyone is ready
```

- **Money** is in the state of the room (`players[].money`), for everyone to see, as in the rankings of the original. It can be below zero. A game starts with `settings.cash` for each player (Cash at Start, 0 by default as in the original, up to 1,000,000).
- **What a round pays** (`shared/economy.ts`): 5,000 to the player whose tank is the last one left and 15 off for each point of energy a player takes from its own tank, both as measured from the original; and our own values until they are measured too: 20 for each point of energy taken from the tank of another, and 2,000 more for destroying it. The state of the room is sent when a shot pays.
- **Interest**: between two rounds, money that was not spent grows by `settings.interest` per cent (Interest Rate, 0–30, 5 by default as in the original). A debt does not grow.
- **Arms level**: `settings.armsLevel` (0–4, 4 by default as in the original). The shop sells only the weapons of that level or lower; a `buy` of another is refused with `no-weapon`.
- **The shop** opens before a round when at least one player can afford something: before the first round only if the game starts with cash. The phase of the room is `shop`, and `shop` in its state tells how long the shop is still open (`time`, at most 60 seconds) and who are ready.
- `buy { weapon }` buys one bundle of a weapon at its price (`shared/weapons.ts`). It is answered with `weapons`, and the new money comes in the state of the room. It is refused with `no-weapon` (no such weapon, or one that is not sold: the Baby Missile), `no-money`, or `too-many` (nobody can have more than 99 of a weapon).
- `sell { weapon }` sells a bundle of a weapon back, or what the player has left of one, at four fifths of its price (`SELL_RATE` in `shared/economy.ts`, our own value). It is answered with `weapons`, and refused with `no-weapon` when the player has none of it. When the weapon the tank had chosen is sold out, the tank goes back to the Baby Missile.
- `ready` tells that the player is done. The round starts when every player who is connected is ready, or when the time is out. A player who is not connected is not waited for.
- A device that returns to the shop gets the state of the room and its `weapons`.

### Turns: classic and live

The screen chooses in the lobby how the turns go (`settings.turns`). A new room has the classic mode.

- **Live**: everyone fires whenever their tank has reloaded, as described above. The state of the room has no `turn`.
- **Classic**: one player at a time fires, as in the Sequential mode of the original. The state of the room tells whose turn it is and how long the player still has: `turn: { player, time }`. The state is sent to everyone whenever the turn changes.
  - The order of the turns is drawn at the start of each round, and stays for the round.
  - Only the player whose turn it is can fire, and only once: anything else is refused with the error `not-your-turn`. Everyone can turn their turret at any time.
  - A player has 45 seconds (`TURN_TIME`). If the player has not fired by then, the turn is skipped. That is also what happens to a player whose phone is not connected.
  - When the shot is fired the clock stops (`time` is 0), and the turn passes when the shot is over: it has exploded or flown away.
  - Players whose tanks have been destroyed are skipped. If the player whose turn it is leaves or is removed, the turn passes at once.
  - There is no reloading, and while the result of a round is shown it is nobody's turn.

A device that returns gets the turn with the state of the room, with the time that is left.

### Damage and rounds

- A tank has an **energy** from 100 down to 0, which is in the tanks of the `field` and `terrain` messages. An explosion takes energy from the tanks its fire reaches, the more the closer it is (`shared/sim/shots.ts`): the most at the middle of the tank, less in proportion to the distance, down to nothing a blast radius away. The most is by the weapon (`damage` in `shared/weapons.ts`): a Baby Missile takes half of the energy of a whole tank at best, the nukes all of it. A tank also loses energy when it falls.
- The player is told the energy of its own tank with `energy { energy }`: at the start of a round, whenever it changes, and when the controller returns.
- **The power is at most ten times the energy**, as in the original. The server lowers the power of a tank that is damaged, and an `aim` with more power is cut to what the energy allows.
- A tank with no energy is **destroyed**: it stays on the field as a wreck, a projectile flies through it, and its `aim` and `fire` are refused with the error `destroyed`. Its player can still use the speech bubbles.
- **A round is over** when at most one tank is left and nothing is in the air. Everyone in the room is told `roundOver { round, winner }`, where the winner is the id of the player whose tank is left, or null if none is. Firing is refused with `wrong-phase` while the result is shown.
- The winner of a round gets a **win**. The wins of each player are in the state of the room (`players[].wins`), which is sent again when a round ends.
- Five seconds later (`ROUND_PAUSE`) the shop opens if anyone can buy anything (see below), and then **the next round starts**: a new terrain, every tank whole again. The screen gets a new `field`, the players their `aim`, `reload` and `energy`, and everyone the state of the room, whose `round` is the number of the round from 1.
- **A game has a number of rounds**, which the screen sets in the lobby with the other settings (`settings.rounds`, 1–1000, 10 by default, as in the original). After the last round there is no new round: the phase of the room becomes `finished`, and the final standings are shown. Nothing can be done on the field then.
- From a finished game the screen goes back to the lobby with `lobby`: the wins are cleared, the QR code is shown and new players can join, and `start` starts a new game.

There are no points or money yet: the standings are by the rounds won.

### Speech bubbles

```
controller                          server                          screen
  │ ── say { text } ─────────────────▶ │ ── say { id, text } ─────────▶ │
  │ ◀── say { id, text } ───────────── │
```

- The text is 1–60 characters (`MAX_SAY_LENGTH`) with no control characters.
- At most one bubble per player every two seconds (`SAY_INTERVAL`); more often is refused with `rate-limited`.
- The server may change the text (the word filter of the public online games, later), which is why the one who said it gets the text back too: the controller shows what was really shown.
- A speech bubble is above a tank, so one before the game has started is refused with `wrong-phase`.
- The spaces at the ends of the text are dropped, and several spaces in a row become one.
- The screen shows a bubble above the tank for about five seconds. A new bubble replaces the old one. Bubbles are not stored: a screen that returns does not get the old ones.

## Errors

When the server refuses something, it answers `error { code, re }`, where `re` is the type of the message that was refused. An error that is not an answer to a message (`replaced`, a removed player, a removed room) has no `re`.

| Code            | Meaning                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| `wrong-version` | The client has another version of the protocol than the server.                                      |
| `bad-message`   | Not a message of the API: not JSON, an unknown type, a missing or wrong field.                       |
| `bad-token`     | The join token is not valid (any more).                                                              |
| `no-room`       | There is no such room (any more).                                                                    |
| `no-session`    | The key does not open the room.                                                                      |
| `room-full`     | The room has its maximum number of players.                                                          |
| `bad-name`      | The name was refused (the word filter, later).                                                       |
| `not-allowed`   | The client is not in a room, or its role may not do this.                                            |
| `wrong-phase`   | The room is not in a phase where this can be done, e.g. joining a game that has started.             |
| `reloading`     | The tank is still reloading after its last shot.                                                     |
| `no-weapon`     | There is no such weapon, or the player has none of it.                                               |
| `no-money`      | In the shop: the player does not have the money for it.                                              |
| `too-many`      | In the shop: the player would have more than 99 of the weapon.                                       |
| `destroyed`     | The tank of the player has been destroyed.                                                           |
| `not-your-turn` | In the classic mode: it is not the turn of the player, or the player has already fired on this turn. |
| `rate-limited`  | Too many messages.                                                                                   |
| `replaced`      | Another connection took over this screen or player. The connection is closed.                        |

A connection that sends more than 40 messages within a second gets `rate-limited` once, and the extra messages are dropped.

## Later

Sketched only, to check that the design above has room for them. They are designed properly when their phase comes.

- **The shop, later**: Free Market.
- **The live mode** (phase 2): the same `aim` and `fire`; the server answers a `fire` during a reload with an error and tells each player when its reload ends.
- **Online** (phase 3): `create { mode: "online", public }`, a list of the public rooms, and `join` with the token of a private link, which does not change. The role is "player": it gets both the messages of a controller and those of the field.

### More kinds of projectiles and changes

The same messages carry the rest of the arsenal, because what a weapon does is code in `shared/sim`, not a message:

- A projectile gets more states: burrowing (the Diggers and the Sandhogs, tunnelling).
- More changes to the terrain: carve or add a wedge (Riot Charge, Dirt Charge). Weapons that change the terrain bit by bit (Liquid Dirt, Napalm, the Diggers) send a run of small changes.
- More events: a tank that starts to fall, damage from the fall. The effects and the sounds are played from the events.
- A checksum of the terrain now and then, as a safeguard: a screen whose terrain differs asks for the whole `field` again.
- Wind, air viscosity and the walls only affect the calculation on the server.

## Open questions

1. **Who may use the speech bubbles?** PLAN.md says the dead. In this slice nobody dies, so everyone can. Whether the living keep them when the game has deaths is a rule of the server, not of the protocol.
