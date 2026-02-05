export default class GameEngine {
  constructor(config = {}) {
    this.config = {
      width: typeof config.width === 'number' ? config.width : 900,
      height: typeof config.height === 'number' ? config.height : 500,
      paddleWidth: typeof config.paddleWidth === 'number' ? config.paddleWidth : 12,
      paddleHeight: typeof config.paddleHeight === 'number' ? config.paddleHeight : 90,
      paddleInset: typeof config.paddleInset === 'number' ? config.paddleInset : 28,
      ballRadius: typeof config.ballRadius === 'number' ? config.ballRadius : 8
    };
    this.broadcastEnabled = Boolean(config.broadcastEnabled);
    this.reset();
  }

  reset() {
    const { width, height, paddleWidth, paddleHeight, paddleInset, ballRadius } = this.config;
    this.matchActive = false;
    this.demo = false;
    this.state = {
      width,
      height,
      paddleWidth,
      paddleHeight,
      paddleInset,
      ballRadius,
      leftPaddleY: (height - paddleHeight) / 2,
      rightPaddleY: (height - paddleHeight) / 2,
      ballX: width / 2,
      ballY: height / 2,
      leftScore: 0,
      rightScore: 0,
      paused: false
    };
  }

  update(dtSeconds, input = {}) {
    if (typeof input.broadcastEnabled === 'boolean') {
      this.broadcastEnabled = input.broadcastEnabled;
    }
    if (typeof input.matchActive === 'boolean') {
      this.matchActive = input.matchActive;
    }
    if (typeof input.isDemo === 'boolean') {
      this.demo = input.isDemo;
    }
    if (input && typeof input.serverState === 'object' && input.serverState) {
      this.applyServerState(input.serverState);
    }
    void dtSeconds;
  }

  applyServerState(serverState) {
    const next = { ...this.state };
    const copyNumber = (key) => {
      if (typeof serverState[key] === 'number' && Number.isFinite(serverState[key])) {
        next[key] = serverState[key];
      }
    };
    const copyBool = (key) => {
      if (typeof serverState[key] === 'boolean') {
        next[key] = serverState[key];
      }
    };

    copyNumber('width');
    copyNumber('height');
    copyNumber('paddleWidth');
    copyNumber('paddleHeight');
    copyNumber('paddleInset');
    copyNumber('ballRadius');
    copyNumber('leftPaddleY');
    copyNumber('rightPaddleY');
    copyNumber('ballX');
    copyNumber('ballY');
    copyNumber('leftScore');
    copyNumber('rightScore');
    copyBool('paused');

    this.state = next;
  }

  getState() {
    const width = typeof this.state.width === 'number' ? this.state.width : this.config.width;
    const height = typeof this.state.height === 'number' ? this.state.height : this.config.height;
    const paddleWidth =
      typeof this.state.paddleWidth === 'number' ? this.state.paddleWidth : this.config.paddleWidth;
    const paddleHeight =
      typeof this.state.paddleHeight === 'number' ? this.state.paddleHeight : this.config.paddleHeight;
    const paddleInset =
      typeof this.state.paddleInset === 'number' ? this.state.paddleInset : this.config.paddleInset;
    const ballRadius =
      typeof this.state.ballRadius === 'number' ? this.state.ballRadius : this.config.ballRadius;
    const leftPaddleY =
      typeof this.state.leftPaddleY === 'number'
        ? this.state.leftPaddleY
        : (height - paddleHeight) / 2;
    const rightPaddleY =
      typeof this.state.rightPaddleY === 'number'
        ? this.state.rightPaddleY
        : (height - paddleHeight) / 2;
    const ballX = typeof this.state.ballX === 'number' ? this.state.ballX : width / 2;
    const ballY = typeof this.state.ballY === 'number' ? this.state.ballY : height / 2;
    const leftScore = typeof this.state.leftScore === 'number' ? this.state.leftScore : 0;
    const rightScore = typeof this.state.rightScore === 'number' ? this.state.rightScore : 0;
    const paused = Boolean(this.state.paused);

    const ballX01 = width ? ballX / width : 0;
    const ballY01 = height ? ballY / height : 0;
    const leftPaddleY01 = height ? leftPaddleY / height : 0;
    const rightPaddleY01 = height ? rightPaddleY / height : 0;
    const paddleH01 = height ? paddleHeight / height : 0;

    let status = 'gameover';
    if (this.matchActive) {
      if (this.demo) {
        status = 'demo';
      } else if (paused) {
        status = 'serve';
      } else {
        status = 'playing';
      }
    }

    return {
      width,
      height,
      paddleWidth,
      paddleHeight,
      paddleInset,
      ballRadius,
      leftPaddleY,
      rightPaddleY,
      ballX,
      ballY,
      leftScore,
      rightScore,
      paused,
      matchActive: this.matchActive,
      demo: this.demo,
      status,
      broadcastEnabled: this.broadcastEnabled,
      ballX01,
      ballY01,
      leftPaddleY01,
      rightPaddleY01,
      paddleH01
    };
  }
}
