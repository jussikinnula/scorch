# Online play: the design of phase 3

This is the plan of the online mode, written before it is built. It takes what [PLAN.md](PLAN.md) already decides (2.1 "Online", 4.7, 4.8) and works it out against the code as it is after phase 1: what is reused, what is new, in which steps it is built, and which questions are still open. Steps 1 to 3 below are built, and the server part of step 5 (the list of public games). The rest is still a plan.

## 1. What online is

Everyone plays on their own device, which shows both the playing field and the controls. There is no shared screen. The one who creates the room chooses whether it is public (in the list of open games, anyone can join) or private (joined only with a link that can be copied).

The game itself is the same: the same rooms, rounds, turns, weapons, money and shop, run by the same server code. Online changes three things only:

1. **Who shows the field.** In hotseat one screen does. Online every player does.
2. **Who is the host.** In hotseat the screen is. Online a player is, and the role can pass to another player.
3. **How a room is found and joined.** In hotseat by the QR code on the screen. Online from a list or by a link.

## 2. What is reused as it is

| Part                                                                               | Why it needs no change                                                 |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| The simulation (`shared/sim`)                                                      | It knows nothing of who watches.                                       |
| Rounds, turns, damage, money, the shop                                             | They are about players, not about devices.                             |
| `aim`, `weapon`, `fire`, `say`, `buy`, `sell`, `ready`                             | A player sends them the same way from a phone or from the online view. |
| `weapons`, `energy`, `reload`                                                      | They already go to the player they are about.                          |
| The state of the room (`room`)                                                     | It already goes to everyone in the room.                               |
| `Field`, `AimControl`, `FireControl`, `WeaponControl`, `Shop`, `Standings`, `Wind` | The online view is these components on one page.                       |
| The version handshake, the rate limit, the type guards                             | They are per connection.                                               |
| Returning after a lost connection (`resume`)                                       | A player key in the storage of the device, as now.                     |

## 3. What changes on the server

### 3.1 Those who show the field

Today the messages of the field (`field`, `shots`, `explode`, `terrain`, `aim` of the others, `say`) are sent to the screen of the room. They now go through one place in `server/rooms.ts`, `viewers(room)`, which answers "the screen" for a hotseat room. **This part is done** (it changes nothing in how hotseat works). For an online room the answer becomes "every connected player".

Two details follow:

- A player's own `aim` is not echoed back to it (as now: the controller already shows what the player did), but the `aim` of every other tank is.
- A player who returns in the middle of a round gets the whole `field` as it is, as a screen does today, in addition to what a controller gets.

### 3.2 The host

"The host" and "the screen" used to be the same thing in the code. They are now two: what only the host may do is checked in one place (`isHost` in `server/rooms.ts`), which answers "the screen" for a hotseat room. **This part is done.** What is left for an online room:

- A room has a **host**: the screen (hotseat) or one of the players (online).
- `settings`, `start`, `kick` and `lobby` are checked against the host, whoever it is.
- Online, when the host leaves for good or has been disconnected for longer than a grace time, the player who has been in the room the longest becomes the host (PLAN.md 2.1). The state of the room tells who the host is (`host: number | null`, the id of the player; null in hotseat).
- A hotseat room is removed when its screen has been away for five minutes. An online room has no screen: it is removed when it has had no connected player for five minutes.

### 3.3 Creating, finding and joining

New and changed messages (**done**, as described in [PROTOCOL.md](PROTOCOL.md)):

| From   | Message                                                                | Meaning                                                                                       |
| ------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Client | `create { mode: "online", name, public, settings }`                    | Creates an online room. The creator is its first player and its host. Answered with `joined`. |
| Client | `list`                                                                 | Asks for the public rooms that can be joined. Answered with `rooms`.                          |
| Server | `rooms { rooms: [{ room, token, host, players, maxPlayers, turns }] }` | The public rooms that are in the lobby and not full.                                          |
| Client | `join { token, name }`                                                 | As now. The token of an online room does not rotate: it is the link.                          |
| Server | `joined { room, id, playerKey }`                                       | As now.                                                                                       |

- **The link** of a private room is `#/join/<token>`, the same address a QR code leads to in hotseat. The token of an online room is longer (it must not be guessable, and it does not change) and is valid while the room is in the lobby.
- **The list** is asked for when the front page is opened and refreshed every few seconds while it is shown. It is not pushed: there is no need for a subscription.
- **Nobody new joins once the game has started**, as in hotseat. A room that has started is not in the list.

