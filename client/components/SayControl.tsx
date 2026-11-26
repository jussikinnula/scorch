import React, { FormEvent, useEffect, useState } from "react";

import { MAX_SAY_LENGTH, SAY_INTERVAL } from "../../shared/protocol";

interface Props {
  /** Says the text. Returns false if it could not be sent. */
  onSay: (text: string) => boolean;
}

/** A field for writing a short text, which is shown in a speech bubble above the tank of the player. */
export default function SayControl({ onSay }: Props) {
  const [text, setText] = useState("");
  // After a bubble the player must wait a moment before the next one
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    if (!waiting) return;
    const timer = window.setTimeout(() => setWaiting(false), SAY_INTERVAL);
    return () => window.clearTimeout(timer);
  }, [waiting]);

  const say = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim() === "" || waiting || !onSay(text.trim())) return;
    setText("");
    setWaiting(true);
  };

  return (
    <form className="say" onSubmit={say}>
      <input
        aria-label="Say something"
        placeholder="Say something…"
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={MAX_SAY_LENGTH}
        autoComplete="off"
        enterKeyHint="send"
      />
      <button className="button" disabled={waiting || text.trim() === ""}>
        Say
      </button>
    </form>
  );
}
