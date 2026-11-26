import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Backend, BrowserWebSocket, openController, openScreen, startBackend, TestClient } from "../../test/backend";
import App from "../App";
import { parseRoute } from "../routes";
import { loadHostKey, loadPlayerKey } from "../session";

// These tests run the real backend. The frontend is one end of a hotseat game, and bare clients
// of the WebSocket API are the others.
vi.setConfig({ testTimeout: 15000 });
const FIND = { timeout: 5000 };

describe("a hotseat game", () => {
  let backend: Backend;
  const clients: TestClient[] = [];

  /** The token of the QR code that is on the screen right now. */
  const shownToken = async () => {
    const code = await screen.findByRole("img", { name: "QR code for joining the game" }, FIND);
    const route = parseRoute(new URL(code.getAttribute("data-value")!).hash);
    if (route.view !== "join") throw new Error("The QR code is not for joining");
    return route.token;
  };

  /** A bare controller that joins the room that the frontend is the screen of. */
  const join = async (name: string) => {
    const controller = await openController(backend, await shownToken(), name);
    clients.push(controller);
    return controller;
  };

  beforeEach(async () => {
    vi.stubGlobal("WebSocket", BrowserWebSocket);
    vi.stubGlobal("__API_URL__", "");
    vi.stubGlobal("__COMMIT__", "");
    vi.stubGlobal("__PLAYER_TESTING_MODE__", false);
    window.location.hash = "";
    backend = await startBackend({ allowedOrigins: [window.location.origin, "http://localhost"] });
  });

  afterEach(async () => {
    cleanup();
    clients.splice(0).forEach((client) => client.close());
    await backend.stop();
    vi.unstubAllGlobals();
  });

  describe("on the screen", () => {
    const start = async (playerTesting = false) => {
      render(<App apiUrl={backend.url} playerTesting={playerTesting} />);
      const button = screen.getByRole("button", { name: "Start a hotseat game" });
      await vi.waitFor(() => expect(button).toBeEnabled(), FIND);
      fireEvent.click(button);
      await screen.findByRole("heading", { name: "Waiting for players" }, FIND);
    };

    it("creates a room and shows the QR code of joining it", async () => {
      await start();

      const route = parseRoute(window.location.hash);
      expect(route.view).toBe("screen");
      expect(loadHostKey((route as { room: string }).room)).toHaveLength(22);
      expect(await shownToken()).toHaveLength(10);
      expect(screen.getByText("0 of 8 players")).toBeInTheDocument();
      expect(screen.getByText("Nobody has joined yet.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Start the game" })).toBeDisabled();
    });

    it("shows those who join, and starts the game", async () => {
      await start();
      await join("Ann");
      expect(await screen.findByText("Ann", {}, FIND)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Start the game" })).toBeDisabled();

      const bob = await join("Bob");
      expect(await screen.findByText("2 of 8 players", {}, FIND)).toBeInTheDocument();

      // A controller whose connection is lost stays in the game
      bob.close();
      const row = (await screen.findByText("Disconnected", {}, FIND)).closest("li")!;
      expect(within(row).getByText("Bob")).toBeInTheDocument();
      expect(screen.getByText("2 of 8 players, 1 disconnected")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Start the game" }));
      expect(await screen.findByRole("img", { name: "The playing field" }, FIND)).toBeInTheDocument();
    });

    it("shows the playing field and the aims of the tanks, also after the page is opened again", async () => {
      await start();
      await join("Ann");
      const bob = await join("Bob");
      await screen.findByText("2 of 8 players", {}, FIND);
      fireEvent.click(screen.getByRole("button", { name: "Start the game" }));

      expect(await screen.findByRole("img", { name: "The playing field" }, FIND)).toBeInTheDocument();
      expect(screen.getByLabelText("Aim of Ann")).toHaveTextContent(/^60° [→←] · 500$/);
      // The field has the whole screen: no QR code, no title
      expect(screen.queryByRole("img", { name: "QR code for joining the game" })).not.toBeInTheDocument();

      bob.send({ type: "aim", angle: 10, power: 900 });
      await vi.waitFor(() => expect(screen.getByLabelText("Aim of Bob")).toHaveTextContent("10° → · 900"), FIND);
      bob.send({ type: "aim", angle: 135 });
      await vi.waitFor(() => expect(screen.getByLabelText("Aim of Bob")).toHaveTextContent("45° ← · 900"), FIND);

      bob.send({ type: "say", text: "Eat this!" });
      expect(await screen.findByLabelText("Speech bubble of Bob", {}, FIND)).toHaveTextContent("Eat this!");

      cleanup();
      render(<App apiUrl={backend.url} />);
      expect(await screen.findByRole("img", { name: "The playing field" }, FIND)).toBeInTheDocument();
      expect(screen.getByLabelText("Aim of Bob")).toHaveTextContent("45° ← · 900");
    });

    it("removes a player", async () => {
      await start();
      const ann = await join("Ann");
      fireEvent.click(await screen.findByRole("button", { name: "Remove Ann" }, FIND));

      expect(await screen.findByText("Nobody has joined yet.", {}, FIND)).toBeInTheDocument();
      expect(await ann.next("error")).toEqual({ type: "error", code: "no-session" });
    });

    it("changes the maximum number of players, and the game starts when the room is full", async () => {
      await start();
      await join("Ann");
      await join("Bob");
      await screen.findByText("2 of 8 players", {}, FIND);

      fireEvent.click(screen.getByRole("button", { name: "More players" }));
      expect(await screen.findByText("2 of 9 players", {}, FIND)).toBeInTheDocument();

      for (let maximum = 9; maximum > 3; maximum--) {
        fireEvent.click(screen.getByRole("button", { name: "Fewer players" }));
        await screen.findByText(`2 of ${maximum - 1} players`, {}, FIND);
      }
      await join("Cat");
      expect(await screen.findByRole("img", { name: "The playing field" }, FIND)).toBeInTheDocument();
    });

    it("returns to its room when the page is opened again", async () => {
      await start();
      await join("Ann");
      await screen.findByText("Ann", {}, FIND);

      cleanup();
      render(<App apiUrl={backend.url} />);
      expect(await screen.findByText("Ann", {}, FIND)).toBeInTheDocument();
      expect(await shownToken()).toHaveLength(10);
    });

    it("has no button for test phones without the player testing mode", async () => {
      await start();
      await shownToken();
      expect(screen.queryByRole("button", { name: "Open a test phone" })).not.toBeInTheDocument();
    });

    it("opens a test phone, in the player testing mode", async () => {
      const open = vi.spyOn(window, "open").mockReturnValue(null);
      await start(true);
      const token = await shownToken();
      fireEvent.click(screen.getByRole("button", { name: "Open a test phone" }));
      fireEvent.click(screen.getByRole("button", { name: "Open a test phone" }));

      expect(open).toHaveBeenCalledTimes(2);
      const [url, name, features] = open.mock.calls[1];
      expect(String(url)).toBe(`${window.location.origin}/?device=2#/join/${token}`);
      expect(name).toBe("scorch-phone-2");
      expect(features).toContain("popup=yes,width=390");
      open.mockRestore();
    });

    it("offers a way back to the game on the front page", async () => {
      await start();
      const { room } = parseRoute(window.location.hash) as { room: string };
      cleanup();

      window.location.hash = "";
      render(<App apiUrl={backend.url} />);
      expect(screen.getByRole("link", { name: "Return to the game on this screen" })).toHaveAttribute(
        "href",
        `#/screen/${room}`
      );
    });

    it("tells when the device is not the screen of the room", async () => {
      const { room } = await openScreen(backend).then((opened) => (clients.push(opened.screen), opened));
      window.location.hash = `#/screen/${room}`;
      render(<App apiUrl={backend.url} />);

      expect(await screen.findByText("This device is not the screen of this game.", {}, FIND)).toBeInTheDocument();
    });
  });

  describe("on a phone", () => {
    let host: TestClient;
    let room: string;
    let token: string;

    beforeEach(async () => {
      ({ screen: host, room } = await openScreen(backend));
      clients.push(host);
      ({ token } = await host.next("token"));
      window.location.hash = `#/join/${token}`;
    });

    const joinAs = async (name: string) => {
      render(<App apiUrl={backend.url} />);
      fireEvent.change(screen.getByLabelText("Your name"), { target: { value: name } });
      const button = screen.getByRole("button", { name: "Join" });
      await vi.waitFor(() => expect(button).toBeEnabled(), FIND);
      fireEvent.click(button);
      await screen.findByRole("heading", { name }, FIND);
    };

    it("joins the game with a name and becomes a controller", async () => {
      await joinAs("Ann");

      expect(parseRoute(window.location.hash)).toEqual({ view: "controller", room });
      expect(loadPlayerKey(room)).toHaveLength(22);
      expect(screen.getByText("Waiting for the game to start…")).toBeInTheDocument();
      expect(screen.getByText("Ann (you)")).toBeInTheDocument();
    });

    it("remembers the name for the next game", async () => {
      await joinAs("Ann");
      fireEvent.click(screen.getByRole("button", { name: "Leave the game" }));
      await vi.waitFor(() => expect(parseRoute(window.location.hash)).toEqual({ view: "home" }), FIND);
      cleanup();

      window.location.hash = `#/join/${token}`;
      render(<App apiUrl={backend.url} />);
      expect(screen.getByLabelText("Your name")).toHaveValue("Ann");
    });

    it("returns to the player it already is when the QR code is scanned again, without asking for a name", async () => {
      await joinAs("Ann");
      cleanup();

      window.location.hash = `#/join/${token}`;
      render(<App apiUrl={backend.url} />);
      expect(await screen.findByRole("heading", { name: "Ann" }, FIND)).toBeInTheDocument();
      expect(screen.queryByLabelText("Your name")).not.toBeInTheDocument();
      expect(parseRoute(window.location.hash)).toEqual({ view: "controller", room });
      // Still one player, the same one
      expect(host.messages.filter((message) => message.type === "room").pop()).toMatchObject({
        state: { players: [{ id: 0, name: "Ann", connected: true }] }
      });
    });

    it("asks for a name on a device that is a player of another game", async () => {
      await joinAs("Ann");
      cleanup();

      const other = await openScreen(backend);
      clients.push(other.screen);
      window.location.hash = `#/join/${(await other.screen.next("token")).token}`;
      render(<App apiUrl={backend.url} />);
      expect(await screen.findByLabelText("Your name", {}, FIND)).toHaveValue("Ann");
    });

    it("offers a way back to the game on the front page", async () => {
      await joinAs("Ann");
      cleanup();

      window.location.hash = "";
      render(<App apiUrl={backend.url} />);
      fireEvent.click(screen.getByRole("link", { name: "Return to your game" }));
      await vi.waitFor(() => expect(parseRoute(window.location.hash)).toEqual({ view: "controller", room }), FIND);
    });

    it("cannot join a game that has started", async () => {
      clients.push(await openController(backend, token, "Bob"), await openController(backend, token, "Cat"));
      host.send({ type: "start" });
      await host.next("field");

      render(<App apiUrl={backend.url} />);
      fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Ann" } });
      const button = screen.getByRole("button", { name: "Join" });
      await vi.waitFor(() => expect(button).toBeEnabled(), FIND);
      fireEvent.click(button);
      expect(await screen.findByRole("alert", {}, FIND)).toHaveTextContent("The game has already started.");
    });

    it("shows the others and when the game starts", async () => {
      await joinAs("Ann");
      clients.push(await openController(backend, token, "Bob"));
      expect(await screen.findByText("Bob", {}, FIND)).toBeInTheDocument();

      host.send({ type: "start" });
      expect(await screen.findByLabelText("Angle", {}, FIND)).toHaveTextContent(/^60° [→←]$/);
      expect(screen.getByLabelText("Power value")).toHaveTextContent("500");
    });

    it("turns the turret and sets the power, also after the page is opened again", async () => {
      await joinAs("Ann");
      clients.push(await openController(backend, token, "Bob"));
      host.send({ type: "start" });
      const { field } = await host.next("field");
      const { angle } = field.tanks[0];
      await screen.findByLabelText("Angle", {}, FIND);

      fireEvent.click(screen.getByRole("button", { name: "Turn the turret left" }));
      expect(await host.next("aim")).toEqual({ type: "aim", id: 0, angle: angle + 1, power: 500 });

      // What is changed quickly is sent together, a moment later
      fireEvent.click(screen.getByRole("button", { name: "Turn the turret right" }));
      fireEvent.click(screen.getByRole("button", { name: "Turn the turret right" }));
      fireEvent.change(screen.getByLabelText("Power"), { target: { value: "800" } });
      fireEvent.click(screen.getByRole("button", { name: "More power" }));
      expect(screen.getByLabelText("Power value")).toHaveTextContent("805");
      expect(await host.next("aim")).toEqual({ type: "aim", id: 0, angle: angle - 1, power: 805 });

      cleanup();
      render(<App apiUrl={backend.url} />);
      expect(await screen.findByLabelText("Power value", {}, FIND)).toHaveTextContent("805");
      const shown = angle - 1 <= 90 ? `${angle - 1}° →` : `${180 - (angle - 1)}° ←`;
      expect(screen.getByLabelText("Angle")).toHaveTextContent(shown);
    });

    it("says something in a speech bubble", async () => {
      await joinAs("Ann");
      clients.push(await openController(backend, token, "Bob"));
      host.send({ type: "start" });
      const field = await screen.findByLabelText("Say something", {}, FIND);

      expect(screen.getByRole("button", { name: "Say" })).toBeDisabled();
      fireEvent.change(field, { target: { value: "  Eat this!  " } });
      fireEvent.click(screen.getByRole("button", { name: "Say" }));

      expect(await host.next("say")).toEqual({ type: "say", id: 0, text: "Eat this!" });
      expect(await screen.findByText("You said: Eat this!", {}, FIND)).toBeInTheDocument();
      expect(field).toHaveValue("");

      // The next one has to wait a moment
      fireEvent.change(field, { target: { value: "And this!" } });
      expect(screen.getByRole("button", { name: "Say" })).toBeDisabled();
    });

    it("returns to the player when the page is opened again", async () => {
      await joinAs("Ann");
      cleanup();

      render(<App apiUrl={backend.url} />);
      expect(await screen.findByRole("heading", { name: "Ann" }, FIND)).toBeInTheDocument();
    });

    it("tells when the code is not valid", async () => {
      window.location.hash = "#/join/nosuchtoken";
      render(<App apiUrl={backend.url} />);
      fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Ann" } });
      const button = screen.getByRole("button", { name: "Join" });
      await vi.waitFor(() => expect(button).toBeEnabled(), FIND);
      fireEvent.click(button);

      expect(await screen.findByRole("alert", {}, FIND)).toHaveTextContent("This code is not valid any more.");
    });

    it("tells when the player is removed, and forgets the key", async () => {
      await joinAs("Ann");
      host.send({ type: "kick", id: 0 });

      expect(await screen.findByText("You are not in this game.", {}, FIND)).toBeInTheDocument();
      expect(loadPlayerKey(room)).toBeNull();
    });

    it("tells when the screen is away", async () => {
      await joinAs("Ann");
      host.close();
      expect(await screen.findByRole("alert", {}, FIND)).toHaveTextContent("The screen of the game is away.");
    });

    it("leaves the game", async () => {
      await joinAs("Ann");
      fireEvent.click(screen.getByRole("button", { name: "Leave the game" }));

      await vi.waitFor(() => expect(parseRoute(window.location.hash)).toEqual({ view: "home" }), FIND);
      expect(loadPlayerKey(room)).toBeNull();
      await vi.waitFor(async () => expect((await host.next("room")).state.players).toEqual([]), FIND);
    });

    it("tells when there is no key for the room", async () => {
      window.location.hash = `#/controller/${room}`;
      render(<App apiUrl={backend.url} />);
      expect(await screen.findByText("You are not in this game.", {}, FIND)).toBeInTheDocument();
    });
  });
});
