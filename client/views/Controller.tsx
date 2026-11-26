import React, { useEffect, useRef, useState } from "react";

import { AIM_INTERVAL, RoomState } from "../../shared/protocol";
import { playerColor } from "../colors";
import AimControl from "../components/AimControl";
import PlayerList from "../components/PlayerList";
import SayControl from "../components/SayControl";
import { Api, useApiMessages } from "../hooks/useApiConnection";
import { useBubbles } from "../hooks/useBubbles";
import { useThrottled } from "../hooks/useThrottled";
import { navigate } from "../routes";
import { loadPlayerKey, savePlayerKey } from "../session";

interface Props {
  api: Api;
  room: string;
}

/** Why this device cannot be a controller of the room. */
type Problem = "not-player" | "no-room" | "replaced";

const PROBLEMS: Record<Problem, string> = {
  "not-player": "You are not in this game.",
  "no-room": "This game has ended.",
  replaced: "You are playing in another tab or on another device."
};

/** A controller of a hotseat game: the lobby before the game, and the controls of the tank during it. */
export default function Controller({ api, room }: Props) {
  const [state, setState] = useState<RoomState | null>(null);
  const [self, setSelf] = useState<number | null>(null);
  const selfNow = useRef<number | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
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
    } else if (message.type === "say" && message.id === selfNow.current) {
      showBubble(message.id, message.text);
    } else if (message.type === "error") {
      if (message.code === "replaced") stop("replaced", false);
      else if (message.code === "no-room") stop("no-room");
      else if (message.code === "no-session") stop("not-player");
    }
  });

  const leave = () => {
    api.send({ type: "leave" });
    savePlayerKey(room, null);
    navigate({ view: "home" });
  };

  if (problem) {
    return (
      <section className="view">
        <h2>{PROBLEMS[problem]}</h2>
        {problem !== "replaced" && <p>To join a game, scan the QR code on its screen.</p>}
      </section>
    );
  }

  const me = state?.players.find((player) => player.id === self);
  if (!state || !me) {
    return (
      <section className="view">
        <p className="note" role="status">
          Connecting to the server…
        </p>
      </section>
    );
  }

  return (
    <section className="view controller">
      <h2 className="controller__name">
        <span className="players__color" style={{ background: playerColor(me.id) }} />
        {me.name}
      </h2>
      {!state.screen && (
        <p className="error" role="alert">
          The screen of the game is away.
        </p>
      )}
      {state.phase === "lobby" && (
        <p className="controller__status" role="status">
          Waiting for the game to start…
        </p>
      )}
      {state.phase === "playing" && aim && (
        <>
          <AimControl angle={aim.angle} power={aim.power} color={playerColor(me.id)} onChange={changeAim} />
          <SayControl onSay={(text) => api.send({ type: "say", text })} />
          {said !== undefined && (
            <p className="note" role="status">
              You said: {said}
            </p>
          )}
        </>
      )}
      {state.phase === "lobby" && <PlayerList players={state.players} self={me.id} />}
      <button className="button controller__leave" onClick={leave}>
        Leave the game
      </button>
    </section>
  );
}
