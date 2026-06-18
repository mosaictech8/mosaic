const API_BASE = '/api';

const api = async (path, options = {}) => {
  const fetchOptions = {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options
  };

  if (options.body && typeof options.body === 'object') {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_BASE}${path}`, fetchOptions);
  const contentType = response.headers.get('content-type');
  const body = contentType && contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    throw new Error(body?.error || response.statusText || 'Erreur serveur');
  }

  return body;
};

const escHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const formatDate = (value, full = false) => {
  if (!value) return '—';
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;
  return full
    ? date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
};

const showLoginError = () => document.getElementById('loginError').classList.add('show');
const hideLoginError = () => document.getElementById('loginError').classList.remove('show');

const getNews = async () => await api('/news', { method: 'GET' });
const getContacts = async () => await api('/contacts', { method: 'GET' });
const getContact = async (id) => await api(`/contacts/${encodeURIComponent(id)}`, { method: 'GET' });
const getArticle = async (id) => await api(`/news/${encodeURIComponent(id)}`, { method: 'GET' });
const getSettings = async () => await api('/settings', { method: 'GET' });

document.addEventListener('DOMContentLoaded', async () => {
  const dateLabel = document.getElementById('today-date');
  if (dateLabel) {
    dateLabel.textContent = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  const authenticated = await checkSession();
  if (authenticated) {
    await showDashboard();
  }
});

async function checkSession() {
  try {
    const sessionInfo = await api('/session', { method: 'GET' });
    return sessionInfo.authenticated === true;
  } catch {
    return false;
  }
}

async function doLogin(event) {
  event.preventDefault();
  hideLoginError();

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  try {
    await api('/login', { method: 'POST', body: { username, password } });
    await showDashboard();
  } catch (error) {
    showLoginError();
  }
}

async function doLogout() {
  try {
    await api('/logout', { method: 'POST' });
  } catch (error) {
    console.warn('Déconnexion impossible :', error.message);
  }
  sessionStorage.clear();
  location.reload();
}

async function showDashboard() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('dashboard').classList.add('visible');
  refreshAll();
  try {
    const settings = await getSettings();
    document.getElementById('set-phone').value = settings.phone || '';
    document.getElementById('set-email').value = settings.email || '';
    document.getElementById('set-address').value = settings.address || '';
    document.getElementById('set-hours').value = settings.hours || '';
  } catch (error) {
    console.info('Impossible de récupérer les paramètres :', error.message);
  }
}

function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar.classList.toggle('mobile-open');
  overlay.classList.toggle('show');
}

function closeSidebarMobile() {
  if (window.innerWidth <= 768) {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar.classList.remove('mobile-open');
    overlay.classList.remove('show');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('sidebar-overlay');
  if (overlay) overlay.addEventListener('click', closeSidebarMobile);
});

async function showPanel(id) {
  document.querySelectorAll('.panel').forEach((panel) => panel.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));
  document.querySelector(`.nav-item[onclick="showPanel('${id}')"]`)?.classList.add('active');

  const titles = {
    'dashboard-home': 'Tableau de bord',
    'panel-news': 'Actualités',
    'panel-contacts': 'Demandes reçues',
    'panel-devis': 'Demandes de devis',
    'panel-portfolio': 'Portfolio',
    'panel-settings': 'Paramètres'
  };
  document.getElementById('panel-title').textContent = titles[id] || '';

  closeSidebarMobile();

  if (id === 'panel-contacts') await renderContacts();
  if (id === 'panel-news') await renderNews();
  if (id === 'panel-devis') await renderDevis();
  if (id === 'panel-portfolio') await renderPortfolio();
  if (id === 'dashboard-home') await refreshAll();
}

/* ══════════════════════════════════════════════════════════
   DEVIS
══════════════════════════════════════════════════════════ */
const DEVIS_STATUS = {
  nouveau:  { label: 'Nouveau',    cls: 'status-new' },
  en_cours: { label: 'En cours',   cls: 'status-read' },
  envoye:   { label: 'Envoyé',     cls: 'status-published' },
  accepte:  { label: 'Accepté',    cls: 'status-published' },
  refuse:   { label: 'Refusé',     cls: 'status-draft' }
};

async function renderDevis() {
  try {
    const devisList = await api('/devis', { method: 'GET' });
    const tbody = document.getElementById('devis-table-body');
    // Badge
    const nouveaux = devisList.filter(d => d.status === 'nouveau').length;
    const badge = document.getElementById('devis-badge');
    if (nouveaux > 0) { badge.textContent = nouveaux; badge.style.display = 'flex'; }
    else badge.style.display = 'none';
    document.getElementById('stat-devis').textContent = devisList.length;

    if (!devisList.length) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><i class="fas fa-file-invoice-dollar"></i><p>Aucun devis reçu.</p></div></td></tr>';
      return;
    }
    tbody.innerHTML = devisList.map(d => {
      const s = DEVIS_STATUS[d.status] || DEVIS_STATUS.nouveau;
      return `<tr style="${d.status==='nouveau'?'font-weight:600;':''}">
        <td><span class="status ${s.cls}"><span class="status-dot"></span>${s.label}</span></td>
        <td>${escHtml(d.prenom+' '+d.nom)}</td>
        <td style="font-size:.82rem;color:var(--texte-clair);">${escHtml(d.societe||'—')}</td>
        <td><span style="background:rgba(91,45,142,.08);color:var(--violet);padding:.2rem .6rem;border-radius:50px;font-size:.78rem;font-weight:700;">${escHtml(d.service||'—')}</span></td>
        <td style="font-size:.82rem;">${escHtml(d.budget||'—')}</td>
        <td style="font-size:.8rem;color:var(--texte-clair);">${escHtml(formatDate(d.date))}</td>
        <td>
          <div class="td-actions">
            <button class="btn btn-secondary btn-sm" onclick="openDevis('${d.id}')"><i class="fas fa-eye"></i></button>
            <button class="btn btn-danger btn-sm" onclick="deleteDevis('${d.id}')"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>`;
    }).join('');
  } catch (err) {
    console.error('Impossible de charger les devis :', err.message);
  }
}

async function openDevis(id) {
  try {
    const d = await api(`/devis/${encodeURIComponent(id)}`, { method: 'GET' });
    if (!d) return;
    const s = DEVIS_STATUS[d.status] || DEVIS_STATUS.nouveau;
    document.getElementById('devis-modal-body').innerHTML = `
      <div class="detail-row"><div class="detail-label">Nom</div><div class="detail-value">${escHtml(d.prenom)} ${escHtml(d.nom)}</div></div>
      <div class="detail-row"><div class="detail-label">Email</div><div class="detail-value"><a href="mailto:${escHtml(d.email)}" style="color:var(--violet);">${escHtml(d.email)}</a></div></div>
      <div class="detail-row"><div class="detail-label">Téléphone</div><div class="detail-value">${escHtml(d.tel||'—')}</div></div>
      <div class="detail-row"><div class="detail-label">Société</div><div class="detail-value">${escHtml(d.societe||'—')}</div></div>
      <div class="detail-row"><div class="detail-label">Pays</div><div class="detail-value">${escHtml(d.pays||'—')}</div></div>
      <div class="detail-row"><div class="detail-label">Service</div><div class="detail-value">${escHtml(d.service||'—')}</div></div>
      <div class="detail-row"><div class="detail-label">Budget</div><div class="detail-value">${escHtml(d.budget||'—')}</div></div>
      <div class="detail-row"><div class="detail-label">Délai</div><div class="detail-value">${escHtml(d.delai||'—')}</div></div>
      ${d.origine ? `<div class="detail-row"><div class="detail-label">Origine</div><div class="detail-value">${escHtml(d.origine)}</div></div>` : ''}
      ${d.destination ? `<div class="detail-row"><div class="detail-label">Destination</div><div class="detail-value">${escHtml(d.destination)}</div></div>` : ''}
      ${d.volume ? `<div class="detail-row"><div class="detail-label">Volume</div><div class="detail-value">${escHtml(d.volume)}</div></div>` : ''}
      <div class="detail-row"><div class="detail-label">Date</div><div class="detail-value">${escHtml(formatDate(d.date,true))}</div></div>
      <div class="detail-row" style="flex-direction:column;">
        <div class="detail-label" style="margin-bottom:.5rem;">Description</div>
        <div class="detail-message">${escHtml(d.description||'—')}</div>
      </div>
    `;
    // Store current devis data for PDF generation
    window._currentDevis = d;
    document.getElementById('devis-modal-footer').innerHTML = `
      <div style="display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;width:100%;">
        <div style="display:flex;align-items:center;gap:.5rem;">
          <label style="font-size:.82rem;font-weight:600;">Statut :</label>
          <select id="devis-status-select" class="form-control" style="width:auto;padding:.4rem .8rem;font-size:.82rem;">
            ${Object.entries(DEVIS_STATUS).map(([k,v])=>`<option value="${k}" ${d.status===k?'selected':''}>${v.label}</option>`).join('')}
          </select>
          <button class="btn btn-primary btn-sm" onclick="updateDevisStatus('${d.id}')"><i class="fas fa-save"></i> Sauvegarder</button>
        </div>
        <a href="mailto:${escHtml(d.email)}?subject=Votre%20devis%20—%20Mosaïc%20International" class="btn btn-secondary"><i class="fas fa-reply"></i> Répondre</a>
        <button class="btn btn-secondary" onclick="printDevis(window._currentDevis)" style="background:#f0f4ff;color:#3b4e9e;border-color:#c7d2f0;"><i class="fas fa-file-pdf"></i> Télécharger PDF</button>
        <button class="btn btn-danger" style="margin-left:auto;" onclick="deleteDevis('${d.id}');closeDevisModal();"><i class="fas fa-trash"></i></button>
      </div>
    `;
    document.getElementById('devis-modal').classList.add('open');
  } catch (err) {
    alert('Impossible d\'ouvrir le devis.');
  }
}

async function updateDevisStatus(id) {
  const status = document.getElementById('devis-status-select').value;
  try {
    await api(`/devis/${encodeURIComponent(id)}/status`, { method: 'PUT', body: { status } });
    await renderDevis();
    closeDevisModal();
  } catch (err) {
    alert('Impossible de mettre à jour le statut.');
  }
}

async function deleteDevis(id) {
  if (!confirm('Supprimer ce devis ?')) return;
  try {
    await api(`/devis/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await renderDevis();
    await refreshAll();
  } catch (err) {
    alert('Impossible de supprimer le devis.');
  }
}

