const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// ===== PERSISTENT DATABASE (data persists across restarts) =====
const DB_PATH = path.join(__dirname, 'data');

function readDB(name) {
  try {
    const file = path.join(DB_PATH, `${name}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return null;
  }
}

function writeDB(name, data) {
  try {
    if (!fs.existsSync(DB_PATH)) fs.mkdirSync(DB_PATH, { recursive: true });
    fs.writeFileSync(path.join(DB_PATH, `${name}.json`), JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.error('Write error:', e);
    return false;
  }
}

// Initialize with defaults if files don't exist
function initDB() {
  if (!readDB('events')) {
    writeDB('events', [
      { id: 1, name: "BTS — ARIRANG SPECIAL", date: "2026-06-15", venue: "Seoul Olympic Stadium", city: "Seoul, South Korea", vipPrice: 350000, stdPrice: 150000, image: "https://images.unsplash.com/photo-1563089145-599997674d42?w=600&h=400&fit=crop" },
      { id: 2, name: "THE WEEKND — AFTER HOURS", date: "2026-07-22", venue: "Tokyo Dome", city: "Tokyo, Japan", vipPrice: 35000, stdPrice: 12000, image: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=600&h=400&fit=crop" },
      { id: 3, name: "EXO — THE EXO'luXion", date: "2026-08-10", venue: "Rajamangala Stadium", city: "Bangkok, Thailand", vipPrice: 8000, stdPrice: 2500, image: "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=600&h=400&fit=crop" }
    ]);
  }
  
  if (!readDB('orders')) writeDB('orders', []);
  
  if (!readDB('settings')) {
    writeDB('settings', { 
      qrCode: '', 
      bankName: 'Your Bank Name', 
      accountName: 'Your Account Name', 
      accountNumber: '0000-0000-0000' 
    });
  }
  
  // Check if admin exists
  const users = readDB('users');
  if (!users || users.length === 0) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync('admin123', salt, 1000, 64, 'sha512').toString('hex');
    writeDB('users', [{
      id: 1,
      name: 'Admin',
      email: 'sancholuisk@gmail.com',
      password: hash,
      salt: salt,
      isAdmin: true,
      createdAt: new Date().toISOString()
    }]);
    console.log('Default admin: sancholuisk@gmail.com / admin123');
  }
}

initDB();

// ===== EMAIL with better error handling =====
let transporter = null;

function initEmail() {
  const emailUser = process.env.EMAIL_USER || 'sancholuisk@gmail.com';
  const emailPass = process.env.EMAIL_PASS;
  
  if (!emailPass) {
    console.log('⚠️ EMAIL_PASS not set. Emails will be logged but not sent.');
    return;
  }
  
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: emailUser,
      pass: emailPass
    }
  });
  
  // Verify connection
  transporter.verify((error) => {
    if (error) {
      console.log('⚠️ Email config error:', error.message);
    } else {
      console.log('✅ Email ready to send');
    }
  });
}

initEmail();

async function sendEmail(to, subject, text) {
  if (!transporter) {
    console.log(`📧 [EMAIL NOT SENT - No config] To: ${to}, Subject: ${subject}`);
    console.log(`📧 Body: ${text.substring(0, 100)}...`);
    return false;
  }
  
  try {
    await transporter.sendMail({
      from: `"TICKETS HUB" <${process.env.EMAIL_USER || 'sancholuisk@gmail.com'}>`,
      to: to,
      subject: subject,
      text: text
    });
    console.log(`✅ Email sent to ${to}`);
    return true;
  } catch (error) {
    console.log(`❌ Email failed to ${to}:`, error.message);
    return false;
  }
}

// ===== TEST ROUTE =====
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'TICKETS HUB10 Backend',
    emailConfigured: transporter !== null,
    emailUser: process.env.EMAIL_USER || 'sancholuisk@gmail.com'
  });
});

// ===== TEST EMAIL ROUTE =====
app.get('/api/test-email', async (req, res) => {
  const result = await sendEmail(
    'sancholuisk@gmail.com',
    '🧪 Test Email from TICKETS HUB Backend',
    'This is a test email. If you receive this, your email configuration is working correctly!\n\nBest,\nTICKETS HUB Backend'
  );
  res.json({ success: result, message: result ? 'Email sent!' : 'Email failed. Check EMAIL_PASS env var.' });
});

// ===== AUTH =====
app.post('/api/users/register', (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.json({ success: false, message: 'All fields required' });
    if (password.length < 6) return res.json({ success: false, message: 'Password must be at least 6 characters' });

    let users = readDB('users') || [];
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      return res.json({ success: false, message: 'Email already registered' });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');

    users.push({
      id: Date.now(),
      name,
      email: email.toLowerCase(),
      password: hash,
      salt,
      isAdmin: false,
      createdAt: new Date().toISOString()
    });
    
    writeDB('users', users);

    sendEmail(email, 'Welcome to TICKETS HUB!', 
      `Hi ${name},\n\nWelcome to TICKETS HUB! Your account has been created.\n\nBrowse events and buy tickets: https://${req.get('host') || 'tickets-hub10'}\n\n— TICKETS HUB Team`);

    res.json({ success: true, message: 'Account created!' });
  } catch (e) {
    res.json({ success: false, message: 'Server error' });
  }
});

app.post('/api/users/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.json({ success: false, message: 'Email and password required' });

    const users = readDB('users') || [];
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return res.json({ success: false, message: 'Invalid email or password' });

    const hash = crypto.pbkdf2Sync(password, user.salt, 1000, 64, 'sha512').toString('hex');
    if (hash !== user.password) return res.json({ success: false, message: 'Invalid email or password' });

    res.json({ 
      success: true, 
      user: { id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin || false } 
    });
  } catch (e) {
    res.json({ success: false, message: 'Server error' });
  }
});

