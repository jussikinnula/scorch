import React, { FormEvent, useEffect, useRef, useState } from "react";

import { ErrorCode, MAX_NAME_LENGTH } from "../../shared/protocol";
import { Api, useApiMessages } from "../hooks/useApiConnection";
import { navigate } from "../routes";
import { loadLastPlayer, loadName, saveName, savePlayerKey } from "../session";

interface Props {
  api: Api;
  token: string;
}

const ERRORS: Partial<Record<ErrorCode, string>> = {
  "bad-token": "This code is not valid any more. Scan the QR code on the screen again.",
  "room-full": "The game is full.",
  "wrong-phase": "The game has already started. You can join when it is over.",
  "bad-name": "That name cannot be used. Try another one."
};

/**
 * Joining a hotseat game: the player gives a name, and the phone becomes a controller.
 *
 * A device that is already a player of the game is not asked anything: it returns to the player it
 * is, with the name and everything else as the server has them.
 */
export default function Join({ api, token }: Props) {
  const [name, setName] = useState(loadName);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Whether the server is being asked if this device already is a player of the game
  const [known] = useState(loadLastPlayer);
  const [checking, setChecking] = useState(known !== null);
  const asked = useRef(false);

  useEffect(() => {
    if (!api.connected || !known || asked.current) return;
    asked.current = api.send({ type: "rejoin", token, playerKey: known.key });
  }, [api, known, token]);

  useApiMessages(api, (message) => {
    if (message.type === "joined") {
      savePlayerKey(message.room, message.playerKey);
      // A device that returned was not asked for a name
      if (joining) saveName(name.trim());
      // The address of the controller replaces this one, whose token soon goes stale
      navigate({ view: "controller", room: message.room }, true);
    } else if (message.type === "error" && message.re === "rejoin") {
      // Not a player of this game: the device can join as a new one. A token that is not valid is told at once.
      setChecking(false);
      if (message.code === "bad-token") setError(ERRORS["bad-token"]!);
    } else if (message.type === "error" && message.re === "join") {
      setJoining(false);
      setError(ERRORS[message.code] ?? "Joining did not work. Try again.");
    }
  });

  const join = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setJoining(api.send({ type: "join", token, name: name.trim() }));
  };

  if (checking) {
    return (
      <section className="view">
        <p className="note" role="status">
          Connecting to the server…
        </p>
      </section>
    );
  }

  return (
    <section className="view join">
      <h2>Join the game</h2>
      <form onSubmit={join}>
        <label htmlFor="name">Your name</label>
        <input
          id="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="nickname"
          autoCapitalize="words"
          autoFocus
        />
        <button className="button button--primary" disabled={!api.connected || joining || name.trim() === ""}>
          Join
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!api.connected && (
        <p className="note" role="status">
          Connecting to the server…
        </p>
      )}
    </section>
  );
}
