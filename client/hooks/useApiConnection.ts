import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ClientMessage, PROTOCOL_VERSION, ServerMessage } from "../../shared/protocol";
import ApiConnection, { ApiMessage, toSocketUrl } from "../api/connection";

/**
 * How the version of the API of the backend compares to that of this frontend. The two are deployed
 * separately, so for a moment one can be newer than the other.
 */
export type Mismatch =
  /** The backend is older: it is being updated, and the frontend goes on by itself when it is done. */
  | "backend-older"
  /** The backend is newer: this page is an old one, and has to be loaded again. */
  | "backend-newer";

/** The connection to the backend, as the views use it. */
export interface Api {
  /**
   * Whether the backend can be talked to right now: there is a connection, and the backend has
   * greeted with the same version of the API as this frontend has.
   */
  connected: boolean;
  /** Set when there is a connection but the backend has another version of the API. Nothing is sent then. */
  mismatch: Mismatch | null;
  /** Sends a message. Returns false if there is no connection: the message is then lost. */
  send: (message: ClientMessage) => boolean;
  /** Calls the listener with each message of the backend, until the returned function is called. */
  subscribe: (listener: (message: ServerMessage) => void) => () => void;
}

/**
 * Keeps a connection to the backend open while the component is shown.
 *
 * @param apiUrl The address of the backend. There is no connection if it is empty.
 */
export function useApiConnection(apiUrl: string): Api {
  const [open, setOpen] = useState(false);
  /** The version of the API the backend greeted with, null before the greeting. */
  const [version, setVersion] = useState<number | null>(null);
  const usable = useRef(false);
  const connection = useRef<ApiConnection | null>(null);
  const listeners = useRef(new Set<(message: ServerMessage) => void>());

  useEffect(() => {
    if (!apiUrl) return;

    const onChange = (connected: boolean) => {
      // Each connection starts without a greeting: the backend may have been updated in between
      usable.current = false;
      setVersion(null);
      setOpen(connected);
    };
    const opened = new ApiConnection(toSocketUrl(apiUrl), onChange, (raw) => {
      // The server is trusted to send only messages of the API
      const message = raw as ServerMessage;
      if (message.type === "hello") {
        usable.current = message.protocol === PROTOCOL_VERSION;
        setVersion(message.protocol);
      }
      listeners.current.forEach((listener) => listener(message));
    });
    connection.current = opened;
    return () => {
      opened.close();
      connection.current = null;
      usable.current = false;
      setVersion(null);
      setOpen(false);
    };
  }, [apiUrl]);

  // Nothing is sent to a backend that has not greeted, or that has another version of the API
  const send = useCallback(
    (message: ClientMessage) => (usable.current && connection.current?.send(message as ApiMessage)) || false,
    []
  );
  const subscribe = useCallback((listener: (message: ServerMessage) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const connected = open && version === PROTOCOL_VERSION;
  const mismatch: Mismatch | null =
    !open || version === null || version === PROTOCOL_VERSION
      ? null
      : version < PROTOCOL_VERSION
        ? "backend-older"
        : "backend-newer";

  return useMemo(() => ({ connected, mismatch, send, subscribe }), [connected, mismatch, send, subscribe]);
}

/** Calls the handler with each message of the backend while the component is shown. */
export function useApiMessages(api: Api, handler: (message: ServerMessage) => void) {
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => api.subscribe((message) => latest.current(message)), [api.subscribe]);
}