// ===== EVENTS =====
app.get('/api/events', (req, res) => {
  const events = readDB('events') || [];
  res.json(events);
});

app.post('/api/events', (req, res) => {
  try {
    const events = readDB('events') || [];
    const event = { 
      id: Date.now(), 
      name: req.body.name,
      date: req.body.date,
      venue: req.body.venue,
      city: req.body.city,
      vipPrice: parseInt(req.body.vipPrice) || 0,
      stdPrice: parseInt(req.body.stdPrice) || 0,
      image: req.body.image || ''
    };
    events.push(event);
    writeDB('events', events);
    res.json({ success: true, event });
  } catch (e) {
    res.json({ success: false, message: 'Failed to save event' });
  }
});

app.put('/api/events/:id', (req, res) => {
  try {
    const events = readDB('events') || [];
    const i = events.findIndex(e => e.id == req.params.id);
    if (i === -1) return res.status(404).json({ error: 'Event not found' });
    
    events[i] = { 
      ...events[i], 
      name: req.body.name || events[i].name,
      date: req.body.date || events[i].date,
      venue: req.body.venue || events[i].venue,
      city: req.body.city || events[i].city,
      vipPrice: parseInt(req.body.vipPrice) || events[i].vipPrice,
      stdPrice: parseInt(req.body.stdPrice) || events[i].stdPrice,
      image: req.body.image || events[i].image
    };
    
    writeDB('events', events);
    res.json({ success: true, event: events[i] });
  } catch (e) {
    res.json({ success: false, message: 'Failed to update event' });
  }
});

app.delete('/api/events/:id', (req, res) => {
  try {
    const events = (readDB('events') || []).filter(e => e.id != req.params.id);
    writeDB('events', events);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, message: 'Failed to delete event' });
  }
});

// ===== ORDERS =====
app.post('/api/orders', async (req, res) => {
  try {
    const orders = readDB('orders') || [];
    const order = { 
      id: Date.now(), 
      customer: req.body.customer, 
      items: req.body.items || [], 
      total: req.body.total || 0, 
      status: 'pending', 
      date: new Date().toISOString() 
    };
    orders.push(order);
    writeDB('orders', orders);

    // Build email content
    let itemsStr = '';
    (order.items || []).forEach(item => {
      itemsStr += `  🎫 ${item.name} (${item.category}) x${item.qty || 1} — ${item.currency || '₩'}${((item.price || 0) * (item.qty || 1)).toLocaleString()}\n`;
    });

    // Email to admin
    await sendEmail('sancholuisk@gmail.com',
      `🎫 NEW ORDER #${order.id} — ${order.customer.name}`,
      `══════════════════════════════\n        NEW ORDER\n══════════════════════════════\n\n👤 ${order.customer.name}\n📧 ${order.customer.email}\n📞 ${order.customer.phone}\n🌍 ${order.customer.country}\n\n🎟️ ITEMS:\n${itemsStr}\n💰 TOTAL: ₩${(order.total || 0).toLocaleString()}\n🆔 Order #${order.id}\n📅 ${new Date(order.date).toLocaleString()}\n\n══════════════════════════════\nVerify payment & send tickets.`
    );

    // Email to customer
    await sendEmail(order.customer.email,
      `✅ Order #${order.id} Confirmed — TICKETS HUB`,
      `Dear ${order.customer.name},\n\nThank you for your order!\n\n━━━━━━━━━━━━━━━━━━\nORDER #${order.id}\n━━━━━━━━━━━━━━━━━━\n${itemsStr}\nTotal: ₩${(order.total || 0).toLocaleString()}\n━━━━━━━━━━━━━━━━━━\n\n1. Scan the QR code to pay\n2. We'll verify within 24h\n3. Tickets sent to this email\n\n— TICKETS HUB Team`
    );

    res.json({ success: true, order });
  } catch (err) {
    console.error('Order error:', err);
    const orders = readDB('orders') || [];
    const order = { id: Date.now(), customer: req.body.customer, items: req.body.items, total: req.body.total, status: 'pending', date: new Date().toISOString() };
    orders.push(order);
    writeDB('orders', orders);
    res.json({ success: true, order, warning: 'Order saved' });
  }
});

app.get('/api/orders', (req, res) => {
  res.json((readDB('orders') || []).reverse());
});

app.put('/api/orders/:id/complete', (req, res) => {
  try {
    const orders = readDB('orders') || [];
    const o = orders.find(o => o.id == req.params.id);
    if (o) { 
      o.status = 'completed'; 
      writeDB('orders', orders); 
      res.json({ success: true }); 
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  } catch (e) {
    res.json({ success: false, message: 'Error' });
  }
});

// ===== SETTINGS =====
app.get('/api/settings', (req, res) => {
  res.json(readDB('settings') || { qrCode: '', bankName: '', accountName: '', accountNumber: '' });
});

app.post('/api/settings', (req, res) => {
  try {
    const s = readDB('settings') || {};
    if (req.body.qrCode !== undefined) s.qrCode = req.body.qrCode;
    if (req.body.bankName !== undefined) s.bankName = req.body.bankName;
    if (req.body.accountName !== undefined) s.accountName = req.body.accountName;
    if (req.body.accountNumber !== undefined) s.accountNumber = req.body.accountNumber;
    writeDB('settings', s);
    res.json({ success: true, settings: s });
  } catch (e) {
    res.json({ success: false, message: 'Failed to save settings' });
  }
});

app.listen(PORT, () => {
  console.log(`TICKETS HUB10 Backend on port ${PORT}`);
  console.log(`Email: ${process.env.EMAIL_USER || 'sancholuisk@gmail.com'}`);
  console.log(`Email configured: ${transporter !== null}`);
});
