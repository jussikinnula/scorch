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
    // The terrain is the same every time, so that a shot lands where it did the last time
    backend = await startBackend({
      allowedOrigins: [window.location.origin, "http://localhost"],
      rooms: { seed: 1, maxWind: 0, kit: true, shopTime: 0 }
    });
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

    /** Chooses the live mode in the lobby, for a test that fires without waiting for a turn. */
    const chooseLive = async () => {
      fireEvent.click(screen.getByRole("button", { name: "Live" }));
      await vi.waitFor(
        () => expect(screen.getByRole("button", { name: "Live" })).toHaveAttribute("aria-pressed", "true"),
        FIND
      );
    };

    it("counts quick clicks on a setting one by one", async () => {
      await start();
      await shownToken();
      for (let clicks = 0; clicks < 5; clicks++) fireEvent.click(screen.getByRole("button", { name: "Fewer rounds" }));
      await vi.waitFor(() => expect(screen.getByLabelText("Rounds")).toHaveTextContent("5"), FIND);
    });

    it("sets the strongest wind, and shows the wind of a round on the screen and on a phone", async () => {
      await start();
      const token = await shownToken();
      expect(screen.getByLabelText("Wind at most")).toHaveTextContent("None");
      for (let clicks = 0; clicks < 10; clicks++) fireEvent.click(screen.getByRole("button", { name: "More wind" }));
      await vi.waitFor(() => expect(screen.getByLabelText("Wind at most")).toHaveTextContent("500"), FIND);
      expect(screen.getByRole("button", { name: "More wind" })).toBeDisabled();

      const ann = await openController(backend, token, "Ann");
      clients.push(ann, await openController(backend, token, "Bob"));
      fireEvent.click(await screen.findByRole("button", { name: "Start the game" }, FIND));
      await vi.waitFor(() => expect(screen.getByLabelText("Wind")).toHaveTextContent(/Wind \d+/), FIND);
      const shown = screen.getByLabelText("Wind").textContent!;
      let room = (await ann.next("room")).state;
      while (room.phase !== "playing") room = (await ann.next("room")).state;
      const { wind } = room;
      expect(shown).toBe(wind < 0 ? `◀ Wind ${-wind}` : `Wind ${wind} ▶`);
    });

    it("shows whose turn it is in the classic mode, and passes the turn after a shot", async () => {
      await start();
      const controllers = [await join("Ann"), await join("Bob")];
      await screen.findByText("2 of 8 players", {}, FIND);
      expect(screen.getByRole("button", { name: "Classic" })).toHaveAttribute("aria-pressed", "true");
      fireEvent.click(screen.getByRole("button", { name: "Start the game" }));

      const turn = await screen.findByRole("status", { name: "Turn" }, FIND);
      const first = turn.textContent!.startsWith("Ann") ? 0 : 1;
      await vi.waitFor(() => expect(turn).toHaveTextContent(/^(Ann|Bob)4[45]$/), FIND);

      // The other one cannot fire
      controllers[1 - first].send({ type: "fire" });
      expect(await controllers[1 - first].next("error")).toEqual({ type: "error", code: "not-your-turn", re: "fire" });

      controllers[first].send({ type: "aim", power: 60 });
      controllers[first].send({ type: "fire" });
      await vi.waitFor(
        () => expect(screen.getByRole("status", { name: "Turn" })).toHaveTextContent(first === 0 ? /^Bob/ : /^Ann/),
        FIND
      );
    });

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
      await chooseLive();
      fireEvent.click(screen.getByRole("button", { name: "Start the game" }));

      expect(await screen.findByRole("img", { name: "The playing field" }, FIND)).toBeInTheDocument();
      expect(screen.getByLabelText("Aim of Ann")).toHaveTextContent(/^60° [→←] · 500$/);
      // The field has the whole screen: no QR code, no title
      expect(screen.queryByRole("img", { name: "QR code for joining the game" })).not.toBeInTheDocument();

      bob.send({ type: "aim", angle: 10, power: 900 });
      await vi.waitFor(() => expect(screen.getByLabelText("Aim of Bob")).toHaveTextContent("10° → · 900"), FIND);
      bob.send({ type: "aim", angle: 135 });
      await vi.waitFor(() => expect(screen.getByLabelText("Aim of Bob")).toHaveTextContent("45° ← · 900"), FIND);

      // A shot straight up at low power comes down on the tank
      expect(screen.getByText("Projectiles in the air: 0")).toBeInTheDocument();
      bob.send({ type: "aim", angle: 90, power: 100 });
      bob.send({ type: "fire" });
      expect(await screen.findByText("Projectiles in the air: 1", {}, FIND)).toBeInTheDocument();
      expect(await screen.findByText("Projectiles in the air: 0", {}, FIND)).toBeInTheDocument();
      // The shot hit its own tank, which has less energy now and cannot fire as hard as before
      const energy = Number(screen.getByLabelText("Energy of Bob").textContent);
      expect(energy).toBeLessThan(100);
      bob.send({ type: "aim", angle: 135, power: 1000 });
      const aim = `45° ← · ${energy * 10}`;
      await vi.waitFor(() => expect(screen.getByLabelText("Aim of Bob")).toHaveTextContent(aim), FIND);

      bob.send({ type: "say", text: "Eat this!" });
      expect(await screen.findByLabelText("Speech bubble of Bob", {}, FIND)).toHaveTextContent("Eat this!");

      cleanup();
      render(<App apiUrl={backend.url} />);
      expect(await screen.findByRole("img", { name: "The playing field" }, FIND)).toBeInTheDocument();
      expect(screen.getByLabelText("Aim of Bob")).toHaveTextContent(aim);
      expect(screen.getByLabelText("Energy of Bob")).toHaveTextContent(String(energy));
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

      fireEvent.click(screen.getByRole("button", { name: "Fewer rounds" }));
      await vi.waitFor(() => expect(screen.getByLabelText("Rounds")).toHaveTextContent("9"), FIND);

      for (let maximum = 9; maximum > 3; maximum--) {
        fireEvent.click(screen.getByRole("button", { name: "Fewer players" }));
        await screen.findByText(`2 of ${maximum - 1} players`, {}, FIND);
      }
      await join("Cat");
      expect(await screen.findByRole("img", { name: "The playing field" }, FIND)).toBeInTheDocument();
    });

    it("shows who won a round and the game, and goes back to the lobby for a new game", async () => {
      await start();
      await join("Ann");
      const bob = await join("Bob");
      await screen.findByText("2 of 8 players", {}, FIND);
      for (let rounds = 10; rounds > 1; rounds--) {
        fireEvent.click(screen.getByRole("button", { name: "Fewer rounds" }));
        await vi.waitFor(() => expect(screen.getByLabelText("Rounds")).toHaveTextContent(String(rounds - 1)), FIND);
      }
      await chooseLive();
      fireEvent.click(screen.getByRole("button", { name: "Start the game" }));
      await screen.findByRole("img", { name: "The playing field" }, FIND);

      // Bob fires straight up, and the shot comes down on his own tank
      bob.send({ type: "weapon", weapon: "baby-nuke" });
      bob.send({ type: "aim", angle: 90, power: 100 });
      bob.send({ type: "fire" });
      const result = await screen.findByRole("alert", {}, FIND);
      expect(result).toHaveTextContent("Round 1 of 1");
      expect(result).toHaveTextContent("Ann wins");
      expect(screen.getByLabelText("Rounds won by Ann")).toHaveTextContent("1");
      expect(screen.getByLabelText("Energy of Bob")).toHaveTextContent("0");

      // It was the only round: after a while the final results are shown
      expect(await screen.findByRole("heading", { name: "Ann wins the game" }, { timeout: 8000 })).toBeInTheDocument();
      expect(screen.getByText("1 round played")).toBeInTheDocument();
      expect(screen.getByLabelText("Rounds won by Bob")).toHaveTextContent("0");

      fireEvent.click(screen.getByRole("button", { name: "New game" }));
      expect(await screen.findByRole("heading", { name: "Waiting for players" }, FIND)).toBeInTheDocument();
      expect(await shownToken()).toHaveLength(10);
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
      // Most of these tests fire without waiting for a turn
      host.send({
        type: "settings",
        settings: {
          maxPlayers: 8,
          rounds: 10,
          turns: "live",
          maxWind: 0,
          cash: 0,
          interest: 5,
          armsLevel: 4,
          traces: false,
          changingWind: false,
          walls: "none"
        }
      });
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

    it("chooses a weapon, fires it, and shows how many are left", async () => {
      await joinAs("Ann");
      clients.push(await openController(backend, token, "Bob"));
      host.send({ type: "start" });
      const weapon = (await screen.findByLabelText("Weapon", {}, FIND)) as HTMLSelectElement;
      expect(weapon.value).toBe("baby-missile");
      expect(screen.getByRole("option", { name: "Missile × 5" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Heavy Roller × 2" })).toBeInTheDocument();

      fireEvent.change(weapon, { target: { value: "tracer" } });
      const fire = screen.getByRole("button", { name: "Fire" });
      await vi.waitFor(() => expect(fire).toBeEnabled(), FIND);
      fireEvent.click(fire);
      expect(await screen.findByRole("option", { name: "Tracer × 19" }, FIND)).toBeInTheDocument();
      expect((await host.next("shots")).shots[0].weapon).toBe("tracer");
      expect(weapon.value).toBe("tracer");

      // After a reload of the page the phone still knows what the tank has
      cleanup();
      render(<App apiUrl={backend.url} />);
      expect(await screen.findByRole("option", { name: "Tracer × 19" }, FIND)).toBeInTheDocument();
      expect((screen.getByLabelText("Weapon") as HTMLSelectElement).value).toBe("tracer");
    });

    it("fires, and reloads after it", async () => {
      await joinAs("Ann");
      clients.push(await openController(backend, token, "Bob"));
      host.send({ type: "start" });
      const fire = await screen.findByRole("button", { name: "Fire" }, FIND);
      await vi.waitFor(() => expect(fire).toBeEnabled(), FIND);

      // The aim that is set just before goes with the shot
      fireEvent.change(screen.getByLabelText("Power"), { target: { value: "50" } });
      fireEvent.click(screen.getByRole("button", { name: "More power" }));
      fireEvent.click(fire);

      expect(await screen.findByRole("button", { name: "Reloading…" }, FIND)).toBeDisabled();
      const { shots } = await host.next("shots");
      expect(shots).toEqual([
        { id: 1, owner: 0, weapon: "baby-missile", x: expect.any(Number), y: expect.any(Number) }
      ]);
      // At so little power the shot comes down close by
      const { x } = (await host.next("field")).field.tanks[0];
      expect(Math.abs((await host.next("explode")).x - x)).toBeLessThan(40);
    });

    it("shows the energy of the tank, and loses some of it when its own shot comes down on it", async () => {
      await joinAs("Ann");
      clients.push(await openController(backend, token, "Bob"));
      host.send({ type: "start" });
      expect(await screen.findByLabelText("Energy", {}, FIND)).toHaveTextContent("100");
      expect(screen.getByLabelText("Power")).toHaveAttribute("max", "1000");

      // Straight up at low power: the shot comes down on the tank
      const { angle } = (await host.next("field")).field.tanks[0];
      const turn = screen.getByRole("button", { name: angle < 90 ? "Turn the turret left" : "Turn the turret right" });
      for (let degrees = 30; degrees > 0; degrees--) fireEvent.click(turn);
      fireEvent.change(screen.getByLabelText("Power"), { target: { value: "100" } });
      fireEvent.click(screen.getByRole("button", { name: "Fire" }));

      await vi.waitFor(() => expect(Number(screen.getByLabelText("Energy").textContent)).toBeLessThan(100), FIND);
      const energy = Number(screen.getByLabelText("Energy").textContent);
      // The tank cannot fire harder than its energy allows any more
      expect(screen.getByLabelText("Power")).toHaveAttribute("max", String(energy * 10));
    });

    it("tells who won a round and the game", async () => {
      await joinAs("Ann");
      const bob = await openController(backend, token, "Bob");
      clients.push(bob);
      host.send({
        type: "settings",
        settings: {
          maxPlayers: 8,
          rounds: 1,
          turns: "live",
          maxWind: 0,
          cash: 0,
          interest: 5,
          armsLevel: 4,
          traces: false,
          changingWind: false,
          walls: "none"
        }
      });
      host.send({ type: "start" });
      await screen.findByLabelText("Energy", {}, FIND);

      bob.send({ type: "weapon", weapon: "baby-nuke" });
      bob.send({ type: "aim", angle: 90, power: 100 });
      bob.send({ type: "fire" });
      expect(await screen.findByRole("alert", {}, FIND)).toHaveTextContent(
        "You won the round! That was the last round."
      );
      // The round is over: the controls of the tank are gone at once, and the standings are shown
      expect(screen.queryByRole("button", { name: "Fire" })).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Power")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Rounds won by Ann")).toHaveTextContent("1");
      expect(await screen.findByText("You won the game!", {}, { timeout: 8000 })).toBeInTheDocument();
      expect(screen.getByLabelText("Rounds won by Ann")).toHaveTextContent("1");
      expect(screen.queryByRole("button", { name: "Fire" })).not.toBeInTheDocument();
    });

    it("tells when it is the turn of the player in the classic mode, and lets the player fire only then", async () => {
      host.send({
        type: "settings",
        settings: {
          maxPlayers: 8,
          rounds: 10,
          turns: "classic",
          maxWind: 0,
          cash: 0,
          interest: 5,
          armsLevel: 4,
          traces: false,
          changingWind: false,
          walls: "none"
        }
      });
      await joinAs("Ann");
      const bob = await openController(backend, token, "Bob");
      clients.push(bob);
      host.send({ type: "start" });
      const turn = await screen.findByRole("status", { name: "Turn" }, FIND);

      if (!turn.textContent!.startsWith("Your turn")) {
        // Bob has the first turn: Ann waits until his shot is over
        expect(turn).toHaveTextContent("Bob is aiming");
        expect(screen.getByRole("button", { name: "Wait" })).toBeDisabled();
        bob.send({ type: "aim", power: 60 });
        bob.send({ type: "fire" });
      }
      await vi.waitFor(
        () => expect(screen.getByRole("status", { name: "Turn" })).toHaveTextContent(/^Your turn · 4[45]$/),
        FIND
      );

      fireEvent.change(screen.getByLabelText("Power"), { target: { value: "60" } });
      fireEvent.click(screen.getByRole("button", { name: "Fire" }));
      await vi.waitFor(
        () => expect(screen.getByRole("status", { name: "Turn" })).toHaveTextContent("Bob is aiming"),
        FIND
      );
      expect(screen.getByRole("button", { name: "Wait" })).toBeDisabled();
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

  describe("with the shop", () => {
    beforeEach(async () => {
      // A backend with the real shop: the others have none, to get from a round to the next at once
      await backend.stop();
      backend = await startBackend({
        allowedOrigins: [window.location.origin, "http://localhost"],
        rooms: { seed: 1, maxWind: 0 }
      });
    });

    it("lets a phone buy weapons before the round, and starts the round when everyone is ready", async () => {
      const { screen: host } = await openScreen(backend);
      clients.push(host);
      const { token } = await host.next("token");
      host.send({
        type: "settings",
        settings: {
          maxPlayers: 8,
          rounds: 10,
          turns: "live",
          maxWind: 0,
          cash: 10000,
          interest: 5,
          armsLevel: 4,
          traces: false,
          changingWind: false,
          walls: "none"
        }
      });
      window.location.hash = `#/join/${token}`;
      render(<App apiUrl={backend.url} />);
      fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Ann" } });
      const button = screen.getByRole("button", { name: "Join" });
      await vi.waitFor(() => expect(button).toBeEnabled(), FIND);
      fireEvent.click(button);
      await screen.findByRole("heading", { name: "Ann" }, FIND);
      const bob = await openController(backend, token, "Bob");
      clients.push(bob);
      host.send({ type: "start" });

      expect(await screen.findByText("The shop is open before round 1.", {}, FIND)).toBeInTheDocument();
      expect(screen.getByLabelText("Money")).toHaveTextContent("$10,000");
      // A Nuke costs more than there is
      expect(screen.getByRole("button", { name: "Buy Nuke" })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Buy Missile" }));
      await vi.waitFor(() => expect(screen.getByLabelText("Money")).toHaveTextContent("$8,125"), FIND);
      expect(await screen.findByText(/5 for \$1,875 · you have 5/, {}, FIND)).toBeInTheDocument();

      // After a reload of the page the phone is still in the shop, with what it bought
      cleanup();
      render(<App apiUrl={backend.url} />);
      expect(await screen.findByText(/5 for \$1,875 · you have 5/, {}, FIND)).toBeInTheDocument();
      expect(screen.getByLabelText("Money")).toHaveTextContent("$8,125");

      fireEvent.click(screen.getByRole("button", { name: "Ready" }));
      expect(await screen.findByRole("button", { name: "Waiting for the others…" }, FIND)).toBeDisabled();
      bob.send({ type: "ready" });
      expect(await screen.findByRole("option", { name: "Missile × 5" }, FIND)).toBeInTheDocument();
    });

    it("shows the shop on the screen, with the money of the players", async () => {
      render(<App apiUrl={backend.url} />);
      const button = screen.getByRole("button", { name: "Start a hotseat game" });
      await vi.waitFor(() => expect(button).toBeEnabled(), FIND);
      fireEvent.click(button);
      await screen.findByRole("heading", { name: "Waiting for players" }, FIND);
      expect(screen.getByLabelText("Cash at start")).toHaveTextContent("$0");
      fireEvent.click(screen.getByRole("button", { name: "More cash" }));
      fireEvent.click(screen.getByRole("button", { name: "More cash" }));
      await vi.waitFor(() => expect(screen.getByLabelText("Cash at start")).toHaveTextContent("$10,000"), FIND);

      const ann = await join("Ann");
      const bob = await join("Bob");
      fireEvent.click(await screen.findByRole("button", { name: "Start the game" }, FIND));
      expect(await screen.findByRole("heading", { name: "The shop is open" }, FIND)).toBeInTheDocument();
      ann.send({ type: "buy", weapon: "baby-nuke" });
      await vi.waitFor(() => expect(screen.getByLabelText("Money of Ann")).toHaveTextContent("$0"), FIND);
      expect(screen.getByLabelText("Money of Bob")).toHaveTextContent("$10,000");

      ann.send({ type: "ready" });
      expect(await screen.findByText(/1 of 2 ready/, {}, FIND)).toBeInTheDocument();

      // Nobody new joins once the game has started: there is no QR code
      expect(screen.queryByRole("img", { name: "QR code for joining the game" })).toBeNull();
      bob.send({ type: "ready" });
      expect(await screen.findByRole("img", { name: "The playing field" }, FIND)).toBeInTheDocument();
    });
  });
});
