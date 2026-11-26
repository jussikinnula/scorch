import { useEffect, useRef, useState } from "react";

import ApiConnection, { ApiMessage, toSocketUrl } from "../api/connection";

/**
 * Keeps a connection to the backend open while the component is shown.
 *
 * @param apiUrl The address of the backend. There is no connection if it is empty.
 * @param onMessage Called with each message of the backend.
 * @returns Whether there is a connection, and a function that sends a message.
 */
export function useApiConnection(apiUrl: string, onMessage?: (message: ApiMessage) => void) {
  const [connected, setConnected] = useState(false);
  const connection = useRef<ApiConnection | null>(null);
  const handler = useRef(onMessage);
  handler.current = onMessage;

  useEffect(() => {
    if (!apiUrl) return;

    const opened = new ApiConnection(toSocketUrl(apiUrl), setConnected, (message) => handler.current?.(message));
    connection.current = opened;
    return () => {
      opened.close();
      connection.current = null;
      setConnected(false);
    };
  }, [apiUrl]);

  return { connected, send: (message: ApiMessage) => connection.current?.send(message) ?? false };
}
