require('dotenv').config();
const express = require('express');
const path    = require('path');
const { init, db } = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth',    require('./routes/auth'));
app.use('/api/visitas', require('./routes/visitas'));
app.use('/api/export',  require('./routes/export'));

app.get('/api/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

async function enviarAlertasSeguimiento() {
  if (!process.env.RESEND_API_KEY) {
    console.log('  [alertas] RESEND_API_KEY no configurado, saltando alertas.');
    return;
  }
  const { Resend } = require('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const today = new Date().toISOString().split('T')[0];

  const seguimientos = db.prepare(`
    SELECT v.*, u.email as userEmail, u.nombre as userName
    FROM visitas v
    JOIN users u ON v.userId = u.id
    WHERE v.resultado = 'Requiere seguimiento'
      AND v.fechaSeguimiento = ?
  `).all(today);

  console.log(`  [alertas] ${seguimientos.length} seguimiento(s) para hoy (${today})`);

  for (const s of seguimientos) {
    try {
      const fechaFormato = new Date(s.fecha + 'T12:00:00').toLocaleDateString('es-AR', {
        weekday: 'long', day: 'numeric', month: 'long'
      });
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'alertas@daraval.com',
        to: s.userEmail,
        subject: `DarAval — Seguimiento pendiente: ${s.contactoEmpresa}`,
        html: `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
            <div style="border-bottom:3px solid #00c853;padding-bottom:16px;margin-bottom:24px">
              <span style="font-size:22px;font-weight:bold">Dar</span><span style="font-size:22px;font-weight:bold;color:#00c853">Aval</span>
              <span style="color:#888;font-size:14px;margin-left:8px">— Alerta de seguimiento</span>
            </div>
            <p style="color:#333;font-size:15px">Hola <strong>${s.userName}</strong>,</p>
            <p style="color:#333;font-size:15px">Hoy tenés un seguimiento pendiente con:</p>
            <div style="background:#f5f5f5;border-left:4px solid #00c853;padding:16px 20px;margin:20px 0;border-radius:2px">
              <div style="font-size:18px;font-weight:bold;color:#1a1a1a">${s.contactoEmpresa}</div>
              ${s.contactoNombre ? `<div style="color:#555;margin-top:4px">${s.contactoNombre}${s.contactoCargo ? ' · ' + s.contactoCargo : ''}</div>` : ''}
              ${s.barrio ? `<div style="color:#888;font-size:13px;margin-top:8px">📍 ${s.barrio}</div>` : ''}
              ${s.proximaAccion ? `<div style="color:#555;font-size:13px;margin-top:8px">📋 ${s.proximaAccion}</div>` : ''}
              ${s.contactoTel ? `<div style="color:#555;font-size:13px;margin-top:4px">📞 ${s.contactoTel}</div>` : ''}
            </div>
            <p style="color:#888;font-size:13px">Visita registrada el ${fechaFormato}</p>
            <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e0e0e0;color:#aaa;font-size:12px">
              DarAval — Sistema de Gestión Comercial
            </div>
          </div>
        `,
      });
      console.log(`  [alertas] Email enviado a ${s.userEmail} — ${s.contactoEmpresa}`);
    } catch (err) {
      console.error(`  [alertas] Error enviando a ${s.userEmail}:`, err.message);
    }
  }
}

init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n  DarAval corriendo en http://localhost:${PORT}\n`);
    });

    // Job diario: alertas de seguimiento a las 8:00 AM
    try {
      const cron = require('node-cron');
      cron.schedule('0 8 * * *', () => {
        console.log('  [cron] Revisando seguimientos pendientes...');
        enviarAlertasSeguimiento().catch(err => console.error('[cron] Error:', err));
      }, { timezone: 'America/Argentina/Buenos_Aires' });
      console.log('  [cron] Job de alertas configurado (8:00 AM ARG)');
    } catch (err) {
      console.warn('  [cron] node-cron no disponible:', err.message);
    }
  })
  .catch(err => {
    console.error('  [error] No se pudo iniciar la base de datos:', err);
    process.exit(1);
  });
