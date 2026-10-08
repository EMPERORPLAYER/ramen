'use strict';

/* RAMEN HABARU — payment API server (zero dependencies, Node 18+) */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json'
};

function loadEnv(file) {
  const out = {};
  try {
    fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach(function (line) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) return;
      let v = m[2];
      if ((v[0] === '"' && v[v.length - 1] === '"') || (v[0] === "'" && v[v.length - 1] === "'")) {
        v = v.slice(1, -1);
      }
      out[m[1]] = v;
    });
  } catch (e) {}
  return Object.assign(out, process.env);
}

const env = loadEnv(path.join(ROOT, '.env'));
const PORT = parseInt(env.PORT || '8080', 10);
const BASE_URL = String(env.BASE_URL || ('http://localhost:' + PORT)).replace(/\/+$/, '');
const SITE_DIR = env.SITE_DIR ? path.resolve(env.SITE_DIR) : ROOT;

const MONO = {
  token: env.MONO_TOKEN || '',
  secret: env.MONO_WEBHOOK_SECRET || ''
};
const P24 = {
  id: env.P24_MERCHANT_ID || '',
  pass: env.P24_MERCHANT_PASSWORD || '',
  sandbox: /^(1|true|yes|on)$/i.test(env.P24_SANDBOX || ''),
  verify: env.P24_VERIFY_SIGN !== '0'
};

const LOG = function () {
  console.log.apply(console, ['[' + new Date().toISOString() + ']'].concat([].slice.call(arguments)));
};

/* ---------------- orders ---------------- */
let orders = {};

function loadOrders() {
  try {
    orders = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8')) || {};
  } catch (e) {
    orders = {};
  }
}

function saveOrder(o) {
  orders[o.id] = o;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
  } catch (e) {
    LOG('orders write failed:', e.message);
  }
}

function genId() {
  return 'HB-' + Math.floor(1000 + Math.random() * 8999);
}

function sanitizeId(v) {
  const s = String(v || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 32);
  return s;
}

function now() {
  return new Date().toISOString();
}

/* ---------------- http helpers ---------------- */
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise(function (resolve, reject) {
    let size = 0;
    const chunks = [];
    req.on('data', function (c) {
      size += c.length;
      if (size > limit) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', function () {
      const buf = Buffer.concat(chunks);
      resolve(buf.length && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf
        ? buf.slice(3) : buf);
    });
    req.on('error', reject);
  });
}

function request(urlStr, opts, payload) {
  return new Promise(function (resolve, reject) {
    let u;
    try { u = new URL(urlStr); } catch (e) { reject(e); return; }
    const data = Buffer.from(payload == null ? '' : payload);
    const headers = Object.assign({
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'habaru-ramen/1.0'
    }, opts.headers || {});
    if (payload != null) headers['Content-Length'] = data.length;

    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: headers,
      timeout: 25000
    }, function (res) {
      const chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(raw); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, body: raw, json: json });
      });
    });
    req.on('timeout', function () { req.destroy(new Error('timeout')); });
    req.on('error', reject);
    if (payload != null) req.write(data);
    req.end();
  });
}

function parseKV(str) {
  const out = {};
  String(str || '').split(/[\r\n&]/).forEach(function (pair) {
    const i = pair.indexOf('=');
    if (i < 0) return;
    out[decodeURIComponent(pair.slice(0, i))] = decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' '));
  });
  return out;
}

function md5(s) { return crypto.createHash('md5').update(s).digest('hex'); }

function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/* ---------------- providers ---------------- */
const providers = {
  mono: {
    name: 'Монобанк',
    live: function () { return !!MONO.token; },
    reason: 'MONO_TOKEN не задано',
    create: monoCreate
  },
  privat24: {
    name: 'Приват24',
    live: function () { return !!(P24.id && P24.pass); },
    reason: 'P24_MERCHANT_ID / P24_MERCHANT_PASSWORD не задані',
    create: p24Create
  }
};