function closeDevisModal() {
  document.getElementById('devis-modal').classList.remove('open');
}

function openDevisForm() {
  const card = document.getElementById('devis-form-card');
  card.style.display = 'block';
  card.scrollIntoView({ behavior: 'smooth' });
  // Reset
  ['prenom','nom','email','tel','societe','origine','destination','volume','description'].forEach(id => {
    const el = document.getElementById('dv-' + id);
    if (el) el.value = '';
  });
  ['pays','service','budget','delai'].forEach(id => {
    const el = document.getElementById('dv-' + id);
    if (el) el.value = '';
  });
  document.getElementById('dv-status').value = 'nouveau';
}

function closeDevisForm() {
  document.getElementById('devis-form-card').style.display = 'none';
}

async function saveDevisAdmin() {
  const g = id => (document.getElementById('dv-' + id)?.value || '').trim();
  if (!g('prenom') || !g('nom') || !g('email') || !g('tel') || !g('service') || !g('description')) {
    alert('Prénom, nom, email, téléphone, service et description sont obligatoires.');
    return;
  }
  const payload = {
    prenom: g('prenom'), nom: g('nom'), email: g('email'), tel: g('tel'),
    societe: g('societe'), pays: g('pays'), service: g('service'),
    description: g('description'), budget: g('budget'), delai: g('delai'),
    origine: g('origine'), destination: g('destination'), volume: g('volume')
  };
  try {
    await api('/devis', { method: 'POST', body: payload });
    // Mettre à jour le statut si différent de "nouveau"
    const status = document.getElementById('dv-status').value;
    if (status !== 'nouveau') {
      const devisList = await api('/devis', { method: 'GET' });
      const last = devisList[0];
      if (last) await api(`/devis/${encodeURIComponent(last.id)}/status`, { method: 'PUT', body: { status } });
    }
    closeDevisForm();
    await renderDevis();
    await refreshAll();
    const alertEl = document.createElement('div');
    alertEl.className = 'alert alert-success';
    alertEl.style.cssText = 'position:fixed;top:80px;right:24px;z-index:9999;padding:.85rem 1.25rem;border-radius:10px;background:#dcfce7;color:#166534;border:1px solid #86efac;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,.12);';
    alertEl.innerHTML = '<i class="fas fa-check-circle"></i> Devis créé avec succès !';
    document.body.appendChild(alertEl);
    setTimeout(() => alertEl.remove(), 3000);
  } catch (err) {
    alert('Erreur : ' + err.message);
  }
}

