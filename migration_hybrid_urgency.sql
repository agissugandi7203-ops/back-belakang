-- =========================================================================
-- MIGRATION: Hybrid Search RRF + Urgency Scoring
-- Run this in Supabase SQL Editor ONCE (after the initial database.sql)
-- =========================================================================

-- 1. Add urgency_level and urgency_reason columns to citizen_reports
alter table citizen_reports 
  add column if not exists urgency_level text check (urgency_level in ('Kritis', 'Tinggi', 'Sedang', 'Rendah')) default 'Sedang',
  add column if not exists urgency_reason text;

create index if not exists idx_citizen_reports_urgency on citizen_reports(urgency_level);

-- 2. Add tsvector column for full-text search on public_services
alter table public_services 
  add column if not exists fts_vector tsvector 
  generated always as (
    to_tsvector('indonesian',
      coalesce(name, '') || ' ' ||
      coalesce(institution, '') || ' ' ||
      coalesce(category, '') || ' ' ||
      coalesce(description, '')
    )
  ) stored;

create index if not exists idx_public_services_fts on public_services using gin(fts_vector);

-- 3. Hybrid Search Function using RRF (Reciprocal Rank Fusion)
-- Combines vector similarity (cosine) + BM25/Full-Text Search
-- RRF formula: score = sum(1 / (k + rank)) where k=60 (standard constant)
create or replace function hybrid_search_services(
  query_text text,
  query_embedding vector(1536),
  match_count int default 5,
  rrf_k int default 60
)
returns table (
  id uuid,
  name varchar(255),
  institution varchar(255),
  category varchar(100),
  description text,
  requirements jsonb,
  procedures jsonb,
  contact_phone varchar(50),
  contact_email varchar(100),
  address text,
  website text,
  rrf_score float
)
language sql stable
as $$
  with
  -- Vector search: rank by cosine similarity
  vector_results as (
    select
      ps.id,
      row_number() over (order by ps.embedding <=> query_embedding) as vector_rank
    from public_services ps
    where ps.embedding is not null
    order by ps.embedding <=> query_embedding
    limit 20
  ),
  -- Full-text BM25 search: rank by ts_rank
  fts_results as (
    select
      ps.id,
      row_number() over (order by ts_rank(ps.fts_vector, plainto_tsquery('indonesian', query_text)) desc) as fts_rank
    from public_services ps
    where ps.fts_vector @@ plainto_tsquery('indonesian', query_text)
    limit 20
  ),
  -- RRF fusion: combine both rankings
  rrf_ranked as (
    select
      coalesce(v.id, f.id) as id,
      (
        coalesce(1.0 / (rrf_k + v.vector_rank), 0.0) +
        coalesce(1.0 / (rrf_k + f.fts_rank), 0.0)
      ) as rrf_score
    from vector_results v
    full outer join fts_results f on v.id = f.id
  )
  select
    ps.id,
    ps.name,
    ps.institution,
    ps.category,
    ps.description,
    ps.requirements,
    ps.procedures,
    ps.contact_phone,
    ps.contact_email,
    ps.address,
    ps.website::text,
    rrf.rrf_score
  from rrf_ranked rrf
  join public_services ps on ps.id = rrf.id
  order by rrf.rrf_score desc
  limit match_count;
$$;

-- 4. Allow service role (backend) to call these functions
grant execute on function hybrid_search_services to service_role;
grant execute on function hybrid_search_services to anon;
grant execute on function hybrid_search_services to authenticated;