async function monoCreate(order) {
  const payload = {
    amount: order.amount,
    currencyCode: 980,
    destination: order.description,
    merchantPaymInfo: {
      reference: order.id,
      destination: 'Ramen Habaru',
      customerPhone: order.customer.phone || '',
      comment: order.customer.address || ''
    },
    redirectOkUrl: order.successUrl,
    redirectFailUrl: order.failUrl,
    webHookUrl: BASE_URL + '/api/webhook/mono'
  };

  const res = await request('https://api.monobank.ua/api/merchant/invoice/create', {
    method: 'POST',
    headers: { 'X-Token': MONO.token, 'Content-Type': 'application/json' }
  }, JSON.stringify(payload));

  const d = res.json || {};
  if (res.status >= 400 || !d.pageUrl) {
    throw new Error(d.errorMessage || d.message || ('Monobank HTTP ' + res.status + (res.body ? ' — ' + res.body.slice(0, 200) : '')));
  }
  return { url: d.pageUrl, remoteId: d.invoiceId || '' };
}

async function p24Create(order) {
  const form = new URLSearchParams();
  form.set('eci', '3');
  form.set('phone', order.customer.phone || '');
  form.set('amount', (order.amount / 100).toFixed(2));
  form.set('currency', 'UAH');
  form.set('description', order.description);
  form.set('orderid', order.id);
  form.set('merchantid', P24.id);
  form.set('merchantpassword', P24.pass);
  form.set('url', order.successUrl);
  form.set('responseurl', BASE_URL + '/api/webhook/privat24');
  if (P24.sandbox) form.set('sandbox', '1');

  const res = await request('https://api.privatbank.ua/p24api/ecommerce', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Accept': 'application/json, text/plain, */*'
    }
  }, form.toString());

  const parsed = res.json || parseKV(res.body);
  const url = parsed.paymentUrl || parsed.paymentURL || parsed.payUrl ||
              parsed.redirectUrl || parsed.redirect || parsed.url;

  if (res.status >= 400 || !url) {
    throw new Error(parsed.errorMessage || parsed.message || parsed.error ||
      ('Privat24 HTTP ' + res.status + (res.body ? ' — ' + res.body.slice(0, 200) : '')));
  }
  return { url: url, remoteId: parsed.orderId || order.id };
}

/* ---------------- /api/pay ---------------- */
async function handlePay(req, res) {
  const raw = await readBody(req, 256 * 1024);
  let data;
  try {
    data = JSON.parse(raw.toString('utf8') || '{}');
  } catch (e) {
    send(res, 400, { ok: false, error: 'Некоректний JSON у запиті' });
    return;
  }

  const provider = String(data.provider || '').toLowerCase();
  const amount = Math.round(Number(data.amount));
  const p = providers[provider];

  if (!p) {
    send(res, 400, { ok: false, error: 'Невідомий платіжний спосіб: ' + provider });
    return;
  }
  if (!Number.isFinite(amount) || amount < 100 || amount > 50000000) {
    send(res, 400, { ok: false, error: 'Сума має бути від 1,00 до 500 000,00 ₴ (передавайте у копійках)' });
    return;
  }
  if (!data.customer || !data.customer.phone) {
    send(res, 400, { ok: false, error: 'Потрібен контактний телефон' });
    return;
  }

  const order = {
    id: sanitizeId(data.orderId) || genId(),
    provider: provider,
    amount: amount,
    currency: 'UAH',
    description: String(data.description || ('RAMEN HABARU · ' + provider)).slice(0, 200),
    items: Array.isArray(data.items) ? data.items.slice(0, 50) : [],
    customer: {
      name: String((data.customer && data.customer.name) || '').slice(0, 120),
      phone: String(data.customer.phone).slice(0, 40),
      address: String((data.customer && data.customer.address) || '').slice(0, 200),
      note: String((data.customer && data.customer.note) || '').slice(0, 400)
    },
    successUrl: String(data.successUrl || BASE_URL).slice(0, 500),
    failUrl: String(data.failUrl || BASE_URL).slice(0, 500),
    status: 'created',
    mode: 'live',
    createdAt: now(),
    updatedAt: now()
  };

  if (orders[order.id]) order.id = order.id + '-' + Math.floor(Math.random() * 900 + 100);

  if (!p.live()) {
    order.mode = 'demo';
    order.status = 'demo';
    order.reason = p.reason;
    saveOrder(order);
    LOG('demo invoice', order.id, provider, p.reason);
    send(res, 200, { ok: true, demo: true, orderId: order.id, reason: p.reason });
    return;
  }

  try {
    const r = await p.create(order);
    order.status = 'pending';
    order.paymentUrl = r.url;
    order.remoteId = r.remoteId || '';
    order.updatedAt = now();
    saveOrder(order);
    LOG('invoice created', order.id, provider, r.url);
    send(res, 200, { ok: true, url: r.url, orderId: order.id });
  } catch (e) {
    order.status = 'failed';
    order.error = String(e && e.message ? e.message : e);
    order.updatedAt = now();
    saveOrder(order);
    LOG('invoice failed', order.id, provider, order.error);
    send(res, 502, { ok: false, orderId: order.id, error: 'Провайдер відхилив запит: ' + order.error });
  }
}

/* ---------------- webhooks ---------------- */
function findOrderByRemote(remoteId, fallbackId) {
  if (remoteId) {
    const keys = Object.keys(orders);
    for (let i = 0; i < keys.length; i++) {
      if (orders[keys[i]].remoteId === String(remoteId)) return orders[keys[i]];
    }
  }
  if (fallbackId) return orders[sanitizeId(fallbackId)] || null;
  return null;
}

async function handleMonoWebhook(req, res) {
  const raw = await readBody(req, 64 * 1024);
  if (!MONO.secret) {
    send(res, 503, { error: 'MONO_WEBHOOK_SECRET не задано' });
    return;
  }
  const sig = String(req.headers['x-mono-signature'] || '');
  const expect = crypto.createHmac('sha256', MONO.secret).update(raw).digest('hex');
  if (!safeEqual(sig, expect)) {
    send(res, 401, { error: 'bad signature' });
    return;
  }
  let data;
  try { data = JSON.parse(raw.toString('utf8')); } catch (e) {
    send(res, 400, { error: 'bad json' });
    return;
  }
  const o = findOrderByRemote(data.invoiceId, data.reference);
  if (!o) { send(res, 404, { error: 'order not found' }); return; }

  const map = { success: 'paid', failure: 'failed', expired: 'failed', reversed: 'failed', hold: 'pending', holdok: 'paid' };
  o.status = map[String(data.status || '').toLowerCase()] || o.status;
  o.remoteStatus = data.status || '';
  o.updatedAt = now();
  saveOrder(o);
  LOG('mono webhook', o.id, o.status);
  send(res, 200, { ok: true, orderId: o.id, status: o.status });
}

function p24SignValid(params, pass) {
  const sign = String(params.ecosign || params.sign || '').toLowerCase();
  if (!sign) return false;
  const keys = Object.keys(params).filter(function (k) {
    return k !== 'ecosign' && k !== 'sign';
  });
  const sorted = keys.slice().sort().map(function (k) { return String(params[k]); }).join('|');
  const ordered = keys.map(function (k) { return String(params[k]); }).join('|');
  return safeEqual(sign, md5(sorted + pass)) || safeEqual(sign, md5(ordered + pass));
}

async function handleP24Webhook(req, res) {
  const raw = await readBody(req, 64 * 1024);
  const params = parseKV(raw.toString('utf8'));

  if (P24.verify && P24.pass) {
    if (!p24SignValid(params, P24.pass)) {
      send(res, 401, { error: 'bad sign' });
      return;
    }
  }

  const o = findOrderByRemote(params.orderid, params.orderid);
  if (!o) { send(res, 404, { error: 'order not found' }); return; }

  const st = String(params.orderstatus || params.status || '').toLowerCase();
  if (st === 'paid' || st === 'ok' || st === 'success') o.status = 'paid';
  else if (st === 'fail' || st === 'failed' || st === 'expired') o.status = 'failed';
  o.remoteStatus = params.orderstatus || params.status || '';
  o.updatedAt = now();
  saveOrder(o);
  LOG('p24 webhook', o.id, o.status);
  send(res, 200, { ok: true, orderId: o.id, status: o.status });
}

/* ---------------- health / order lookup ---------------- */
function handleHealth(req, res) {
  const live = {};
  Object.keys(providers).forEach(function (k) { live[k] = providers[k].live(); });
  const mode = live.mono || live.privat24 ? 'live' : 'demo';
  send(res, 200, {
    ok: true,
    mode: mode,
    providers: live,
    baseUrl: BASE_URL,
    orders: Object.keys(orders).length,
    paid: Object.keys(orders).filter(function (k) { return orders[k].status === 'paid'; }).length
  });
}

function handleOrder(res, id) {
  const o = orders[sanitizeId(id)];
  if (!o) { send(res, 404, { ok: false, error: 'Замовлення не знайдено' }); return; }
  send(res, 200, {
    ok: true,
    order: {
      id: o.id,
      provider: o.provider,
      amount: o.amount,
      status: o.status,
      mode: o.mode,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt
    }
  });
}

/* ---------------- static ---------------- */
function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch (e) { send(res, 400, { error: 'bad path' }); return; }
  if (rel === '/' || rel === '') rel = '/index.html';

  const abs = path.normalize(path.join(SITE_DIR, rel));
  if (abs !== SITE_DIR && abs.indexOf(SITE_DIR + path.sep) !== 0) {
    send(res, 403, { error: 'forbidden' });
    return;
  }

  fs.stat(abs, function (err, st) {
    let file = abs;
    if (!err && st.isDirectory()) file = path.join(abs, 'index.html');
    fs.stat(file, function (e2, s2) {
      if (e2 || !s2.isFile()) { send(res, 404, { error: 'not found' }); return; }
      const ext = path.extname(file).toLowerCase();
      fs.readFile(file, function (e3, buf) {
        if (e3) { send(res, 500, { error: 'read error' }); return; }
        res.writeHead(200, {
          'Content-Type': MIME[ext] || 'application/octet-stream',
          'Content-Length': buf.length,
          'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
        });
        res.end(buf);
      });
    });
  });
}

/* ---------------- server ---------------- */
loadOrders();

const server = http.createServer(async function (req, res) {
  const u = new URL(req.url, 'http://localhost');
  const p = u.pathname;

  try {
    if (p === '/api/pay' && req.method === 'POST') { await handlePay(req, res); return; }
    if (p === '/api/health' && req.method === 'GET') { handleHealth(req, res); return; }
    if (p === '/api/webhook/mono' && req.method === 'POST') { await handleMonoWebhook(req, res); return; }
    if (p === '/api/webhook/privat24' && req.method === 'POST') { await handleP24Webhook(req, res); return; }
    if (p.indexOf('/api/order/') === 0 && req.method === 'GET') {
      handleOrder(res, p.slice('/api/order/'.length));
      return;
    }
    if (p.indexOf('/api/') === 0) { send(res, 404, { error: 'unknown api endpoint' }); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { send(res, 405, { error: 'method not allowed' }); return; }

    serveStatic(req, res, p);
  } catch (e) {
    LOG('handler error', p, e && e.stack ? e.stack : e);
    if (!res.headersSent) send(res, 500, { ok: false, error: 'internal error' });
  }
});

server.listen(PORT, function () {
  const live = Object.keys(providers).filter(function (k) { return providers[k].live(); });
  LOG('RAMEN HABARU API on http://localhost:' + PORT);
  LOG('static:', SITE_DIR);
  LOG('mode:', live.length ? 'LIVE (' + live.join(', ') + ')' : 'DEMO (немає токенів — додайте .env)');
  LOG('base url:', BASE_URL);
});

process.on('unhandledRejection', function (e) {
  LOG('unhandled rejection:', e && e.stack ? e.stack : e);
});
