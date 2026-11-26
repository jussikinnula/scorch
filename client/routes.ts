/**
 * The views of the app. The frontend is a static site in GitHub Pages, which cannot serve the same
 * page for every path, so the view is in the hash of the address, e.g. https://.../#/join/abc123.
 */
export type Route =
  /** The front page: start a hotseat or an online game, or pick a public one. */
  | { view: "home" }
  /** The big screen of a hotseat game: the playing field and the QR code. */
  | { view: "screen"; room: string }
  /** A controller of a hotseat game, opened by scanning the QR code. The token is short-lived. */
  | { view: "join"; token: string }
  /** An online player: the playing field and the controls on the same device. */
  | { view: "play"; room: string };

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The route of a hash, e.g. "#/screen/abc". An unknown one is the front page. */
export function parseRoute(hash: string): Route {
  const [view, id, ...rest] = hash.replace(/^#\/?/, "").split("/");
  if (rest.length === 0 && id !== undefined && ID.test(id)) {
    if (view === "screen") return { view, room: id };
    if (view === "play") return { view, room: id };
    if (view === "join") return { view, token: id };
  }
  return { view: "home" };
}

/** The hash of a route, the opposite of parseRoute. */
export function toHash(route: Route): string {
  if (route.view === "home") return "#/";
  return `#/${route.view}/${route.view === "join" ? route.token : route.room}`;
}
