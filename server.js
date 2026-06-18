require('dotenv').config();
const express          = require('express');
const { createClient } = require('@supabase/supabase-js');
const bcrypt           = require('bcryptjs');
const nodemailer       = require('nodemailer');
const jwt              = require('jsonwebtoken');
const path             = require('path');

const app  = express();
const port = process.env.PORT || 3000;

/* ── Supabase ─────────────────────────────────────────────── */
const SUPABASE_URL         = process.env.SUPABASE_URL        || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('SUPABASE_URL et SUPABASE_SERVICE_KEY sont requis dans .env');
}

let supabase;
try {
  supabase = createClient(
    SUPABASE_URL  || 'https://placeholder.supabase.co',
    SUPABASE_SERVICE_KEY || 'placeholder-key',
    { auth: { persistSession: false } }
  );
  console.log('Supabase init :', SUPABASE_URL || '(no URL set)');
} catch (e) {
  console.error('Supabase createClient failed:', e.message);
  supabase = null;
}

/* ── Variables d'environnement ────────────────────────────── */
const ADMIN_USER     = process.env.ADMIN_USER     || 'admin';
const ADMIN_PASS     = process.env.ADMIN_PASS     || 'Mosaic2026!';
const JWT_SECRET     = process.env.JWT_SECRET     || process.env.SESSION_SECRET || 'mosaic-jwt-secret-2026';
const CONTACT_EMAIL  = process.env.CONTACT_EMAIL  || 'contact@mozaikinternational.com';
const SMTP_HOST      = process.env.SMTP_HOST      || '';
const SMTP_PORT      = Number(process.env.SMTP_PORT || 587);
const SMTP_USER      = process.env.SMTP_USER      || '';
const SMTP_PASS      = process.env.SMTP_PASS      || '';
const SMTP_SECURE    = process.env.SMTP_SECURE === 'true';
const SMTP_FROM      = process.env.SMTP_FROM      || CONTACT_EMAIL;

/* ── Nodemailer ───────────────────────────────────────────── */
const transporter = SMTP_HOST
  ? nodemailer.createTransport({
      host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    })
  : null;

/* ── Bcrypt ───────────────────────────────────────────────── */
const hashPassword    = (p) => bcrypt.hashSync(p, 10);
const comparePassword = (p, h) => bcrypt.compareSync(p, h);

/* ── Mappers DB (snake_case) ↔ API (camelCase) ───────────── */
const toContact = (r) => !r ? null : {
  id: r.id, prenom: r.prenom, nom: r.nom,
  email: r.email, tel: r.tel, societe: r.societe,
  pays: r.pays, service: r.service, budget: r.budget,
  message: r.message, status: r.status, date: r.date,
  sourcePage: r.source_page, createdAt: r.created_at
};

const toArticle = (r) => !r ? null : {
  id: r.id, title: r.title, category: r.category,
  status: r.status, excerpt: r.excerpt, content: r.content,
  author: r.author, date: r.date,
  imageData: r.image_data, createdAt: r.created_at
};

/* ── Helper erreur Supabase ───────────────────────────────── */
const sbCheck = ({ error }, label) => {
  if (error) {
    console.error(`[${label}]`, error);
    throw new Error(error.message);
  }
};

/* ── JWT helpers ──────────────────────────────────────────── */
const COOKIE_NAME = 'mosaic_auth';
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  maxAge: 24 * 60 * 60 * 1000,
  secure: process.env.NODE_ENV === 'production'
};

const signToken  = () => jwt.sign({ isAdmin: true }, JWT_SECRET, { expiresIn: '24h' });
const verifyToken = (token) => { try { return jwt.verify(token, JWT_SECRET); } catch { return null; } };

/* ── Init mot de passe admin ──────────────────────────────── */
const initAdminPassword = async () => {
  if (!supabase || !SUPABASE_URL) return;
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'admin_password')
    .maybeSingle();

  if (!data) {
    const { error } = await supabase
      .from('settings')
      .insert({ key: 'admin_password', value: hashPassword(ADMIN_PASS) });
    if (error) console.error('Init admin_password :', error.message);
    else console.log('Mot de passe admin initialisé.');
  }
};