### 3.4 Pausing

A hotseat game is told to be paused while its screen is away. An online room has nothing like that: a player who is away is skipped when the turn clock runs out (classic) or simply does not fire (live), exactly as a disconnected phone today.

## 4. What changes in the frontend

- **The front page** gets a second way to start: "Play online" beside "Start a hotseat game", with a name, a choice of public or private, and the list of public games to join.
- **`#/play/<room>`** is the online view: in the lobby the list of players, the settings of the game to read and the link to copy; in a round the `Field` with the controls of the controller under it; between rounds the shop; at the end the standings.
- **The layout of a round** is that of the original (**done**): a narrow bar at the top with what the player needs to aim and fire (the name, the energy, the wind, the angle, the power, the weapon and the fire button), and the playing field under it with the rest of the window. The angle and the power are numbers with buttons that repeat while they are held, so the bar works by touch too; on a phone the bar wraps to a few rows, and the phone is best held sideways. On a desktop the keys work as in the original: the arrows turn the turret and set the power (with Shift in bigger steps, Page Up and Page Down in bigger still), the space bar fires and Tab changes the weapon.
- **The settings of the lobby** are a component of their own (`LobbySettings`), used by the screen and later by the online host. **This part is done.**

## 5. Protections (PLAN.md 4.8)

Hotseat is played among people in one room. A public online game is not, so these come with it:

| Protection                                    | State                                                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Every input checked on the server             | Done: type guards, the turn, the reload, what the player has.                                                                   |
| A limit on messages per connection            | Done: 40 a second.                                                                                                              |
| The host can remove a player                  | Done for the screen; follows the host.                                                                                          |
| A limit on the length and characters of names | Done. A word filter is new, for names and speech bubbles alike.                                                                 |
| The host can mute a player's speech bubbles   | New.                                                                                                                            |
| A limit on rooms and connections per address  | Done: 5 rooms and 60 connections. Behind Render the address comes from `X-Forwarded-For`, which a client can also write itself. |
| A limit on the number of rooms in all         | Done: 200.                                                                                                                      |

## 6. Steps

Each step can be merged and tried on its own, and hotseat keeps working after each.

1. **Viewers and host on the server, and the settings of the lobby as a component**, with no new messages. **Done**: hotseat is unchanged, and the tests passed as they were.
2. **Online rooms on the server** (**done**): `create { mode: "online" }`, the fixed token, players as viewers, the host passing on, removing an empty room. Tested with bare connections, as the rooms are today. The protocol version is raised.
3. **The online view** (**done**): `#/play/<room>` with the lobby and a round, first for a wide screen. Two browser windows can play a whole game through a private link.
4. **The layout of a round as in the original, and the keys** (**done**).
5. **Public rooms** (**done**): `list`, the list on the front page, and the limits per address.
6. **The word filter and muting.**

## 7. Decided

- **The host plays as everyone else does.** Being the host matters only for setting the game up: the settings, starting, removing players.
- **An online game goes on to its end** with those who are left, also with one player. When the last player leaves, the room is gone.
- **A host that loses its connection is waited for ten seconds** (`HOST_GRACE`). After that the player who has been in the room the longest becomes the host. A host that leaves is replaced at once.
- **The settings of an online room are fixed when it is created.** The one who creates the room chooses them on the front page, and they cannot be changed after that: those who see the room in the list choose it by its settings.
- **The list of public games** shows the settings of each, has those with the most players first, and can be narrowed to classic or live games. A full room has started and is not in it.
- **The lobby of an online room is open for five minutes.** Then the game starts by itself with those who are there, or the room is closed if nobody else came. So a room nobody comes to does not stay in the list.
- **One address can have one online room at a time**, and five rooms in all.
- **There are at most 50 online rooms** at a time. This and the other limits are defaults that the environment of the server can change.

## 8. Open questions

These need a decision before the step they belong to.

1. **Is the shop time the same online?** Sixty seconds is short among friends in one room and long among strangers.
2. **Can a public room be watched** without playing? A spectator mode is in phase 5; the list could show games in progress then. (Step 5.)
3. **Which words does the filter refuse**, and in which languages? (Step 6.)
4. **The free plan of Render sleeps** when nobody is connected, and waking takes tens of seconds. For hotseat that is a wait once at the start; for a list of public games it means the list is always empty after a quiet time. Is a paid plan in the picture when online opens? (Step 5.)