async function refreshAll() {
  try {
    const [news, contacts, devisList, portfolioList] = await Promise.all([
      getNews(), getContacts(),
      api('/devis', { method: 'GET' }).catch(() => []),
      api('/portfolio', { method: 'GET' }).catch(() => [])
    ]);
    const unread = contacts.filter((contact) => contact.status === 'new').length;
    const newDevis = devisList.filter(d => d.status === 'nouveau').length;

    document.getElementById('stat-news').textContent = news.filter((article) => article.status === 'published').length;
    document.getElementById('stat-total-contacts').textContent = contacts.length;
    document.getElementById('stat-unread').textContent = unread;
    document.getElementById('stat-portfolio').textContent = portfolioList.filter(p => p.status === 'published').length;
    document.getElementById('stat-devis').textContent = devisList.length;

    const badge = document.getElementById('unread-badge');
    if (unread > 0) { badge.textContent = unread; badge.style.display = 'flex'; }
    else badge.style.display = 'none';

    const devisBadge = document.getElementById('devis-badge');
    if (newDevis > 0) { devisBadge.textContent = newDevis; devisBadge.style.display = 'flex'; }
    else devisBadge.style.display = 'none';

    renderRecentContacts(contacts);
  } catch (error) {
    console.warn('Impossible d actualiser le tableau de bord :', error.message);
  }
}

function renderRecentContacts(contacts) {
  const wrap = document.getElementById('recent-contacts-list');
  if (!contacts || contacts.length === 0) {
    wrap.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>Aucune demande.</p></div>';
    return;
  }

  wrap.innerHTML = contacts.slice(0, 5).map((contact) => `
    <div style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem 0;border-bottom:1px solid var(--gris);cursor:pointer;" onclick="openContact('${contact.id}')">
      <div style="width:36px;height:36px;border-radius:50%;background:var(--gris-clair);display:flex;align-items:center;justify-content:center;color:var(--violet);font-size:0.9rem;flex-shrink:0;">
        <i class="fas fa-user"></i>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:0.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(contact.prenom)} ${escHtml(contact.nom)}</div>
        <div style="font-size:0.75rem;color:var(--texte-clair);">${escHtml(contact.service || 'Non précisé')} · ${escHtml(formatDate(contact.date))}</div>
      </div>
      ${contact.status === 'new' ? '<span class="status status-new"><span class="status-dot"></span>Nouveau</span>' : ''}
    </div>
  `).join('');
}

