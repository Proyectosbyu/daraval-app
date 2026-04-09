require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth',    require('./routes/auth'));
app.use('/api/visitas', require('./routes/visitas'));
app.use('/api/export',  require('./routes/export'));

app.get('/api/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Serve app.html for /app route
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

app.listen(PORT, () => {
  console.log(`\n  FieldLog corriendo en http://localhost:${PORT}\n`);
});
