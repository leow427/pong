// Pong server
// - Serves the screen/controller clients
// - Manages player queue, matchmaking, and screens
// - Runs authoritative game simulation
// - Streams state to screens and score updates to controllers
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const qrcode = require('qrcode');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');
const srcDir = path.join(__dirname, 'src');

// Serve static assets (screen/controller clients)
app.use(express.static(publicDir));
app.use('/src', express.static(srcDir));

// Main routes
app.get('/', (req, res) => res.redirect('/screen'));
app.get('/screen', (req, res) => res.sendFile(path.join(publicDir, 'screen.html')));
app.get('/controller', (req, res) => res.sendFile(path.join(publicDir, 'controller.html')));

// QR endpoint for controller join URL
app.get('/qr', async (req, res) => {
  try {
    const joinUrl = 'https://ebullient-lecia-handleless.ngrok-free.dev/controller';
    const png = await qrcode.toBuffer(joinUrl, { type: 'png', width: 260, margin: 1 });
    res.setHeader('Content-Type', 'image/png');
    res.send(png);
  } catch (err) {
    res.status(500).send('Failed to generate QR code');
  }
});

// Game constants
const GAME = {
  width: 900,
  height: 500,
  paddleWidth: 12,
  paddleHeight: 90,
  paddleInset: 28,
  paddleSpeed: 420,
  ballRadius: 8,
  ballSpeed: 320,
  ballSpeedIncrement: 14,
  ballMaxSpeed: 620,
  winScore: 3,
  serveDelayMs: 900,
  matchStartDelayMs: 4000
};

// Runtime state
// players: playerId -> { id, socketId, inQueue, matchId, name, isDemo? }
// queue: ordered list of waiting playerIds
// screens: socketId -> { id, socketId, available, matchId }
// matches: matchId -> match object
const players = new Map();
const queue = [];
const screens = new Map();
const matches = new Map();

