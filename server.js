const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ===== DATABASE =====
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

// Initialize
const defaultEvents = [
  { id: 1, name: "BTS — ARIRANG SPECIAL", date: "2026-06-15", venue: "Seoul Olympic Stadium", city: "Seoul, South Korea", vipPrice: 350000, stdPrice: 150000, image: "https://images.unsplash.com/photo-1563089145-599997674d42?w=600&h=400&fit=crop" },
  { id: 2, name: "THE WEEKND — AFTER HOURS", date: "2026-07-22", venue: "Tokyo Dome", city: "Tokyo, Japan", vipPrice: 35000, stdPrice: 12000, image: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=600&h=400&fit=crop" },
  { id: 3, name: "EXO — THE EXO'luXion", date: "2026-08-10", venue: "Rajamangala Stadium", city: "Bangkok, Thailand", vipPrice: 8000, stdPrice: 2500, image: "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=600&h=400&fit=crop" }
];

if (!fs.existsSync(path.join(DB_PATH, 'events.json'))) writeDB('events', defaultEvents);
if (!fs.existsSync(path.join(DB_PATH, 'orders.json'))) writeDB('orders', []);
if (!fs.existsSync(path.join(DB_PATH, 'users.json'))) writeDB('users', []);
if (!fs.existsSync(path.join(DB_PATH, 'settings.json'))) writeDB('settings', { qrCode: '', bankName: 'Your Bank', accountName: 'Your Name', accountNumber: '0000' });

// Create default admin account if none exists
const users = readDB('users');
if (users.length === 0) {
  // Hash the password
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync('admin123', salt, 1000, 64, 'sha512').toString('hex');
  users.push({
    id: 1,
    name: 'Admin',
    email: 'sancholuisk@gmail.com',
    password: hash,
    salt: salt,
    isAdmin: true,
    createdAt: new Date().toISOString()
  });
  writeDB('users', users);
  console.log('Default admin account created:');
  console.log('  Email: sancholuisk@gmail.com');
  console.log('  Password: admin123');
}

// ===== EMAIL =====
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'sancholuisk@gmail.com',
    pass: process.env.EMAIL_PASS || ''
  }
});

// ===== AUTH ENDPOINTS =====

// Register
app.post('/api/users/register', (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
      return res.json({ success: false, message: 'All fields are required' });
    }

    if (password.length < 6) {
      return res.json({ success: false, message: 'Password must be at least 6 characters' });
    }

    let users = readDB('users');
    
    // Check if email exists
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      return res.json({ success: false, message: 'An account with this email already exists' });
    }

    // Hash password
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');

    const user = {
      id: Date.now(),
      name,
      email: email.toLowerCase(),
      password: hash,
      salt,
      isAdmin: false,
      createdAt: new Date().toISOString()
    };

    users.push(user);
    writeDB('users', users);

    // Send welcome email
    try {
      transporter.sendMail({
        from: `"TICKETS HUB" <${process.env.EMAIL_USER || 'sancholuisk@gmail.com'}>`,
        to: user.email,
        subject: 'Welcome to TICKETS HUB!',
        text: `Hi ${name},\n\nWelcome to TICKETS HUB! Your account has been created successfully.\n\nYou can now browse events, add tickets to your cart, and purchase securely.\n\nStart exploring: https://tickets-hub10.netlify.app/events\n\nBest regards,\nTICKETS HUB Team`
      });
    } catch (e) {
      console.log('Welcome email failed:', e.message);
    }

    res.json({ success: true, message: 'Account created successfully' });

  } catch (error) {
    res.json({ success: false, message: 'Server error. Please try again.' });
  }
});

// Login
app.post('/api/users/login', (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.json({ success: false, message: 'Email and password are required' });
    }

    const users = readDB('users');
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      return res.json({ success: false, message: 'Invalid email or password' });
    }

    // Verify password
    const hash = crypto.pbkdf2Sync(password, user.salt, 1000, 64, 'sha512').toString('hex');

    if (hash !== user.password) {
      return res.json({ success: false, message: 'Invalid email or password' });
    }

    // Return user without sensitive data
    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin || false
    };

    res.json({ success: true, user: safeUser });

  } catch (error) {
    res.json({ success: false, message: 'Server error. Please try again.' });
  }
});

// Get current user by ID
app.get('/api/users/:id', (req, res) => {
  const users = readDB('users');
  const user = users.find(u => u.id == req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    isAdmin: user.isAdmin || false
  });
});

// ===== EVENTS =====
app.get('/api/events', (req, res) => res.json(readDB('events')));

app.post('/api/events', (req, res) => {
  const events = readDB('events');
  const event = { id: Date.now(), ...req.body };
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
  writeDB('events', readDB('events').filter(e => e.id != req.params.id));
  res.json({ success: true });
});

// ===== ORDERS =====
app.post('/api/orders', async (req, res) => {
  try {
    const orders = readDB('orders');
    const order = { id: Date.now(), customer: req.body.customer, items: req.body.items, total: req.body.total, status: 'pending', date: new Date().toISOString() };
    orders.push(order);
    writeDB('orders', orders);

    let itemsStr = '';
    order.items.forEach(item => { itemsStr += `  🎫 ${item.name} (${item.category}) x${item.qty} — ${item.currency}${(item.price * item.qty).toLocaleString()}\n`; });

    await transporter.sendMail({
      from: `"TICKETS HUB" <${process.env.EMAIL_USER || 'sancholuisk@gmail.com'}>`,
      to: 'sancholuisk@gmail.com',
      subject: `🎫 NEW ORDER #${order.id} — ${order.customer.name}`,
      text: `══════════════════════════════\n        NEW ORDER\n══════════════════════════════\n\n👤 ${order.customer.name}\n📧 ${order.customer.email}\n📞 ${order.customer.phone}\n🌍 ${order.customer.country}\n\n🎟️ ITEMS:\n${itemsStr}\n💰 TOTAL: ₩${order.total.toLocaleString()}\n🆔 Order #${order.id}\n📅 ${new Date(order.date).toLocaleString()}\n\n══════════════════════════════\nVerify payment & send tickets.`
    });

    await transporter.sendMail({
      from: `"TICKETS HUB" <${process.env.EMAIL_USER || 'sancholuisk@gmail.com'}>`,
      to: order.customer.email,
      subject: `✅ Order #${order.id} Confirmed — TICKETS HUB`,
      text: `Dear ${order.customer.name},\n\nThank you for your order!\n\n━━━━━━━━━━━━━━━━━━\nORDER #${order.id}\n━━━━━━━━━━━━━━━━━━\n${itemsStr}\nTotal: ₩${order.total.toLocaleString()}\n━━━━━━━━━━━━━━━━━━\n\n1. Scan the QR code to pay\n2. We'll verify within 24h\n3. Tickets sent to this email\n\n— TICKETS HUB Team`
    });

    res.json({ success: true, order });
  } catch (err) {
    const orders = readDB('orders');
    const order = { id: Date.now(), customer: req.body.customer, items: req.body.items, total: req.body.total, status: 'pending', date: new Date().toISOString() };
    orders.push(order);
    writeDB('orders', orders);
    res.json({ success: true, order, warning: 'Order saved but email failed' });
  }
});

app.get('/api/orders', (req, res) => res.json(readDB('orders').reverse()));

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

app.get('/', (req, res) => res.json({ status: 'ok', message: 'TICKETS HUB10 Backend running' }));

app.listen(PORT, () => console.log(`TICKETS HUB10 Backend on port ${PORT}`));
