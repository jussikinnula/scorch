import React from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Backend, BrowserWebSocket, startBackend } from "../../test/backend";
import { PROTOCOL_VERSION } from "../../shared/protocol";
import App from "../App";

// These tests run the real backend, and the frontend connects to it over a real WebSocket.
vi.setConfig({ testTimeout: 15000 });

describe("the app with the backend", () => {
  let backend: Backend | null = null;

  beforeEach(() => {
    vi.stubGlobal("WebSocket", BrowserWebSocket);
    vi.stubGlobal("__API_URL__", "");
    vi.stubGlobal("__COMMIT__", "");
    vi.stubGlobal("__PLAYER_TESTING_MODE__", false);
    window.location.hash = "";
  });

  afterEach(async () => {
    await backend?.stop();
    backend = null;
    vi.unstubAllGlobals();
  });

  it("shows whether there is a connection to the backend", async () => {
    backend = await startBackend({ allowedOrigins: [window.location.origin] });
    const { unmount } = render(<App apiUrl={backend.url} />);

    expect(
      await screen.findByRole("status", { name: "Connected to the server" }, { timeout: 5000 })
    ).toBeInTheDocument();
    expect(backend.connections()).toBe(1);

    await backend.stop();
    backend = null;
    expect(
      await screen.findByRole("status", { name: "No connection to the server" }, { timeout: 5000 })
    ).toBeInTheDocument();
    unmount();
  });

  it("shows the view of the address", async () => {
    render(<App apiUrl="" />);
    expect(screen.getByRole("heading", { name: "Hotseat" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start a hotseat game" })).toBeDisabled();

    await act(async () => {
      window.location.hash = "#/play/abc";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(screen.getByRole("heading", { name: "Online game" })).toBeInTheDocument();
    expect(screen.getByText("abc")).toBeInTheDocument();
  });

  it("tells when the backend speaks another version of the protocol", async () => {
    /** A backend that greets with a version the frontend does not know. */
    class OtherVersion extends EventTarget {
      static OPEN = 1;
      readyState = 1;
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        super();
        setTimeout(() => {
          this.onopen?.();
          this.onmessage?.({ data: JSON.stringify({ type: "hello", protocol: PROTOCOL_VERSION + 1 }) });
        });
      }
      send() {}
      close() {}
    }
    vi.stubGlobal("WebSocket", OtherVersion);

    render(<App apiUrl="http://localhost:1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("The game is being updated.");
  });

  it("does not tell about versions when the backend speaks the same one", async () => {
    backend = await startBackend({ allowedOrigins: [window.location.origin] });
    render(<App apiUrl={backend.url} />);
    await screen.findByRole("status", { name: "Connected to the server" }, { timeout: 5000 });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