async function renderContacts() {
  try {
    const contacts = await getContacts();
    const tbody = document.getElementById('contacts-table-body');

    if (!contacts.length) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><i class="fas fa-inbox"></i><p>Aucune demande reçue.</p></div></td></tr>';
      return;
    }

    tbody.innerHTML = contacts.map((contact) => `
      <tr style="${contact.status === 'new' ? 'font-weight:600;' : ''}">
        <td>${contact.status === 'new' ? '<span class="status status-new"><span class="status-dot"></span>Nouveau</span>' : '<span class="status status-read"><span class="status-dot"></span>Lu</span>'}</td>
        <td>${escHtml(contact.prenom + ' ' + contact.nom)}</td>
        <td><a href="mailto:${escHtml(contact.email)}" style="color:var(--violet);">${escHtml(contact.email)}</a></td>
        <td>${escHtml(contact.tel || '—')}</td>
        <td>${escHtml(contact.service || '—')}</td>
        <td style="font-size:0.8rem;color:var(--texte-clair);">${escHtml(formatDate(contact.date))}</td>
        <td>
          <div class="td-actions">
            <button class="btn btn-secondary btn-sm" onclick="openContact('${contact.id}')"><i class="fas fa-eye"></i></button>
            <button class="btn btn-danger btn-sm" onclick="deleteContact('${contact.id}')"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Impossible de charger les demandes :', error.message);
  }
}

async function openContact(id) {
  try {
    const contact = await getContact(id);
    if (!contact) return;

    if (contact.status === 'new') {
      await api(`/contacts/${encodeURIComponent(id)}/status`, {
        method: 'PUT',
        body: { status: 'read' }
      });
      await refreshAll();
      await renderContacts();
    }

    const modalBody = document.getElementById('modal-body-content');
    modalBody.innerHTML = `
      <div class="detail-row"><div class="detail-label">Nom</div><div class="detail-value">${escHtml(contact.prenom)} ${escHtml(contact.nom)}</div></div>
      <div class="detail-row"><div class="detail-label">Email</div><div class="detail-value"><a href="mailto:${escHtml(contact.email)}" style="color:var(--violet);">${escHtml(contact.email)}</a></div></div>
      <div class="detail-row"><div class="detail-label">Téléphone</div><div class="detail-value">${escHtml(contact.tel || '—')}</div></div>
      <div class="detail-row"><div class="detail-label">Entreprise</div><div class="detail-value">${escHtml(contact.societe || '—')}</div></div>
      <div class="detail-row"><div class="detail-label">Pays</div><div class="detail-value">${escHtml(contact.pays || '—')}</div></div>
      <div class="detail-row"><div class="detail-label">Service</div><div class="detail-value">${escHtml(contact.service || '—')}</div></div>
      <div class="detail-row"><div class="detail-label">Date</div><div class="detail-value">${escHtml(formatDate(contact.date, true))}</div></div>
      <div class="detail-row" style="flex-direction:column;">
        <div class="detail-label" style="margin-bottom:0.5rem;">Message</div>
        <div class="detail-message">${escHtml(contact.message || 'Aucun message.')}</div>
      </div>
    `;

    const footer = document.getElementById('modal-footer-content');
    footer.innerHTML = `
      <a href="mailto:${escHtml(contact.email)}?subject=Re%3A%20Votre%20demande%20%E2%80%94%20Mosa%C3%AFc%20International" class="btn btn-primary"><i class="fas fa-reply"></i> Répondre par email</a>
      ${contact.tel ? `<a href="tel:${escHtml(contact.tel)}" class="btn btn-secondary"><i class="fas fa-phone"></i> Appeler</a>` : ''}
      <button class="btn btn-danger" style="margin-left:auto;" onclick="deleteContact('${contact.id}'); closeModal();"><i class="fas fa-trash"></i></button>
    `;
    document.getElementById('contact-modal').classList.add('open');
  } catch (error) {
    console.error('Impossible d ouvrir la demande :', error.message);
  }
}

function closeModal() {
  document.getElementById('contact-modal').classList.remove('open');
}

async function deleteContact(id) {
  if (!confirm('Supprimer cette demande ?')) return;
  try {
    await api(`/contacts/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await renderContacts();
    await refreshAll();
  } catch (error) {
    alert('Impossible de supprimer la demande.');
  }
}

async function clearAllContacts() {
  if (!confirm('Supprimer TOUTES les demandes ? Cette action est irréversible.')) return;
  try {
    await api('/contacts', { method: 'DELETE' });
    await renderContacts();
    await refreshAll();
  } catch (error) {
    alert('Impossible de supprimer toutes les demandes.');
  }
}

async function openNewsForm(id = null) {
  const card = document.getElementById('news-form-card');
  card.style.display = 'block';
  card.scrollIntoView({ behavior: 'smooth' });
  if (id) {
    try {
      const article = await getArticle(id);
      document.getElementById('news-form-title').textContent = 'Modifier l\'article';
      document.getElementById('news-title').value = article.title;
      document.getElementById('news-cat').value = article.category;
      document.getElementById('news-status').value = article.status;
      document.getElementById('news-excerpt').value = article.excerpt || '';
      document.getElementById('news-content').innerHTML = article.content || '';
      document.getElementById('news-author').value = article.author || 'Équipe Mosaïc International';
      document.getElementById('news-date').value = article.date || new Date().toISOString().split('T')[0];
      setNewsImagePreview(article.imageData || '');
      window._articleImageUrl = article.imageData || '';
      window.editingNewsId = id;
    } catch (error) {
      alert('Impossible de charger l article.');
    }
  } else {
    window.editingNewsId = null;
    document.getElementById('news-form-title').textContent = 'Nouvel article';
    document.getElementById('news-title').value = '';
    document.getElementById('news-cat').value = '';
    document.getElementById('news-status').value = 'published';
    document.getElementById('news-excerpt').value = '';
    document.getElementById('news-content').innerHTML = '';
    document.getElementById('news-author').value = 'Équipe Mosaïc International';
    document.getElementById('news-date').value = new Date().toISOString().split('T')[0];
    setNewsImagePreview('');
    window._articleImageUrl = '';
  }
}

function closeNewsForm() {
  document.getElementById('news-form-card').style.display = 'none';
  window.editingNewsId = null;
  window._articleImageUrl = '';
  setNewsImagePreview('');
}

