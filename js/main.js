/* =========================================================
   MOSAÏC INTERNATIONAL — JavaScript principal
   ========================================================= */

/* ── Loader (s'exécute avant DOMContentLoaded) ───────────── */
(function () {
  const loader = document.createElement('div');
  loader.id = 'page-loader';
  loader.innerHTML = '<div class="loader-inner"><img src="images/cropped-LOGO-moaic.png" alt="Mosaïc" class="loader-logo"><div class="loader-bar"><div class="loader-bar-fill"></div></div></div>';
  document.body.prepend(loader);
  window.addEventListener('load', () => {
    setTimeout(() => loader.classList.add('hidden'), 350);
    setTimeout(() => loader.remove(), 950);
  });
})();

document.addEventListener('DOMContentLoaded', async () => {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const NEWS_FALLBACK_IMAGES = {
    'Logistique': 'images/Equipe-de-Mosaic-International_logistique-petroliere.png',
    'Transit & Douane': 'images/Equipe-de-Mosaic-International_logistique-petroliere2.png',
    'Télécom': 'images/Equipe-de-technicien-de-Mosaic-sur-le-terrain-2.png',
    'Génie Civil': 'images/Equipe-Mosaic-sur-le-terrain.png',
    'Agrobusiness': 'images/WhatsApp-Image-2023-10-06-at-2.20.45-PM-1-1-qfhedz1n3cb2idzkvik3xb4dkqi4g7q55x1w97lbbc.jpeg',
    'Entreprise': 'images/pdg mosaic.png',
    'Actualité entreprise': 'images/pdg mosaic.png'
  };
  const DEFAULT_NEWS_IMAGE = 'images/Equipe-Mosaic-sur-le-terrain.png';

  const fetchPublishedNews = async () => {
    try {
      const res = await fetch('/api/news');
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  };

  const escHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const formatNewsDate = (value, detailed = false) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('fr-FR', detailed
      ? { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { day: 'numeric', month: 'long', year: 'numeric' });
  };
  const getPublishedNews = async () => {
    const news = await fetchPublishedNews();
    return news.sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
  };
  const getNewsImage = (article) => article.imageData || NEWS_FALLBACK_IMAGES[article.category] || DEFAULT_NEWS_IMAGE;
  const getNewsExcerpt = (article) => article.excerpt || 'Découvrez les dernières informations publiées par Mosaïc International.';
  const getNewsContent = (article) => {
    if (article.content && article.content.trim()) return article.content;
    return `<p>${escHtml(getNewsExcerpt(article))}</p>`;
  };

  const ensureArticleModal = () => {
    if (!document.getElementById('article-modal-style')) {
      const style = document.createElement('style');
      style.id = 'article-modal-style';
      style.textContent = `
        .article-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(26, 26, 46, 0.65);
          display: none;
          align-items: center;
          justify-content: center;
          padding: 1.5rem;
          z-index: 1200;
        }
        .article-modal-backdrop.open { display: flex; }
        .article-modal {
          width: min(860px, 100%);
          max-height: 90vh;
          overflow-y: auto;
          background: var(--blanc);
          border-radius: 18px;
          box-shadow: 0 24px 64px rgba(0,0,0,0.28);
        }
        .article-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid var(--gris);
        }
        .article-modal-close {
          width: 42px;
          height: 42px;
          border: none;
          border-radius: 50%;
          background: var(--gris-clair);
          color: var(--texte);
          font-size: 1rem;
          cursor: pointer;
        }
        .article-modal-hero {
          height: 320px;
          position: relative;
          overflow: hidden;
          background: linear-gradient(135deg, var(--violet), var(--violet-dark));
        }
        .article-modal-hero::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(26,26,46,0.08), rgba(26,26,46,0.45));
          pointer-events: none;
        }
        .article-modal-body { padding: 2rem; }
        .article-modal-body h2 { margin-bottom: 1rem; }
        .article-modal-body .blog-meta { margin-bottom: 1rem; }
        .article-content { line-height: 1.8; color: var(--texte); }
        .article-content p, .article-content ul, .article-content ol { margin-bottom: 1rem; }
        .article-content h3 { margin: 1.25rem 0 0.75rem; }
      `;
      document.head.appendChild(style);
    }

    if (document.getElementById('article-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'article-modal';
    modal.className = 'article-modal-backdrop';
    modal.innerHTML = `
      <div class="article-modal" role="dialog" aria-modal="true" aria-label="Article">
        <div class="article-modal-header">
          <div>
            <div style="font-size:0.78rem;color:var(--texte-clair);text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Lecture</div>
            <h3 style="font-family:'Montserrat',sans-serif;color:var(--marine);">Article</h3>
          </div>
          <button class="article-modal-close" type="button" data-close-article-modal aria-label="Fermer"><i class="fas fa-times"></i></button>
        </div>
        <div class="article-modal-hero" id="article-modal-hero"></div>
        <div class="article-modal-body">
          <div class="blog-meta" id="article-modal-meta"></div>
          <h2 id="article-modal-title"></h2>
          <div class="article-content" id="article-modal-content"></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  };

  const openArticleModal = async (articleId) => {
    const article = (await getPublishedNews()).find((item) => item.id === articleId);
    if (!article) return;
    ensureArticleModal();
    document.getElementById('article-modal-hero').innerHTML =
      `<img src="${escHtml(getNewsImage(article))}" alt="${escHtml(article.title)}" class="media-cover">`;
    document.getElementById('article-modal-meta').innerHTML = `
      <span class="tag">${escHtml(article.category || 'Actualité')}</span>
      <span><i class="fas fa-calendar"></i> ${escHtml(formatNewsDate(article.date || article.createdAt))}</span>
      <span><i class="fas fa-user"></i> ${escHtml(article.author || 'Équipe Mosaïc International')}</span>
    `;
    document.getElementById('article-modal-title').textContent = article.title || 'Article';
    document.getElementById('article-modal-content').innerHTML = getNewsContent(article);
    document.getElementById('article-modal').classList.add('open');
    document.body.style.overflow = 'hidden';
  };

  const closeArticleModal = () => {
    const modal = document.getElementById('article-modal');
    if (!modal) return;
    modal.classList.remove('open');
    document.body.style.overflow = '';
  };

  const renderHomeNews = async () => {
    const homeGrid = document.querySelector('#actualites .blog-grid');
    const featuredWrap = document.getElementById('featured-news-wrap');
    if (!homeGrid || featuredWrap) return;
    const news = (await getPublishedNews()).slice(0, 3);
    if (!news.length) return;

    homeGrid.innerHTML = news.map((article, index) => `
      <article class="blog-card" data-animate data-delay="${(index + 1) * 100}">
        <div class="blog-card-img">
          <img src="${escHtml(getNewsImage(article))}" alt="${escHtml(article.title)}" class="media-cover">
        </div>
        <div class="blog-card-body">
          <div class="blog-meta">
            <span class="tag">${escHtml(article.category || 'Actualité')}</span>
            <span><i class="fas fa-calendar"></i> ${escHtml(formatNewsDate(article.date || article.createdAt))}</span>
          </div>
          <h3>${escHtml(article.title)}</h3>
          <p>${escHtml(getNewsExcerpt(article))}</p>
          <a href="actualites.html#${escHtml(article.id)}" class="blog-read-more">Lire l'article <i class="fas fa-arrow-right"></i></a>
        </div>
      </article>
    `).join('');
    homeGrid.querySelectorAll('[data-animate]').forEach((el) => animObserver.observe(el));
  };

  const renderActualitesPage = async () => {
    const featuredWrap = document.getElementById('featured-news-wrap');
    const gridWrap = document.getElementById('news-grid-dynamic');
    if (!featuredWrap || !gridWrap) return;

    const news = await getPublishedNews();
    const categoriesSidebar = document.querySelector('.categories-sidebar');
    ensureArticleModal();

    if (!news.length) return;

    const [featured, ...rest] = news;
    const sidebarArticles = rest.slice(0, 3);
    const gridArticles = rest.length ? rest : news.slice(0, 6);

    featuredWrap.innerHTML = `
      <article class="blog-featured-main">
        <div class="blog-featured-img" style="position:relative; overflow:hidden;">
          <img src="${escHtml(getNewsImage(featured))}" alt="${escHtml(featured.title)}" class="media-cover">
        </div>
        <div class="blog-featured-body">
          <div class="blog-meta">
            <span class="tag">${escHtml(featured.category || 'Actualité')}</span>
            <span><i class="fas fa-calendar"></i> ${escHtml(formatNewsDate(featured.date || featured.createdAt))}</span>
            <span><i class="fas fa-user"></i> ${escHtml(featured.author || 'Équipe Mosaïc International')}</span>
          </div>
          <h2>${escHtml(featured.title)}</h2>
          <p>${escHtml(getNewsExcerpt(featured))}</p>
          <button type="button" class="btn btn-violet" data-open-article="${escHtml(featured.id)}" style="margin-top: 1rem;">
            <i class="fas fa-book-open"></i> Lire l'article complet
          </button>
        </div>
      </article>
      <div class="blog-sidebar">
        ${sidebarArticles.map((article, index) => `
          <article class="blog-sidebar-card" style="cursor:pointer;" data-open-article="${escHtml(article.id)}">
            <div class="blog-sidebar-img ${index % 3 === 0 ? 'bs1' : index % 3 === 1 ? 'bs2' : 'bs3'}" style="position:relative; overflow:hidden;">
              <img src="${escHtml(getNewsImage(article))}" alt="${escHtml(article.title)}" class="media-cover">
            </div>
            <div class="blog-sidebar-body">
              <span class="tag">${escHtml(article.category || 'Actualité')}</span>
              <h4>${escHtml(article.title)}</h4>
              <div class="date"><i class="fas fa-calendar"></i> ${escHtml(formatNewsDate(article.date || article.createdAt))}</div>
            </div>
          </article>
        `).join('')}
      </div>
    `;

    gridWrap.innerHTML = gridArticles.map((article, index) => `
      <article class="blog-card" data-animate data-delay="${((index % 3) + 1) * 100}" id="${escHtml(article.id)}">
        <div class="blog-card-img">
          <img src="${escHtml(getNewsImage(article))}" alt="${escHtml(article.title)}" class="media-cover">
        </div>
        <div class="blog-card-body">
          <div class="blog-meta">
            <span class="tag">${escHtml(article.category || 'Actualité')}</span>
            <span><i class="fas fa-calendar"></i> ${escHtml(formatNewsDate(article.date || article.createdAt))}</span>
          </div>
          <h3>${escHtml(article.title)}</h3>
          <p>${escHtml(getNewsExcerpt(article))}</p>
          <button type="button" class="blog-read-more" data-open-article="${escHtml(article.id)}">Lire la suite <i class="fas fa-arrow-right"></i></button>
        </div>
      </article>
    `).join('');
    gridWrap.querySelectorAll('[data-animate]').forEach((el) => animObserver.observe(el));

    if (categoriesSidebar) {
      const categoryCounts = news.reduce((acc, article) => {
        const key = article.category || 'Actualité';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      categoriesSidebar.innerHTML = `
        <h4>Catégories</h4>
        ${Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]).map(([name, count]) => `
          <div class="category-item">
            <a href="#news-grid-dynamic">${escHtml(name)}</a>
            <span class="category-count">${count}</span>
          </div>
        `).join('')}
      `;
    }
  };

  /* ── Barre de progression scroll ────────────────────── */
  const progressBar = document.createElement('div');
  progressBar.id = 'scroll-progress';
  document.body.prepend(progressBar);

  /* ── Étoiles hero ────────────────────────────────────── */
  const hero = document.querySelector('.hero');
  if (hero) {
    const starsWrap = document.createElement('div');
    starsWrap.className = 'hero-stars';
    hero.appendChild(starsWrap);
    for (let i = 0; i < 60; i++) {
      const star = document.createElement('div');
      star.className = 'star';
      star.style.left = Math.random() * 100 + '%';
      star.style.top = Math.random() * 100 + '%';
      star.style.setProperty('--dur', (2 + Math.random() * 4) + 's');
      star.style.setProperty('--delay', (Math.random() * 4) + 's');
      starsWrap.appendChild(star);
    }
  }

  /* ── Navbar sticky + scroll ─────────────────────────── */
  const navbar = document.querySelector('.navbar');
  const backTop = document.querySelector('.back-top');

  window.addEventListener('scroll', () => {
    // Progress bar
    const docH = document.documentElement.scrollHeight - window.innerHeight;
    progressBar.style.width = (window.scrollY / docH * 100) + '%';

    if (window.scrollY > 60) {
      navbar?.classList.add('scrolled');
      backTop?.classList.add('visible');
    } else {
      navbar?.classList.remove('scrolled');
      backTop?.classList.remove('visible');
    }
  });

  backTop?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  /* ── Navigation active link ─────────────────────────── */
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });

  /* ── Hamburger / mobile menu ────────────────────────── */
  const hamburger = document.querySelector('.hamburger');
  const mobileMenu = document.querySelector('.mobile-menu');
  const mobileClose = document.querySelector('.mobile-menu-close');

  hamburger?.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    mobileMenu?.classList.toggle('open');
    hamburger.setAttribute('aria-expanded', mobileMenu?.classList.contains('open') ? 'true' : 'false');
    document.body.style.overflow = mobileMenu?.classList.contains('open') ? 'hidden' : '';
  });

  mobileClose?.addEventListener('click', () => {
    hamburger?.classList.remove('open');
    mobileMenu?.classList.remove('open');
    hamburger?.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  });

  // Fermer en cliquant un lien
  mobileMenu?.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      hamburger?.classList.remove('open');
      mobileMenu?.classList.remove('open');
      hamburger?.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    });
  });

  /* ── Intersection Observer — animations ─────────────── */
  const animObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animated');
        animObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('[data-animate]').forEach(el => animObserver.observe(el));

  /* ── Counter animation ──────────────────────────────── */
  const counters = document.querySelectorAll('.stat-number[data-target]');
  let countersStarted = false;

  const startCounters = () => {
    if (countersStarted) return;
    countersStarted = true;
    counters.forEach(counter => {
      const target = parseFloat(counter.dataset.target);
      const suffix = counter.dataset.suffix || '';
      const prefix = counter.dataset.prefix || '';
      const decimals = counter.dataset.decimals ? parseInt(counter.dataset.decimals) : 0;
      const duration = 2000;
      const step = target / (duration / 16);
      let current = 0;

      const update = () => {
        current = Math.min(current + step, target);
        counter.textContent = prefix + (decimals ? current.toFixed(decimals) : Math.floor(current)) + suffix;
        if (current < target) requestAnimationFrame(update);
      };
      update();
    });
  };

  const statsSection = document.querySelector('.stats-section');
  if (statsSection) {
    const statsObserver = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { startCounters(); statsObserver.disconnect(); }
    }, { threshold: 0.3 });
    statsObserver.observe(statsSection);
  }

  /* ── FAQ accordion ──────────────────────────────────── */
  document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const answer = btn.nextElementSibling;
      const isOpen = btn.classList.contains('open');

      // Fermer tous
      document.querySelectorAll('.faq-question').forEach(b => {
        b.classList.remove('open');
        b.nextElementSibling?.classList.remove('open');
      });

      // Ouvrir celui-ci si était fermé
      if (!isOpen) {
        btn.classList.add('open');
        answer?.classList.add('open');
      }
    });
  });

  /* ── Portfolio filters ──────────────────────────────── */
  const filterBtns = document.querySelectorAll('.filter-btn');
  const portfolioCards = document.querySelectorAll('.portfolio-card');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;

      portfolioCards.forEach(card => {
        const match = filter === 'all' || card.dataset.category === filter;
        card.style.display = match ? '' : 'none';
      });
    });
  });

  /* ── Contact form ───────────────────────────────────── */
  const contactForm = document.getElementById('contactForm');
  contactForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!contactForm.reportValidity()) return;

    const formData = new FormData(contactForm);
    const payload = {
      prenom: (formData.get('prenom') || '').toString().trim(),
      nom: (formData.get('nom') || '').toString().trim(),
      email: (formData.get('email') || '').toString().trim(),
      tel: (formData.get('tel') || '').toString().trim(),
      societe: (formData.get('societe') || '').toString().trim(),
      pays: (formData.get('pays') || '').toString().trim(),
      service: (formData.get('service') || '').toString().trim(),
      budget: (formData.get('budget') || '').toString().trim(),
      message: (formData.get('message') || '').toString().trim(),
      sourcePage: currentPage
    };

    const btn = contactForm.querySelector('[type="submit"]');
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Envoi en cours…';
    btn.disabled = true;

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Erreur serveur');

      btn.innerHTML = '<i class="fas fa-check"></i> Message envoyé !';
      btn.style.background = '#16a34a';
      contactForm.reset();
    } catch (err) {
      btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Erreur, réessayez.';
      btn.style.background = '#dc2626';
      btn.disabled = false;
    }

    setTimeout(() => {
      btn.innerHTML = original;
      btn.style.background = '';
      btn.disabled = false;
    }, 3500);
  });

  /* ── Smooth scroll pour ancres internes ─────────────── */
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  document.addEventListener('click', (event) => {
    const openTrigger = event.target.closest('[data-open-article]');
    if (openTrigger) {
      openArticleModal(openTrigger.getAttribute('data-open-article'));
      return;
    }

    if (event.target.closest('[data-close-article-modal]')) {
      closeArticleModal();
      return;
    }

    const modal = document.getElementById('article-modal');
    if (modal && event.target === modal) {
      closeArticleModal();
    }
  });

  if (!prefersReducedMotion) {
    document.querySelectorAll('.service-card, .stat-card, .blog-card, .portfolio-card, .testimonial-card, .team-card').forEach(card => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width;
        const py = (e.clientY - rect.top) / rect.height;
        const rotateY = (px - 0.5) * 8;
        const rotateX = (0.5 - py) * 8;

        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-6px)`;
      });

      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
      });
    });
  }


  /* ── Parallax hero au mousemove + spotlight curseur ─────── */
  const heroBg = document.querySelector('.hero-bg');
  const heroSection = document.querySelector('.hero');
  if (heroSection && !prefersReducedMotion) {
    /* Spotlight */
    const spotlight = document.createElement('div');
    spotlight.className = 'hero-spotlight';
    heroSection.appendChild(spotlight);

    let spotX = -999, spotY = -999;
    heroSection.addEventListener('mousemove', (e) => {
      const r = heroSection.getBoundingClientRect();
      spotX = e.clientX - r.left;
      spotY = e.clientY - r.top;
      spotlight.style.left = spotX + 'px';
      spotlight.style.top  = spotY + 'px';
      spotlight.style.opacity = '1';

      if (heroBg) {
        const x = ((e.clientX - r.left) / r.width  - 0.5) * 18;
        const y = ((e.clientY - r.top)  / r.height - 0.5) *  9;
        heroBg.style.transform = `translate(${x}px, ${y}px)`;
      }
    });
    heroSection.addEventListener('mouseleave', () => {
      spotlight.style.opacity = '0';
      if (heroBg) heroBg.style.transform = '';
    });
  }

  /* ── Compteurs KPI hero ──────────────────────────────────── */
  const kpiItems = [
    { sel: '.kpi-item:nth-child(1) strong', end: 10,  suffix: '+' },
    { sel: '.kpi-item:nth-child(3) strong', end: 500, suffix: '+' },
    { sel: '.kpi-item:nth-child(5) strong', end: 6,   suffix: ''  },
    { sel: '.kpi-item:nth-child(7) strong', end: 6,   suffix: ''  }
  ];
  const kpisEl = document.querySelector('.hero-kpis');
  if (kpisEl) {
    const kpiObserver = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      kpiObserver.disconnect();
      kpiItems.forEach(({ sel, end }) => {
        const el = document.querySelector(sel);
        if (!el || el._counted) return;
        el._counted = true;
        const sup = el.querySelector('sup');
        let v = 0;
        const step = Math.max(1, Math.ceil(end / 50));
        const id = setInterval(() => {
          v = Math.min(v + step, end);
          el.firstChild.textContent = v;
          if (sup) el.appendChild(sup);
          if (v >= end) clearInterval(id);
        }, 30);
      });
    }, { threshold: 0.4 });
    kpiObserver.observe(kpisEl);
  }

  /* ── Boutons magnétiques ─────────────────────────────────── */
  if (!prefersReducedMotion) {
    document.querySelectorAll('.btn-primary, .btn-violet, .btn-or, .hero-actions .btn').forEach(btn => {
      btn.addEventListener('mousemove', (e) => {
        const r = btn.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width  / 2) * 0.22;
        const y = (e.clientY - r.top  - r.height / 2) * 0.22;
        btn.style.transform = `translate(${x}px, ${y}px)`;
      });
      btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
    });
  }

  /* ── Révélation mot par mot des titres de section ───────── */
  if (!prefersReducedMotion) {
    document.querySelectorAll('.section-header h2').forEach(h2 => {
      const words = h2.innerHTML.split(/(\s+)/);
      let wi = 0;
      h2.innerHTML = words.map(w => {
        if (/^\s+$/.test(w)) return w;
        return `<span class="word-reveal" style="--wi:${wi++}">${w}</span>`;
      }).join('');
    });
  }

  /* ── Stagger pour les grilles principales ────────────────── */
  document.querySelectorAll('.services-grid, .stats-grid, .blog-grid, .portfolio-grid, .testimonials-grid, .about-features').forEach(grid => {
    grid.classList.add('stagger');
    grid.querySelectorAll(':scope > *').forEach(child => {
      if (!child.hasAttribute('data-animate')) {
        child.setAttribute('data-animate', '');
        animObserver.observe(child);
      }
    });
  });

  /* ── Révélations directionnelles ─────────────────────────── */
  document.querySelectorAll('.geo-zone').forEach((el, i) => {
    el.setAttribute('data-animate', '');
    el.setAttribute('data-dir', 'left');
    animObserver.observe(el);
  });
  document.querySelectorAll('.contact-item').forEach(el => {
    el.setAttribute('data-animate', '');
    el.setAttribute('data-dir', 'right');
    animObserver.observe(el);
  });
  document.querySelectorAll('.tl-left-content').forEach(el => {
    el.setAttribute('data-dir', 'left');
  });
  document.querySelectorAll('.tl-right-content').forEach(el => {
    el.setAttribute('data-dir', 'right');
  });

  /* ── Observer étendu pour data-dir ───────────────────────── */
  const dirObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animated');
        dirObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('[data-dir]').forEach(el => {
    if (!el.classList.contains('animated')) dirObserver.observe(el);
  });



  await renderHomeNews();
  await renderActualitesPage();

});
