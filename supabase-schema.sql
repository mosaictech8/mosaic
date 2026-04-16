-- ================================================================
-- Mosaïc International — Schéma Supabase (à exécuter en entier)
-- Supabase Dashboard → SQL Editor → New query → Run
-- ================================================================

-- Supprimer les anciennes tables si elles existent
drop table if exists contacts;
drop table if exists news;
drop table if exists settings;

-- ── Table contacts ────────────────────────────────────────────
create table contacts (
  id          text primary key,
  prenom      text,
  nom         text,
  email       text,
  tel         text,
  societe     text,
  pays        text,
  service     text,
  budget      text,
  message     text,
  status      text default 'new',
  date        text,
  source_page text,
  created_at  text
);

-- ── Table news (actualités) ───────────────────────────────────
create table news (
  id          text primary key,
  title       text,
  category    text,
  status      text default 'draft',
  excerpt     text,
  content     text,
  author      text,
  date        text,
  image_data  text,
  created_at  text
);

-- ── Table settings (paramètres + mot de passe admin) ──────────
create table settings (
  key   text primary key,
  value text
);

-- ── Désactiver RLS (accès via clé serveur uniquement) ─────────
alter table contacts disable row level security;
alter table news     disable row level security;
alter table settings disable row level security;

-- ── Storage bucket pour les images d'articles ────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'article-images',
  'article-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/jpg']
) on conflict (id) do nothing;

-- Autoriser l'upload depuis le serveur (clé anon avec RLS désactivé)
drop policy if exists "anon upload" on storage.objects;
create policy "anon upload" on storage.objects
  for insert to anon
  with check (bucket_id = 'article-images');

drop policy if exists "anon update" on storage.objects;
create policy "anon update" on storage.objects
  for update to anon
  using (bucket_id = 'article-images');

drop policy if exists "anon delete" on storage.objects;
create policy "anon delete" on storage.objects
  for delete to anon
  using (bucket_id = 'article-images');

-- Autoriser la lecture publique des images
drop policy if exists "public read images" on storage.objects;
create policy "public read images" on storage.objects
  for select to public
  using (bucket_id = 'article-images');

-- ================================================================
-- Fin du script. Après exécution, relancez : npm start
-- ================================================================
