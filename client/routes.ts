/**
 * The views of the app. The frontend is a static site in GitHub Pages, which cannot serve the same
 * page for every path, so the view is in the hash of the address, e.g. https://.../#/join/abc123.
 */
export type Route =
  /** The front page: the name of the game, and the two ways to play. */
  | { view: "home" }
  /** The lobby of the online games: the public games that wait for players, and the way to a new one. */
  | { view: "online" }
  /** Setting up a new online game. */
  | { view: "new" }
  /** The big screen of a hotseat game: the playing field and the QR code. */
  | { view: "screen"; room: string }
  /** Joining a hotseat game as a controller, opened by scanning the QR code. The token is short-lived. */
  | { view: "join"; token: string }
  /** A controller of a hotseat game, after joining. */
  | { view: "controller"; room: string }
  /** An online player: the playing field and the controls on the same device. */
  | { view: "play"; room: string };

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The route of a hash, e.g. "#/screen/abc". An unknown one is the front page. */
export function parseRoute(hash: string): Route {
  const [view, id, ...rest] = hash.replace(/^#\/?/, "").split("/");
  if (view === "online" && rest.length === 0) {
    if (id === undefined || id === "") return { view: "online" };
    if (id === "new") return { view: "new" };
    return { view: "home" };
  }
  if (rest.length === 0 && id !== undefined && ID.test(id)) {
    if (view === "screen" || view === "controller" || view === "play") return { view, room: id };
    if (view === "join") return { view, token: id };
  }
  return { view: "home" };
}

/** The hash of a route, the opposite of parseRoute. */
export function toHash(route: Route): string {
  if (route.view === "home") return "#/";
  if (route.view === "online") return "#/online";
  if (route.view === "new") return "#/online/new";
  return `#/${route.view}/${route.view === "join" ? route.token : route.room}`;
}

/** The whole address of a route of this site, e.g. for a QR code. */
export function toUrl(route: Route): string {
  const url = new URL(document.baseURI);
  url.search = "";
  url.hash = toHash(route);
  return url.toString();
}

/** Goes to a route. With replace, the new address takes the place of the current one in the history of the browser. */
export function navigate(route: Route, replace = false) {
  const url = new URL(window.location.href);
  url.hash = toHash(route);
  if (replace) window.location.replace(url);
  else window.location.assign(url);
}
