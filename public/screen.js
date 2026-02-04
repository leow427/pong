const socket = io();

const statusEl = document.getElementById('status');
const matchInfoEl = document.getElementById('match-info');
const scoreLeftEl = document.getElementById('score-left');
const scoreRightEl = document.getElementById('score-right');
const leftNameEl = document.getElementById('left-name');
const rightNameEl = document.getElementById('right-name');
const qrUrlEl = document.getElementById('qr-url');
const demoBtn = document.getElementById('demo-btn');
const demoStatusEl = document.getElementById('demo-status');
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let currentState = null;
const DEFAULT_WIDTH = 900;
const DEFAULT_HEIGHT = 500;
let demoActive = false;
let leftMove = 0;
let rightMove = 0;

function setStatus(text) {
  statusEl.textContent = text;
}

function setMatchInfo(text) {
  matchInfoEl.textContent = text;
}

function updateScores(left, right) {
  scoreLeftEl.textContent = left;
  scoreRightEl.textContent = right;
}

function updateNames(left, right) {
  if (leftNameEl) leftNameEl.textContent = left || 'Left Player';
  if (rightNameEl) rightNameEl.textContent = right || 'Right Player';
}

function setDemoStatus(text) {
  if (demoStatusEl) demoStatusEl.textContent = text;
}

function setDemoActive(active) {
  demoActive = active;
  if (demoBtn) {
    demoBtn.textContent = active ? 'Stop demo' : 'Start demo';
  }
}

function sizeCanvas(state) {
  canvas.width = state.width;
  canvas.height = state.height;

  const container = document.querySelector('.screen-canvas-wrap');
  const maxWidth = container.clientWidth - 32;
  const maxHeight = Math.max(300, window.innerHeight * 0.6);
  const scale = Math.min(maxWidth / state.width, maxHeight / state.height, 1.2);
  canvas.style.width = `${state.width * scale}px`;
  canvas.style.height = `${state.height * scale}px`;
}

function drawField(state) {
  ctx.clearRect(0, 0, state.width, state.height);
  ctx.fillStyle = '#040b0f';
  ctx.fillRect(0, 0, state.width, state.height);

  ctx.strokeStyle = 'rgba(248, 250, 252, 0.18)';
  ctx.setLineDash([10, 12]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(state.width / 2, 0);
  ctx.lineTo(state.width / 2, state.height);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(state.paddleInset, state.leftPaddleY, state.paddleWidth, state.paddleHeight);
  ctx.fillRect(
    state.width - state.paddleInset - state.paddleWidth,
    state.rightPaddleY,
    state.paddleWidth,
    state.paddleHeight
  );

  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(state.ballX, state.ballY, state.ballRadius, 0, Math.PI * 2);
  ctx.fill();
}

function render() {
  if (currentState) {
    drawField(currentState);
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#040b0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(248, 250, 252, 0.6)';
    ctx.font = '24px Impact, sans-serif';
    ctx.fillText('Waiting for players...', 24, 40);
  }
  requestAnimationFrame(render);
}

socket.on('connect', () => {
  socket.emit('register_screen');
});

socket.on('screen_registered', () => {
  setStatus('Screen connected. Waiting for players...');
});

socket.on('match_start', (payload) => {
  currentState = payload.state;
  sizeCanvas(currentState);
  updateScores(currentState.leftScore, currentState.rightScore);
  if (payload.isDemo) {
    setStatus('Demo match running');
    setMatchInfo('Demo match in progress.');
    setDemoActive(true);
    setDemoStatus('Demo running. W/S for Player 1, Arrow Up/Down for Player 2.');
    updateNames(payload.leftName || 'Demo Player 1', payload.rightName || 'Demo Player 2');
  } else {
    setDemoActive(false);
    setStatus('Match running');
    updateNames(payload.leftName, payload.rightName);
    setMatchInfo(`${payload.leftName || payload.leftPlayerId} vs ${payload.rightName || payload.rightPlayerId}`);
  }
});

socket.on('match_state', (state) => {
  currentState = state;
  updateScores(state.leftScore, state.rightScore);
});

socket.on('match_end', (payload) => {
  const winner = payload.winnerName || payload.winnerId;
  const statusText = winner ? `${winner} has won!` : 'Match ended';
  setStatus(statusText);
  setMatchInfo('Waiting for next match...');
  currentState = null;
  updateScores(0, 0);
  updateNames('Left Player', 'Right Player');
  if (payload.isDemo) {
    setDemoActive(false);
    leftMove = 0;
    rightMove = 0;
    setDemoStatus('Demo ended. You can start a new demo.');
  }
});

socket.on('demo_error', (payload) => {
  setDemoStatus(payload.message || 'Unable to start demo.');
});

window.addEventListener('resize', () => {
  if (currentState) sizeCanvas(currentState);
});

function emitDemoMove(side, move) {
  socket.emit('demo_input', { side, move });
}

function setDemoMove(side, move) {
  if (!demoActive) return;
  if (side === 'left') {
    if (leftMove === move) return;
    leftMove = move;
  } else {
    if (rightMove === move) return;
    rightMove = move;
  }
  emitDemoMove(side, move);
}

function requestDemoStart() {
  if (currentState) {
    setDemoStatus('Finish the current match before starting a demo.');
    return;
  }
  setDemoStatus('Starting demo...');
  socket.emit('demo_start');
}

function requestDemoStop() {
  if (!demoActive) return;
  emitDemoMove('left', 0);
  emitDemoMove('right', 0);
  leftMove = 0;
  rightMove = 0;
  setDemoActive(false);
  setDemoStatus('Stopping demo...');
  socket.emit('demo_stop');
}

if (demoBtn) {
  demoBtn.addEventListener('click', () => {
    if (demoActive) {
      requestDemoStop();
    } else {
      requestDemoStart();
    }
  });
}

window.addEventListener('keydown', (event) => {
  if (!demoActive) return;
  if (event.code === 'KeyW') {
    event.preventDefault();
    setDemoMove('left', -1);
  } else if (event.code === 'KeyS') {
    event.preventDefault();
    setDemoMove('left', 1);
  } else if (event.code === 'ArrowUp') {
    event.preventDefault();
    setDemoMove('right', -1);
  } else if (event.code === 'ArrowDown') {
    event.preventDefault();
    setDemoMove('right', 1);
  }
});

window.addEventListener('keyup', (event) => {
  if (!demoActive) return;
  if (event.code === 'KeyW' && leftMove === -1) {
    event.preventDefault();
    setDemoMove('left', 0);
  } else if (event.code === 'KeyS' && leftMove === 1) {
    event.preventDefault();
    setDemoMove('left', 0);
  } else if (event.code === 'ArrowUp' && rightMove === -1) {
    event.preventDefault();
    setDemoMove('right', 0);
  } else if (event.code === 'ArrowDown' && rightMove === 1) {
    event.preventDefault();
    setDemoMove('right', 0);
  }
});

qrUrlEl.textContent = `${window.location.origin}/controller`;

sizeCanvas({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
updateNames('Left Player', 'Right Player');
render();