/* ── Email notification ───────────────────────────────────── */

/* Lit l'email de notification depuis Supabase settings, avec fallback */
const getNotifEmail = async () => {
  if (!supabase || !SUPABASE_URL) return CONTACT_EMAIL;
  try {
    const { data } = await supabase.from('settings').select('value').eq('key', 'notif_email').maybeSingle();
    return (data?.value && data.value.trim()) ? data.value.trim() : CONTACT_EMAIL;
  } catch { return CONTACT_EMAIL; }
};

const mailHtmlWrapper = (title, rows) => `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f5f5f8;padding:20px;">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
  <div style="background:linear-gradient(135deg,#5B2D8E,#3d1e62);padding:24px 28px;">
    <h2 style="margin:0;color:#fff;font-size:1.1rem;">${title}</h2>
    <p style="margin:6px 0 0;color:rgba(255,255,255,0.7);font-size:0.82rem;">Mosaïc International — Notification automatique</p>
  </div>
  <div style="padding:24px 28px;">
    ${rows}
    <hr style="border:none;border-top:1px solid #e0e0e8;margin:20px 0;">
    <p style="color:#9ca3af;font-size:0.75rem;">Cet email a été envoyé automatiquement depuis le site mozaikinternational.com</p>
  </div>
</div></body></html>`;

const mailRow = (label, value) => value
  ? `<p style="margin:8px 0;"><b style="color:#1a1a2e;min-width:120px;display:inline-block;">${label} :</b> <span style="color:#444;">${value}</span></p>`
  : '';

const sendContactMail = async (c) => {
  if (!transporter) return;
  const to = await getNotifEmail();
  try {
    await transporter.sendMail({
      from: `"Mosaïc International" <${SMTP_FROM}>`,
      to,
      subject: `📬 Nouveau contact — ${c.prenom} ${c.nom}`,
      html: mailHtmlWrapper('Nouvelle demande de contact', `
        ${mailRow('Nom', `${c.prenom} ${c.nom}`)}
        ${mailRow('Email', `<a href="mailto:${c.email}">${c.email}</a>`)}
        ${mailRow('Téléphone', c.tel)}
        ${mailRow('Entreprise', c.societe)}
        ${mailRow('Pays', c.pays)}
        ${mailRow('Service', c.service)}
        ${mailRow('Budget', c.budget)}
        <div style="margin-top:16px;background:#f5f5f8;border-radius:8px;padding:14px;">
          <b style="color:#1a1a2e;">Message :</b>
          <p style="margin:8px 0 0;color:#444;line-height:1.6;">${String(c.message).replace(/\n/g,'<br>')}</p>
        </div>
        <div style="margin-top:16px;">
          <a href="https://mozaikinternational.com/admin" style="display:inline-block;background:#5B2D8E;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:0.85rem;">
            Voir dans l'admin
          </a>
        </div>`)
    });
  } catch (err) {
    console.warn('Email contact non envoyé :', err.message);
  }
};

/* ── Auth middleware ──────────────────────────────────────── */
const requireAuth = (req, res, next) => {
  const token = req.cookies?.[COOKIE_NAME] || req.headers['authorization']?.replace('Bearer ', '');
  if (token && verifyToken(token)) return next();
  return res.status(401).json({ error: 'Unauthorized' });
};

