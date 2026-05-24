// /opt/banner-webapp/scripts/adx-monitor-cron.js
// Run every 30 minutes via system cron
// Command: node /opt/banner-webapp/scripts/adx-monitor-cron.js
process.chdir('/opt/banner-webapp');
require('dotenv').config();
const http = require('http');

const req = http.request({
  hostname: 'localhost',
  port: 3001,
  path: '/api/adx/internal/monitor',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-internal-key': process.env.INTERNAL_KEY || 'adx_monitor_2026'
  }
}, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    console.log('[ADX Cron]', new Date().toISOString(), d);
    process.exit(0);
  });
});
req.on('error', e => {
  console.error('[ADX Cron error]', e.message);
  process.exit(1);
});
req.setTimeout(30000, () => {
  console.error('[ADX Cron] timeout');
  req.destroy();
  process.exit(1);
});
req.end();
