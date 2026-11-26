import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ClientMessage, ServerMessage } from "../../shared/protocol";
import ApiConnection, { ApiMessage, toSocketUrl } from "../api/connection";

/** The connection to the backend, as the views use it. */
export interface Api {
  /** Whether there is a connection right now. */
  connected: boolean;
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
  const [connected, setConnected] = useState(false);
  const connection = useRef<ApiConnection | null>(null);
  const listeners = useRef(new Set<(message: ServerMessage) => void>());

  useEffect(() => {
    if (!apiUrl) return;

    const opened = new ApiConnection(toSocketUrl(apiUrl), setConnected, (message) => {
      // The server is trusted to send only messages of the API
      listeners.current.forEach((listener) => listener(message as ServerMessage));
    });
    connection.current = opened;
    return () => {
      opened.close();
      connection.current = null;
      setConnected(false);
    };
  }, [apiUrl]);

  const send = useCallback((message: ClientMessage) => connection.current?.send(message as ApiMessage) ?? false, []);
  const subscribe = useCallback((listener: (message: ServerMessage) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  return useMemo(() => ({ connected, send, subscribe }), [connected, send, subscribe]);
}

/** Calls the handler with each message of the backend while the component is shown. */
export function useApiMessages(api: Api, handler: (message: ServerMessage) => void) {
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => api.subscribe((message) => latest.current(message)), [api.subscribe]);
}
