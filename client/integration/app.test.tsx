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

  describe("with a backend of another version of the protocol", () => {
    /** A backend that greets with the given version, and counts what is sent to it. */
    const backendOf = (protocol: number) => {
      const sent: string[] = [];
      class OtherVersion {
        static OPEN = 1;
        readyState = 1;
        onopen: (() => void) | null = null;
        onmessage: ((event: { data: string }) => void) | null = null;
        onclose: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor() {
          setTimeout(() => {
            this.onopen?.();
            this.onmessage?.({ data: JSON.stringify({ type: "hello", protocol }) });
          });
        }
        send(data: string) {
          sent.push(data);
        }
        close() {}
      }
      vi.stubGlobal("WebSocket", OtherVersion);
      return sent;
    };

    it("tells that the page must be loaded again when the backend is newer, and sends nothing", async () => {
      const sent = backendOf(PROTOCOL_VERSION + 1);
      window.location.hash = "#/screen/abc";
      render(<App apiUrl="http://localhost:1" />);

      expect(await screen.findByRole("alert")).toHaveTextContent("The game has been updated. Reload the page");
      expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
      // Not connected as far as the views can tell: nothing was asked of the backend
      expect(screen.getByRole("status", { name: "No connection to the server" })).toBeInTheDocument();
      expect(sent).toEqual([]);
    });

    it("tells to wait when the backend is older, and sends nothing", async () => {
      const sent = backendOf(PROTOCOL_VERSION - 1);
      render(<App apiUrl="http://localhost:1" />);

      expect(await screen.findByRole("alert")).toHaveTextContent("The server is being updated.");
      expect(screen.queryByRole("button", { name: "Reload" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Start a hotseat game" })).toBeDisabled();
      expect(sent).toEqual([]);
    });
  });

  it("does not tell about versions when the backend speaks the same one", async () => {
    backend = await startBackend({ allowedOrigins: [window.location.origin] });
    render(<App apiUrl={backend.url} />);
    await screen.findByRole("status", { name: "Connected to the server" }, { timeout: 5000 });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
