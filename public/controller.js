const socket = io();

const connectionEl = document.getElementById('connection');
const queueStatusEl = document.getElementById('queue-status');
const queueErrorEl = document.getElementById('queue-error');
const joinBtn = document.getElementById('join-btn');
const leaveBtn = document.getElementById('leave-btn');
const sideLabelEl = document.getElementById('side-label');
const scoreLabelEl = document.getElementById('score-label');
const upBtn = document.getElementById('up-btn');
const downBtn = document.getElementById('down-btn');
const readyOverlayEl = document.getElementById('ready-overlay');
const readyOverlayMessageEl = document.getElementById('ready-overlay-message');

const READY_OVERLAY_MS = 2200;

let playerId = localStorage.getItem('pongPlayerId');
let inQueue = false;
let inMatch = false;
let currentMove = 0;
let side = null;
let readyOverlayTimer = null;

function setConnection(text) {
  connectionEl.textContent = text;
}

function setQueueStatus(text) {
  queueStatusEl.textContent = text;
}

function setScore(left, right) {
  scoreLabelEl.textContent = `Score: ${left} - ${right}`;
}

function getPlayerLabel(matchSide) {
  return matchSide === 'left' ? 'Player 1' : 'Player 2';
}

function getQueueLabel(position) {
  return `You are #${position} in queue`;
}

function hideReadyOverlay() {
  if (!readyOverlayEl) return;
  readyOverlayEl.classList.remove('active');
}

function showReadyOverlay(matchSide) {
  if (!readyOverlayEl || !readyOverlayMessageEl) return;
  const playerLabel = getPlayerLabel(matchSide);
  readyOverlayMessageEl.textContent = `Get Ready! You are ${playerLabel}!`;
  readyOverlayEl.classList.add('active');
  if (readyOverlayTimer) clearTimeout(readyOverlayTimer);
  readyOverlayTimer = setTimeout(() => {
    hideReadyOverlay();
    readyOverlayTimer = null;
  }, READY_OVERLAY_MS);
}

function setMove(direction) {
  if (!inMatch) return;
  if (direction === currentMove) return;
  currentMove = direction;
  socket.emit('player_input', { move: direction });
  updateControlState();
}

function updateControlState() {
  upBtn.classList.toggle('active', currentMove === -1);
  downBtn.classList.toggle('active', currentMove === 1);
}

function resetMatchUI(message) {
  inMatch = false;
  side = null;
  currentMove = 0;
  hideReadyOverlay();
  updateControlState();
  sideLabelEl.textContent = message || 'Waiting for match...';
  if (!message) setScore(0, 0);
}

function updateQueueButtons() {
  joinBtn.disabled = inQueue || inMatch;
  leaveBtn.disabled = !inQueue;
}

socket.on('connect', () => {
  setConnection('Connected');
  socket.emit('register_controller', { playerId });
});

socket.on('disconnect', () => {
  setConnection('Disconnected');
  hideReadyOverlay();
});

socket.on('player_registered', (payload) => {
  playerId = payload.playerId;
  localStorage.setItem('pongPlayerId', playerId);
  updateQueueButtons();
});

socket.on('queue_update', (payload) => {
  inQueue = true;
  queueErrorEl.textContent = '';
  const queueLabel = getQueueLabel(payload.position);
  if (payload.waitingForOpponent) {
    setQueueStatus(`${queueLabel}. Waiting for opponent.`);
  } else {
    setQueueStatus(`${queueLabel} of ${payload.total}.`);
  }
  updateQueueButtons();
});

socket.on('queue_error', (payload) => {
  queueErrorEl.textContent = payload.message || 'Queue error.';
});

socket.on('match_start', (payload) => {
  inMatch = true;
  inQueue = false;
  side = payload.side;
  queueErrorEl.textContent = '';
  setQueueStatus('Game starts when the ball starts moving.');
  sideLabelEl.textContent = `You are ${getPlayerLabel(side)}.`;
  setScore(payload.scores.left, payload.scores.right);
  showReadyOverlay(side);
  updateQueueButtons();
});

socket.on('score_update', (payload) => {
  setScore(payload.left, payload.right);
});

socket.on('match_end', (payload) => {
  const winner = payload.winnerName || payload.winnerId || 'No winner';
  setScore(payload.scores.left, payload.scores.right);
  resetMatchUI(`${winner} has won!`);
  setQueueStatus('Not in queue');
  updateQueueButtons();
});

socket.on('queue_left', () => {
  inQueue = false;
  hideReadyOverlay();
  setQueueStatus('Not in queue');
  updateQueueButtons();
});

joinBtn.addEventListener('click', () => {
  socket.emit('join_queue');
});

leaveBtn.addEventListener('click', () => {
  socket.emit('leave_queue');
  inQueue = false;
  hideReadyOverlay();
  setQueueStatus('Not in queue');
  updateQueueButtons();
});

function bindControl(button, direction) {
  const start = (event) => {
    event.preventDefault();
    setMove(direction);
  };
  const end = (event) => {
    event.preventDefault();
    if (currentMove === direction) setMove(0);
  };

  button.addEventListener('pointerdown', start);
  button.addEventListener('pointerup', end);
  button.addEventListener('pointerleave', end);
  button.addEventListener('pointercancel', end);
}

bindControl(upBtn, -1);
bindControl(downBtn, 1);

window.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowUp') {
    setMove(-1);
  }
  if (event.key === 'ArrowDown') {
    setMove(1);
  }
});

window.addEventListener('keyup', (event) => {
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    setMove(0);
  }
});

updateQueueButtons();
resetMatchUI();