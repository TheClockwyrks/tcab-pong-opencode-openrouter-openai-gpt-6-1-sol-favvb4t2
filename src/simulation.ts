import type { DeepReadonly } from "ts-essentials";
import type { UpdateApi } from "@clockwyrks/simple-2d";
import type {
  BallState,
  CaromState,
  Mode,
  ObstacleState,
  PaddleState,
} from "./game";
import * as C from "./constants";
import { clamp, flyBall } from "./physics";
export const drawSign = (): 1 | -1 => (Math.random() < 0.5 ? -1 : 1);
export const parkedBall = (): BallState => ({
  x: C.FIELD_CX,
  y: C.FIELD_CY,
  vx: 0,
  vy: 0,
  spin: 0,
  held: true,
  holdTimer: C.HOLD_TIME,
  serveSign: drawSign(),
  trail: [],
});
export function obstaclePose(index: number, t: number): ObstacleState {
  const base = C.OBSTACLE_CENTERS[index];
  if (!base) throw new RangeError(`Unknown obstacle: ${index}`);
  return {
    index,
    cx: base.x,
    cy:
      base.y +
      (index === 0 ? 1 : -1) *
        C.OBSTACLE_SWAY_AMP *
        Math.sin((2 * Math.PI * t) / C.OBSTACLE_SWAY_PERIOD),
    theta: C.OBSTACLE_SPIN_RATE * t,
  };
}
export function initialState(muted: boolean): CaromState {
  const paddle = (): PaddleState => ({
    cy: C.FIELD_CY,
    vy: 0,
    driven: false,
    drivenVy: 0,
  });
  return {
    screen: "title",
    mode: "solo",
    menuIndex: 0,
    titleIndex: 0,
    resumeScreen: "playing",
    score: { p1: 0, p2: 0 },
    winner: null,
    paddles: { left: paddle(), right: paddle() },
    ai: { tracking: true, movement: true },
    receiver: "left",
    ball: parkedBall(),
    obstacles: C.OBSTACLE_CENTERS.map((_, i) => obstaclePose(i, 0)),
    obstacleClock: 0,
    obstacleClockRunning: true,
    simTime: 0,
    muted,
  };
}
export function startMatch(
  s: DeepReadonly<CaromState>,
  mode: Mode,
): CaromState {
  return {
    ...s,
    screen: "countdown",
    mode,
    resumeScreen: "playing",
    menuIndex: 0,
    score: { p1: 0, p2: 0 },
    winner: null,
    receiver: "left",
    ball: parkedBall(),
    paddles: {
      left: { ...s.paddles.left, cy: C.FIELD_CY, vy: 0 },
      right: { ...s.paddles.right, cy: C.FIELD_CY, vy: 0 },
    },
    obstacleClock: 0,
    obstacleClockRunning: true,
    obstacles: s.obstacles.map((o) => obstaclePose(o.index, 0)),
    menuContacts: {},
  };
}
export function returnTitle(s: DeepReadonly<CaromState>): CaromState {
  return {
    ...initialState(s.muted),
    titleIndex: s.titleIndex,
    menuIndex: s.titleIndex,
    simTime: s.simTime,
  };
}
function integrate(p: PaddleState, vy: number, dt: number): PaddleState {
  const raw = p.cy + vy * dt;
  const cy = clamp(raw, C.PADDLE_MIN_CY, C.PADDLE_MAX_CY);
  return { ...p, cy, vy: raw !== cy && dt > 0 ? (cy - p.cy) / dt : vy };
}
function movePaddles(
  s: DeepReadonly<CaromState>,
  api: UpdateApi,
  dt: number,
): CaromState["paddles"] {
  const held = (name: C.ActionName) => api.input.value(name) > 0;
  const axis = (up: boolean, down: boolean) =>
    (Number(down) - Number(up)) * C.PADDLE_SPEED;
  const leftVy = axis(
    held("p1-up") || (s.mode === "solo" && held("p2-up")),
    held("p1-down") || (s.mode === "solo" && held("p2-down")),
  );
  let rightVy = axis(held("p2-up"), held("p2-down"));
  if (s.mode === "solo") {
    const defend =
      s.ai.tracking &&
      s.screen === "playing" &&
      s.ball !== null &&
      s.ball.vx > 0;
    const target =
      defend && s.ball ? s.ball.y - s.ball.vy * C.AI_REACT : C.AI_HOME_Y;
    const diff = target - s.paddles.right.cy;
    const deadzone = defend ? C.AI_DEADZONE : C.AI_HOME_DEADZONE;
    rightVy =
      !s.ai.movement || Math.abs(diff) <= deadzone
        ? 0
        : Math.sign(diff) *
          Math.min(C.AI_SPEED, dt > 0 ? Math.abs(diff) / dt : 0);
  }
  return {
    left: integrate(
      s.paddles.left,
      s.paddles.left.driven ? s.paddles.left.drivenVy : leftVy,
      dt,
    ),
    right: integrate(
      s.paddles.right,
      s.paddles.right.driven ? s.paddles.right.drivenVy : rightVy,
      dt,
    ),
  };
}

/** Render-free simulation; obstacles collide at the opening pose of the frame. */
export function advanceWorld(
  s: DeepReadonly<CaromState>,
  api: UpdateApi,
  dt: number,
): CaromState {
  if (s.screen !== "playing" && s.screen !== "countdown") return s;
  let next: CaromState = { ...s, paddles: movePaddles(s, api, dt) };
  let ball = s.ball;
  if (ball) {
    if (s.screen === "countdown") {
      const holdTimer = Math.max(0, ball.holdTimer - dt);
      ball = { ...ball, holdTimer };
      if (holdTimer <= 0) {
        ball = {
          ...ball,
          held: false,
          vx:
            (s.receiver === "left" ? -1 : 1) *
            C.SERVE_SPEED *
            Math.cos(C.SERVE_ANGLE),
          vy: ball.serveSign * C.SERVE_SPEED * Math.sin(C.SERVE_ANGLE),
          trail: [],
        };
        next = { ...next, screen: "playing" };
      }
    } else if (!ball.held) {
      const result = flyBall(ball, next.paddles, s.obstacles, dt);
      ball = result.ball;
      for (const cue of result.cues) api.audio.play(cue);
    }
    ball = {
      ...ball,
      trail: [
        ...ball.trail.filter((p) => s.simTime - p.t <= C.TRAIL_TIME),
        { x: ball.x, y: ball.y, t: s.simTime },
      ],
    };
    next = { ...next, ball };
    if (
      s.screen === "playing" &&
      (ball.x - C.BALL_R > C.FIELD_W || ball.x + C.BALL_R < 0)
    ) {
      const left = ball.x > C.FIELD_W;
      const score = {
        p1: s.score.p1 + Number(left),
        p2: s.score.p2 + Number(!left),
      };
      api.audio.play(C.CUES.score);
      const won =
        Math.max(score.p1, score.p2) >= C.WIN_SCORE &&
        Math.abs(score.p1 - score.p2) >= C.WIN_LEAD;
      next = won
        ? {
            ...next,
            score,
            winner: left ? "left" : "right",
            screen: "matchover",
            menuIndex: 0,
            menuContacts: {},
          }
        : {
            ...next,
            score,
            receiver: left ? "right" : "left",
            ball: parkedBall(),
            screen: "countdown",
          };
    }
  }
  const obstacleClock = s.obstacleClock + (s.obstacleClockRunning ? dt : 0);
  return {
    ...next,
    obstacleClock,
    obstacles: s.obstacles.map((o) => obstaclePose(o.index, obstacleClock)),
  };
}
