import type { DeepReadonly } from "ts-essentials";
import type { UpdateApi } from "@clockwyrks/simple-2d";
import type { CaromState, MenuRect, Screen } from "./game";
import {
  ACTIONS,
  TITLE_ITEMS,
  PAUSE_ITEMS,
  MATCHOVER_ITEMS,
} from "./constants";
import { returnTitle, startMatch } from "./simulation";

export function menuItems(screen: Screen): readonly string[] {
  switch (screen) {
    case "title":
      return TITLE_ITEMS;
    case "paused":
      return PAUSE_ITEMS;
    case "matchover":
      return MATCHOVER_ITEMS;
    case "howto":
      return ["BACK TO MENU"];
    default:
      return [];
  }
}
export function menuItemRect(
  s: DeepReadonly<CaromState>,
  index: number,
): MenuRect | null {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= menuItems(s.screen).length
  )
    return null;
  if (s.screen === "title")
    return { x: 116, y: 352 + index * 68, w: 380, h: 56 };
  if (s.screen === "howto") return { x: 116, y: 574, w: 380, h: 56 };
  return { x: 450, y: 354 + index * 66, w: 380, h: 54 };
}
function confirm(s: CaromState): CaromState {
  if (s.screen === "title") {
    const remembered = { ...s, titleIndex: s.menuIndex, menuContacts: {} };
    return s.menuIndex === 2
      ? { ...remembered, screen: "howto", menuIndex: 0 }
      : startMatch(remembered, s.menuIndex === 0 ? "solo" : "versus");
  }
  if (s.screen === "howto") return returnTitle(s);
  if (s.screen === "paused") {
    if (s.menuIndex === 0)
      return { ...s, screen: s.resumeScreen, menuContacts: {} };
    return s.menuIndex === 1 ? startMatch(s, s.mode) : returnTitle(s);
  }
  if (s.screen === "matchover")
    return s.menuIndex === 0 ? startMatch(s, s.mode) : returnTitle(s);
  return s;
}

export function readControls(
  state: DeepReadonly<CaromState>,
  api: UpdateApi,
): CaromState {
  const edges = Object.fromEntries(
    ACTIONS.map((action) => [action, api.input.pressed(action)]),
  );
  const samples = api.input.pointerSamples();
  const contacts = api.input.pointerContacts();
  let s: CaromState = {
    ...state,
    muted: edges.mute ? !state.muted : state.muted,
  };
  const screen = state.screen;
  if (screen === "countdown" || screen === "playing") {
    return edges.pause
      ? {
          ...s,
          resumeScreen: screen,
          screen: "paused",
          menuIndex: 0,
          menuContacts: {},
        }
      : s;
  }
  if (screen === "paused" && (edges.pause || edges.back))
    return { ...s, screen: s.resumeScreen, menuContacts: {} };
  if ((screen === "howto" || screen === "matchover") && edges.back)
    return returnTitle(s);
  const count = menuItems(screen).length;
  const up = edges["p1-up"] || edges["p2-up"];
  const down = edges["p1-down"] || edges["p2-down"];
  const movement = count > 1 && (up || down);
  if (movement)
    s = { ...s, menuIndex: (s.menuIndex + (up ? -1 : 1) + count) % count };
  const keyboardConfirm = edges.confirm && !movement;
  if (keyboardConfirm) return confirm(s);

  const hit = (x: number, y: number): number => {
    for (let i = 0; i < count; i++) {
      const r = menuItemRect(state, i);
      if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)
        return i;
    }
    return -1;
  };
  const presses: Record<number, number> = { ...state.menuContacts };
  let activated = false;
  for (const p of samples) {
    const index = hit(p.x, p.y);
    if (index >= 0) s = { ...s, menuIndex: index };
    if (p.type === "down" && p.button === "primary") presses[p.id] = index;
    if (p.type === "up") {
      if (index >= 0 && presses[p.id] === index) activated = true;
      delete presses[p.id];
    }
  }
  for (const p of contacts) {
    const index = hit(p.x, p.y);
    if (index >= 0) s = { ...s, menuIndex: index };
  }
  s = { ...s, menuContacts: presses };
  return activated ? confirm(s) : s;
}
