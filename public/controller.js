const socket = io();

const connectionEl = document.getElementById('connection');
const playerIdEl = document.getElementById('player-id');
const queueStatusEl = document.getElementById('queue-status');
const queueErrorEl = document.getElementById('queue-error');
const joinBtn = document.getElementById('join-btn');
const leaveBtn = document.getElementById('leave-btn');
const sideLabelEl = document.getElementById('side-label');
const scoreLabelEl = document.getElementById('score-label');
const upBtn = document.getElementById('up-btn');
const downBtn = document.getElementById('down-btn');
const playerNameInput = document.getElementById('player-name');
const saveNameBtn = document.getElementById('save-name');
const nameStatusEl = document.getElementById('name-status');

let playerId = localStorage.getItem('pongPlayerId');
let playerName = localStorage.getItem('pongPlayerName') || '';
let inQueue = false;
let inMatch = false;
let currentMove = 0;
let side = null;

function setConnection(text) {
  connectionEl.textContent = text;
}

function setQueueStatus(text) {
  queueStatusEl.textContent = text;
}

function setNameStatus(text) {
  if (nameStatusEl) nameStatusEl.textContent = text;
}

function setScore(left, right) {
  scoreLabelEl.textContent = `Score: ${left} - ${right}`;
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
  updateControlState();
  sideLabelEl.textContent = message || 'Waiting for match...';
  if (!message) setScore(0, 0);
}

function updateQueueButtons() {
  const hasName = Boolean(playerName && playerName.trim().length);
  joinBtn.disabled = inQueue || inMatch || !hasName;
  leaveBtn.disabled = !inQueue;
}

socket.on('connect', () => {
  setConnection('Connected');
  socket.emit('register_controller', { playerId, name: playerName });
});

socket.on('disconnect', () => {
  setConnection('Disconnected');
});

socket.on('player_registered', (payload) => {
  playerId = payload.playerId;
  if (payload.name) {
    playerName = payload.name;
    localStorage.setItem('pongPlayerName', playerName);
  }
  localStorage.setItem('pongPlayerId', playerId);
  playerIdEl.textContent = playerId;
  if (playerNameInput) playerNameInput.value = playerName;
  setNameStatus(playerName ? 'Name saved.' : 'Set your name to join the queue.');
  updateQueueButtons();
});

socket.on('player_name_updated', (payload) => {
  if (payload.name) {
    playerName = payload.name;
    localStorage.setItem('pongPlayerName', playerName);
    if (playerNameInput) playerNameInput.value = playerName;
    setNameStatus('Name saved.');
    updateQueueButtons();
  }
});

socket.on('queue_update', (payload) => {
  inQueue = true;
  queueErrorEl.textContent = '';
  if (payload.waitingForOpponent) {
    setQueueStatus('Waiting for opponent');
  } else {
    setQueueStatus(`Position ${payload.position} of ${payload.total}`);
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
  setQueueStatus('Match started');
  queueErrorEl.textContent = '';
  const opponentName = payload.opponentName ? payload.opponentName : 'Opponent';
  sideLabelEl.textContent = `You are playing ${side.toUpperCase()} vs ${opponentName}`;
  setScore(payload.scores.left, payload.scores.right);
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
  setQueueStatus('Not in queue');
  updateQueueButtons();
});

joinBtn.addEventListener('click', () => {
  socket.emit('join_queue');
});

leaveBtn.addEventListener('click', () => {
  socket.emit('leave_queue');
  inQueue = false;
  setQueueStatus('Not in queue');
  updateQueueButtons();
});

function savePlayerName() {
  const nextName = playerNameInput ? playerNameInput.value.trim() : '';
  if (!nextName) {
    setNameStatus('Name cannot be empty.');
    return;
  }
  playerName = nextName.slice(0, 20);
  localStorage.setItem('pongPlayerName', playerName);
  socket.emit('set_player_name', { name: playerName });
  setNameStatus('Saving...');
  updateQueueButtons();
}

if (saveNameBtn) {
  saveNameBtn.addEventListener('click', savePlayerName);
}

if (playerNameInput) {
  playerNameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      savePlayerName();
    }
  });
}

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

if (playerNameInput) {
  playerNameInput.value = playerName;
  setNameStatus(playerName ? 'Name saved.' : 'Set your name to join the queue.');
}
