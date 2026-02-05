const osc = require('osc');

const LISTEN_PORT = Number.parseInt(process.env.LISTEN_PORT, 10) || 9000;

const udpPort = new osc.UDPPort({
  localAddress: '0.0.0.0',
  localPort: LISTEN_PORT,
  metadata: false
});

udpPort.on('ready', () => {
  console.log(`OSC listener on udp://0.0.0.0:${LISTEN_PORT}`);
});

udpPort.on('message', (message) => {
  const args = Array.isArray(message.args) ? message.args : [];
  const formatted = args.map((arg) => String(arg)).join(' ');
  console.log(`${message.address} ${formatted}`.trim());
});

udpPort.on('error', (err) => {
  console.error('OSC listen error:', err.message || err);
});

udpPort.open();
