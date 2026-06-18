# Documentation Technique — Mosaïc International

> Version : 1.0 — Juin 2026  
> Domaine de production : mozaikinternational.com  
> Dépôt Git : github.com/mosaictech8/mosaic

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Architecture](#2-architecture)
3. [Structure des fichiers](#3-structure-des-fichiers)
4. [Base de données (Supabase)](#4-base-de-données-supabase)
5. [Variables d'environnement](#5-variables-denvironnement)
6. [API REST — Référence complète](#6-api-rest--référence-complète)
7. [Authentification](#7-authentification)
8. [Emails (Nodemailer + Resend)](#8-emails-nodemailer--resend)
9. [Upload d'images](#9-upload-dimages)
10. [Pages publiques](#10-pages-publiques)
11. [Interface d'administration](#11-interface-dadministration)
12. [Déploiement (Vercel)](#12-déploiement-vercel)
13. [Développement local](#13-développement-local)
14. [Procédures de maintenance](#14-procédures-de-maintenance)

---

## 1. Vue d'ensemble

Mosaïc International est un site vitrine + back-office pour une société de services logistiques et techniques au Tchad. Il est composé de :

- Un **site public** (HTML/CSS/JS statique) présentant l'entreprise, ses services, son portfolio et ses actualités
- Un **back-office admin** (SPA en JS pur) permettant de gérer les contenus, contacts et devis
- Un **serveur Node.js/Express** qui expose une API REST et sert les fichiers statiques
- Une **base de données PostgreSQL** hébergée sur Supabase

La stack est minimaliste (pas de framework frontend, pas de build step) pour faciliter la maintenance.

---

## 2. Architecture

```
Browser (public)            Browser (admin)
      │                           │
      │  GET /                    │  GET /admin
      │  POST /api/contact        │  GET/POST /api/*
      │  POST /api/devis          │  (auth cookie requis)
      ▼                           ▼
┌─────────────────────────────────────────┐
│            Vercel (serverless)          │
│                                         │
│   server.js (Express)                   │
│   ├── express.static → public/          │
│   ├── Routes publiques (/api/contact…)  │
│   └── Routes admin (/api/settings…)     │
└──────────────┬──────────────────────────┘
               │
               ▼
┌──────────────────────────┐   ┌──────────────────┐
│  Supabase (PostgreSQL)   │   │  Supabase Storage │
│  - contacts              │   │  - article-images │
│  - news                  │   └──────────────────┘
│  - devis                 │
│  - portfolio             │   ┌──────────────────┐
│  - settings              │   │  Resend (SMTP)    │
└──────────────────────────┘   │  Emails contact + │
                               │  devis            │
                               └──────────────────┘
```

### Flux de requête type

1. Le browser envoie une requête HTTP à Vercel
2. Vercel route vers `server.js` (toutes les routes → `server.js` selon `vercel.json`)
3. Express vérifie si c'est une route `/api/*` → exécute le handler correspondant
4. Sinon → sert le fichier statique depuis `public/`
5. Si aucun fichier ne correspond → renvoie `public/404.html`

---

## 3. Structure des fichiers

```
mosaic/
├── server.js                  # Serveur Express (point d'entrée Vercel)
├── package.json               # Dépendances Node.js
├── vercel.json                # Configuration déploiement Vercel
├── supabase-schema.sql        # Schéma SQL à appliquer sur Supabase
├── .env                       # Variables d'environnement (développement local)
├── docs/
│   └── documentation-technique.md  # Ce fichier
└── public/                    # Fichiers servis statiquement
    ├── index.html             # Accueil
    ├── a-propos.html          # Page À propos
    ├── services.html          # Page Services
    ├── portfolio.html         # Page Portfolio
    ├── actualites.html        # Page Actualités
    ├── contact.html           # Page Contact
    ├── devis.html             # Formulaire de devis (multi-étapes)
    ├── faq.html               # FAQ
    ├── 404.html               # Page d'erreur 404
    ├── admin.html             # Interface d'administration
    ├── css/
    │   └── style.css          # Styles globaux (3 600 lignes)
    └── js/
        ├── main.js            # JS pages publiques (780 lignes)
        └── admin.js           # JS interface admin (1 229 lignes)
```

---

## 4. Base de données (Supabase)

Le schéma est dans `supabase-schema.sql`. Pour l'appliquer : Supabase Dashboard → SQL Editor → coller et exécuter.

> **RLS désactivé** sur toutes les tables — l'accès est contrôlé par la clé service côté serveur.

### Table `contacts`

Stocke les messages reçus via le formulaire de contact public.

| Colonne | Type | Description |
|---|---|---|
| `id` | text PK | `contact_<timestamp>` |
| `prenom` | text | |
| `nom` | text | |
| `email` | text | |
| `tel` | text | |
| `societe` | text | |
| `pays` | text | |
| `service` | text | Service demandé |
| `budget` | text | Budget indicatif |
| `message` | text | Contenu du message |
| `status` | text | `new` ou `read` |
| `date` | text | ISO 8601 |
| `source_page` | text | URL d'origine |
| `created_at` | text | ISO 8601 |

### Table `news`

Articles / actualités publiés sur le site.

| Colonne | Type | Description |
|---|---|---|
| `id` | text PK | `news_<timestamp>` |
| `title` | text | Titre de l'article |
| `category` | text | Ex : Logistique, Transport… |
| `status` | text | `published` ou `draft` |
| `excerpt` | text | Résumé court |
| `content` | text | HTML complet (éditeur riche) |
| `author` | text | |
| `date` | text | Date de publication |
| `image_data` | text | URL Supabase Storage ou base64 |
| `created_at` | text | ISO 8601 |

### Table `devis`

Demandes de devis reçues (formulaire public ou créées manuellement en admin).

| Colonne | Type | Description |
|---|---|---|
| `id` | text PK | `devis_<timestamp>` |
| `prenom`, `nom` | text | |
| `email`, `tel` | text | |
| `societe`, `pays` | text | |
| `service` | text | Type de service demandé |
| `description` | text | Détail de la demande |
| `budget`, `delai` | text | |
| `origine`, `destination` | text | Pour services logistiques |
| `volume` | text | Quantité/volume |
| `status` | text | `nouveau`, `en_cours`, `envoye`, `accepte`, `refuse` |
| `date`, `created_at` | text | ISO 8601 |

### Table `portfolio`

Projets affichés sur la page Portfolio du site.

| Colonne | Type | Description |
|---|---|---|
| `id` | text PK | `pf_<timestamp>` |
| `title` | text | Titre du projet |
| `category` | text | Catégorie |
| `description` | text | Description complète |
| `status` | text | `published` ou `draft` |
| `image` | text | URL image principale |
| `gallery` | text | JSON array d'URLs |
| `client` | text | Nom du client |
| `location` | text | Lieu du projet |
| `date` | text | Date du projet |
| `created_at` | text | ISO 8601 |

### Table `settings`

Clé-valeur pour les paramètres du site et le mot de passe admin.

| Clé | Description |
|---|---|
| `site_phone` | Téléphone affiché sur le site |
| `site_email` | Email public affiché sur le site |
| `site_address` | Adresse affichée |
| `site_hours` | Horaires d'ouverture |
| `notif_email` | Email qui reçoit les notifications de formulaires |
| `admin_password` | Mot de passe admin hashé (bcrypt) |

### Storage Supabase

Bucket `article-images` — public, limite 5 Mo par fichier, types acceptés : JPEG, PNG, WebP, GIF.

URL d'accès aux images : `https://<project>.supabase.co/storage/v1/object/public/article-images/<filename>`

---

## 5. Variables d'environnement

À configurer dans **Vercel → Settings → Environment Variables** (production) et dans `.env` (local).

| Variable | Obligatoire | Description | Exemple |
|---|---|---|---|
| `SUPABASE_URL` | ✅ | URL du projet Supabase | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | ✅ | Clé service (rôle `service_role`) | `eyJ...` |
| `JWT_SECRET` | ✅ | Secret de signature des tokens JWT | Chaîne aléatoire longue |
| `ADMIN_USER` | — | Login admin (défaut : `admin`) | `admin` |
| `ADMIN_PASS` | — | Mot de passe admin initial | `Mosaic2026!` |
| `CONTACT_EMAIL` | — | Email de fallback | `contact@mozaikinternational.com` |
| `SMTP_HOST` | — | Serveur SMTP | `smtp.resend.com` |
| `SMTP_PORT` | — | Port SMTP | `465` |
| `SMTP_USER` | — | Utilisateur SMTP | `resend` |
| `SMTP_PASS` | — | Mot de passe / clé API SMTP | `re_xxx...` |
| `SMTP_SECURE` | — | TLS (true/false) | `true` |
| `SMTP_FROM` | — | Adresse expéditeur des emails | `onboarding@resend.dev` |

> **Sans `SMTP_HOST`**, le serveur démarre normalement mais les emails ne sont pas envoyés (pas d'erreur, juste silencieux).

---

## 6. API REST — Référence complète

Base URL : `https://mozaikinternational.com/api`

`🔒` = authentification requise (cookie JWT `mosaic_auth`)  
`🌐` = public, sans authentification

---

### Système

| Méthode | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/ping` | 🌐 | Health check — retourne `{ ok: true, db: bool, ts: ... }` |
| GET | `/api/status` | 🌐 | Diagnostic config (sans secrets) |

---

### Authentification

| Méthode | Endpoint | Auth | Body | Description |
|---|---|---|---|---|
| POST | `/api/login` | 🌐 | `{ username, password }` | Connexion admin — pose le cookie `mosaic_auth` (JWT 24h) |
| POST | `/api/logout` | 🌐 | — | Efface le cookie |
| GET | `/api/session` | 🌐 | — | Vérifie si le cookie est valide → `{ authenticated: bool }` |

**Cookie** : `mosaic_auth`, httpOnly, SameSite=Lax, expiration 24h. Secure en production.

---

### Contacts

| Méthode | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/contact` | 🌐 | Soumettre un contact. Champs requis : `prenom`, `nom`, `email`, `tel`, `service`, `message` |
| GET | `/api/contacts` | 🔒 | Liste tous les contacts (tri par date DESC) |
| GET | `/api/contacts/:id` | 🔒 | Détail d'un contact |
| PUT | `/api/contacts/:id/status` | 🔒 | Body : `{ status: "read" }` |
| DELETE | `/api/contacts/:id` | 🔒 | Supprimer un contact |
| DELETE | `/api/contacts` | 🔒 | Supprimer tous les contacts |
| GET | `/api/export/contacts` | 🔒 | Export CSV (UTF-8 BOM, séparateur `;`) |

**`POST /api/contact` — Body complet :**
```json
{
  "prenom": "string",
  "nom": "string",
  "email": "string",
  "tel": "string",
  "societe": "string",
  "pays": "string",
  "service": "string",
  "budget": "string",
  "message": "string",
  "sourcePage": "string"
}
```

---

### Actualités

| Méthode | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/news` | 🌐 | Articles publiés (sans auth) ou tous (avec auth) |
| GET | `/api/news/:id` | 🔒 | Détail d'un article |
| POST | `/api/news` | 🔒 | Créer un article |
| PUT | `/api/news/:id` | 🔒 | Modifier un article |
| DELETE | `/api/news/:id` | 🔒 | Supprimer un article |

**Corps POST/PUT :**
```json
{
  "title": "string",
  "category": "string",
  "status": "published|draft",
  "excerpt": "string",
  "content": "HTML string",
  "author": "string",
  "date": "YYYY-MM-DD",
  "imageData": "URL ou base64"
}
```

---

### Devis

| Méthode | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/devis` | 🌐 | Soumettre une demande de devis |
| GET | `/api/devis` | 🔒 | Liste tous les devis (tri par date DESC) |
| GET | `/api/devis/:id` | 🔒 | Détail d'un devis |
| PUT | `/api/devis/:id/status` | 🔒 | Body : `{ status: "en_cours|envoye|accepte|refuse" }` |
| DELETE | `/api/devis/:id` | 🔒 | Supprimer un devis |
| GET | `/api/export/devis` | 🔒 | Export CSV |

**`POST /api/devis` — Champs requis :** `prenom`, `nom`, `email`, `tel`, `service`, `description`

---

### Portfolio

| Méthode | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/portfolio` | 🌐/🔒 | Projets publiés (sans auth) ou tous (avec auth) |
| POST | `/api/portfolio` | 🔒 | Créer un projet |
| PUT | `/api/portfolio/:id` | 🔒 | Modifier un projet |
| DELETE | `/api/portfolio/:id` | 🔒 | Supprimer un projet |

**Corps POST/PUT :**
```json
{
  "title": "string",
  "category": "string",
  "description": "string",
  "status": "published|draft",
  "image": "URL string",
  "gallery": "[\"url1\",\"url2\"]",
  "client": "string",
  "location": "string",
  "date": "YYYY-MM-DD"
}
```

---

### Paramètres

| Méthode | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/public-settings` | 🌐 | Retourne `phone, email, address, hours` pour affichage public |
| GET | `/api/settings` | 🔒 | Tous les paramètres + `notifEmail`, `smtpReady` |
| POST | `/api/settings` | 🔒 | Enregistrer paramètres (`phone, email, address, hours, notifEmail`) |
| POST | `/api/change-password` | 🔒 | Body : `{ oldPassword, newPassword }` |
| POST | `/api/test-email` | 🔒 | Envoie un email test à `notif_email` |

---

### Upload

| Méthode | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/upload-image` | 🔒 | Upload vers Supabase Storage. Body JSON : `{ dataUrl: "data:image/...;base64,..." }` |

Réponse : `{ url: "https://..." }`  
Limite : 10 Mo (Express) / 5 Mo (Supabase Storage)  
Types acceptés : JPEG, PNG, WebP, GIF

---

## 7. Authentification

### Mécanisme

1. `POST /api/login` → vérifie login + mot de passe (bcrypt) dans la table `settings` (clé `admin_password`)
2. Si OK → génère un JWT signé avec `JWT_SECRET` (payload : `{ isAdmin: true }`, expiration 24h)
3. Pose le JWT dans un cookie httpOnly `mosaic_auth`
4. Chaque requête admin suivante → `requireAuth` middleware lit le cookie, vérifie le JWT

### Mot de passe initial

Au premier démarrage (`initAdminPassword`), si la clé `admin_password` n'existe pas en base, le hash bcrypt de `ADMIN_PASS` est inséré automatiquement.

Changer le mot de passe depuis l'admin → `POST /api/change-password` → le nouveau hash remplace l'ancien en base (l'env var `ADMIN_PASS` n'est plus utilisée après la première init).

### Sécurité

- Cookies httpOnly (inaccessibles en JS côté client)
- SameSite=Lax (protection CSRF)
- Secure=true en production (HTTPS uniquement)
- JWT expire en 24h
- Rate limiting non implémenté (à ajouter en production si nécessaire)

---

## 8. Emails (Nodemailer + Resend)

### Configuration actuelle (Resend SMTP)

| Variable Vercel | Valeur |
|---|---|
| `SMTP_HOST` | `smtp.resend.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | `resend` |
| `SMTP_PASS` | Clé API Resend (`re_xxx…`) |
| `SMTP_SECURE` | `true` |
| `SMTP_FROM` | `onboarding@resend.dev` (ou domaine vérifié) |

### Email de destination

L'email de notification est lu à chaque envoi depuis la table `settings` (clé `notif_email`). Si absent, fallback sur `CONTACT_EMAIL`. Configurable depuis admin → Paramètres → "Email de notification".

### Emails déclenchés automatiquement

| Événement | Sujet |
|---|---|
| Formulaire de contact soumis | `📬 Nouveau contact — Prénom Nom` |
| Formulaire de devis soumis | `📋 Nouveau devis — Service — Prénom Nom` |

### Domaine expéditeur personnalisé (optionnel)

Pour que les emails arrivent en boîte principale (et non spam) avec l'expéditeur `contact@mozaikinternational.com` :

1. Resend dashboard → Domains → Add Domain → `mozaikinternational.com`
2. Ajouter les enregistrements DNS indiqués par Resend chez LWS
3. Mettre à jour `SMTP_FROM=contact@mozaikinternational.com` dans Vercel
4. Redéployer

---

## 9. Upload d'images

### Flux d'upload

```
Admin (browser)
  └── FileReader.readAsDataURL()
        └── POST /api/upload-image  { dataUrl: "data:image/jpeg;base64,..." }
              └── server.js : extrait le buffer, upload vers Supabase Storage
                    └── Retourne { url: "https://xxx.supabase.co/storage/..." }
```

### Utilisation

- **Image principale article** : stockée dans `image_data` (URL Supabase)
- **Image principale portfolio** : stockée dans `portfolio.image` (URL Supabase)
- **Galerie portfolio** : URLs stockées en JSON dans `portfolio.gallery`

### Limites

- Taille max côté Express : 10 Mo
- Taille max côté Supabase Storage : 5 Mo
- Types acceptés : JPEG, PNG, WebP, GIF

---

## 10. Pages publiques

| Page | Fichier | Description |
|---|---|---|
| Accueil | `index.html` | Hero, KPIs animés, services, portfolio dynamique, actualités, contact |
| À propos | `a-propos.html` | Histoire, équipe, références techniques clients |
| Services | `services.html` | Présentation des services avec détails |
| Portfolio | `portfolio.html` | Grille de projets (données Supabase) |
| Actualités | `actualites.html` | Liste + modal article (données Supabase) |
| Contact | `contact.html` | Formulaire → `POST /api/contact` |
| Devis | `devis.html` | Formulaire multi-étapes (3 étapes) → `POST /api/devis` |
| FAQ | `faq.html` | Questions fréquentes (statique) |
| 404 | `404.html` | Page d'erreur personnalisée |

### Données dynamiques sur les pages

`main.js` charge au démarrage :
- `/api/public-settings` → met à jour téléphone, email, adresse, horaires (attributs `data-setting`)
- `/api/news` → affiche les articles sur la page actualités
- `/api/portfolio` → affiche les projets publiés

---

## 11. Interface d'administration

URL : `/admin` (redirige vers `public/admin.html`)

### Panels disponibles

| Panel | Description |
|---|---|
| Tableau de bord | Statistiques, derniers contacts, accès rapide |
| Actualités | Créer/modifier/supprimer des articles (éditeur riche) |
| Contacts | Liste des demandes, recherche, export CSV, marquer lu |
| Devis | Liste, changement de statut, impression PDF, export CSV |
| Portfolio | Créer/modifier des projets avec upload d'images |
| Paramètres | Infos de contact, email de notification, mot de passe |

### Fonctionnalités clés

- **Recherche en temps réel** dans contacts et devis (filtre client-side sur cache)
- **Export CSV** contacts et devis (téléchargement direct via `GET /api/export/*`)
- **Marquer tout lu** : met à jour en parallèle tous les contacts non lus
- **Test email** : envoie un email test et affiche le résultat inline
- **Upload d'images** : zone glisser-déposer ou clic pour image principale, multi-upload pour galerie
- **Impression PDF devis** : génère une page d'impression stylisée avec logo

### Architecture JS admin (`admin.js`)

```
DOMContentLoaded
  └── checkSession() → si OK → showDashboard()
        ├── refreshAll()         # stats dashboard
        ├── getSettings()        # remplir formulaire paramètres
        └── showPanel()          # nav entre panels
              ├── renderContacts()   # charge + cache dans _contactsCache
              ├── renderDevis()      # charge + cache dans _devisCache
              ├── renderNews()
              └── renderPortfolio()
```

---

## 12. Déploiement (Vercel)

### Configuration `vercel.json`

```json
{
  "builds": [{ "src": "server.js", "use": "@vercel/node" }],
  "routes": [
    { "src": "/api/(.*)", "dest": "/server.js" },
    { "handle": "filesystem" },
    { "src": "/(.*)", "dest": "/server.js" }
  ],
  "crons": [{ "path": "/api/ping", "schedule": "0 8 * * *" }]
}
```

- Toutes les requêtes `/api/*` → `server.js`
- Fichiers statiques (`public/`) → servis directement par Vercel
- Fallback → `server.js` (qui renvoie `404.html` pour les routes inconnues)
- Cron quotidien à 8h UTC → `/api/ping` pour garder le serveur actif

### Procédure de déploiement

```bash
git add .
git commit -m "description"
git push origin main
```

Vercel détecte automatiquement le push et redéploie.

### Domaine personnalisé

DNS chez LWS : enregistrement A `mozaikinternational.com` → `76.76.21.21` (IP Vercel)

---

## 13. Développement local

### Prérequis

- Node.js 18+
- Un projet Supabase avec le schéma appliqué (`supabase-schema.sql`)

### Installation

```bash
git clone https://github.com/mosaictech8/mosaic.git
cd mosaic
npm install
```

### Configuration `.env`

```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
JWT_SECRET=une-chaine-aleatoire-longue
ADMIN_USER=admin
ADMIN_PASS=MotDePasseLocal!
CONTACT_EMAIL=vous@email.com

# Optionnel — emails
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=re_xxxx
SMTP_SECURE=true
SMTP_FROM=onboarding@resend.dev
```

### Démarrage

```bash
npm start
# → http://localhost:3000
# → http://localhost:3000/admin
```

---

## 14. Procédures de maintenance

### Changer le mot de passe admin

Admin → Paramètres → "Changer le mot de passe admin" → ancien + nouveau mot de passe → Enregistrer.

Ou directement en SQL Supabase :
```sql
-- Remplacer par le hash bcrypt du nouveau mot de passe
UPDATE settings SET value = '$2a$10$...' WHERE key = 'admin_password';
```

### Réinitialiser le mot de passe admin (urgence)

1. Dans Vercel → Environment Variables → modifier `ADMIN_PASS` avec le nouveau mot de passe
2. Dans Supabase SQL Editor :
   ```sql
   DELETE FROM settings WHERE key = 'admin_password';
   ```
3. Redéployer → `initAdminPassword` recréera le hash au prochain démarrage

### Ajouter un administrateur

Actuellement un seul admin est supporté. Le login est `ADMIN_USER` (défaut : `admin`), le mot de passe est dans `settings.admin_password`.

### Sauvegarder la base de données

Depuis Supabase Dashboard → Database → Backups (sauvegardes automatiques disponibles sur les plans payants).

Export manuel :
```sql
-- Exporter les tables importantes
SELECT * FROM contacts ORDER BY created_at DESC;
SELECT * FROM devis ORDER BY created_at DESC;
SELECT * FROM portfolio;
SELECT * FROM news;
```

Ou via l'admin → Exporter CSV contacts et devis.

### Appliquer une mise à jour du schéma

Pour ajouter une colonne sans perdre les données existantes :
```sql
-- Exemple : ajouter une colonne à portfolio
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS tags text;
```

Ne jamais ré-exécuter `supabase-schema.sql` en entier en production (les `drop table` effacent tout).

### Vérifier les logs

Vercel Dashboard → votre projet → Deployments → cliquer sur un déploiement → Functions → sélectionner `server.js`.

### Tester la configuration email

Admin → Paramètres → "Envoyer un email test" → vérifier la réception.

---

*Document généré le 19 juin 2026 — Mosaïc International SARL*
