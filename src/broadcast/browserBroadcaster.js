function clamp01(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function toNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return fallback;
}

export function createBroadcaster({ enabled = false, url = 'ws://127.0.0.1:8081', fps = 30 } = {}) {
  const config = {
    enabled: Boolean(enabled),
    url,
    fps: typeof fps === 'number' && fps > 0 ? fps : 30
  };

  let socket = null;
  let latestPayload = null;
  let warned = false;

  const warnOnce = (message) => {
    if (warned) return;
    warned = true;
    console.warn(message);
  };

  const connect = () => {
    try {
      socket = new WebSocket(config.url);
    } catch (err) {
      warnOnce('Broadcast: unable to create WebSocket connection.');
      return;
    }

    socket.addEventListener('error', () => {
      warnOnce('Broadcast: WebSocket connection failed.');
    });
  };

  const buildPayload = (state) => {
    const fieldW = toNumber(state.width, 0);
    const fieldH = toNumber(state.height, 0);
    return {
      t: Date.now(),
      status: state.status || 'playing',
      field: { w: fieldW, h: fieldH },
      ball: {
        x01: clamp01(state.ballX01),
        y01: clamp01(state.ballY01)
      },
      paddles: {
        leftY01: clamp01(state.leftPaddleY01),
        rightY01: clamp01(state.rightPaddleY01),
        h01: clamp01(state.paddleH01)
      },
      score: {
        left: Math.round(toNumber(state.leftScore, 0)),
        right: Math.round(toNumber(state.rightScore, 0))
      },
      demo: Boolean(state.demo)
    };
  };

  const sendLatest = () => {
    if (!latestPayload) return;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    try {
      socket.send(JSON.stringify(latestPayload));
    } catch (err) {
      warnOnce('Broadcast: failed to send state payload.');
    }
  };

  const capture = (state) => {
    if (!config.enabled || !state) return;
    latestPayload = buildPayload(state);
  };

  if (config.enabled) {
    connect();
    setInterval(sendLatest, 1000 / config.fps);
  }

  return {
    enabled: config.enabled,
    capture
  };
}
