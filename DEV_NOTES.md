# Pong Dev Notes

## Run the game (current behavior)
1. `npm install`
2. `npm start`
3. Open `http://localhost:3000/screen` for the shared screen.
4. Open `http://localhost:3000/controller` on phones to join.

## Entry points
- Screen HTML: `public/screen.html`
- Screen JS: `public/screen.js`
- Controller HTML: `public/controller.html`
- Controller JS: `public/controller.js`
- Server: `server.js`

## Demo mode (unchanged)
- On the screen page, click **Start demo**.
- Controls while demo is running:
  - Player 1: `W` (up) / `S` (down)
  - Player 2: Arrow Up / Arrow Down
- Click **Stop demo** to end the demo match.

## Game feel constants (authoritative server values)
Defined in `server.js` under `GAME`:
- Field: `width = 900`, `height = 500`
- Paddles: `paddleWidth = 12`, `paddleHeight = 90`, `paddleInset = 28`, `paddleSpeed = 420`
- Ball: `ballRadius = 8`, `ballSpeed = 320`, `ballSpeedIncrement = 14`, `ballMaxSpeed = 620`
- Win condition: `winScore = 3`
- Serve pause: `serveDelayMs = 900`

## Engine + renderer split (screen)
- Engine: `src/engine/GameEngine.js`
- Renderer: `src/render/CanvasRenderer.js`
- The screen loop calls `engine.update(dt, input)` then `renderer.render(engine.getState())`.
- Normalization uses the **paddle top edge** Y value, consistent with server state.

Status mapping used for broadcast:
- `demo` when demo match is active
- `serve` when the server reports `paused: true` (serve delay)
- `playing` otherwise during a match
- `gameover` when no match is active

## Broadcast to TouchDesigner (optional)
Broadcast is **OFF by default**.
- Enable by opening the screen with `?broadcast=1`:
  - Example: `http://localhost:3000/screen?broadcast=1`
- When enabled, the canvas shows a small **Broadcast ON** overlay.
- The browser sends JSON state to `ws://127.0.0.1:8081` at 30 fps.

### Broadcast JSON schema
```
{
  "t": <ms timestamp>,
  "status": "playing" | "paused" | "serve" | "gameover" | "demo",
  "field": { "w": <pixels>, "h": <pixels> },
  "ball": { "x01": <0..1>, "y01": <0..1> },
  "paddles": { "leftY01": <0..1>, "rightY01": <0..1>, "h01": <0..1> },
  "score": { "left": <int>, "right": <int> },
  "demo": <true|false>
}
```

## TD relay (WebSocket -> OSC)
- Relay server: `tools/td-relay/server.js`
- Dependencies: `ws`, `osc`

Run relay:
1. `npm install`
2. `node tools/td-relay/server.js`

Env vars:
- `TD_WS_PORT` (default `8081`)
- `TD_OSC_HOST` (default `127.0.0.1`)
- `TD_OSC_PORT` (default `9000`)

### OSC address scheme
Each update sends:
- `/pong/ball` x01 y01
- `/pong/paddleL` leftY01
- `/pong/paddleR` rightY01
- `/pong/score` leftScore rightScore
- `/pong/demo` 1 or 0
- `/pong/status` statusString

## TouchDesigner setup (no validation performed here)
- Add **OSC In CHOP**
- Set port to `9000`
- Expected channels map to the OSC messages above

## Validation without TouchDesigner
Terminal A:
1. `node tools/td-relay/osc-listen.js`

Terminal B:
2. `node tools/td-relay/server.js`

Browser:
3. Open `http://localhost:3000/screen?broadcast=1`

Expected results:
- Relay prints "client connected" and a summary line every 2 seconds with frame counts increasing.
- `osc-listen` prints messages like `/pong/ball` and `/pong/paddleL` continuously.
- Values change as the ball and paddles move.
- Scores update when someone scores.

## Troubleshooting
- **Port already in use**: change `TD_WS_PORT` or `TD_OSC_PORT` and retry.
- **WebSocket not opening**: confirm the relay is running and `?broadcast=1` is in the URL.
- **No OSC packets**: confirm relay is running, `osc-listen.js` uses the correct port, and firewalls allow UDP.
- **Broadcast overlay not showing**: confirm the URL includes `?broadcast=1` and refresh the screen page.
