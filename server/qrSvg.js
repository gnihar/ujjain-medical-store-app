const qrcode = require('../public/js/qrcode.js');

function makeQrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(String(text || ''));
  qr.make();
  return qr.createSvgTag({ cellSize: 8, margin: 16, scalable: true });
}

module.exports = { makeQrSvg };
