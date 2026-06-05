const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ===== SIMPLE FILE-BASED DATABASE =====
const DB_PATH = path.join(__dirname, 'data');

function readDB(name) {
  try {
    const file = path.join(DB_PATH, `${name}.json`);
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return [];
  }
}

function writeDB(name, data) {
  if (!fs.existsSync(DB_PATH)) fs.mkdirSync(DB_PATH);
  fs.writeFileSync(path.join(DB_PATH, `${name}.json`), JSON.stringify(data, null, 2));
}

// Initialize with default events
const defaultEvents = [
  {
    id: 1,
    name: "BTS — ARIRANG SPECIAL",
    date: "2026-06-15",
    venue: "Seoul Olympic Stadium",
    city: "Seoul, South Korea",
    vipPrice: 350000,
    stdPrice: 150000,
    image: "https://images.unsplash.com/photo-1563089145-599997674d42?w=600&h=400&fit=crop"
  },
  {
    id: 2,
    name: "THE WEEKND — AFTER HOURS",
    date: "2026-07-22",
    venue: "Tokyo Dome",
    city: "Tokyo, Japan",
    vipPrice: 35000,
    stdPrice: 12000,
    image: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=600&h=400&fit=crop"
  },
  {
    id: 3,
    name: "EXO — THE EXO'luXion",
    date: "2026-08-10",
    venue: "Rajamangala Stadium",
    city: "Bangkok, Thailand",
    vipPrice: 8000,
    stdPrice: 2500,
    image: "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=600&h=400&fit=crop"
  }
];

if (!fs.existsSync(path.join(DB_PATH, 'events.json'))) writeDB('events', defaultEvents);
if (!fs.existsSync(path.join(DB_PATH, 'orders.json'))) writeDB('orders', []);
if (!fs.existsSync(path.join(DB_PATH, 'users.json'))) writeDB('users', []);
if (!fs.existsSync(path.join(DB_PATH, 'settings.json'))) writeDB('settings', {
  qrCode: '',
  bankName: 'Your Bank Name',
  accountName: 'Your Account Name',
  accountNumber: 'Your Account Number'
});

// ===== EMAIL CONFIG =====
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'sancholuisk@gmail.com',
    pass: process.env.EMAIL_PASS || ''
  }
});

// ===== TEST =====
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'TICKETS HUB10 Backend is running!' });
});

// ===== EVENTS =====
app.get('/api/events', (req, res) => {
  res.json(readDB('events'));
});

app.post('/api/events', (req, res) => {
  const events = readDB('events');
  const event = {
    id: Date.now(),
    name: req.body.name,
    date: req.body.date,
    venue: req.body.venue,
    city: req.body.city,
    vipPrice: parseInt(req.body.vipPrice),
    stdPrice: parseInt(req.body.stdPrice),
    image: req.body.image
  };
  events.push(event);
  writeDB('events', events);
  res.json({ success: true, event });
});

app.put('/api/events/:id', (req, res) => {
  let events = readDB('events');
  const i = events.findIndex(e => e.id == req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Not found' });
  events[i] = { ...events[i], ...req.body, id: events[i].id };
  writeDB('events', events);
  res.json({ success: true, event: events[i] });
});

app.delete('/api/events/:id', (req, res) => {
  let events = readDB('events').filter(e => e.id != req.params.id);
  writeDB('events', events);
  res.json({ success: true });
});

// ===== ORDERS =====
app.post('/api/orders', async (req, res) => {
  try {
    const orders = readDB('orders');
    const order = {
      id: Date.now(),
      customer: req.body.customer,
      items: req.body.items,
      total: req.body.total,
      status: 'pending',
      date: new Date().toISOString()
    };
    orders.push(order);
    writeDB('orders', orders);

    // Build items string
    let itemsStr = '';
    order.items.forEach(item => {
      itemsStr += `  🎫 ${item.name} (${item.category}) x${item.qty} — ${item.currency}${(item.price * item.qty).toLocaleString()}\n`;
    });

    // Email to YOU
    await transporter.sendMail({
      from: `"TICKETS HUB" <${process.env.EMAIL_USER || 'sancholuisk@gmail.com'}>`,
      to: 'sancholuisk@gmail.com',
      subject: `🎫 NEW ORDER #${order.id} — ${order.customer.name}`,
      text: `
══════════════════════════════
        NEW ORDER
══════════════════════════════

👤 ${order.customer.name}
📧 ${order.customer.email}
📞 ${order.customer.phone}
🌍 ${order.customer.country}

🎟️ ITEMS:
${itemsStr}
💰 TOTAL: ₩${order.total.toLocaleString()}
🆔 Order #${order.id}
📅 ${new Date(order.date).toLocaleString()}

══════════════════════════════
Verify payment & send tickets.
      `
    });

    // Email to customer
    await transporter.sendMail({
      from: `"TICKETS HUB" <${process.env.EMAIL_USER || 'sancholuisk@gmail.com'}>`,
      to: order.customer.email,
      subject: `✅ Order #${order.id} Confirmed — TICKETS HUB`,
      text: `
Dear ${order.customer.name},

Thank you for your order!

━━━━━━━━━━━━━━━━━━
ORDER #${order.id}
━━━━━━━━━━━━━━━━━━
${itemsStr}
Total: ₩${order.total.toLocaleString()}
━━━━━━━━━━━━━━━━━━

1. Scan the QR code to pay
2. We'll verify within 24h
3. Tickets sent to this email

— TICKETS HUB Team
      `
    });

    res.json({ success: true, order });

  } catch (err) {
    console.error('Order error:', err);
    const orders = readDB('orders');
    const order = { id: Date.now(), customer: req.body.customer, items: req.body.items, total: req.body.total, status: 'pending', date: new Date().toISOString() };
    orders.push(order);
    writeDB('orders', orders);
    res.json({ success: true, order, warning: 'Order saved but email failed: ' + err.message });
  }
});

app.get('/api/orders', (req, res) => {
  res.json(readDB('orders').reverse());
});

app.put('/api/orders/:id/complete', (req, res) => {
  const orders = readDB('orders');
  const o = orders.find(o => o.id == req.params.id);
  if (o) { o.status = 'completed'; writeDB('orders', orders); res.json({ success: true }); }
  else res.status(404).json({ error: 'Not found' });
});

// ===== SETTINGS =====
app.get('/api/settings', (req, res) => res.json(readDB('settings')));

app.post('/api/settings', (req, res) => {
  const s = readDB('settings');
  if (req.body.qrCode !== undefined) s.qrCode = req.body.qrCode;
  if (req.body.bankName !== undefined) s.bankName = req.body.bankName;
  if (req.body.accountName !== undefined) s.accountName = req.body.accountName;
  if (req.body.accountNumber !== undefined) s.accountNumber = req.body.accountNumber;
  writeDB('settings', s);
  res.json({ success: true, settings: s });
});

app.listen(PORT, () => console.log(`TICKETS HUB10 Backend on port ${PORT}`));
