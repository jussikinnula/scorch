# The protocol

How the clients and the server talk to each other. The types of the messages and the limits are in [`shared/protocol.ts`](../shared/protocol.ts), which both sides import; this document tells how they are used and why.

Status: everything up to "Later" is implemented (protocol version 1): the rooms (creating one, joining it with the QR code, the lobby, returning after a lost connection), the playing field, turning the turret and the speech bubbles.

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
  │ ── (WebSocket opens) ─────────────▶ │
  │ ◀──────── hello { protocol } ────── │
  │ ── ping ──────────────────────────▶ │   every 25 s
  │ ◀──────────────────────── pong ──── │
```

`protocol` is `PROTOCOL_VERSION`. A frontend built for another version tells the user that the game is being updated and offers to reload the page. This matters because the previews of pull requests use the production server.

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

**Nobody new joins during the game.** A `join` after the game has started is refused with `wrong-phase`, and the screen does not show the QR code then. Those who are players return with `resume` or `rejoin` at any time. The front page of the site offers a device a way back to the game it was last in, for when its page was closed.

If a second connection takes over a screen or a player with the right key, the first one gets the error `replaced` and is closed. That is what happens when the same phone opens the page in two tabs.

### The lobby

The state of the room (`RoomState`) is sent to everyone in the room whenever it changes: someone joins, leaves, loses or regains the connection, the settings change, or the phase changes.

| From       | Message                 | When         | What happens                                                                                                   |
| ---------- | ----------------------- | ------------ | -------------------------------------------------------------------------------------------------------------- |
| Screen     | `settings { settings }` | In the lobby | Changes the maximum number of players (2–10, 8 by default). It cannot go below the number already in the room. |
| Screen     | `kick { id }`           | Any time     | Removes the player; its key stops working. The controller of the player gets the error `no-session`.           |
| Screen     | `start`                 | In the lobby | Starts the game, if there are at least two players.                                                            |
| Controller | `leave`                 | Any time     | The player leaves for good. There is no answer.                                                                |

The game also starts by itself when the room becomes full.

Joining is open again between the rounds, once the game has rounds.

### Losing a connection

- **A controller**: the player stays in the room with `connected: false`, and the tank stays on the field. `resume` brings the player back. The others see the player as disconnected, not as gone: only the screen removing the player, or the player leaving, takes the player out of the game.
- **The screen**: the room stays, with `screen: false`. The controllers show that the screen is away. `host` brings it back. A room without a screen is removed after five minutes, and with it the keys of its players. The controllers that are connected get the error `no-room`.

**A device that returns is told everything it needs.** After `host` or `resume` the server sends the whole of what that role shows, not only what has changed since: a device that returns may have missed anything, or may be a page that was just reloaded and knows nothing. Today that is the state of the room, for the screen also the join token and the playing field with the aims of all the tanks, and for a controller the aim of its own tank. Each later feature adds its part to this: the playing field for those who show it, and for a player its own aim, energy, money, inventory, turn and reload. Every such addition gets a test that returns in the middle of it (see PLAN.md, Testing).

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

| Code           | Meaning                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------- |
| `bad-message`  | Not a message of the API: not JSON, an unknown type, a missing or wrong field.           |
| `bad-token`    | The join token is not valid (any more).                                                  |
| `no-room`      | There is no such room (any more).                                                        |
| `no-session`   | The key does not open the room.                                                          |
| `room-full`    | The room has its maximum number of players.                                              |
| `bad-name`     | The name was refused (the word filter, later).                                           |
| `not-allowed`  | The client is not in a room, or its role may not do this.                                |
| `wrong-phase`  | The room is not in a phase where this can be done, e.g. joining a game that has started. |
| `rate-limited` | Too many messages.                                                                       |
| `replaced`     | Another connection took over this screen or player. The connection is closed.            |

A connection that sends more than 40 messages within a second gets `rate-limited` once, and the extra messages are dropped.

## Later

Sketched only, to check that the design above has room for them. They are designed properly when their phase comes.

- **Firing and the round** (phase 1): `weapon { id }` and `fire` from a player. From the server a `turn` (whose turn, how long). Each player gets its own energy, money and inventory in a message of its own, which the controller needs but the others must not see.
- **Wind** (phase 1): a number with a sign, in the message that starts a round and again whenever it changes (Changing Wind, the live mode). It goes to everyone, the controllers too, because the player aims by it.
- **Projectiles in flight** (phase 1): see below.
- **The shop** (phase 1): `buy { item }`, `sell { item, quantity }`, `ready`. The inventory and the prices go only to the player.
- **The live mode** (phase 2): the same `aim` and `fire`; the server answers a `fire` during a reload with an error and tells each player when its reload ends.
- **Online** (phase 3): `create { mode: "online", public }`, a list of the public rooms, and `join` with the token of a private link, which does not change. The role is "player": it gets both the messages of a controller and those of the field.

### Projectiles and the terrain

The server runs the flight, and the clients only draw it. That keeps the protocol the same for every weapon: what a weapon _does_ is code in `shared/sim`, not a message.

- **Snapshots.** While anything is in the air the server sends, 20–30 times a second, the list of the projectiles: an id, the kind (which picks the look and the sound), the place and what it is doing. Those who show the field interpolate between two snapshots. A projectile that is not in the next snapshot is gone.
- **What a projectile is doing** is a state in the snapshot: flying, rolling along the ground (the Rollers), burrowing (the Diggers and the Sandhogs, tunnelling). A MIRV that splits is one projectile that goes and five that appear. The client needs the state only to draw the right thing; it never calculates where a projectile goes.
- **Events.** What happens at a moment is sent once, as it happens: a launch (which tank, which weapon), an explosion (where, how large, which weapon), damage to a tank, a tank that starts to fall, a death. The effects and the sounds are played from these.
- **Operations on the terrain.** A change to the dirt is sent as an operation, not as a new terrain: carve a circle (explosions, Riot Bombs), add a circle of dirt (Dirt Clod, Dirt Ball, Ton of Dirt), carve or add a wedge (Riot Charge, Dirt Charge), let the loose dirt fall. The clients apply them to their own copy of the terrain with the code of `shared/sim`, which is integer arithmetic and gives the same result everywhere. Weapons that change the terrain bit by bit (Liquid Dirt, Napalm, the Diggers) send a run of small operations.
- **A safeguard.** The server sends a checksum of the terrain now and then. A client whose terrain differs asks for the whole `field` again.
- **Wind and the trajectory.** Wind, gravity, air viscosity and the walls only affect the calculation on the server. The clients see their effect in the places of the snapshots.

In the classic mode the same messages carry one shot at a time; in the live mode many at once.

## Open questions

1. **Who may use the speech bubbles?** PLAN.md says the dead. In this slice nobody dies, so everyone can. Whether the living keep them when the game has deaths is a rule of the server, not of the protocol.