async function saveArticle() {
  const title = document.getElementById('news-title').value.trim();
  const category = document.getElementById('news-cat').value;
  const status = document.getElementById('news-status').value;
  const excerpt = document.getElementById('news-excerpt').value.trim();
  const content = document.getElementById('news-content').innerHTML.trim();
  const author = document.getElementById('news-author').value.trim();
  const date = document.getElementById('news-date').value;
  const imageData = getNewsImageData();

  if (!title || !category) {
    alert('Titre et catégorie sont obligatoires.');
    return;
  }

  const payload = { title, category, status, excerpt, content, author, date, imageData };

  try {
    if (window.editingNewsId) {
      await api(`/news/${encodeURIComponent(window.editingNewsId)}`, { method: 'PUT', body: payload });
    } else {
      await api('/news', { method: 'POST', body: payload });
    }
    await renderNews();
    await refreshAll();
    closeNewsForm();
    const alertEl = document.getElementById('news-alert');
    document.getElementById('news-alert-msg').textContent = window.editingNewsId ? 'Article modifié avec succès !' : 'Article publié avec succès !';
    alertEl.classList.add('show');
    setTimeout(() => alertEl.classList.remove('show'), 3000);
  } catch (error) {
    alert(error.message || 'Impossible d enregistrer l article.');
  }
}

async function renderNews() {
  try {
    const articles = await getNews();
    document.getElementById('news-count').textContent = `(${articles.length})`;
    const tbody = document.getElementById('news-table-body');

    if (!articles.length) {
      tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state"><i class="fas fa-newspaper"></i><p>Aucun article. Créez votre premier article !</p></div></td></tr>';
      return;
    }

    tbody.innerHTML = articles.map((article) => `
      <tr>
        <td style="max-width:280px;font-weight:600;">${escHtml(article.title)}</td>
        <td><span style="background:rgba(91,45,142,0.08);color:var(--violet);padding:0.2rem 0.6rem;border-radius:50px;font-size:0.78rem;font-weight:700;">${escHtml(article.category)}</span></td>
        <td style="font-size:0.82rem;color:var(--texte-clair);">${escHtml(formatDate(article.date))}</td>
        <td>${article.status === 'published' ? '<span class="status status-published"><span class="status-dot"></span>Publié</span>' : '<span class="status status-draft"><span class="status-dot"></span>Brouillon</span>'}</td>
        <td>
          <div class="td-actions">
            <button class="btn btn-secondary btn-sm" onclick="openNewsForm('${article.id}')"><i class="fas fa-edit"></i></button>
            <button class="btn btn-danger btn-sm" onclick="deleteArticle('${article.id}')"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Impossible de charger les articles :', error.message);
  }
}

async function deleteArticle(id) {
  if (!confirm('Supprimer cet article ?')) return;
  try {
    await api(`/news/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await renderNews();
    await refreshAll();
  } catch (error) {
    alert('Impossible de supprimer cet article.');
  }
}

async function saveSettings() {
  const phone = document.getElementById('set-phone').value.trim();
  const email = document.getElementById('set-email').value.trim();
  const address = document.getElementById('set-address').value.trim();
  const hours = document.getElementById('set-hours').value.trim();

  try {
    await api('/settings', { method: 'POST', body: { phone, email, address, hours } });
    alert('Paramètres enregistrés !');
  } catch (error) {
    alert(error.message || 'Impossible d enregistrer les paramètres.');
  }
}

async function changePassword() {
  const oldPassword = document.getElementById('pwd-old').value;
  const newPassword = document.getElementById('pwd-new').value;

  try {
    await api('/change-password', { method: 'POST', body: { oldPassword, newPassword } });
    document.getElementById('pwd-old').value = '';
    document.getElementById('pwd-new').value = '';
    alert('Mot de passe modifié avec succès !');
  } catch (error) {
    alert(error.message || 'Impossible de changer le mot de passe.');
  }
}

function fmt(cmd, val = null) {
  document.execCommand(cmd, false, val);
  document.getElementById('news-content').focus();
}

async function previewImg(input) {
  if (!input.files || !input.files[0]) return;

  const file = input.files[0];

  // Vérification taille (max 4 Mo)
  if (file.size > 4 * 1024 * 1024) {
    alert('Image trop lourde (max 4 Mo). Réduisez sa taille avant d\'uploader.');
    input.value = '';
    return;
  }

  // Lire en base64 pour la prévisualisation
  const reader = new FileReader();
  reader.onload = async (event) => {
    const base64 = event.target.result;
    setNewsImagePreview(base64, true); // mode "chargement"

    try {
      const res = await fetch('/api/upload-image', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: base64 })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Erreur upload');
      // Remplacer le src par l'URL Supabase Storage
      setNewsImagePreview(result.url, false);
      window._articleImageUrl = result.url;
    } catch (err) {
      alert('Impossible d\'uploader l\'image : ' + err.message);
      setNewsImagePreview('', false);
      input.value = '';
      window._articleImageUrl = '';
    }
  };
  reader.readAsDataURL(file);
}

function setNewsImagePreview(src, loading = false) {
  const wrap = document.getElementById('img-preview-wrap');
  let img = wrap.querySelector('img');

  if (src) {
    if (!img) {
      img = document.createElement('img');
      wrap.appendChild(img);
    }
    img.src = src;
    img.style.opacity = loading ? '0.4' : '1';
    wrap.querySelector('i').style.display = 'none';
    wrap.querySelector('span').style.display = loading ? '' : 'none';
    if (loading) wrap.querySelector('span').textContent = 'Envoi en cours…';
  } else {
    if (img) img.remove();
    wrap.querySelector('i').style.display = '';
    wrap.querySelector('span').style.display = '';
    wrap.querySelector('span').textContent = 'Cliquer pour ajouter une image';
    document.getElementById('news-image').value = '';
    window._articleImageUrl = '';
  }
}

function getNewsImageData() {
  // Retourne l'URL Supabase Storage (pas le base64)
  return window._articleImageUrl || '';
}

