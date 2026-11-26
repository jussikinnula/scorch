import React from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Backend, BrowserWebSocket, startBackend } from "../../test/backend";
import App from "../App";

// These tests run the real backend, and the frontend connects to it over a real WebSocket.
vi.setConfig({ testTimeout: 15000 });

describe("the app with the backend", () => {
  let backend: Backend | null = null;

  beforeEach(() => {
    vi.stubGlobal("WebSocket", BrowserWebSocket);
    vi.stubGlobal("__API_URL__", "");
    vi.stubGlobal("__COMMIT__", "");
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
    expect(screen.getByRole("heading", { name: "Skeleton" })).toBeInTheDocument();

    await act(async () => {
      window.location.hash = "#/screen/abc";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(screen.getByRole("heading", { name: "Game screen" })).toBeInTheDocument();
    expect(screen.getByText("abc")).toBeInTheDocument();
  });
});
