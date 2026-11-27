import { describe, expect, it } from "vitest";

import { parseRoute, Route, toHash, toUrl } from "./routes";

describe("the routes", () => {
  it("are parsed from the hash", () => {
    expect(parseRoute("")).toEqual({ view: "home" });
    expect(parseRoute("#/")).toEqual({ view: "home" });
    expect(parseRoute("#/online")).toEqual({ view: "online" });
    expect(parseRoute("#/online/")).toEqual({ view: "online" });
    expect(parseRoute("#/online/new")).toEqual({ view: "new" });
    expect(parseRoute("#/screen/abc")).toEqual({ view: "screen", room: "abc" });
    expect(parseRoute("#/play/abc")).toEqual({ view: "play", room: "abc" });
    expect(parseRoute("#/controller/abc")).toEqual({ view: "controller", room: "abc" });
    expect(parseRoute("#/join/t0k-en_")).toEqual({ view: "join", token: "t0k-en_" });
  });

  it("fall back to the front page", () => {
    expect(parseRoute("#/screen")).toEqual({ view: "home" });
    expect(parseRoute("#/online/old")).toEqual({ view: "home" });
    expect(parseRoute("#/online/new/extra")).toEqual({ view: "home" });
    expect(parseRoute("#/screen/abc/extra")).toEqual({ view: "home" });
    expect(parseRoute("#/unknown/abc")).toEqual({ view: "home" });
    expect(parseRoute("#/join/<script>")).toEqual({ view: "home" });
  });

  it("survive a round trip", () => {
    const routes: Route[] = [
      { view: "home" },
      { view: "online" },
      { view: "new" },
      { view: "screen", room: "abc" },
      { view: "play", room: "abc" },
      { view: "controller", room: "abc" },
      { view: "join", token: "xyz" }
    ];
    for (const route of routes) expect(parseRoute(toHash(route))).toEqual(route);
  });

  it("have an address for a QR code", () => {
    expect(toUrl({ view: "join", token: "xyz" })).toBe(`${window.location.origin}/#/join/xyz`);
  });
});