document.getElementById('contact-modal').addEventListener('click', (event) => {
  if (event.target === document.getElementById('contact-modal')) {
    closeModal();
  }
});

document.getElementById('devis-modal').addEventListener('click', (event) => {
  if (event.target === document.getElementById('devis-modal')) {
    closeDevisModal();
  }
});

/* ══════════════════════════════════════════════════════════
   PORTFOLIO
══════════════════════════════════════════════════════════ */
const PORTFOLIO_CAT = {
  telecom:     'Télécom',
  logistique:  'Transport & Logistique',
  'genie-civil': 'Génie Civil',
  agrobusiness: 'Agrobusiness',
  export:      'Export',
  medical:     'Distribution Médicale'
};

async function renderPortfolio() {
  try {
    const projects = await api('/portfolio', { method: 'GET' });
    const published = projects.filter(p => p.status === 'published').length;
    document.getElementById('portfolio-count').textContent = `(${projects.length})`;
    document.getElementById('stat-portfolio').textContent = published;
    const tbody = document.getElementById('portfolio-table-body');

    if (!projects.length) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><i class="fas fa-briefcase"></i><p>Aucun projet créé. Cliquez sur "Nouveau projet" pour commencer.</p></div></td></tr>';
      return;
    }

    tbody.innerHTML = projects.map(p => {
      const catLabel = PORTFOLIO_CAT[p.category] || p.category || '—';
      const thumb = p.image
        ? `<img src="${escHtml(p.image)}" alt="" style="width:52px;height:38px;object-fit:cover;border-radius:6px;">`
        : `<div style="width:52px;height:38px;background:var(--gris-clair);border-radius:6px;display:flex;align-items:center;justify-content:center;"><i class="fas fa-image" style="color:var(--texte-clair);font-size:.8rem;"></i></div>`;
      return `
        <tr>
          <td>${thumb}</td>
          <td style="font-weight:600;max-width:220px;">${escHtml(p.title)}</td>
          <td><span style="background:rgba(91,45,142,.08);color:var(--violet);padding:.2rem .6rem;border-radius:50px;font-size:.78rem;font-weight:700;">${escHtml(catLabel)}</span></td>
          <td style="font-size:.82rem;color:var(--texte-clair);">${escHtml(p.client||'—')}</td>
          <td style="font-size:.8rem;color:var(--texte-clair);">${escHtml(p.date ? p.date.slice(0,7) : '—')}</td>
          <td>${p.status === 'published'
            ? '<span class="status status-published"><span class="status-dot"></span>Publié</span>'
            : '<span class="status status-draft"><span class="status-dot"></span>Brouillon</span>'}</td>
          <td>
            <div class="td-actions">
              <button class="btn btn-secondary btn-sm" onclick="openPortfolioForm('${p.id}')"><i class="fas fa-edit"></i></button>
              <button class="btn btn-danger btn-sm" onclick="deletePortfolio('${p.id}')"><i class="fas fa-trash"></i></button>
            </div>
          </td>
        </tr>`;
    }).join('');
  } catch (err) {
    console.error('Impossible de charger le portfolio :', err.message);
  }
}

async function openPortfolioForm(id = null) {
  const card = document.getElementById('portfolio-form-card');
  card.style.display = 'block';
  card.scrollIntoView({ behavior: 'smooth' });

  const resetImg = () => {
    const img = document.getElementById('pf-image-preview-img');
    const lbl = document.getElementById('pf-drop-label');
    if (img) { img.src = ''; img.style.display = 'none'; }
    if (lbl) lbl.style.display = 'block';
    document.getElementById('pf-upload-status').textContent = '';
  };

  if (id) {
    window._editingPortfolioId = id;
    try {
      const projects = await api('/portfolio', { method: 'GET' });
      const p = projects.find(x => x.id === id);
      if (!p) return;
      document.getElementById('portfolio-form-title').textContent = 'Modifier le projet';
      document.getElementById('pf-title').value       = p.title       || '';
      document.getElementById('pf-category').value    = p.category    || '';
      document.getElementById('pf-status').value      = p.status      || 'published';
      document.getElementById('pf-client').value      = p.client      || '';
      document.getElementById('pf-location').value    = p.location    || '';
      document.getElementById('pf-date').value        = p.date        || '';
      document.getElementById('pf-image').value       = p.image       || '';
      document.getElementById('pf-description').value = p.description || '';
      try {
        const gallery = p.gallery ? JSON.parse(p.gallery) : [];
        document.getElementById('pf-gallery').value = gallery.join('\n');
      } catch { document.getElementById('pf-gallery').value = p.gallery || ''; }
      renderGalleryPreview();
      if (p.image) {
        const img = document.getElementById('pf-image-preview-img');
        img.src = p.image;
        img.style.display = 'block';
        const lbl = document.getElementById('pf-drop-label');
        if (lbl) lbl.style.display = 'none';
      } else resetImg();
    } catch (err) {
      alert('Impossible de charger le projet.');
    }
  } else {
    window._editingPortfolioId = null;
    document.getElementById('portfolio-form-title').textContent = 'Nouveau projet';
    ['title','client','location','image','description','gallery'].forEach(f => {
      document.getElementById('pf-' + f).value = '';
    });
    document.getElementById('pf-category').value = '';
    document.getElementById('pf-status').value   = 'published';
    document.getElementById('pf-date').value     = new Date().toISOString().split('T')[0];
    resetImg();
    renderGalleryPreview();
  }
}

