import React, { useEffect, useRef, useState } from "react";

import { AIM_INTERVAL, MAX_ANGLE, MAX_ENERGY, MIN_ANGLE, MIN_POWER, RoomState } from "../../shared/protocol";
import { WEAPONS } from "../../shared/weapons";
import { playerColor } from "../colors";
import AimBar from "../components/AimBar";
import AimControl from "../components/AimControl";
import FireControl from "../components/FireControl";
import GearControl from "../components/GearControl";
import PlayerList from "../components/PlayerList";
import SayControl from "../components/SayControl";
import Shop from "../components/Shop";
import Standings, { ranked } from "../components/Standings";
import WeaponControl from "../components/WeaponControl";
import Wind from "../components/Wind";
import { Api, useApiMessages } from "../hooks/useApiConnection";
import { useBubbles } from "../hooks/useBubbles";
import { useCountdown } from "../hooks/useCountdown";
import { useThrottled } from "../hooks/useThrottled";
import { navigate } from "../routes";
import { trackOf } from "../sound/music";
import { useMusic } from "../sound/sound";
import SoundControls from "../components/SoundControls";
import { loadPlayerKey, savePlayerKey } from "../session";

interface Props {
  api: Api;
  room: string;
  /** Whether this is the player of an online game, whose page also has the playing field (see Play). */
  online?: boolean;
  /** In an online game: the playing field, which is shown under the bar of the controls during a round. */
  field?: React.ReactNode;
}

/** Why this device cannot be a controller of the room. */
type Problem = "not-player" | "no-room" | "replaced";

const PROBLEMS: Record<Problem, string> = {
  "not-player": "You are not in this game.",
  "no-room": "This game has ended.",
  replaced: "You are playing in another tab or on another device."
};

