const { WebSocketServer } = require('ws');
const osc = require('osc');

const WS_PORT = Number.parseInt(process.env.TD_WS_PORT, 10) || 8081;
const OSC_HOST = process.env.TD_OSC_HOST || '127.0.0.1';
const OSC_PORT = Number.parseInt(process.env.TD_OSC_PORT, 10) || 9000;

const udpPort = new osc.UDPPort({
  localAddress: '0.0.0.0',
  localPort: 0,
  remoteAddress: OSC_HOST,
  remotePort: OSC_PORT,
  metadata: false
});

udpPort.on('error', (err) => {
  console.error('OSC UDP error:', err.message || err);
});

udpPort.open();

const wss = new WebSocketServer({
  host: '127.0.0.1',
  port: WS_PORT
});

let framesSinceReport = 0;
let lastState = null;

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseState(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const ball = payload.ball || {};
  const paddles = payload.paddles || {};
  const score = payload.score || {};

  if (!isNumber(ball.x01) || !isNumber(ball.y01)) return null;
  if (!isNumber(paddles.leftY01) || !isNumber(paddles.rightY01)) return null;
  if (!isNumber(score.left) || !isNumber(score.right)) return null;

  return {
    ballX: ball.x01,
    ballY: ball.y01,
    leftY: paddles.leftY01,
    rightY: paddles.rightY01,
    leftScore: score.left,
    rightScore: score.right,
    demo: payload.demo ? 1 : 0,
    status: typeof payload.status === 'string' ? payload.status : 'unknown'
  };
}

function sendOsc(address, args) {
  udpPort.send({ address, args });
}

wss.on('connection', (ws) => {
  console.log('client connected');

  ws.on('message', (data) => {
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch (err) {
      return;
    }

    const state = parseState(parsed);
    if (!state) return;

    lastState = state;
    framesSinceReport += 1;

    sendOsc('/pong/ball', [state.ballX, state.ballY]);
    sendOsc('/pong/paddleL', [state.leftY]);
    sendOsc('/pong/paddleR', [state.rightY]);
    sendOsc('/pong/score', [state.leftScore, state.rightScore]);
    sendOsc('/pong/demo', [state.demo]);
    sendOsc('/pong/status', [state.status]);
  });

  ws.on('close', () => {
    console.log('client disconnected');
  });
});

setInterval(() => {
  const snapshot = lastState;
  if (!snapshot) {
    console.log(`summary: frames=${framesSinceReport} (no state yet)`);
  } else {
    const ball = `ball=(${snapshot.ballX.toFixed(3)}, ${snapshot.ballY.toFixed(3)})`;
    const paddles = `paddles=(${snapshot.leftY.toFixed(3)}, ${snapshot.rightY.toFixed(3)})`;
    const score = `score=(${snapshot.leftScore}, ${snapshot.rightScore})`;
    console.log(`summary: frames=${framesSinceReport} ${ball} ${paddles} ${score} demo=${snapshot.demo} status=${snapshot.status}`);
  }
  framesSinceReport = 0;
}, 2000);

console.log(`TD relay listening on ws://127.0.0.1:${WS_PORT}`);
console.log(`Forwarding OSC to udp://${OSC_HOST}:${OSC_PORT}`);