// Create unique IDs for players/matches
function makeId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `p_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function sanitizeName(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().slice(0, 20);
  return trimmed.length ? trimmed : fallback;
}

// Resolve a Socket.IO socket instance by id
function getSocket(socketId) {
  return io.sockets.sockets.get(socketId);
}

// Safe emit to a player (if connected)
function sendToPlayer(playerId, event, payload) {
  const player = players.get(playerId);
  if (!player || !player.socketId) return;
  const socket = getSocket(player.socketId);
  if (socket) socket.emit(event, payload);
}

// Normalize controller input to -1, 0, 1
function normalizeMove(value) {
  if (value === 1 || value === '1') return 1;
  if (value === -1 || value === '-1') return -1;
  return 0;
}

// Broadcast each queued player's position and total queue length
function updateQueuePositions() {
  const total = queue.length;
  queue.forEach((playerId, index) => {
    const player = players.get(playerId);
    if (!player) return;
    sendToPlayer(playerId, 'queue_update', {
      position: index + 1,
      total,
      waitingForOpponent: total < 2
    });
  });
}

// Remove a player from queue and optionally notify them
function removeFromQueue(playerId, notify = true) {
  const index = queue.indexOf(playerId);
  if (index !== -1) {
    queue.splice(index, 1);
  }
  const player = players.get(playerId);
  if (player) player.inQueue = false;
  if (notify) sendToPlayer(playerId, 'queue_left', {});
  updateQueuePositions();
}

// Place ball at center and delay serve for a brief pause
function scheduleServe(match, direction, delayMs = GAME.serveDelayMs) {
  match.state.ballX = GAME.width / 2;
  match.state.ballY = GAME.height / 2;
  match.state.ballVX = 0;
  match.state.ballVY = 0;
  match.pendingServeDirection = direction;
  match.pausedUntil = Date.now() + delayMs;
}

// Apply initial ball velocity when a serve begins
function startServe(match) {
  const direction = match.pendingServeDirection || (Math.random() < 0.5 ? -1 : 1);
  const angle = (Math.random() * 0.7 - 0.35);
  const speed = GAME.ballSpeed;
  match.state.ballVX = Math.cos(angle) * speed * direction;
  match.state.ballVY = Math.sin(angle) * speed;
  match.pendingServeDirection = null;
}

// Reset paddles + schedule a new serve after a point
function resetMatchPositions(match, serveDirection, delayMs = GAME.serveDelayMs) {
  match.state.leftPaddleY = (GAME.height - GAME.paddleHeight) / 2;
  match.state.rightPaddleY = (GAME.height - GAME.paddleHeight) / 2;
  scheduleServe(match, serveDirection, delayMs);
}

// Create a match and assign it to a screen
// options.isDemo: demo match controlled by the screen keyboard
// options.controlSocketId: socket allowed to send demo inputs
function createMatch(screen, leftPlayerId, rightPlayerId, options = {}) {
  const matchId = makeId();
  const leftPlayer = players.get(leftPlayerId);
  const rightPlayer = players.get(rightPlayerId);
  const leftName = options.isDemo ? 'Demo Player 1' : 'Player 1';
  const rightName = options.isDemo ? 'Demo Player 2' : 'Player 2';
  const match = {
    id: matchId,
    screenId: screen.id,
    screenSocketId: screen.socketId,
    leftPlayerId,
    rightPlayerId,
    isDemo: Boolean(options.isDemo),
    controlSocketId: options.controlSocketId || null,
    leftName,
    rightName,
    inputs: {
      left: 0,
      right: 0
    },
    state: {
      width: GAME.width,
      height: GAME.height,
      leftPaddleY: (GAME.height - GAME.paddleHeight) / 2,
      rightPaddleY: (GAME.height - GAME.paddleHeight) / 2,
      ballX: GAME.width / 2,
      ballY: GAME.height / 2,
      ballVX: 0,
      ballVY: 0,
      leftScore: 0,
      rightScore: 0
    },
    pausedUntil: 0,
    pendingServeDirection: null,
    lastUpdate: process.hrtime.bigint(),
    interval: null
  };

  // Register match + lock the screen
  matches.set(matchId, match);
  screen.available = false;
  screen.matchId = matchId;

  if (leftPlayer) leftPlayer.matchId = matchId;
  if (rightPlayer) rightPlayer.matchId = matchId;

  // Start with a fresh serve
  resetMatchPositions(match, Math.random() < 0.5 ? -1 : 1, match.isDemo ? GAME.serveDelayMs : GAME.matchStartDelayMs);

  const screenSocket = getSocket(screen.socketId);
  if (screenSocket) {
    screenSocket.emit('match_start', {
      matchId,
      leftPlayerId,
      rightPlayerId,
      leftName,
      rightName,
      state: serializeState(match),
      isDemo: match.isDemo
    });
  }

  sendToPlayer(leftPlayerId, 'match_start', {
    matchId,
    side: 'left',
    opponentId: rightPlayerId,
    playerName: leftName,
    opponentName: rightName,
    scores: { left: 0, right: 0 }
  });

  sendToPlayer(rightPlayerId, 'match_start', {
    matchId,
    side: 'right',
    opponentId: leftPlayerId,
    playerName: rightName,
    opponentName: leftName,
    scores: { left: 0, right: 0 }
  });

  // Fixed tick loop (authoritative simulation)
  match.interval = setInterval(() => stepMatch(match), 1000 / 60);
}

// Build a minimal state payload for the screen renderer
function serializeState(match) {
  return {
    width: GAME.width,
    height: GAME.height,
    paddleWidth: GAME.paddleWidth,
    paddleHeight: GAME.paddleHeight,
    paddleInset: GAME.paddleInset,
    ballRadius: GAME.ballRadius,
    leftPaddleY: match.state.leftPaddleY,
    rightPaddleY: match.state.rightPaddleY,
    ballX: match.state.ballX,
    ballY: match.state.ballY,
    leftScore: match.state.leftScore,
    rightScore: match.state.rightScore,
    paused: Boolean(match.pausedUntil && Date.now() < match.pausedUntil)
  };
}

// Push state to the bound screen
function broadcastState(match) {
  const screenSocket = getSocket(match.screenSocketId);
  if (screenSocket) {
    screenSocket.emit('match_state', serializeState(match));
  }
}

// Notify controllers of score updates (minimal UI state)
function sendScoreUpdate(match) {
  sendToPlayer(match.leftPlayerId, 'score_update', {
    left: match.state.leftScore,
    right: match.state.rightScore
  });
  sendToPlayer(match.rightPlayerId, 'score_update', {
    left: match.state.leftScore,
    right: match.state.rightScore
  });
}

// End a match, clean up, and try to matchmake the next game
function endMatch(matchId, reason, winnerId) {
  const match = matches.get(matchId);
  if (!match) return;

  if (match.interval) clearInterval(match.interval);
  matches.delete(matchId);

  const winnerName = winnerId === match.leftPlayerId
    ? match.leftName
    : winnerId === match.rightPlayerId
      ? match.rightName
      : null;

  const screen = screens.get(match.screenSocketId);
  if (screen) {
    screen.available = true;
    screen.matchId = null;
    const screenSocket = getSocket(screen.socketId);
    if (screenSocket) {
      screenSocket.emit('match_end', {
        matchId,
        winnerId,
        winnerName,
        reason,
        isDemo: match.isDemo,
        scores: {
          left: match.state.leftScore,
          right: match.state.rightScore
        }
      });
    }
  }

  const leftPlayer = players.get(match.leftPlayerId);
  const rightPlayer = players.get(match.rightPlayerId);
  if (leftPlayer) leftPlayer.matchId = null;
  if (rightPlayer) rightPlayer.matchId = null;
  if (leftPlayer && leftPlayer.isDemo) players.delete(match.leftPlayerId);
  if (rightPlayer && rightPlayer.isDemo) players.delete(match.rightPlayerId);

  sendToPlayer(match.leftPlayerId, 'match_end', {
    matchId,
    winnerId,
    winnerName,
    reason,
    scores: {
      left: match.state.leftScore,
      right: match.state.rightScore
    }
  });

  sendToPlayer(match.rightPlayerId, 'match_end', {
    matchId,
    winnerId,
    winnerName,
    reason,
    scores: {
      left: match.state.leftScore,
      right: match.state.rightScore
    }
  });

  tryMatchmake();
}

// Physics + scoring loop
function stepMatch(match) {
  const now = process.hrtime.bigint();
  let dt = Number(now - match.lastUpdate) / 1e9;
  match.lastUpdate = now;
  if (dt > 0.05) dt = 0.05;

  const state = match.state;

  state.leftPaddleY += match.inputs.left * GAME.paddleSpeed * dt;
  state.rightPaddleY += match.inputs.right * GAME.paddleSpeed * dt;

  state.leftPaddleY = Math.max(0, Math.min(GAME.height - GAME.paddleHeight, state.leftPaddleY));
  state.rightPaddleY = Math.max(0, Math.min(GAME.height - GAME.paddleHeight, state.rightPaddleY));

  // During pause, only broadcast positions (ball stays centered)
  if (match.pausedUntil && Date.now() < match.pausedUntil) {
    broadcastState(match);
    return;
  }

  // Serve at end of pause
  if (match.pausedUntil) {
    match.pausedUntil = 0;
    startServe(match);
  }

  state.ballX += state.ballVX * dt;
  state.ballY += state.ballVY * dt;

  // Top/bottom wall collisions
  if (state.ballY - GAME.ballRadius <= 0 && state.ballVY < 0) {
    state.ballY = GAME.ballRadius;
    state.ballVY *= -1;
  }

  if (state.ballY + GAME.ballRadius >= GAME.height && state.ballVY > 0) {
    state.ballY = GAME.height - GAME.ballRadius;
    state.ballVY *= -1;
  }

  const leftPaddleX = GAME.paddleInset;
  const rightPaddleX = GAME.width - GAME.paddleInset - GAME.paddleWidth;

  // Paddle collisions: left paddle
  if (state.ballVX < 0) {
    const ballLeft = state.ballX - GAME.ballRadius;
    const ballRight = state.ballX + GAME.ballRadius;
    const ballTop = state.ballY - GAME.ballRadius;
    const ballBottom = state.ballY + GAME.ballRadius;

    if (
      ballRight >= leftPaddleX &&
      ballLeft <= leftPaddleX + GAME.paddleWidth &&
      ballBottom >= state.leftPaddleY &&
      ballTop <= state.leftPaddleY + GAME.paddleHeight
    ) {
      const paddleCenter = state.leftPaddleY + GAME.paddleHeight / 2;
      const intersect = (state.ballY - paddleCenter) / (GAME.paddleHeight / 2);
      const clamped = Math.max(-1, Math.min(1, intersect));
      const bounceAngle = clamped * (Math.PI / 3);
      const speed = Math.min(
        GAME.ballMaxSpeed,
        Math.hypot(state.ballVX, state.ballVY) + GAME.ballSpeedIncrement
      );
      state.ballVX = Math.cos(bounceAngle) * speed;
      state.ballVY = Math.sin(bounceAngle) * speed;
      state.ballX = leftPaddleX + GAME.paddleWidth + GAME.ballRadius;
    }
  // Paddle collisions: right paddle
  } else if (state.ballVX > 0) {
    const ballLeft = state.ballX - GAME.ballRadius;
    const ballRight = state.ballX + GAME.ballRadius;
    const ballTop = state.ballY - GAME.ballRadius;
    const ballBottom = state.ballY + GAME.ballRadius;

    if (
      ballLeft <= rightPaddleX + GAME.paddleWidth &&
      ballRight >= rightPaddleX &&
      ballBottom >= state.rightPaddleY &&
      ballTop <= state.rightPaddleY + GAME.paddleHeight
    ) {
      const paddleCenter = state.rightPaddleY + GAME.paddleHeight / 2;
      const intersect = (state.ballY - paddleCenter) / (GAME.paddleHeight / 2);
      const clamped = Math.max(-1, Math.min(1, intersect));
      const bounceAngle = clamped * (Math.PI / 3);
      const speed = Math.min(
        GAME.ballMaxSpeed,
        Math.hypot(state.ballVX, state.ballVY) + GAME.ballSpeedIncrement
      );
      state.ballVX = -Math.cos(bounceAngle) * speed;
      state.ballVY = Math.sin(bounceAngle) * speed;
      state.ballX = rightPaddleX - GAME.ballRadius;
    }
  }

  // Score events (ball passes off-screen)
  if (state.ballX + GAME.ballRadius < 0) {
    state.rightScore += 1;
    sendScoreUpdate(match);
    if (state.rightScore >= GAME.winScore) {
      endMatch(match.id, 'score_limit', match.rightPlayerId);
      return;
    }
    resetMatchPositions(match, -1);
  }

  if (state.ballX - GAME.ballRadius > GAME.width) {
    state.leftScore += 1;
    sendScoreUpdate(match);
    if (state.leftScore >= GAME.winScore) {
      endMatch(match.id, 'score_limit', match.leftPlayerId);
      return;
    }
    resetMatchPositions(match, 1);
  }

  broadcastState(match);
}

// Pair queued players with available screens
function tryMatchmake() {
  const availableScreens = Array.from(screens.values()).filter((screen) => screen.available);
  while (queue.length >= 2 && availableScreens.length > 0) {
    const screen = availableScreens.shift();
    const leftPlayerId = queue.shift();
    const rightPlayerId = queue.shift();
    if (!players.has(leftPlayerId) || !players.has(rightPlayerId)) {
      if (leftPlayerId && players.has(leftPlayerId)) players.get(leftPlayerId).inQueue = false;
      if (rightPlayerId && players.has(rightPlayerId)) players.get(rightPlayerId).inQueue = false;
      continue;
    }
    players.get(leftPlayerId).inQueue = false;
    players.get(rightPlayerId).inQueue = false;
    createMatch(screen, leftPlayerId, rightPlayerId);
  }
  updateQueuePositions();
}

// Socket.IO event handlers
io.on('connection', (socket) => {
  // Controller registration (restore or create player ID)
  socket.on('register_controller', (payload = {}) => {
    const requestedId = typeof payload.playerId === 'string' ? payload.playerId : null;
    let player = requestedId ? players.get(requestedId) : null;

    if (!player) {
      const newId = makeId();
      player = {
        id: newId,
        socketId: socket.id,
        inQueue: false,
        matchId: null,
        name: 'Player'
      };
      players.set(newId, player);
    } else {
      player.socketId = socket.id;
    }

    socket.data.role = 'controller';
    socket.data.playerId = player.id;

    socket.emit('player_registered', { playerId: player.id });

    if (player.inQueue) {
      updateQueuePositions();
    }
  });


  // Join matchmaking queue
  socket.on('join_queue', () => {
    const playerId = socket.data.playerId;
    if (!playerId || !players.has(playerId)) return;
    const player = players.get(playerId);

    if (player.matchId) {
      socket.emit('queue_error', { message: 'Already in a match.' });
      return;
    }

    if (player.inQueue) {
      socket.emit('queue_error', { message: 'Already queued.' });
      return;
    }

    player.inQueue = true;
    queue.push(playerId);
    updateQueuePositions();
    tryMatchmake();
  });

  // Leave matchmaking queue
  socket.on('leave_queue', () => {
    const playerId = socket.data.playerId;
    if (!playerId) return;
    removeFromQueue(playerId, true);
  });

  // Controller input during match
  socket.on('player_input', (payload = {}) => {
    const playerId = socket.data.playerId;
    if (!playerId) return;
    const player = players.get(playerId);
    if (!player || !player.matchId) return;
    const match = matches.get(player.matchId);
    if (!match) return;

    const move = normalizeMove(payload.move);
    if (playerId === match.leftPlayerId) {
      match.inputs.left = move;
    } else if (playerId === match.rightPlayerId) {
      match.inputs.right = move;
    }
  });

  // Screen registration (renders match state)
  socket.on('register_screen', () => {
    const screen = {
      id: socket.id,
      socketId: socket.id,
      available: true,
      matchId: null
    };

    screens.set(socket.id, screen);
    socket.data.role = 'screen';

    socket.emit('screen_registered', { screenId: screen.id });
    tryMatchmake();
  });

  // Start demo match (screen keyboard controls both sides)
  socket.on('demo_start', () => {
    const screen = screens.get(socket.id);
    if (!screen) {
      socket.emit('demo_error', { message: 'Screen not registered.' });
      return;
    }
    if (!screen.available || screen.matchId) {
      socket.emit('demo_error', { message: 'Screen is busy.' });
      return;
    }

    const leftPlayerId = makeId();
    const rightPlayerId = makeId();

    players.set(leftPlayerId, {
      id: leftPlayerId,
      socketId: null,
      inQueue: false,
      matchId: null,
      isDemo: true,
      name: 'Demo Player 1'
    });

    players.set(rightPlayerId, {
      id: rightPlayerId,
      socketId: null,
      inQueue: false,
      matchId: null,
      isDemo: true,
      name: 'Demo Player 2'
    });

    createMatch(screen, leftPlayerId, rightPlayerId, { isDemo: true, controlSocketId: socket.id });
  });

  // Demo input (side + direction)
  socket.on('demo_input', (payload = {}) => {
    const screen = screens.get(socket.id);
    if (!screen || !screen.matchId) return;
    const match = matches.get(screen.matchId);
    if (!match || !match.isDemo || match.controlSocketId !== socket.id) return;

    const move = normalizeMove(payload.move);
    if (payload.side === 'left') {
      match.inputs.left = move;
    } else if (payload.side === 'right') {
      match.inputs.right = move;
    }
  });

  // Stop demo match early
  socket.on('demo_stop', () => {
    const screen = screens.get(socket.id);
    if (!screen || !screen.matchId) return;
    const match = matches.get(screen.matchId);
    if (!match || !match.isDemo) return;
    endMatch(match.id, 'demo_stopped', null);
  });

  // Cleanup on disconnect
  socket.on('disconnect', () => {
    const role = socket.data.role;
    if (role === 'controller') {
      const playerId = socket.data.playerId;
      const player = playerId ? players.get(playerId) : null;
      if (!player) return;

      if (player.inQueue) {
        removeFromQueue(playerId, false);
      }

      if (player.matchId) {
        const match = matches.get(player.matchId);
        if (match) {
          const winnerId = match.leftPlayerId === playerId ? match.rightPlayerId : match.leftPlayerId;
          endMatch(match.id, 'player_disconnected', winnerId);
        }
      }

      player.socketId = null;
      return;
    }

    if (role === 'screen') {
      const screen = screens.get(socket.id);
      screens.delete(socket.id);
      if (screen && screen.matchId) {
        endMatch(screen.matchId, 'screen_disconnected', null);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Pong server running on http://localhost:${PORT}`);
});
