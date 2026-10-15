import { afterEach, describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import type { Engine, Transition } from "@clockwyrks/simple-2d";
import { BACKGROUND, game } from "./game";
import type { CaromDebugApi, CaromState, Screen } from "./game";
import * as C from "./constants";

const engines: Engine<CaromState, CaromDebugApi>[] = [];
afterEach(() => {
  for (const engine of engines) engine.destroy();
  engines.length = 0;
});

async function setup(step = 10) {
  const target = new EventTarget();
  const engine = createEngine({
    canvas: createCanvas(320, 180) as unknown as HTMLCanvasElement,
    width: C.FIELD_W,
    height: C.FIELD_H,
    game,
    layout: C.LAYOUT,
    background: BACKGROUND,
    clock: new ConstantClock(step),
    surface: {
      cssWidth: () => C.FIELD_W,
      cssHeight: () => C.FIELD_H,
      dpr: () => 0.25,
      events: () => target,
    },
  });
  engines.push(engine);
  await engine.initialize();
  const key = (code: string, type = "keydown") =>
    target.dispatchEvent(
      Object.assign(new Event(type), { code, repeat: false }),
    );
  const tap = async (code: string) => {
    key(code);
    await engine.advance(1);
    key(code, "keyup");
  };
  const pointer = (
    type: string,
    x: number,
    y: number,
    device = "mouse",
    id = 1,
  ) =>
    target.dispatchEvent(
      Object.assign(new Event(`pointer${type}`), {
        clientX: x,
        clientY: y,
        pointerType: device,
        pointerId: id,
        isPrimary: true,
        button: 0,
        buttons: type === "up" ? 0 : 1,
      }),
    );
  const pose = (transition: Transition<CaromState>) => engine.apply(transition);
  const d = engine.debug;
  const flight = (x: number, y: number, vx: number, vy: number, spin = 0) => {
    pose((s) => d.clearWorld(s));
    pose((s) => d.spawnBall(s));
    pose((s) => d.setScreen(s, "playing"));
    pose((s) => d.setMode(s, "versus"));
    pose((s) => d.setBallHeld(s, false));
    pose((s) => d.setBallPosition(s, x, y));
    pose((s) => d.setBallVelocity(s, vx, vy));
    pose((s) => d.setBallSpin(s, spin));
  };
  return { engine, d, pose, key, tap, pointer, flight };
}

describe("menus and frame transitions", () => {
  it("opens fully initialized, registers live diagnostics, and does not advance the title world", async () => {
    const { engine, d } = await setup();
    const original = d.snapshot(engine.state);
    const ball = engine.state.ball;
    expect(original.screen).toBe("title");
    expect(original.ball?.held).toBe(true);
    expect(original.obstacles).toHaveLength(C.OBSTACLE_CENTERS.length);
    await engine.advance(2);
    expect(engine.state.simTime).toBeCloseTo(0.02);
    expect(engine.state.ball).toBe(ball);
    expect(engine.state.obstacleClock).toBe(0);
    expect(engine.diagnostics()).toHaveLength(12);
    expect(engine.diagnostics().every((r) => r.error === undefined)).toBe(true);
  });

  it("wraps selection, gives up priority, and movement suppresses confirm", async () => {
    const { engine, key, tap } = await setup();
    key("KeyW");
    key("KeyS");
    key("Enter");
    await engine.advance(1);
    expect(engine.state.screen).toBe("title");
    expect(engine.state.menuIndex).toBe(2);
    key("KeyW", "keyup");
    key("KeyS", "keyup");
    key("Enter", "keyup");
    await tap("Enter");
    expect(engine.state.screen).toBe("howto");
    expect(engine.state.titleIndex).toBe(2);
    await tap("Escape");
    expect(engine.state.screen).toBe("title");
    expect(engine.state.menuIndex).toBe(2);
    await tap("ArrowDown");
    expect(engine.state.menuIndex).toBe(0);
    await tap("Space");
    expect(engine.state.screen).toBe("countdown");
    expect(engine.state.mode).toBe("solo");
    expect(engine.state.ball?.holdTimer).toBeCloseTo(C.HOLD_TIME - 0.01);
  });

  it("pauses and resumes countdown exactly once on Escape and freezes every entity", async () => {
    const { engine, tap } = await setup();
    await tap("Enter");
    const before = engine.state;
    await tap("Escape");
    expect(engine.state.screen).toBe("paused");
    await engine.advance(3);
    expect(engine.state.ball).toEqual(before.ball);
    expect(engine.state.paddles).toEqual(before.paddles);
    expect(engine.state.obstacleClock).toBe(before.obstacleClock);
    await tap("Escape");
    expect(engine.state.screen).toBe("countdown");
    expect(engine.state.ball?.holdTimer).toBeCloseTo(
      before.ball!.holdTimer - 0.01,
    );
  });

  it("restarts a versus match, quits, and remembers the confirmed title choice", async () => {
    const { engine, d, pose, tap } = await setup();
    await tap("KeyS");
    await tap("Enter");
    expect(engine.state.mode).toBe("versus");
    pose((s) => d.setScore(s, 8, 4));
    await tap("KeyP");
    await tap("KeyS");
    await tap("Enter");
    expect(engine.state.score).toEqual({ p1: 0, p2: 0 });
    expect(engine.state.mode).toBe("versus");
    await tap("KeyP");
    await tap("KeyW");
    await tap("Enter");
    expect(engine.state.screen).toBe("title");
    expect(engine.state.menuIndex).toBe(1);
    expect(engine.state.ai).toEqual({ tracking: true, movement: true });
  });

  it("requires matching pointer edges and handles same-frame clicks and touch drag selection", async () => {
    const { engine, d, pointer } = await setup();
    const a = d.menuItemRect(engine.state, 0)!;
    const b = d.menuItemRect(engine.state, 1)!;
    pointer("down", a.x + 10, a.y + 10);
    await engine.advance(1);
    pointer("up", b.x + 10, b.y + 10);
    await engine.advance(1);
    expect(engine.state.screen).toBe("title");
    expect(engine.state.menuIndex).toBe(1);
    pointer("down", 10, 10, "touch", 2);
    await engine.advance(1);
    pointer("move", b.x + 20, b.y + 20, "touch", 2);
    await engine.advance(1);
    expect(engine.state.menuIndex).toBe(1);
    pointer("up", b.x + 20, b.y + 20, "touch", 2);
    await engine.advance(1);
    expect(engine.state.screen).toBe("title");
    pointer("down", b.x + 20, b.y + 20, "touch", 3);
    pointer("up", b.x + 20, b.y + 20, "touch", 3);
    await engine.advance(1);
    expect(engine.state.screen).toBe("countdown");
    expect(engine.state.mode).toBe("versus");
  });

  it("gives keyboard confirm priority over a simultaneous pointer confirmation", async () => {
    const { engine, d, pointer, key } = await setup();
    const b = d.menuItemRect(engine.state, 1)!;
    key("Enter");
    pointer("down", b.x + 20, b.y + 20);
    pointer("up", b.x + 20, b.y + 20);
    await engine.advance(1);
    expect(engine.state.mode).toBe("solo");
  });
});

describe("paddle movers and serve", () => {
  it("serves in the posed direction without moving the ball on its release frame", async () => {
    const { engine, d, pose } = await setup();
    pose((s) => d.setScreen(s, "countdown"));
    pose((s) => d.setReceiver(s, "right"));
    pose((s) => d.setBallServeSign(s, -1));
    pose((s) => d.setBallHoldTimer(s, 0));
    await engine.advance(1);
    expect(engine.state.screen).toBe("playing");
    expect(engine.state.ball).toMatchObject({
      x: C.FIELD_CX,
      y: C.FIELD_CY,
      held: false,
      holdTimer: 0,
      serveSign: -1,
    });
    expect(engine.state.ball!.vx).toBeCloseTo(
      C.SERVE_SPEED * Math.cos(C.SERVE_ANGLE),
    );
    expect(engine.state.ball!.vy).toBeCloseTo(
      -C.SERVE_SPEED * Math.sin(C.SERVE_ANGLE),
    );
    await engine.advance(1);
    expect(engine.state.ball!.x).toBeGreaterThan(C.FIELD_CX);
  });

  it("uses either key pair in Solo, cancels opposing movement, and separates Versus controls", async () => {
    const { engine, d, pose, key } = await setup();
    pose((s) => d.setScreen(s, "countdown"));
    key("ArrowDown");
    await engine.advance(1);
    expect(engine.state.paddles.left.vy).toBe(C.PADDLE_SPEED);
    expect(engine.state.paddles.right.vy).toBe(0);
    key("KeyW");
    await engine.advance(1);
    expect(engine.state.paddles.left.vy).toBe(0);
    pose((s) => d.setMode(s, "versus"));
    await engine.advance(1);
    expect(engine.state.paddles.left.vy).toBe(-C.PADDLE_SPEED);
    expect(engine.state.paddles.right.vy).toBe(C.PADDLE_SPEED);
  });

  it("integrates a debug driver at the boundary using actual rather than requested velocity", async () => {
    const { engine, d, pose } = await setup();
    pose((s) => d.setScreen(s, "countdown"));
    pose((s) => d.setPaddleCy(s, "left", C.PADDLE_MAX_CY - 2));
    pose((s) => d.setPaddleVy(s, "left", 900));
    expect(engine.state.paddles.left.vy).toBe(0);
    pose((s) => d.setPaddleDriven(s, "left", true));
    await engine.advance(1);
    expect(engine.state.paddles.left.cy).toBe(C.PADDLE_MAX_CY);
    expect(engine.state.paddles.left.vy).toBeCloseTo(200);
    await engine.advance(1);
    expect(engine.state.paddles.left.vy).toBe(0);
    expect(engine.state.paddles.left.drivenVy).toBe(900);
    expect(engine.state.paddles.right.driven).toBe(false);
  });

  it("gates AI sensing and movement independently and lets a driver override both", async () => {
    const { engine, d, pose, flight } = await setup();
    flight(900, 150, 400, 100);
    pose((s) => d.setMode(s, "solo"));
    await engine.advance(1);
    expect(engine.state.paddles.right.vy).toBe(-C.AI_SPEED);
    pose((s) => d.setAiTracking(s, false));
    await engine.advance(1);
    expect(engine.state.paddles.right.vy).toBe(0);
    pose((s) => d.setPaddleCy(s, "right", 200));
    await engine.advance(1);
    expect(engine.state.paddles.right.vy).toBe(C.AI_SPEED);
    pose((s) => d.setAiMovement(s, false));
    await engine.advance(1);
    expect(engine.state.paddles.right.vy).toBe(0);
    pose((s) => d.setPaddleDriven(s, "right", true));
    pose((s) => d.setPaddleVy(s, "right", -100));
    await engine.advance(1);
    expect(engine.state.paddles.right.vy).toBe(-100);
  });
});

describe("ball collisions and spin", () => {
  it.each([500, C.SPEED_CAP])(
    "accelerates a centered paddle hit at speed %s with the cap",
    async (speed) => {
      const { engine, flight } = await setup();
      flight(C.P1_X1 + C.BALL_R + 1, C.FIELD_CY, -speed, 0);
      const before = engine.state;
      await engine.advance(1);
      expect(engine.state.ball!.vx).toBeCloseTo(
        Math.min(speed * C.SPEED_MULT, C.SPEED_CAP),
      );
      expect(engine.state.ball!.vy).toBeCloseTo(0);
      expect(before.ball!.vx).toBe(-speed);
      expect(before.ball!.x).toBe(C.P1_X1 + C.BALL_R + 1);
      expect(engine.state.ball!.x).toBeGreaterThanOrEqual(C.P1_X1 + C.BALL_R);
    },
  );

  it("adds signed paddle motion to spin, bends the trajectory, and preserves speed during decay", async () => {
    const { engine, d, pose, flight } = await setup();
    flight(C.P1_X1 + C.BALL_R + 1, C.FIELD_CY + 3, -500, 0);
    pose((s) => d.setPaddleDriven(s, "left", true));
    pose((s) => d.setPaddleVy(s, "left", 300));
    await engine.advance(1);
    expect(engine.state.ball!.spin).toBeGreaterThan(250);
    expect(engine.state.ball!.vy).toBeGreaterThanOrEqual(0);
    const speed = Math.hypot(engine.state.ball!.vx, engine.state.ball!.vy);
    pose((s) => d.setBallPosition(s, 500, 360));
    pose((s) => d.setBallVelocity(s, speed, 0));
    const spin = engine.state.ball!.spin;
    await engine.advance(10);
    expect(engine.state.ball!.vy).toBeGreaterThan(0);
    expect(
      Math.hypot(engine.state.ball!.vx, engine.state.ball!.vy),
    ).toBeCloseTo(speed);
    expect(engine.state.ball!.spin).toBeCloseTo(
      spin * 0.5 ** (0.1 / C.SPIN_HALFLIFE),
    );
  });

  it("reflects on a right paddle edge with an upward exit angle", async () => {
    const { engine, flight } = await setup();
    flight(C.P2_X0 - C.BALL_R - 1, C.FIELD_CY - C.PADDLE_HALF, 500, 0);
    await engine.advance(1);
    expect(engine.state.ball!.vx).toBeLessThan(0);
    expect(engine.state.ball!.vy).toBeCloseTo(
      -500 * C.SPEED_MULT * Math.sin(C.MAX_BOUNCE_ANGLE),
    );
  });

  it.each(["top", "bottom"])(
    "reflects the %s wall without changing speed or spin except decay",
    async (wall) => {
      const { engine, flight } = await setup();
      flight(
        350,
        wall === "top" ? C.BALL_R : C.FIELD_H - C.BALL_R,
        0,
        wall === "top" ? -700 : 700,
        100,
      );
      await engine.advance(1);
      expect(Math.sign(engine.state.ball!.vy)).toBe(wall === "top" ? 1 : -1);
      expect(
        Math.hypot(engine.state.ball!.vx, engine.state.ball!.vy),
      ).toBeCloseTo(700);
      expect(engine.state.ball!.spin).toBeCloseTo(
        100 * 0.5 ** (0.01 / C.SPIN_HALFLIFE),
      );
    },
  );

  it.each(["top", "bottom"])(
    "resolves paddle %s end caps as walls",
    async (face) => {
      const { engine, flight } = await setup();
      const top = face === "top";
      flight(
        (C.P1_X0 + C.P1_X1) / 2,
        C.FIELD_CY + (top ? -1 : 1) * (C.PADDLE_HALF + C.BALL_R + 1),
        0,
        top ? 500 : -500,
      );
      await engine.advance(1);
      expect(Math.sign(engine.state.ball!.vy)).toBe(top ? -1 : 1);
      expect(
        Math.hypot(engine.state.ball!.vx, engine.state.ball!.vy),
      ).toBeCloseTo(500);
    },
  );

  it("reflects from a tilted obstacle in its local coordinates with unchanged speed", async () => {
    const { engine, d, pose, flight } = await setup(2);
    flight(0, 0, 0, 0);
    pose((s) => d.setObstacleClock(s, 0.75));
    pose((s) => d.setObstacleClockRunning(s, false));
    pose((s) => d.spawnObstacle(s, 0));
    const o = engine.state.obstacles[0];
    const cos = Math.cos(o.theta),
      sin = Math.sin(o.theta);
    pose((s) =>
      d.setBallPosition(
        s,
        o.cx + (C.OBSTACLE_HW + C.BALL_R + 0.5) * cos,
        o.cy + (C.OBSTACLE_HW + C.BALL_R + 0.5) * sin,
      ),
    );
    pose((s) => d.setBallVelocity(s, -500 * cos, -500 * sin));
    await engine.advance(1);
    expect(engine.state.ball!.vx).toBeCloseTo(500 * cos);
    expect(engine.state.ball!.vy).toBeCloseTo(500 * sin);
    expect(engine.state.obstacleClock).toBe(0.75);
  });

  it("pushes a ball posed inside an obstacle out without inventing a bounce", async () => {
    const { engine, d, pose, flight } = await setup();
    flight(490, 220, 0, 0);
    pose((s) => d.spawnObstacle(s, 0));
    pose((s) => d.setObstacleClockRunning(s, false));
    await engine.advance(1);
    expect(engine.state.ball!.x).toBe(490 - C.OBSTACLE_HW - C.BALL_R);
    expect(engine.state.ball!.vx).toBe(0);
  });

  it("keeps time-bounded trail samples and emits at most one cue of each kind per frame", async () => {
    const { engine, flight } = await setup(1000);
    const cues: string[] = [];
    engine.events.on("cue:played", (e) => cues.push(e.cue));
    flight(300, 200, 0, C.SPEED_CAP);
    await engine.advance(1);
    expect(cues.filter((c) => c === C.CUES.wallBounce)).toHaveLength(1);
    engine.setClock(new ConstantClock(10));
    await engine.advance(15);
    expect(
      engine.state.ball!.trail.every(
        (p) => engine.state.simTime - p.t <= C.TRAIL_TIME + 1e-10,
      ),
    ).toBe(true);
    expect(engine.state.ball!.trail.length).toBeGreaterThan(10);
  });
});

describe("points, debug operations, and reproducibility", () => {
  it("scores only after the whole ball passes a goal, then parks toward the receiver", async () => {
    const { engine, d, pose, flight } = await setup();
    flight(C.FIELD_W + C.BALL_R, 100, 0, 0);
    await engine.advance(1);
    expect(engine.state.score.p1).toBe(0);
    pose((s) => d.setBallVelocity(s, 200, 0));
    await engine.advance(1);
    expect(engine.state.score.p1).toBe(1);
    expect(engine.state.receiver).toBe("right");
    expect(engine.state.screen).toBe("countdown");
    expect(engine.state.ball!.trail).toEqual([]);
    expect(engine.state.ball!.holdTimer).toBe(C.HOLD_TIME);
  });

  it("requires a two-point lead and freezes the winning ball on matchover", async () => {
    const { engine, d, pose, flight, tap } = await setup();
    flight(-C.BALL_R - 1, 100, -200, 0);
    pose((s) => d.setScore(s, 10, 10));
    await engine.advance(1);
    expect(engine.state.score).toEqual({ p1: 10, p2: 11 });
    expect(engine.state.screen).toBe("countdown");
    pose((s) => d.setScreen(s, "playing"));
    pose((s) => d.setBallHeld(s, false));
    pose((s) => d.setBallPosition(s, -C.BALL_R - 1, 100));
    await engine.advance(1);
    expect(engine.state.winner).toBe("right");
    expect(engine.state.screen).toBe("matchover");
    const ball = engine.state.ball;
    await engine.advance(1);
    expect(engine.state.ball).toEqual(ball);
    await tap("Enter");
    expect(engine.state.score).toEqual({ p1: 0, p2: 0 });
  });

  it("mirrors mute into cue gain while keeping real scoring active", async () => {
    const { engine, d, pose, flight, tap } = await setup();
    await tap("KeyM");
    expect(engine.state.muted).toBe(true);
    const gains: number[] = [];
    engine.events.on("cue:played", (e) => gains.push(e.gain));
    flight(C.FIELD_W + 20, 100, 200, 0);
    await engine.advance(1);
    expect(engine.state.score.p1).toBe(1);
    expect(gains).toEqual([0]);
    pose((s) => d.setMuted(s, false));
    await engine.advance(1);
    expect(engine.state.muted).toBe(false);
  });

  it("clears entities, rejects absent-ball poses and unknown obstacles, and reconciles without advancing", async () => {
    const { engine, d, pose } = await setup();
    pose((s) => d.clearWorld(s));
    expect(d.snapshot(engine.state).ball).toBeNull();
    expect(engine.state.obstacles).toEqual([]);
    expect(() => pose((s) => d.setBallSpin(s, 2))).toThrow("no ball");
    expect(() => pose((s) => d.spawnObstacle(s, 2))).toThrow(
      "Unknown obstacle",
    );
    expect(() => pose((s) => d.spawnObstacle(s, 0.5))).toThrow(
      "Unknown obstacle",
    );
    pose((s) => d.setObstacleClock(s, 0.9));
    pose((s) => d.spawnObstacle(s, 1));
    pose((s) => d.spawnObstacle(s, 0));
    expect(engine.state.obstacles.map((o) => o.index)).toEqual([0, 1]);
    expect(engine.state.obstacles[0].cy).toBeCloseTo(
      C.OBSTACLE_CENTERS[0].y + C.OBSTACLE_SWAY_AMP,
    );
    pose((s) => d.spawnBall(s));
    pose((s) => d.setBallPosition(s, C.P1_X0, C.FIELD_CY));
    const before = d.snapshot(engine.state);
    pose((s) => d.reconcile(s));
    pose((s) => d.reconcile(s));
    expect(d.snapshot(engine.state)).toEqual(before);
    pose((s) => d.reset(s));
    expect(engine.state.simTime).toBe(0);
    expect(engine.state.screen).toBe("title");
  });

  it("keeps poses independent, reads derived speed immediately, and resets drivers and faculties", async () => {
    const { engine, d, pose } = await setup();
    pose((s) => d.setPaddleDriven(s, "left", true));
    pose((s) => d.setPaddleVy(s, "left", -50));
    pose((s) => d.setTitleIndex(s, 2));
    pose((s) => d.setMenuIndex(s, 1));
    pose((s) => d.setResumeScreen(s, "countdown"));
    pose((s) => d.setWinner(s, "left"));
    pose((s) => d.setAiTracking(s, false));
    pose((s) => d.setAiMovement(s, false));
    pose((s) => d.setBallVelocity(s, 300, 400));
    expect(d.snapshot(engine.state).ball!.speed).toBe(500);
    pose((s) => d.drawBallServeSign(s));
    expect([-1, 1]).toContain(engine.state.ball!.serveSign);
    pose((s) => d.setScreen(s, "paused"));
    pose((s) => d.setMuted(s, true));
    expect(engine.state.paddles.left.driven).toBe(true);
    expect(engine.state.menuIndex).toBe(1);
    pose((s) => d.reset(s));
    expect(engine.state.paddles.left.driven).toBe(false);
    expect(engine.state.paddles.left.drivenVy).toBe(0);
    expect(engine.state.muted).toBe(true);
    expect(engine.state.ai).toEqual({ tracking: true, movement: true });
  });

  it("agrees across 2ms and 16ms steps through a paddle and wall rally", async () => {
    const runs = [];
    for (const step of [2, 16]) {
      const { engine, flight } = await setup(step);
      flight(110, C.FIELD_CY - 20, -600, -40, -180);
      const cues: string[] = [];
      engine.events.on("cue:played", (e) => cues.push(e.cue));
      await engine.advance(1600 / step);
      runs.push({
        ball: engine.debug.snapshot(engine.state).ball!,
        cues,
        time: engine.state.simTime,
      });
    }
    expect(runs[0].cues).toEqual(runs[1].cues);
    expect(runs[0].cues).toContain(C.CUES.paddleHit);
    expect(runs[0].cues).toContain(C.CUES.wallBounce);
    expect(runs[0].ball.speed).toBeCloseTo(runs[1].ball.speed, 6);
    expect(Math.sign(runs[0].ball.vx)).toBe(Math.sign(runs[1].ball.vx));
    expect(Math.sign(runs[0].ball.vy)).toBe(Math.sign(runs[1].ball.vy));
    expect(runs[0].time).toBeCloseTo(runs[1].time);
  });

  it("renders every screen and records real draw operations without mutating state", async () => {
    const { engine, d, pose } = await setup();
    engine.startRecording();
    for (const screen of [
      "title",
      "howto",
      "countdown",
      "playing",
      "paused",
      "matchover",
    ] as Screen[]) {
      pose((s) => d.setScreen(s, screen));
      await engine.advance(1);
    }
    const recording = engine.stopRecording();
    expect(recording.frames).toHaveLength(6);
    expect(recording.ops.length).toBeGreaterThan(100);
    expect(recording.frames.some((f) => f.truncated)).toBe(false);
    expect(d.menuItemRect(engine.state, 0)).not.toBeNull();
    expect(d.menuItemRect(engine.state, 9)).toBeNull();
    pose((s) => d.setScreen(s, "playing"));
    expect(d.menuItemRect(engine.state, 0)).toBeNull();
    const before = d.snapshot(engine.state);
    engine.diagnostics();
    expect(d.snapshot(engine.state)).toEqual(before);
  });
});