function closePortfolioForm() {
  document.getElementById('portfolio-form-card').style.display = 'none';
  window._editingPortfolioId = null;
}

async function savePortfolio() {
  const title    = document.getElementById('pf-title').value.trim();
  const category = document.getElementById('pf-category').value;
  if (!title)    { alert('Le titre est obligatoire.'); return; }
  if (!category) { alert('La catégorie est obligatoire.'); return; }

  const galleryRaw = document.getElementById('pf-gallery').value.trim();
  const gallery    = JSON.stringify(galleryRaw.split('\n').map(u => u.trim()).filter(Boolean));

  const payload = {
    title, category,
    status:      document.getElementById('pf-status').value,
    client:      document.getElementById('pf-client').value.trim(),
    location:    document.getElementById('pf-location').value.trim(),
    date:        document.getElementById('pf-date').value,
    image:       document.getElementById('pf-image').value.trim(),
    description: document.getElementById('pf-description').value.trim(),
    gallery
  };

  try {
    if (window._editingPortfolioId) {
      await api(`/portfolio/${encodeURIComponent(window._editingPortfolioId)}`, { method: 'PUT', body: payload });
    } else {
      await api('/portfolio', { method: 'POST', body: payload });
    }
    closePortfolioForm();
    await renderPortfolio();
    await refreshAll();

    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;top:80px;right:24px;z-index:9999;padding:.85rem 1.25rem;border-radius:10px;background:#dcfce7;color:#166534;border:1px solid #86efac;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,.12);';
    toast.innerHTML = `<i class="fas fa-check-circle"></i> Projet ${window._editingPortfolioId ? 'modifié' : 'créé'} avec succès !`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  } catch (err) {
    alert('Erreur : ' + err.message);
  }
}

