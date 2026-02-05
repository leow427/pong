export default class CanvasRenderer {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;
  }

  render(state) {
    if (!state || !state.matchActive) {
      this.drawWaiting(state);
    } else {
      this.drawField(state);
    }

    if (state && state.broadcastEnabled) {
      this.drawBroadcastBadge();
    }
  }

  drawWaiting(state) {
    const width = state && state.width ? state.width : this.canvas.width;
    const height = state && state.height ? state.height : this.canvas.height;
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.fillStyle = '#040b0f';
    this.ctx.fillRect(0, 0, width, height);
    this.ctx.fillStyle = 'rgba(248, 250, 252, 0.6)';
    this.ctx.font = '24px Impact, sans-serif';
    this.ctx.fillText('Waiting for players...', 24, 40);
  }

  drawField(state) {
    this.ctx.clearRect(0, 0, state.width, state.height);
    this.ctx.fillStyle = '#040b0f';
    this.ctx.fillRect(0, 0, state.width, state.height);

    this.ctx.strokeStyle = 'rgba(248, 250, 252, 0.18)';
    this.ctx.setLineDash([10, 12]);
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(state.width / 2, 0);
    this.ctx.lineTo(state.width / 2, state.height);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    this.ctx.fillStyle = '#f8fafc';
    this.ctx.fillRect(state.paddleInset, state.leftPaddleY, state.paddleWidth, state.paddleHeight);
    this.ctx.fillRect(
      state.width - state.paddleInset - state.paddleWidth,
      state.rightPaddleY,
      state.paddleWidth,
      state.paddleHeight
    );

    this.ctx.fillStyle = '#fbbf24';
    this.ctx.beginPath();
    this.ctx.arc(state.ballX, state.ballY, state.ballRadius, 0, Math.PI * 2);
    this.ctx.fill();
  }

  drawBroadcastBadge() {
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(248, 250, 252, 0.85)';
    this.ctx.font = '12px Impact, sans-serif';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText('Broadcast ON', 12, 12);
    this.ctx.restore();
  }
}
