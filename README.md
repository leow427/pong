# Pong Arena (Screen + Mobile Controllers)

Two-player Pong with an authoritative Node.js server, a shared “screen” client that renders the game, and mobile “controller” clients that send input. The server manages the queue, matchmaking, physics, scoring, and win conditions. The screen only renders server state, and controllers only send input intent.

## Features

- Authoritative server-side game loop (60 FPS)
- Player queue + matchmaking with live queue updates
- Screen client renders game state on a canvas
- Mobile controller client with simple up/down controls
- Demo mode on the screen for quick local testing (keyboard)
- QR code for easy controller join

## Requirements

- Node.js 18+ recommended

## Install

```bash
npm install
```

## Run

```bash
npm start
```

Open the screen:

```
http://localhost:3000/screen
```

Open the controller:

```
http://localhost:3000/controller
```

Note: If you’re joining from phones, open the screen using your LAN IP (e.g. `http://192.168.1.12:3000/screen`) so the QR code points to a reachable address.

## How It Works

- Controllers register and get a stable `playerId` (stored in localStorage).
- Players join the queue; positions update in real time.
- When a screen is available and at least two players are queued, the server starts a match.
- The server runs the physics loop and broadcasts state to the screen.
- Controllers send movement intent only; no client-side simulation.

## Demo Mode (Keyboard)

On the screen page, click **Start demo** to spawn a demo match controlled by the screen keyboard:

- Player 1: `W` (up), `S` (down)
- Player 2: Arrow Up / Arrow Down

Click **Stop demo** to end the demo match.

## Game Rules

- First player to reach **3 points** wins the match.
- Paddle rebound angle is based on where the ball hits the paddle.
- After each point, the ball and paddles reset with a short serve delay.

## Project Structure

```
.
+-- server.js
+-- package.json
+-- public
    +-- screen.html
    +-- screen.js
    +-- controller.html
    +-- controller.js
    +-- style.css
```

## Scripts

- `npm start` — start the server

## Troubleshooting

- If controllers can’t connect from phones, make sure your machine firewall allows inbound connections on port 3000.
- Use your LAN IP address (not `localhost`) for the screen so the QR code works on other devices.