/** A controller of a hotseat game: the lobby before the game, and the controls of the tank during it. */
export default function Controller({ api, room, online = false, field }: Props) {
  const [state, setState] = useState<RoomState | null>(null);
  const [self, setSelf] = useState<number | null>(null);
  const selfNow = useRef<number | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  /** The energy of the tank of the player, as the server told it. A tank with none is destroyed. */
  const [energy, setEnergy] = useState(MAX_ENERGY);
  /** What is left of the shield of the tank, 0 when it has none. */
  const [shield, setShield] = useState(0);
  /** The result of the round that just ended, until the next round starts. */
  const [result, setResult] = useState<{ round: number; winner: number | null } | null>(null);
  // The turns of the classic mode: whose it is, and how long that player still has
  const turn = state?.turn ?? null;
  const myTurn = turn !== null && turn.player === self && turn.time > 0;
  const turnTime = useCountdown(turn ? turn.time : null, state);
  const shopTime = useCountdown(state?.shop ? state.shop.time : null, state);
  useEffect(() => {
    // The phone tells that the turn has come, also to one who is looking at the big screen
    if (myTurn) window.navigator.vibrate?.(200);
  }, [myTurn]);
  // The reload of the tank that is going on, as the server told it
  const [reload, setReload] = useState({ until: 0, time: 0 });
  /** The weapons of the player and the one the tank fires next, once the server has told them. */
  const [weapons, setWeapons] = useState<{ selected: string; counts: Record<string, number> } | null>(null);
  // What the player last said, as the server showed it, for as long as the bubble is on the screen
  const { bubbles, say: showBubble } = useBubbles();
  const said: string | undefined = self === null ? undefined : bubbles[self];
  /** The aim of the tank of the player, once the server has told it. */
  const [aim, setAim] = useState<{ angle: number; power: number } | null>(null);
  // What has changed in the aim since it was last sent: only the latest values are sent, not every step
  const unsent = useRef<{ angle?: number; power?: number }>({});
  const sendAim = useThrottled(() => {
    if (api.send({ type: "aim", ...unsent.current })) unsent.current = {};
  }, AIM_INTERVAL);

  /** The player turned the turret or set the power: it is shown at once and sent to the server. */
  const changeAim = (change: { angle?: number; power?: number }) => {
    setAim((current) => current && { ...current, ...change });
    unsent.current = { ...unsent.current, ...change };
    sendAim();
  };
  // After a problem the controller does not return to the room, e.g. to not fight another tab over the player
  const stopped = useRef(false);

  const stop = (reason: Problem, forget = true) => {
    stopped.current = true;
    if (forget) savePlayerKey(room, null);
    setProblem(reason);
  };

  // Returns to the player whenever there is a connection: at first, and again after the connection was lost
  useEffect(() => {
    if (!api.connected || stopped.current) return;

    const playerKey = loadPlayerKey(room);
    if (playerKey) api.send({ type: "resume", room, playerKey });
    else stop("not-player");
  }, [api, room]);

  useApiMessages(api, (message) => {
    if (message.type === "joined" && message.room === room) {
      // Also kept where the next message finds it: the messages can come faster than the view is redrawn
      selfNow.current = message.id;
      setSelf(message.id);
    } else if (message.type === "room" && message.state.room === room) setState(message.state);
    // The server tells the aim only when the controller cannot know it: at first and after returning
    else if (message.type === "aim" && message.id === selfNow.current) {
      setAim({ angle: message.angle, power: message.power });
    } else if (message.type === "energy") {
      setEnergy(message.energy);
      setShield(message.shield);
      // The power cannot be more than the energy allows
      setAim((current) => current && { ...current, power: Math.min(current.power, message.energy * 10) });
      // A whole tank after a round has ended is the start of the next round
      if (message.energy === MAX_ENERGY) setResult(null);
    } else if (message.type === "roundOver") {
      setResult({ round: message.round, winner: message.winner });
    } else if (message.type === "reload") {
      setReload({ until: performance.now() + message.time, time: message.time });
    } else if (message.type === "weapons") {
      setWeapons({ selected: message.selected, counts: message.counts });
    } else if (message.type === "say" && message.id === selfNow.current) {
      showBubble(message.id, message.text);
    } else if (message.type === "error") {
      if (message.code === "replaced") stop("replaced", false);
      else if (message.code === "no-room") stop("no-room");
      else if (message.code === "no-session") stop("not-player");
    }
  });

  // A player of an online game has the field on the same page: its view is another one
  const mode = state?.mode;
  useEffect(() => {
    if (mode === "online" && !online) navigate({ view: "play", room }, true);
    if (mode === "hotseat" && online) navigate({ view: "controller", room }, true);
  }, [mode, online, room]);

  /** Fires the tank. The aim that was just set goes before the shot, not after it. */
  const fire = () => {
    if (Object.keys(unsent.current).length > 0 && api.send({ type: "aim", ...unsent.current })) unsent.current = {};
    api.send({ type: "fire" });
  };

  /** Uses an accessory of the tank: a battery, or a shield to put up. */
  const useItem = (item: string) => api.send({ type: "use", item });

  /** Chooses the weapon the tank fires next. It is shown at once; the server answers with what the tank really has. */
  const chooseWeapon = (weapon: string) => {
    setWeapons((current) => current && { ...current, selected: weapon });
    api.send({ type: "weapon", weapon });
  };

  // In an online game the keys work as in the original: the arrows aim, the space bar fires, Tab changes the weapon
  const canAim = online && state?.phase === "playing" && aim !== null && energy > 0 && result === null;
  const keys = useRef<(event: KeyboardEvent) => void>(() => {});
  keys.current = (event) => {
    if (!canAim || !aim) return;
    // Not while something is being written, e.g. a speech bubble
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
    const big = event.shiftKey;
    const changes: Record<string, () => void> = {
      ArrowLeft: () => changeAim({ angle: Math.min(MAX_ANGLE, aim.angle + (big ? 5 : 1)) }),
      ArrowRight: () => changeAim({ angle: Math.max(MIN_ANGLE, aim.angle - (big ? 5 : 1)) }),
      ArrowUp: () => changeAim({ power: Math.min(energy * 10, aim.power + (big ? 25 : 5)) }),
      ArrowDown: () => changeAim({ power: Math.max(MIN_POWER, aim.power - (big ? 25 : 5)) }),
      PageUp: () => changeAim({ power: Math.min(energy * 10, aim.power + 50) }),
      PageDown: () => changeAim({ power: Math.max(MIN_POWER, aim.power - 50) }),
      " ": () => {
        if (!event.repeat && (!turn || myTurn) && reload.until <= performance.now()) fire();
      },
      Tab: () => {
        if (!weapons) return;
        const owned = WEAPONS.filter((weapon) => !Number.isFinite(weapon.bundle) || weapons.counts[weapon.id] > 0);
        const now = owned.findIndex((weapon) => weapon.id === weapons.selected);
        chooseWeapon(owned[(now + (event.shiftKey ? owned.length - 1 : 1)) % owned.length].id);
      }
    };
    const change = changes[event.key];
    if (!change) return;
    event.preventDefault();
    change();
  };
  useEffect(() => {
    if (!online) return;
    const onKey = (event: KeyboardEvent) => keys.current(event);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [online]);

  const leave = () => {
    api.send({ type: "leave" });
    savePlayerKey(room, null);
    navigate({ view: "home" });
  };

  const me = state?.players.find((player) => player.id === self);
  // An online player hears the music of the game, and at its end that of how it went for this player: the
  // one with the most rounds won, alone or with others, has won. A phone of a hotseat game is silent.
  const most = Math.max(0, ...(state?.players ?? []).map((player) => player.wins));
  useMusic(online ? trackOf(state?.phase, me !== undefined && me.wins === most) : null);

  if (problem) {
    return (
      <section className="view">
        <h2>{PROBLEMS[problem]}</h2>
        {problem !== "replaced" && <p>To join a game, scan the QR code on its screen.</p>}
      </section>
    );
  }

  if (!state || !me) {
    return (
      <section className="view">
        <p className="note" role="status">
          Connecting to the server…
        </p>
      </section>
    );
  }

  if (online && state.phase === "playing") {
    // A round of an online game, as in the original: a narrow bar with what the player needs to aim
    // and fire, and the playing field under it with the rest of the window
    const name = (id: number) => state.players.find((player) => player.id === id)?.name ?? "?";
    return (
      <section className="controller online">
        <div className="bar">
          <div className="bar__status">
            <h2 className="bar__name">
              <span className="players__color" style={{ background: playerColor(me.id) }} />
              {me.name}
            </h2>
            <p className="controller__energy bar__energy" aria-label="Energy">
              <span
                style={{
                  width: `${energy}%`,
                  background: energy > 50 ? "#2f8f5b" : energy > 25 ? "#b8860b" : "#c0392b"
                }}
              />
              {energy}
            </p>
            <Wind wind={state.wind} className="bar__wind" />
          </div>
          {result ? (
            <p className="bar__message bar__message--result" role="alert">
              {result.winner === null
                ? "Nobody is left."
                : result.winner === me.id
                  ? "You won the round!"
                  : `${name(result.winner)} won the round.`}{" "}
              {state.round < state.settings.rounds ? "The next round starts in a moment." : "That was the last round."}
            </p>
          ) : !aim ? null : energy <= 0 ? (
            <p className="bar__message" role="status">
              Your tank was destroyed.
            </p>
          ) : (
            <>
              <AimBar angle={aim.angle} power={aim.power} maxPower={energy * 10} onChange={changeAim} />
              {weapons && <WeaponControl selected={weapons.selected} counts={weapons.counts} onSelect={chooseWeapon} />}
              {weapons && <GearControl counts={weapons.counts} energy={energy} shield={shield} onUse={useItem} />}
              <FireControl
                reloadedAt={reload.until}
                reloadTime={reload.time}
                waiting={turn && !myTurn ? "Wait" : undefined}
                onFire={fire}
              />
            </>
          )}
          {turn && !result && (
            <p className={`bar__turn${myTurn ? " bar__turn--mine" : ""}`} role="status" aria-label="Turn">
              {myTurn
                ? `Your turn${turnTime ? ` · ${turnTime}` : ""}`
                : turn.player === me.id
                  ? "Your shot is on its way"
                  : `${name(turn.player)} is aiming`}
            </p>
          )}
        </div>
        {field}
        {result && <Standings players={state.players} self={me.id} />}
        <div className="online__rest">
          <SayControl onSay={(text) => api.send({ type: "say", text })} />
          <button className="button controller__leave" onClick={leave}>
            Leave the game
          </button>
          <SoundControls />
        </div>
      </section>
    );
  }

  return (
    <section className={`view controller${state.phase === "playing" ? " controller--playing" : ""}`}>
      <div className="controller__top">
        <h2 className="controller__name">
          <span className="players__color" style={{ background: playerColor(me.id) }} />
          {me.name}
        </h2>
        {state.phase === "playing" && <Wind wind={state.wind} className="controller__wind" />}
      </div>
      {!online && !state.screen && (
        <p className="error" role="alert">
          The screen of the game is away.
        </p>
      )}
      {state.phase === "lobby" && (
        <p className="controller__status" role="status">
          Waiting for the game to start…
        </p>
      )}
      {state.phase === "playing" && result && (
        <p className="controller__result" role="alert">
          {result.winner === null
            ? "Nobody is left."
            : result.winner === me.id
              ? "You won the round!"
              : `${state.players.find((player) => player.id === result.winner)?.name ?? "?"} won the round.`}{" "}
          {state.round < state.settings.rounds ? "The next round starts in a moment." : "That was the last round."}
        </p>
      )}
      {state.phase === "playing" && aim && energy <= 0 && (
        <>
          <p className="controller__status" role="status">
            Your tank was destroyed.
          </p>
          <SayControl onSay={(text) => api.send({ type: "say", text })} />
          {said !== undefined && <p className="note">You said: {said}</p>}
        </>
      )}
      {state.phase === "playing" && result && <Standings players={state.players} self={me.id} />}
      {/* When a round is over the tank has nothing to do: its controls come back with the next round */}
      {state.phase === "playing" && aim && energy > 0 && !result && (
        <>
          {turn && (
            <p className={`controller__turn${myTurn ? " controller__turn--mine" : ""}`} role="status" aria-label="Turn">
              {myTurn
                ? `Your turn${turnTime ? ` · ${turnTime}` : ""}`
                : turn.player === me.id
                  ? "Your shot is on its way"
                  : `${state.players.find((player) => player.id === turn.player)?.name ?? "?"} is aiming`}
            </p>
          )}
          <p className="controller__energy" aria-label="Energy">
            <span
              style={{
                width: `${energy}%`,
                // Green, then yellow under a half and red under a quarter: as the bar of the tank on the big screen
                background: energy > 50 ? "#2f8f5b" : energy > 25 ? "#b8860b" : "#c0392b"
              }}
            />
            {energy}
          </p>
          <AimControl
            angle={aim.angle}
            power={aim.power}
            maxPower={energy * 10}
            color={playerColor(me.id)}
            onChange={changeAim}
          />
          {weapons && <WeaponControl selected={weapons.selected} counts={weapons.counts} onSelect={chooseWeapon} />}
          <FireControl
            reloadedAt={reload.until}
            reloadTime={reload.time}
            waiting={turn && !myTurn ? "Wait" : undefined}
            onFire={fire}
          />
          {weapons && <GearControl counts={weapons.counts} energy={energy} shield={shield} onUse={useItem} />}
          <SayControl onSay={(text) => api.send({ type: "say", text })} />
          {said !== undefined && (
            <p className="note" role="status">
              You said: {said}
            </p>
          )}
        </>
      )}
      {state.phase === "shop" && state.shop && (
        <>
          <p className="controller__status" role="status">
            The shop is open before round {state.round + 1}.
          </p>
          <Shop
            money={me.money}
            counts={weapons?.counts ?? {}}
            ready={state.shop.ready.includes(me.id)}
            time={shopTime}
            armsLevel={state.settings.armsLevel}
            onBuy={(weapon) => api.send({ type: "buy", weapon })}
            onSell={(weapon) => api.send({ type: "sell", weapon })}
            onReady={() => api.send({ type: "ready" })}
          />
        </>
      )}
      {state.phase === "lobby" && (
        <PlayerList
          players={state.players}
          self={me.id}
          // The host of an online game can remove the others
          onKick={online && state.host === me.id ? (player) => api.send({ type: "kick", id: player.id }) : undefined}
        />
      )}
      {state.phase === "finished" && (
        <>
          <p className="controller__status" role="status">
            {ranked(state.players)[0].id === me.id && me.wins > (ranked(state.players)[1]?.wins ?? -1)
              ? "You won the game!"
              : "The game is over."}
          </p>
          <Standings players={state.players} self={me.id} />
        </>
      )}
      <button className="button controller__leave" onClick={leave}>
        Leave the game
      </button>
    </section>
  );
}
