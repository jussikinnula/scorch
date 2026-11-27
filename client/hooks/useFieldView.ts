import { useRef, useState } from "react";

import { FieldState, RoomState } from "../../shared/protocol";
import { applyTerrainOp } from "../../shared/sim/terrain";
import { TANK_HEIGHT } from "../../shared/sim/field";
import { findWeapon } from "../../shared/weapons";
import { noAction } from "../components/Field";
import { effects } from "../sound/sound";
import { explosionSound, landed, launched } from "../sound/events";
import { Api, useApiMessages } from "./useApiConnection";
import { useBubbles } from "./useBubbles";

/**
 * What a view that shows the playing field of a room keeps of it, from what the server tells: the
 * field, what flies over it, the speech bubbles and the result of a round. It is the same for the
 * big screen of a hotseat game and for a player of an online game.
 */
export function useFieldView(api: Api, room: string) {
  const [state, setState] = useState<RoomState | null>(null);
  const [field, setField] = useState<FieldState | null>(null);
  const { bubbles, say } = useBubbles();
  // The projectiles and the explosions move too fast to go through the state of the view
  const action = useRef(noAction());
  const [flying, setFlying] = useState(0);
  /** The result of the round that just ended, while it is shown. */
  const [result, setResult] = useState<{ round: number; winner: number | null } | null>(null);
  // Kept where the next message finds them, as the messages can come faster than the view is redrawn
  const tracesNow = useRef(false);
  const roundNow = useRef(0);
  // For the sounds: the field as it is now, and how many things have gone off since the projectiles were last told
  const fieldNow = useRef<FieldState | null>(null);
  fieldNow.current = field;
  const wentOff = useRef(0);

  useApiMessages(api, (message) => {
    if (message.type === "room" && message.state.room === room) {
      setState(message.state);
      tracesNow.current = message.state.settings.traces;
      // The traces are of one round: a new round starts with none
      if (message.state.round !== roundNow.current) action.current.traces.clear();
      roundNow.current = message.state.round;
    } else if (message.type === "field") {
      setField(message.field);
      // A new field is a new round: the result of the old one has been seen
      setResult(null);
    } else if (message.type === "roundOver") setResult({ round: message.round, winner: message.winner });
    else if (message.type === "say") say(message.id, message.text);
    else if (message.type === "shots") {
      // A Tracer and a Smoke Tracer leave a trace of its path, and with Trace Paths on everything does
      for (const shot of message.shots) {
        const weapon = findWeapon(shot.weapon);
        if (weapon?.kind !== "tracer" && shot.part === undefined && !tracesNow.current) continue;
        let trace = action.current.traces.get(shot.id);
        if (!trace) {
          trace = { owner: shot.owner, smoke: weapon?.smoke, part: shot.part, points: [] };
          // The trace of a bomb that a weapon threw starts from where the weapon went off
          const thrown = [...action.current.explosions]
            .reverse()
            .find((explosion) => explosion.weapon === shot.weapon && explosion.part === undefined);
          if (shot.part !== undefined && thrown) trace.points.push({ x: thrown.x, y: thrown.y });
        }
        trace.points.push({ x: shot.x, y: shot.y });
        action.current.traces.set(shot.id, trace);
      }
      // A shot that appears at a tank was fired from it; one that is gone without going off landed quietly
      const before = action.current.shots;
      const tanks = (fieldNow.current?.tanks ?? []).map((tank) => ({ x: tank.x, y: tank.y - TANK_HEIGHT }));
      if (launched(before, message.shots, tanks) > 0) effects.fire();
      if (fieldNow.current && landed(before, message.shots, fieldNow.current) > wentOff.current) effects.click();
      wentOff.current = 0;
      action.current.previous = action.current.shots;
      action.current.shots = message.shots;
      action.current.at = performance.now();
      setFlying(message.shots.length);
    } else if (message.type === "beam") {
      const { x1, y1, x2, y2 } = message;
      action.current.beams.push({ x1, y1, x2, y2, at: performance.now() });
      wentOff.current++;
      effects.zap();
    } else if (message.type === "burn") {
      // What still spreads is told again and again: the latest telling is all of it
      const { id, x, depths, weapon } = message;
      wentOff.current++;
      // The fire is heard once, when it starts: what is told after that is the same fire spreading
      if (!action.current.burns.some((burn) => burn.id === id)) effects.burn(weapon === "hot-napalm");
      const burns = action.current.burns.filter((burn) => burn.id !== id);
      action.current.burns = [...burns, { id, x, depths, weapon, at: performance.now() }];
    } else if (message.type === "explode") {
      const { x, y, radius, weapon, part } = message;
      action.current.explosions.push({ x, y, radius, weapon, part, at: performance.now() });
      wentOff.current++;
      // A rumble for what explodes, by its size; a click for what only digs, fills or flashes
      const sound = explosionSound(weapon, radius);
      if (sound === "nuke") effects.nuke(radius);
      else if (sound === "plasma") effects.plasma(radius);
      else if (sound === "explosion") effects.explode(radius);
      else effects.click();
    } else if (message.type === "terrain") {
      const { changes, tanks } = message;
      setField((current) => {
        if (!current) return current;
        // The same changes as on the server, to a copy: the old terrain is still being drawn
        const terrain = [...current.terrain];
        changes.forEach((change) => applyTerrainOp(terrain, change, current.height));
        return { ...current, terrain, tanks };
      });
    } else if (message.type === "aim") {
      const { id, angle, power } = message;
      setField(
        (current) =>
          current && {
            ...current,
            tanks: current.tanks.map((tank) => (tank.id === id ? { ...tank, angle, power } : tank))
          }
      );
    }
  });

  return { state, field, bubbles, action: action.current, flying, result };
}