async function deletePortfolio(id) {
  if (!confirm('Supprimer ce projet du portfolio ?')) return;
  try {
    await api(`/portfolio/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await renderPortfolio();
    await refreshAll();
  } catch (err) {
    alert('Impossible de supprimer le projet.');
  }
}

async function _uploadOneImage(dataUrl) {
  const res = await fetch('/api/upload-image', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: dataUrl })
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || 'Erreur upload');
  return result.url;
}

async function uploadPortfolioImage(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  if (file.size > 4 * 1024 * 1024) {
    alert('Image trop lourde (max 4 Mo). Réduisez sa taille.');
    input.value = '';
    return;
  }
  const status = document.getElementById('pf-upload-status');
  status.textContent = 'Envoi…';
  status.style.color = 'var(--texte-clair)';
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const url = await _uploadOneImage(e.target.result);
      document.getElementById('pf-image').value = url;
      const img = document.getElementById('pf-image-preview-img');
      img.src = url;
      img.style.display = 'block';
      document.getElementById('pf-drop-label').style.display = 'none';
      status.textContent = 'Image uploadée !';
      status.style.color = 'var(--success)';
      setTimeout(() => { status.textContent = ''; }, 3000);
    } catch (err) {
      alert('Impossible d\'uploader l\'image : ' + err.message);
      input.value = '';
      status.textContent = '';
    }
  };
  reader.readAsDataURL(file);
}

function renderGalleryPreview() {
  const textarea = document.getElementById('pf-gallery');
  const preview  = document.getElementById('pf-gallery-preview');
  if (!textarea || !preview) return;
  const urls = textarea.value.split('\n').map(u => u.trim()).filter(Boolean);
  if (!urls.length) { preview.innerHTML = ''; return; }
  preview.innerHTML = urls.map((url, i) => `
    <div style="position:relative;border-radius:8px;overflow:hidden;background:var(--gris-clair);">
      <img src="${escHtml(url)}" alt="" style="width:100%;height:80px;object-fit:cover;display:block;"
           onerror="this.parentElement.style.display='none'">
      <button type="button" onclick="removeGalleryImage(${i})"
        style="position:absolute;top:3px;right:3px;width:22px;height:22px;border-radius:50%;border:none;background:rgba(220,38,38,.85);color:#fff;font-size:.7rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">
        <i class="fas fa-times"></i>
      </button>
    </div>`).join('');
}

function removeGalleryImage(idx) {
  const textarea = document.getElementById('pf-gallery');
  const urls = textarea.value.split('\n').map(u => u.trim()).filter(Boolean);
  urls.splice(idx, 1);
  textarea.value = urls.join('\n');
  renderGalleryPreview();
}

async function uploadGalleryImages(input) {
  if (!input.files || !input.files.length) return;
  const status = document.getElementById('pf-gallery-status');
  const textarea = document.getElementById('pf-gallery');
  const files = Array.from(input.files);
  const oversized = files.filter(f => f.size > 4 * 1024 * 1024);
  if (oversized.length) {
    alert(`${oversized.length} image(s) trop lourde(s) (max 4 Mo). Elles seront ignorées.`);
  }
  const valid = files.filter(f => f.size <= 4 * 1024 * 1024);
  if (!valid.length) return;
  status.textContent = `Envoi de ${valid.length} image(s)…`;
  status.style.color = 'var(--texte-clair)';
  const urls = [];
  for (const file of valid) {
    try {
      const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = e => res(e.target.result);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const url = await _uploadOneImage(dataUrl);
      urls.push(url);
      status.textContent = `${urls.length}/${valid.length} envoyée(s)…`;
    } catch (err) {
      status.textContent = `Erreur sur une image : ${err.message}`;
      status.style.color = 'var(--danger)';
    }
  }
  const existing = textarea.value.trim();
  textarea.value = (existing ? existing + '\n' : '') + urls.join('\n');
  renderGalleryPreview();
  status.textContent = `${urls.length} photo(s) ajoutée(s).`;
  status.style.color = 'var(--success)';
  input.value = '';
  setTimeout(() => { status.textContent = ''; }, 4000);
}

/* Mise à jour des prévisualisations quand l'URL est saisie manuellement */
document.addEventListener('input', (e) => {
  if (e.target.id === 'pf-image') {
    const url = e.target.value.trim();
    const img = document.getElementById('pf-image-preview-img');
    const label = document.getElementById('pf-drop-label');
    if (url) {
      img.src = url;
      img.style.display = 'block';
      if (label) label.style.display = 'none';
    } else {
      img.style.display = 'none';
      if (label) label.style.display = 'block';
    }
  }
  if (e.target.id === 'pf-gallery') renderGalleryPreview();
});

function printDevis(d) {
  if (!d) return;
  const ref = 'DEV-' + (d.id || '').toUpperCase().slice(0, 8);
  const dateStr = d.date ? new Date(d.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

  const row = (label, value) => value && value !== '—'
    ? `<tr><td class="lbl">${label}</td><td>${value}</td></tr>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Devis ${ref} — Mosaïc International</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color:#1a1a2e; background:#fff; padding:40px; }

  /* Header */
  .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #5b2d8e; padding-bottom:24px; margin-bottom:32px; }
  .logo-block h1 { font-size:1.6rem; font-weight:800; color:#5b2d8e; letter-spacing:-.5px; }
  .logo-block p { font-size:.78rem; color:#666; margin-top:2px; }
  .ref-block { text-align:right; }
  .ref-block .ref { font-size:1.1rem; font-weight:700; color:#5b2d8e; }
  .ref-block .date { font-size:.8rem; color:#888; margin-top:4px; }

  /* Status badge */
  .badge { display:inline-block; padding:.3rem .9rem; border-radius:50px; font-size:.78rem; font-weight:700; margin-bottom:28px; }
  .badge.nouveau  { background:#ede9fe; color:#6d28d9; }
  .badge.en_cours { background:#dbeafe; color:#1d4ed8; }
  .badge.envoye   { background:#d1fae5; color:#065f46; }
  .badge.accepte  { background:#dcfce7; color:#166534; }
  .badge.refuse   { background:#fee2e2; color:#991b1b; }

  /* Section titles */
  h2 { font-size:.82rem; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#5b2d8e; margin-bottom:10px; margin-top:28px; padding-bottom:6px; border-bottom:1px solid #ede9fe; }

  /* Tables */
  table { width:100%; border-collapse:collapse; margin-bottom:8px; }
  td { padding:8px 10px; font-size:.88rem; vertical-align:top; }
  td.lbl { width:38%; font-weight:600; color:#555; white-space:nowrap; }
  tr:nth-child(even) td { background:#faf8ff; }

  /* Description box */
  .desc { background:#faf8ff; border-left:3px solid #5b2d8e; padding:12px 16px; font-size:.88rem; line-height:1.6; border-radius:0 6px 6px 0; white-space:pre-wrap; word-break:break-word; }

  /* Footer */
  .footer { margin-top:48px; border-top:1px solid #e5e7eb; padding-top:18px; display:flex; justify-content:space-between; font-size:.75rem; color:#aaa; }

  /* Signature area */
  .sign-block { margin-top:40px; display:flex; justify-content:space-between; gap:32px; }
  .sign-col { flex:1; text-align:center; }
  .sign-col .sign-line { border-bottom:1px solid #ccc; height:48px; margin-bottom:8px; }
  .sign-col p { font-size:.78rem; color:#888; }

  @media print {
    body { padding:20px; }
    button { display:none; }
  }
</style>
</head>
<body>

  <div class="header">
    <div class="logo-block">
      <h1>MOSAÏC INTERNATIONAL</h1>
      <p>Solutions logistiques &amp; technologiques globales</p>
    </div>
    <div class="ref-block">
      <div class="ref">${ref}</div>
      <div class="date">Date : ${dateStr}</div>
    </div>
  </div>

  <span class="badge ${d.status || 'nouveau'}">${{ nouveau:'Nouveau', en_cours:'En cours', envoye:'Envoyé', accepte:'Accepté', refuse:'Refusé' }[d.status] || 'Nouveau'}</span>

  <h2>Informations du demandeur</h2>
  <table>
    ${row('Nom complet', (d.prenom || '') + ' ' + (d.nom || ''))}
    ${row('Email', d.email)}
    ${row('Téléphone', d.tel)}
    ${row('Société', d.societe)}
    ${row('Pays', d.pays)}
  </table>

  <h2>Détails de la demande</h2>
  <table>
    ${row('Service demandé', d.service)}
    ${row('Budget estimé', d.budget)}
    ${row('Délai souhaité', d.delai)}
    ${row('Origine', d.origine)}
    ${row('Destination', d.destination)}
    ${row('Volume / Quantité', d.volume)}
  </table>

  <h2>Description du projet</h2>
  <div class="desc">${(d.description || '—').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>

  <div class="sign-block">
    <div class="sign-col">
      <div class="sign-line"></div>
      <p>Signature du client</p>
    </div>
    <div class="sign-col">
      <div class="sign-line"></div>
      <p>Cachet &amp; Signature Mosaïc International</p>
    </div>
  </div>

  <div class="footer">
    <span>Mosaïc International — Document confidentiel</span>
    <span>Réf. ${ref}</span>
  </div>

  <script>window.onload = function(){ window.print(); };<\/script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) { alert('Veuillez autoriser les popups pour générer le PDF.'); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
