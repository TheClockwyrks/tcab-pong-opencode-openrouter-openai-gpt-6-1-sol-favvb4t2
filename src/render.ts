import type { DeepReadonly } from "ts-essentials";
import type { RenderApi } from "@clockwyrks/simple-2d";
import type { CaromState } from "./game";
import * as C from "./constants";
import { menuItemRect, menuItems } from "./controls";

const INK = "#eaf0e9";
const MUTED = "#82919b";
const MINT = "#a2f6cf";
const CORAL = "#ff8c7b";
const AMBER = "#e7bc72";
const LINE = "#26333c";
const MONO = '"Courier New", monospace';
const SANS = '"Arial", sans-serif';
type Context = CanvasRenderingContext2D;

function text(
  ctx: Context,
  value: string,
  x: number,
  y: number,
  size = 14,
  color = MUTED,
  align: CanvasTextAlign = "left",
  bold = false,
): void {
  ctx.fillStyle = color;
  ctx.font = `${bold ? "700" : "400"} ${size}px ${size <= 16 ? MONO : SANS}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(value, x, y);
}
function line(
  ctx: Context,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color = LINE,
  width = 1,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}
function circle(
  ctx: Context,
  x: number,
  y: number,
  r: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
function bar(
  ctx: Context,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  glow = true,
): void {
  ctx.save();
  ctx.fillStyle = color;
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 17;
  }
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(w / 2, 5));
  ctx.fill();
  ctx.restore();
}
function base(ctx: Context): void {
  // Sparse drafting-paper texture keeps the court quiet at rally speed.
  ctx.fillStyle = "#1b2831";
  for (let x = 24; x < C.FIELD_W; x += 32)
    for (let y = 24; y < C.FIELD_H; y += 32) ctx.fillRect(x, y, 1, 1);
  line(ctx, 24, 19, C.FIELD_W - 24, 19);
  line(ctx, 24, C.FIELD_H - 19, C.FIELD_W - 24, C.FIELD_H - 19);
  for (const x of [24, C.FIELD_W - 24]) {
    line(ctx, x, 19, x, 35);
    line(ctx, x, C.FIELD_H - 35, x, C.FIELD_H - 19);
  }
}
function footer(ctx: Context, s: DeepReadonly<CaromState>, menu = false): void {
  text(
    ctx,
    menu ? "↑ ↓ / W S   SELECT" : "W S   PLAYER 01",
    48,
    678,
    12,
    menu ? MUTED : MINT,
  );
  text(
    ctx,
    menu
      ? "ENTER   CONFIRM"
      : s.mode === "solo"
        ? "↑ ↓   ALSO MOVE PLAYER 01"
        : "↑ ↓   PLAYER 02",
    menu ? 312 : 272,
    678,
    12,
    menu ? MUTED : MUTED,
  );
  text(ctx, `M   SOUND ${s.muted ? "OFF" : "ON"}`, 870, 678, 12);
  text(
    ctx,
    menu ? "EST. 2026" : "P / ESC   PAUSE",
    1232,
    678,
    12,
    MUTED,
    "right",
  );
}
function furniture(ctx: Context, s: DeepReadonly<CaromState>): void {
  ctx.save();
  ctx.setLineDash([7, 12]);
  line(ctx, C.NET_X, 126, C.NET_X, 638, "#30404a");
  ctx.setLineDash([]);
  ctx.strokeStyle = "#20303a";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(C.FIELD_CX, C.FIELD_CY, 68, 0, Math.PI * 2);
  ctx.stroke();
  for (const o of s.obstacles) {
    ctx.save();
    ctx.translate(o.cx, o.cy);
    ctx.rotate(o.theta);
    bar(ctx, -C.OBSTACLE_HW, -C.OBSTACLE_HH, C.OBSTACLE_W, C.OBSTACLE_H, AMBER);
    line(ctx, -4, -C.OBSTACLE_HH + 12, -4, C.OBSTACLE_HH - 12, "#ffdf9e", 2);
    ctx.restore();
    circle(ctx, o.cx, o.cy, 2.5, "#0a1118");
  }
  bar(
    ctx,
    C.P1_X0,
    s.paddles.left.cy - C.PADDLE_HALF,
    C.PADDLE_W,
    C.PADDLE_H,
    MINT,
  );
  bar(
    ctx,
    C.P2_X0,
    s.paddles.right.cy - C.PADDLE_HALF,
    C.PADDLE_W,
    C.PADDLE_H,
    CORAL,
  );
  const b = s.ball;
  if (b) {
    if (!b.held) {
      for (let i = 1; i < b.trail.length; i++) {
        const a = b.trail[i - 1],
          z = b.trail[i];
        const opacity = Math.max(0, 1 - (s.simTime - z.t) / C.TRAIL_TIME);
        line(
          ctx,
          a.x,
          a.y,
          z.x,
          z.y,
          `rgba(234,240,233,${opacity * 0.45})`,
          C.BALL_R * opacity * 1.5,
        );
      }
    }
    ctx.save();
    ctx.shadowColor = INK;
    ctx.shadowBlur = 22;
    circle(ctx, b.x, b.y, C.BALL_R, INK);
    ctx.restore();
    if (Math.abs(b.spin) > 80 && !b.held) {
      ctx.strokeStyle = MINT;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(
        b.x,
        b.y,
        C.BALL_R + 5,
        s.simTime * 8,
        s.simTime * 8 + Math.PI * 1.3,
      );
      ctx.stroke();
    }
  }
  ctx.restore();
}
function scoreboard(ctx: Context, s: DeepReadonly<CaromState>): void {
  text(ctx, C.TITLE_TEXT, 48, 60, 24, INK, "left", true);
  text(
    ctx,
    s.mode === "solo" ? "SOLO / HUMAN VS MACHINE" : "VERSUS / LOCAL DUEL",
    48,
    87,
    11,
  );
  text(ctx, "PLAYER 01", 510, 40, 11, MINT, "center");
  text(
    ctx,
    s.mode === "solo" ? "MACHINE" : "PLAYER 02",
    770,
    40,
    11,
    CORAL,
    "center",
  );
  text(
    ctx,
    String(s.score.p1).padStart(2, "0"),
    510,
    86,
    58,
    INK,
    "center",
    true,
  );
  text(
    ctx,
    String(s.score.p2).padStart(2, "0"),
    770,
    86,
    58,
    INK,
    "center",
    true,
  );
  text(ctx, ":", C.FIELD_CX, 84, 27, "#43515a", "center");
  text(ctx, `FIRST TO ${C.WIN_SCORE}`, 1232, 55, 12, MUTED, "right");
  text(ctx, `WIN BY ${C.WIN_LEAD}`, 1232, 77, 11, MUTED, "right");
  if (s.score.p1 >= C.WIN_SCORE - 1 || s.score.p2 >= C.WIN_SCORE - 1)
    text(
      ctx,
      Math.abs(s.score.p1 - s.score.p2) === 0 ? "DEUCE" : "MATCH POINT",
      C.FIELD_CX,
      142,
      12,
      AMBER,
      "center",
    );
}
function menu(ctx: Context, s: DeepReadonly<CaromState>): void {
  menuItems(s.screen).forEach((item, index) => {
    const r = menuItemRect(s, index);
    if (!r) return;
    const selected = s.menuIndex === index;
    ctx.fillStyle = selected ? MINT : "#101c25";
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 4);
    ctx.fill();
    if (!selected) {
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    text(
      ctx,
      `0${index + 1}`,
      r.x + 20,
      r.y + r.h / 2,
      12,
      selected ? "#396454" : "#63747f",
    );
    text(
      ctx,
      item,
      r.x + 60,
      r.y + r.h / 2,
      17,
      selected ? "#0c2820" : INK,
      "left",
      true,
    );
    text(
      ctx,
      selected ? "↗" : "+",
      r.x + r.w - 24,
      r.y + r.h / 2,
      22,
      selected ? "#0c2820" : "#63747f",
      "center",
    );
  });
}
function titleIllustration(ctx: Context): void {
  ctx.save();
  const cx = 918,
    cy = 343;
  ctx.strokeStyle = "#283b45";
  ctx.lineWidth = 1;
  for (const r of [136, 224]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([3, 8]);
  line(ctx, 672, cy, 1164, cy, "#354651");
  line(ctx, cx, 96, cx, 590, "#354651");
  ctx.setLineDash([]);
  for (const x of [690, 1146]) {
    line(ctx, x - 8, 116, x + 8, 116, "#617078");
    line(ctx, x, 108, x, 124, "#617078");
    line(ctx, x - 8, 570, x + 8, 570, "#617078");
    line(ctx, x, 562, x, 578, "#617078");
  }
  bar(ctx, 696, 332, 14, 104, MINT);
  bar(ctx, 1128, 220, 14, 104, CORAL);
  ctx.save();
  ctx.translate(858, 260);
  ctx.rotate(-0.48);
  bar(ctx, -8, -58, 16, 116, AMBER);
  ctx.restore();
  ctx.save();
  ctx.translate(978, 426);
  ctx.rotate(-0.48);
  bar(ctx, -8, -58, 16, 116, AMBER);
  ctx.restore();
  ctx.lineWidth = 2;
  ctx.strokeStyle = MINT;
  ctx.beginPath();
  ctx.moveTo(718, 380);
  ctx.bezierCurveTo(770, 382, 814, 358, 848, 316);
  ctx.bezierCurveTo(905, 305, 974, 231, 1084, 255);
  ctx.stroke();
  ctx.setLineDash([4, 7]);
  ctx.strokeStyle = "#627a76";
  ctx.beginPath();
  ctx.moveTo(1084, 255);
  ctx.quadraticCurveTo(1118, 263, 1128, 278);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowColor = INK;
  ctx.shadowBlur = 22;
  circle(ctx, 1084, 255, C.BALL_R, INK);
  ctx.shadowBlur = 0;
  text(ctx, "01 / THE ANGLE IS EVERYTHING", 918, 620, 11, MUTED, "center");
  text(ctx, "SPIN", 756, 449, 11, MINT);
  line(ctx, 767, 430, 789, 385, "#527a69");
  text(ctx, "CAROM / kăr′əm", 1012, 136, 11, AMBER, "center");
  ctx.restore();
}
function title(ctx: Context, s: DeepReadonly<CaromState>): void {
  text(ctx, "AN EXPERIMENT IN ANGLES", 116, 119, 12, MINT);
  // Wide, tightly set custom wordmark, with a small offset accent.
  text(ctx, C.TITLE_TEXT, 108, 214, 112, INK, "left", true);
  ctx.fillStyle = MINT;
  ctx.fillRect(116, 280, 40, 3);
  text(ctx, "A paddle duel. With a twist.", 116, 314, 20, MUTED);
  menu(ctx, s);
  text(ctx, "BEND THE FLIGHT.  PLAY THE BANK.", 116, 593, 11, MUTED);
  line(ctx, 587, 104, 587, 620);
  titleIllustration(ctx);
  footer(ctx, s, true);
}
function howto(ctx: Context, s: DeepReadonly<CaromState>): void {
  text(ctx, "THE FIELD GUIDE / 01", 116, 100, 12, MINT);
  text(ctx, "Make your own angle.", 112, 162, 50, INK, "left", true);
  const rows = [
    [
      "01",
      "MOVE",
      "W / S moves the left paddle. ↑ / ↓ moves the right.",
      "In Solo, either pair moves you. The machine takes the other side.",
    ],
    [
      "02",
      "BEND",
      "Strike while moving to put spin on the ball.",
      "Upward motion bends one way; downward motion bends the other.",
    ],
    [
      "03",
      "BANK",
      "The amber bars sway and turn. Use their faces.",
      `Send the ball past your opponent. First to ${C.WIN_SCORE}, with a ${C.WIN_LEAD}-point lead.`,
    ],
  ];
  rows.forEach(([n, heading, a, b], i) => {
    const y = 256 + i * 99;
    text(ctx, n, 116, y, 13, AMBER);
    text(ctx, heading, 166, y, 17, MINT, "left", true);
    text(ctx, a, 302, y - 2, 18, INK);
    text(ctx, b, 302, y + 26, 15, MUTED);
    line(ctx, 116, y + 56, 1164, y + 56);
  });
  text(
    ctx,
    "P / ESC   PAUSE       M   MUTE       `   DIAGNOSTICS",
    116,
    542,
    12,
  );
  menu(ctx, s);
  footer(ctx, s, true);
}
function overlay(ctx: Context, s: DeepReadonly<CaromState>): void {
  ctx.fillStyle = "rgba(6,13,19,0.83)";
  ctx.fillRect(0, 0, C.FIELD_W, C.FIELD_H);
  ctx.fillStyle = "#101c25";
  ctx.beginPath();
  ctx.roundRect(394, 180, 492, s.screen === "paused" ? 420 : 370, 8);
  ctx.fill();
  line(ctx, 422, 181, 858, 181, MINT, 2);
  text(
    ctx,
    s.screen === "paused" ? "TAKE A BREATHER" : "THE FINAL ANGLE",
    C.FIELD_CX,
    218,
    11,
    MINT,
    "center",
  );
  text(
    ctx,
    s.screen === "paused"
      ? "Paused."
      : `${s.winner === "left" ? "Player 01" : s.mode === "solo" ? "Machine" : "Player 02"} wins.`,
    C.FIELD_CX,
    271,
    42,
    INK,
    "center",
    true,
  );
  text(
    ctx,
    s.screen === "paused"
      ? "Your next shot can wait."
      : `${s.score.p1}  —  ${s.score.p2}    /    ${s.mode === "solo" ? "SOLO" : "VERSUS"}`,
    C.FIELD_CX,
    315,
    14,
    MUTED,
    "center",
  );
  menu(ctx, s);
  footer(ctx, s, true);
}
export function drawGame(s: DeepReadonly<CaromState>, api: RenderApi): void {
  const ctx = api.ctx;
  ctx.save();
  base(ctx);
  if (s.screen === "title") title(ctx, s);
  else if (s.screen === "howto") howto(ctx, s);
  else {
    furniture(ctx, s);
    scoreboard(ctx, s);
    if (s.screen === "paused" || s.screen === "matchover") overlay(ctx, s);
    else {
      footer(ctx, s);
      if (s.screen === "countdown" && s.ball) {
        text(ctx, "GET READY", C.FIELD_CX, 289, 12, MINT, "center");
        text(
          ctx,
          s.receiver === "left"
            ? "←  SERVING TO PLAYER 01"
            : `SERVING TO ${s.mode === "solo" ? "MACHINE" : "PLAYER 02"}  →`,
          C.FIELD_CX,
          421,
          11,
          MUTED,
          "center",
        );
        line(ctx, C.FIELD_CX - 45, 453, C.FIELD_CX + 45, 453);
        line(
          ctx,
          C.FIELD_CX - 45,
          453,
          C.FIELD_CX - 45 + 90 * Math.max(0, s.ball.holdTimer / C.HOLD_TIME),
          453,
          MINT,
          2,
        );
      }
    }
  }
  ctx.restore();
}