/* ── Express ──────────────────────────────────────────────── */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* Cookie parser léger sans dépendance externe */
app.use((req, _res, next) => {
  req.cookies = {};
  const raw = req.headers.cookie || '';
  raw.split(';').forEach(part => {
    const [k, ...v] = part.trim().split('=');
    if (k) req.cookies[k.trim()] = decodeURIComponent(v.join('=').trim());
  });
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

/* Route /admin → admin.html */
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

/* ══════════════════════════════════════════════════════════
   KEEP-ALIVE (ping Supabase pour éviter la mise en pause)
══════════════════════════════════════════════════════════ */
app.get('/api/ping', async (_req, res) => {
  try {
    await supabase.from('settings').select('key').limit(1);
    return res.json({ ok: true, ts: new Date().toISOString() });
  } catch {
    return res.json({ ok: false, ts: new Date().toISOString() });
  }
});

/* ── Diagnostic (sans secrets) ──────────────────────────── */
app.get('/api/status', async (_req, res) => {
  const info = {
    supabase_url_set: Boolean(SUPABASE_URL),
    supabase_key_set: Boolean(SUPABASE_SERVICE_KEY),
    tables: {}
  };
  if (supabase && SUPABASE_URL) {
    for (const table of ['contacts', 'news', 'settings', 'devis']) {
      const { error } = await supabase.from(table).select('*').limit(1);
      info.tables[table] = error ? `ERREUR: ${error.message}` : 'OK';
    }
  } else {
    info.tables = 'Supabase non configuré';
  }
  return res.json(info);
});

/* ══════════════════════════════════════════════════════════
   AUTH (JWT — compatible serverless Vercel)
══════════════════════════════════════════════════════════ */
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (username !== ADMIN_USER || !password) {
    return res.status(401).json({ error: 'Identifiants incorrects. Réessayez.' });
  }
  try {
    let isValid = false;

    if (supabase && SUPABASE_URL) {
      const { data, error } = await supabase
        .from('settings').select('value')
        .eq('key', 'admin_password').maybeSingle();

      if (data?.value) {
        // Mot de passe stocké en base — comparaison bcrypt
        isValid = comparePassword(password, data.value);
      } else {
        // Table vide ou inexistante — fallback sur variable d'environnement
        isValid = (password === ADMIN_PASS);
        if (isValid) {
          // Initialiser le mot de passe en base en arrière-plan
          supabase.from('settings')
            .upsert({ key: 'admin_password', value: hashPassword(ADMIN_PASS) }, { onConflict: 'key' })
            .then(({ error: e }) => { if (e) console.error('Init pwd:', e.message); });
        }
        if (error) console.error('Login Supabase error:', error.message);
      }
    } else {
      // Supabase non configuré — comparaison directe
      isValid = (password === ADMIN_PASS);
    }

    if (!isValid) {
      return res.status(401).json({ error: 'Identifiants incorrects. Réessayez.' });
    }
    const token = signToken();
    res.cookie(COOKIE_NAME, token, COOKIE_OPTS);
    return res.json({ authenticated: true });
  } catch (err) {
    console.error('Login error:', err.message);
    // Dernier recours : comparaison directe
    if (password === ADMIN_PASS) {
      const token = signToken();
      res.cookie(COOKIE_NAME, token, COOKIE_OPTS);
      return res.json({ authenticated: true });
    }
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.post('/api/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME);
  return res.json({ ok: true });
});

app.get('/api/session', (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  res.json({ authenticated: Boolean(token && verifyToken(token)) });
});

/* ══════════════════════════════════════════════════════════
   UPLOAD IMAGE (Supabase Storage)
══════════════════════════════════════════════════════════ */
app.post('/api/upload-image', requireAuth, async (req, res) => {
  const { data: dataUrl } = req.body;
  if (!dataUrl || !dataUrl.startsWith('data:')) {
    return res.status(400).json({ error: 'Image invalide.' });
  }

  const match = dataUrl.match(/^data:([a-zA-Z0-9+/]+\/[a-zA-Z0-9+/]+);base64,(.+)$/);
  if (!match) return res.status(400).json({ error: 'Format base64 invalide.' });

  const mimeType = match[1];
  const ext      = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
  const buffer   = Buffer.from(match[2], 'base64');
  const filename = `article_${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('article-images')
    .upload(filename, buffer, { contentType: mimeType, upsert: false });

  if (uploadError) {
    console.error('Upload storage :', uploadError);
    return res.status(500).json({ error: 'Impossible d\'uploader l\'image. Vérifiez que le bucket "article-images" existe dans Supabase Storage.' });
  }

  const { data: urlData } = supabase.storage
    .from('article-images')
    .getPublicUrl(filename);

  return res.json({ url: urlData.publicUrl });
});

/* ══════════════════════════════════════════════════════════
   CONTACTS
══════════════════════════════════════════════════════════ */
app.post('/api/contact', async (req, res) => {
  const { prenom, nom, email, tel, societe, pays, service, budget, message, sourcePage } = req.body;
  if (!prenom || !nom || !email || !service || !message) {
    return res.status(400).json({ error: 'Veuillez remplir tous les champs obligatoires.' });
  }
  const now = new Date().toISOString();
  const row = {
    id:          `contact_${Date.now()}`,
    prenom, nom, email, tel, societe,
    pays:        pays       || '',
    service,
    budget:      budget     || '',
    message,
    status:      'new',
    date:        now,
    source_page: sourcePage || '',
    created_at:  now
  };
  try {
    if (!supabase || !SUPABASE_URL) {
      return res.status(503).json({ error: 'Base de données non configurée. Contactez-nous par email ou WhatsApp.' });
    }
    const { error } = await supabase.from('contacts').insert(row);
    if (error) {
      console.error('INSERT contact:', error.message);
      return res.status(500).json({ error: 'Erreur enregistrement. Contactez-nous directement par WhatsApp.' });
    }
    await sendContactMail({ ...row, sourcePage: row.source_page });
    return res.json({ ok: true });
  } catch (err) {
    console.error('Contact route error:', err.message);
    return res.status(500).json({ error: 'Erreur serveur. Contactez-nous par WhatsApp au +235 62 68 68 12.' });
  }
});

app.get('/api/contacts', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('contacts').select('*')
      .order('date', { ascending: false });
    sbCheck({ error }, 'GET contacts');
    return res.json((data || []).map(toContact));
  } catch (err) {
    return res.status(500).json({ error: 'Impossible de charger les demandes.' });
  }
});

app.get('/api/contacts/:id', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('contacts').select('*')
      .eq('id', req.params.id).maybeSingle();
    sbCheck({ error }, 'GET contact');
    if (!data) return res.status(404).json({ error: 'Demande non trouvée.' });
    return res.json(toContact(data));
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.put('/api/contacts/:id/status', requireAuth, async (req, res) => {
  const { status } = req.body;
  if (!['new', 'read'].includes(status)) {
    return res.status(400).json({ error: 'Statut invalide.' });
  }
  try {
    const { error } = await supabase
      .from('contacts').update({ status }).eq('id', req.params.id);
    sbCheck({ error }, 'UPDATE contact status');
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Impossible de mettre à jour.' });
  }
});

app.delete('/api/contacts/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabase.from('contacts').delete().eq('id', req.params.id);
    sbCheck({ error }, 'DELETE contact');
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Impossible de supprimer.' });
  }
});

app.delete('/api/contacts', requireAuth, async (req, res) => {
  try {
    const { error } = await supabase
      .from('contacts').delete().not('id', 'is', null);
    sbCheck({ error }, 'DELETE all contacts');
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Impossible de vider les demandes.' });
  }
});

/* ══════════════════════════════════════════════════════════
   NEWS
══════════════════════════════════════════════════════════ */
app.get('/api/news', async (req, res) => {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    const isAdmin = Boolean(token && verifyToken(token));
    let q = supabase.from('news').select('*').order('date', { ascending: false });
    if (!isAdmin) q = q.eq('status', 'published');
    const { data, error } = await q;
    sbCheck({ error }, 'GET news');
    return res.json((data || []).map(toArticle));
  } catch (err) {
    return res.status(500).json({ error: 'Impossible de charger les actualités.' });
  }
});

app.get('/api/news/:id', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('news').select('*')
      .eq('id', req.params.id).maybeSingle();
    sbCheck({ error }, 'GET news by id');
    if (!data) return res.status(404).json({ error: 'Article non trouvé.' });
    return res.json(toArticle(data));
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.post('/api/news', requireAuth, async (req, res) => {
  const { title, category, status, excerpt, content, author, date, imageData } = req.body;
  if (!title || !category || !status) {
    return res.status(400).json({ error: 'Titre, catégorie et statut sont obligatoires.' });
  }
  const row = {
    id:         `art_${Date.now()}`,
    title, category, status,
    excerpt:    excerpt || '',
    content:    content || '',
    author:     author  || 'Équipe Mosaïc International',
    date:       date    || new Date().toISOString().split('T')[0],
    image_data: imageData || '',
    created_at: new Date().toISOString()
  };
  try {
    const { error } = await supabase.from('news').insert(row);
    sbCheck({ error }, 'INSERT news');
    return res.json(toArticle(row));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Impossible de créer l'article." });
  }
});

app.put('/api/news/:id', requireAuth, async (req, res) => {
  const { title, category, status, excerpt, content, author, date, imageData } = req.body;
  if (!title || !category || !status) {
    return res.status(400).json({ error: 'Titre, catégorie et statut sont obligatoires.' });
  }
  const updates = {
    title, category, status,
    excerpt:    excerpt || '',
    content:    content || '',
    author:     author  || 'Équipe Mosaïc International',
    date:       date    || new Date().toISOString().split('T')[0],
    image_data: imageData || ''
  };
  try {
    const { error } = await supabase
      .from('news').update(updates).eq('id', req.params.id);
    sbCheck({ error }, 'UPDATE news');
    const { data } = await supabase
      .from('news').select('*').eq('id', req.params.id).maybeSingle();
    return res.json(toArticle(data));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Impossible de mettre à jour l'article." });
  }
});

app.delete('/api/news/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabase
      .from('news').delete().eq('id', req.params.id);
    sbCheck({ error }, 'DELETE news');
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Impossible de supprimer l'article." });
  }
});

/* ══════════════════════════════════════════════════════════
   PARAMÈTRES
══════════════════════════════════════════════════════════ */

/* Public — retourne les infos de contact affichées sur le site */
app.get('/api/public-settings', async (_req, res) => {
  const defaults = {
    phone:   '+235 62 68 68 12',
    email:   CONTACT_EMAIL,
    address: "425W+W78, N'Djaména, Tchad",
    hours:   'Lun – Sam : 07h00 – 18h00'
  };
  try {
    if (!supabase || !SUPABASE_URL) return res.json(defaults);
    const { data } = await supabase.from('settings').select('key, value');
    const s = (data || []).reduce((acc, r) => ({ ...acc, [r.key]: r.value }), {});
    return res.json({
      phone:   s.site_phone   || defaults.phone,
      email:   s.site_email   || defaults.email,
      address: s.site_address || defaults.address,
      hours:   s.site_hours   || defaults.hours
    });
  } catch {
    return res.json(defaults);
  }
});

app.get('/api/settings', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('settings').select('key, value');
    sbCheck({ error }, 'GET settings');
    const s = (data || []).reduce((acc, r) => ({ ...acc, [r.key]: r.value }), {});
    return res.json({
      phone:      s.site_phone   || '+235 62 68 68 12',
      email:      s.site_email   || CONTACT_EMAIL,
      address:    s.site_address || "425W+W78, N'Djaména, Tchad",
      hours:      s.site_hours   || 'Lun – Sam : 07h00 – 18h00',
      notifEmail: s.notif_email  || CONTACT_EMAIL,
      smtpReady:  Boolean(SMTP_HOST)
    });
  } catch (err) {
    return res.status(500).json({ error: 'Impossible de charger les paramètres.' });
  }
});

app.post('/api/settings', requireAuth, async (req, res) => {
  const { phone, email, address, hours, notifEmail } = req.body;
  try {
    const { error } = await supabase.from('settings').upsert([
      { key: 'site_phone',   value: phone      || '' },
      { key: 'site_email',   value: email      || CONTACT_EMAIL },
      { key: 'site_address', value: address    || "425W+W78, N'Djaména, Tchad" },
      { key: 'site_hours',   value: hours      || 'Lun – Sam : 07h00 – 18h00' },
      { key: 'notif_email',  value: notifEmail || CONTACT_EMAIL }
    ], { onConflict: 'key' });
    sbCheck({ error }, 'UPSERT settings');
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Impossible d'enregistrer les paramètres." });
  }
});

/* Tester la configuration email */
app.post('/api/test-email', requireAuth, async (req, res) => {
  if (!transporter) return res.status(503).json({ error: 'SMTP non configuré. Ajoutez SMTP_HOST, SMTP_USER, SMTP_PASS dans les variables Vercel.' });
  const to = await getNotifEmail();
  try {
    await transporter.sendMail({
      from: `"Mosaïc International" <${SMTP_FROM}>`,
      to,
      subject: '✅ Test email — Mosaïc International Admin',
      html: mailHtmlWrapper('Test de configuration email', `
        <p style="color:#166534;background:#f0fdf4;border:1px solid #bbf7d0;padding:12px;border-radius:8px;">
          ✅ La configuration email fonctionne correctement !
        </p>
        ${mailRow('Envoyé à', to)}
        ${mailRow('Serveur SMTP', SMTP_HOST)}
        ${mailRow('Date', new Date().toLocaleString('fr-FR'))}`)
    });
    return res.json({ ok: true, to });
  } catch (err) {
    return res.status(500).json({ error: `Échec envoi : ${err.message}` });
  }
});

/* Export CSV contacts */
app.get('/api/export/contacts', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('contacts').select('*').order('date', { ascending: false });
    sbCheck({ error }, 'EXPORT contacts');
    const rows = (data || []);
    const headers = ['ID','Prénom','Nom','Email','Téléphone','Société','Pays','Service','Budget','Message','Statut','Date'];
    const csv = [headers.join(';'),
      ...rows.map(r => [r.id,r.prenom,r.nom,r.email,r.tel,r.societe,r.pays,r.service,r.budget,
        (r.message||'').replace(/[\r\n;]/g,' '),r.status,r.date].map(v=>`"${String(v||'').replace(/"/g,'""')}"`).join(';'))
    ].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="contacts_${Date.now()}.csv"`);
    return res.send('﻿' + csv);
  } catch (err) { return res.status(500).json({ error: 'Export impossible.' }); }
});

/* Export CSV devis */
app.get('/api/export/devis', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('devis').select('*').order('date', { ascending: false });
    sbCheck({ error }, 'EXPORT devis');
    const rows = (data || []);
    const headers = ['ID','Prénom','Nom','Email','Téléphone','Société','Pays','Service','Budget','Délai','Origine','Destination','Volume','Description','Statut','Date'];
    const csv = [headers.join(';'),
      ...rows.map(r => [r.id,r.prenom,r.nom,r.email,r.tel,r.societe,r.pays,r.service,r.budget,
        r.delai,r.origine,r.destination,r.volume,
        (r.description||'').replace(/[\r\n;]/g,' '),r.status,r.date].map(v=>`"${String(v||'').replace(/"/g,'""')}"`).join(';'))
    ].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="devis_${Date.now()}.csv"`);
    return res.send('﻿' + csv);
  } catch (err) { return res.status(500).json({ error: 'Export impossible.' }); }
});

app.post('/api/change-password', requireAuth, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Mot de passe invalide.' });
  }
  try {
    const { data } = await supabase
      .from('settings').select('value')
      .eq('key', 'admin_password').maybeSingle();
    if (!data?.value || !comparePassword(oldPassword, data.value)) {
      return res.status(401).json({ error: 'Ancien mot de passe incorrect.' });
    }
    const { error } = await supabase.from('settings')
      .upsert({ key: 'admin_password', value: hashPassword(newPassword) }, { onConflict: 'key' });
    sbCheck({ error }, 'UPDATE password');
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Impossible de changer le mot de passe.' });
  }
});

/* ══════════════════════════════════════════════════════════
   DEVIS
══════════════════════════════════════════════════════════ */
const toDevis = (r) => !r ? null : {
  id: r.id, prenom: r.prenom, nom: r.nom,
  email: r.email, tel: r.tel, societe: r.societe,
  pays: r.pays, service: r.service, description: r.description,
  budget: r.budget, delai: r.delai, origine: r.origine,
  destination: r.destination, volume: r.volume,
  status: r.status, date: r.date, createdAt: r.created_at
};

app.post('/api/devis', async (req, res) => {
  const { prenom, nom, email, tel, societe, pays, service,
          description, budget, delai, origine, destination, volume } = req.body;
  if (!prenom || !nom || !email || !tel || !service || !description) {
    return res.status(400).json({ error: 'Champs obligatoires manquants.' });
  }
  const now = new Date().toISOString();
  const row = {
    id: `devis_${Date.now()}`,
    prenom, nom, email, tel,
    societe: societe || '', pays: pays || '',
    service, description,
    budget: budget || '', delai: delai || '',
    origine: origine || '', destination: destination || '',
    volume: volume || '',
    status: 'nouveau', date: now, created_at: now
  };
  try {
    const { error } = await supabase.from('devis').insert(row);
    sbCheck({ error }, 'INSERT devis');
    if (transporter) {
      getNotifEmail().then(to => transporter.sendMail({
        from: `"Mosaïc International" <${SMTP_FROM}>`,
        to,
        subject: `📋 Nouveau devis — ${service} — ${prenom} ${nom}`,
        html: mailHtmlWrapper('Nouvelle demande de devis', `
          ${mailRow('Nom', `${prenom} ${nom}`)}
          ${mailRow('Email', `<a href="mailto:${email}">${email}</a>`)}
          ${mailRow('Téléphone', tel)}
          ${mailRow('Société', societe)}
          ${mailRow('Pays', pays)}
          ${mailRow('Service', service)}
          ${mailRow('Budget', budget)}
          ${mailRow('Délai', delai)}
          ${mailRow('Origine', origine)}
          ${mailRow('Destination', destination)}
          ${mailRow('Volume', volume)}
          <div style="margin-top:16px;background:#f5f5f8;border-radius:8px;padding:14px;">
            <b style="color:#1a1a2e;">Description :</b>
            <p style="margin:8px 0 0;color:#444;line-height:1.6;">${description.replace(/\n/g,'<br>')}</p>
          </div>
          <div style="margin-top:16px;">
            <a href="https://mozaikinternational.com/admin" style="display:inline-block;background:#5B2D8E;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:0.85rem;">
              Voir dans l'admin
            </a>
          </div>`)
      })).catch(e => console.warn('Email devis non envoyé :', e.message));
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Impossible d'enregistrer le devis." });
  }
});

app.get('/api/devis', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('devis').select('*').order('date', { ascending: false });
    sbCheck({ error }, 'GET devis');
    return res.json((data || []).map(toDevis));
  } catch (err) {
    return res.status(500).json({ error: 'Impossible de charger les devis.' });
  }
});

app.get('/api/devis/:id', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('devis').select('*').eq('id', req.params.id).maybeSingle();
    sbCheck({ error }, 'GET devis by id');
    if (!data) return res.status(404).json({ error: 'Devis non trouvé.' });
    return res.json(toDevis(data));
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.put('/api/devis/:id/status', requireAuth, async (req, res) => {
  const { status } = req.body;
  const valid = ['nouveau', 'en_cours', 'envoye', 'accepte', 'refuse'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Statut invalide.' });
  try {
    const { error } = await supabase
      .from('devis').update({ status }).eq('id', req.params.id);
    sbCheck({ error }, 'UPDATE devis status');
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Impossible de mettre à jour.' });
  }
});

app.delete('/api/devis/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabase.from('devis').delete().eq('id', req.params.id);
    sbCheck({ error }, 'DELETE devis');
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Impossible de supprimer le devis." });
  }
});

/* ══════════════════════════════════════════════════════════
   PORTFOLIO
══════════════════════════════════════════════════════════ */
const toPortfolio = (r) => !r ? null : {
  id: r.id, title: r.title, category: r.category,
  description: r.description, status: r.status,
  image: r.image, gallery: r.gallery,
  client: r.client, location: r.location,
  date: r.date, createdAt: r.created_at
};

app.get('/api/portfolio', async (req, res) => {
  try {
    if (!supabase || !SUPABASE_URL) return res.json([]);
    const token = req.cookies?.[COOKIE_NAME];
    const isAdmin = Boolean(token && verifyToken(token));
    let q = supabase.from('portfolio').select('*').order('date', { ascending: false });
    if (!isAdmin) q = q.eq('status', 'published');
    const { data, error } = await q;
    sbCheck({ error }, 'GET portfolio');
    return res.json((data || []).map(toPortfolio));
  } catch (err) {
    return res.status(500).json({ error: 'Impossible de charger le portfolio.' });
  }
});

app.post('/api/portfolio', requireAuth, async (req, res) => {
  const { title, category, description, status, image, gallery, client, location, date } = req.body;
  if (!title || !category) return res.status(400).json({ error: 'Titre et catégorie obligatoires.' });
  const now = new Date().toISOString();
  const row = {
    id: `proj_${Date.now()}`,
    title, category,
    description: description || '',
    status: status || 'published',
    image: image || '',
    gallery: gallery || '',
    client: client || '',
    location: location || '',
    date: date || now.split('T')[0],
    created_at: now
  };
  try {
    const { error } = await supabase.from('portfolio').insert(row);
    sbCheck({ error }, 'INSERT portfolio');
    return res.json(toPortfolio(row));
  } catch (err) {
    return res.status(500).json({ error: 'Impossible de créer le projet.' });
  }
});

app.put('/api/portfolio/:id', requireAuth, async (req, res) => {
  const { title, category, description, status, image, gallery, client, location, date } = req.body;
  if (!title || !category) return res.status(400).json({ error: 'Titre et catégorie obligatoires.' });
  const updates = {
    title, category,
    description: description || '',
    status: status || 'published',
    image: image || '',
    gallery: gallery || '',
    client: client || '',
    location: location || '',
    date: date || new Date().toISOString().split('T')[0]
  };
  try {
    const { error } = await supabase.from('portfolio').update(updates).eq('id', req.params.id);
    sbCheck({ error }, 'UPDATE portfolio');
    const { data } = await supabase.from('portfolio').select('*').eq('id', req.params.id).maybeSingle();
    return res.json(toPortfolio(data));
  } catch (err) {
    return res.status(500).json({ error: 'Impossible de mettre à jour le projet.' });
  }
});

app.delete('/api/portfolio/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabase.from('portfolio').delete().eq('id', req.params.id);
    sbCheck({ error }, 'DELETE portfolio');
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Impossible de supprimer le projet.' });
  }
});

/* ── Page 404 pour les routes inconnues (non-API) ─────────── */
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Route non trouvée.' });
  }
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

/* ── Démarrage ────────────────────────────────────────────── */
if (require.main === module) {
  /* Lancement local uniquement (node server.js) */
  initAdminPassword().then(() => {
    app.listen(port, () => {
      console.log(`Mosaïc server → http://localhost:${port}`);
    });
  }).catch((err) => {
    console.error('Erreur init :', err.message);
  });
} else {
  /* Vercel serverless — init en arrière-plan, sans bloquer */
  initAdminPassword().catch((err) => {
    console.error('Init admin (serverless) :', err.message);
  });
}

module.exports = app;
