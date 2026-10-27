const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const apiRouter = require('./routes/api');
const { makeQrSvg } = require('./qrSvg');
const { GITHUB_RAW_APK, GITHUB_RELEASE_APK } = require('./apkLinks');

const app = express();
const PORT = process.env.PORT || 3456;
const publicDir = path.join(__dirname, '../public');

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

app.use('/api', apiRouter);

app.get('/download/UjjainMedStore-v1.0.apk', (_req, res) => {
  const apkPath = path.join(__dirname, '../UjjainMedStore-v1.0.apk');
  res.download(apkPath, 'UjjainMedStore-v1.0.apk');
});

function preferredBase(req) {
  const hostHeader = req.get('host') || `127.0.0.1:${PORT}`;
  const hostname = hostHeader.split(':')[0];
  const local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  if (!local) return `${req.protocol}://${hostHeader}`;
  return `http://127.0.0.1:${PORT}`;
}

function qrPayload(base) {
  const clean = String(base || '').replace(/\/$/, '');
  const apk = `${clean}/download/UjjainMedStore-v1.0.apk`;
  const web = `${clean}/`;
  const install = `${clean}/install?apk=${encodeURIComponent(apk)}&web=${encodeURIComponent(web)}`;
  return { apk, web, install };
}

app.get('/qr.svg', (req, res) => {
  const data = String(req.query.text || req.query.data || '').slice(0, 1800);
  if (!data) return res.status(400).type('text/plain').send('missing data');
  res.type('image/svg+xml').send(makeQrSvg(data));
});

app.get(['/qr', '/qr/'], (req, res) => {
  const hostHeader = req.get('host') || '';
  const hostname = hostHeader.split(':')[0];
  const local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  const base = String(req.query.base || preferredBase(req));
  const payload = qrPayload(base);
  const defaultTarget = local ? GITHUB_RAW_APK : payload.apk;
  let html = fs.readFileSync(path.join(publicDir, 'qr.html'), 'utf8');
  html = html.replace('<!--QRSVG-->', makeQrSvg(defaultTarget));
  html = html.replaceAll('__DEFAULT_QR__', defaultTarget);
  html = html.replaceAll('__GITHUB_APK__', GITHUB_RAW_APK);
  html = html.replaceAll('__RELEASE_APK__', GITHUB_RELEASE_APK);
  html = html.replaceAll('__LOCAL_APK__', payload.apk);
  html = html.replaceAll('__SUGGESTED_BASE__', base);
  html = html.replaceAll('__APK_URL__', defaultTarget);
  html = html.replaceAll('__WEB_URL__', payload.web);
  res.type('html').send(html);
});

app.get(['/install', '/install/'], (_req, res) => {
  res.sendFile(path.join(publicDir, 'install.html'));
});

app.use(express.static(publicDir));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', app: 'Akshay Medicose — Ujjain v2.1', time: new Date().toISOString() });
});

app.use((_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Akshay Medicose server running on http://0.0.0.0:${PORT}`);
});
