require('dotenv').config();
const express          = require('express');
const session          = require('express-session');
const { createClient } = require('@supabase/supabase-js');
const bcrypt           = require('bcryptjs');
const nodemailer       = require('nodemailer');
const path             = require('path');

const app  = express();
const port = process.env.PORT || 3000;

/* ── Supabase ─────────────────────────────────────────────── */
const SUPABASE_URL         = process.env.SUPABASE_URL        || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('SUPABASE_URL et SUPABASE_SERVICE_KEY sont requis dans .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});
console.log('Supabase connecté :', SUPABASE_URL);

/* ── Variables d'environnement ────────────────────────────── */
const ADMIN_USER     = process.env.ADMIN_USER     || 'admin';
const ADMIN_PASS     = process.env.ADMIN_PASS     || 'Mosaic2026!';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-secret';
const CONTACT_EMAIL  = process.env.CONTACT_EMAIL  || 'contact@mozaikinternational.com';
const SMTP_HOST      = process.env.SMTP_HOST      || '';
const SMTP_PORT      = Number(process.env.SMTP_PORT || 587);
const SMTP_USER      = process.env.SMTP_USER      || '';
const SMTP_PASS      = process.env.SMTP_PASS      || '';
const SMTP_SECURE    = process.env.SMTP_SECURE === 'true';

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
/*
   Colonnes DB utilisées :
   contacts : id, prenom, nom, email, tel, societe, pays, service,
              budget, message, status, date, source_page, created_at
   news     : id, title, category, status, excerpt, content, author,
              date, image_data, created_at
   settings : key, value
*/
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

/* ── Init mot de passe admin ──────────────────────────────── */
const initAdminPassword = async () => {
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
const sendContactMail = async (c) => {
  if (!transporter) return;
  try {
    await transporter.sendMail({
      from: SMTP_USER || CONTACT_EMAIL,
      to: CONTACT_EMAIL,
      subject: `Nouvelle demande de contact de ${c.prenom} ${c.nom}`,
      html: `
        <h2>Nouvelle demande de contact</h2>
        <p><b>Nom :</b> ${c.prenom} ${c.nom}</p>
        <p><b>Email :</b> ${c.email}</p>
        <p><b>Téléphone :</b> ${c.tel}</p>
        <p><b>Entreprise :</b> ${c.societe}</p>
        <p><b>Pays :</b> ${c.pays}</p>
        <p><b>Service :</b> ${c.service}</p>
        <p><b>Budget :</b> ${c.budget || 'Non précisé'}</p>
        <p><b>Message :</b><br>${c.message.replace(/\n/g, '<br>')}</p>
      `
    });
  } catch (err) {
    console.warn('Email non envoyé :', err.message);
  }
};

/* ── Auth middleware ──────────────────────────────────────── */
const requireAuth = (req, res, next) => {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'Unauthorized' });
};

/* ── Express ──────────────────────────────────────────────── */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname)));

/* ══════════════════════════════════════════════════════════
   AUTH
══════════════════════════════════════════════════════════ */
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (username !== ADMIN_USER || !password) {
    return res.status(401).json({ error: 'Identifiants invalides' });
  }
  try {
    const { data } = await supabase
      .from('settings').select('value')
      .eq('key', 'admin_password').maybeSingle();
    if (!data?.value || !comparePassword(password, data.value)) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }
    req.session.isAdmin = true;
    return res.json({ authenticated: true });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/logout', requireAuth, (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/session', (req, res) => {
  res.json({ authenticated: Boolean(req.session && req.session.isAdmin) });
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
  if (!prenom || !nom || !email || !tel || !societe || !service || !message) {
    return res.status(400).json({ error: 'Tous les champs obligatoires doivent être remplis.' });
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
    const { error } = await supabase.from('contacts').insert(row);
    sbCheck({ error }, 'INSERT contact');
    await sendContactMail({ ...row, sourcePage: row.source_page });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Impossible d'enregistrer la demande." });
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
    const { error } = await supabase
      .from('contacts').delete().eq('id', req.params.id);
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
    const isAdmin = req.session && req.session.isAdmin;
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
app.get('/api/settings', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('settings').select('key, value');
    sbCheck({ error }, 'GET settings');
    const s = (data || []).reduce((acc, r) => ({ ...acc, [r.key]: r.value }), {});
    return res.json({
      phone:   s.site_phone   || '+235 62 68 68 12',
      email:   s.site_email   || CONTACT_EMAIL,
      address: s.site_address || "425W+W78, N'Djaména, Tchad",
      hours:   s.site_hours   || 'Lun – Sam : 07h00 – 18h00'
    });
  } catch (err) {
    return res.status(500).json({ error: 'Impossible de charger les paramètres.' });
  }
});

app.post('/api/settings', requireAuth, async (req, res) => {
  const { phone, email, address, hours } = req.body;
  try {
    const { error } = await supabase.from('settings').upsert([
      { key: 'site_phone',   value: phone   || '' },
      { key: 'site_email',   value: email   || CONTACT_EMAIL },
      { key: 'site_address', value: address || "425W+W78, N'Djaména, Tchad" },
      { key: 'site_hours',   value: hours   || 'Lun – Sam : 07h00 – 18h00' }
    ], { onConflict: 'key' });
    sbCheck({ error }, 'UPSERT settings');
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Impossible d'enregistrer les paramètres." });
  }
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

/* ── Démarrage ────────────────────────────────────────────── */
initAdminPassword().then(() => {
  app.listen(port, () => {
    console.log(`Mosaïc server → http://localhost:${port}`);
  });
}).catch((err) => {
  console.error('Erreur init :', err.message);
  process.exit(1);
});
