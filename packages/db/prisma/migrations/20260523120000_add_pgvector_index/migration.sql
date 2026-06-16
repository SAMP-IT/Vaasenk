-- Sprint 4 — pgvector ANN index for cosine-similarity search.
--
-- Adds an HNSW index on `vector_embeddings.embedding` so RAG retrieval
-- (VectorStoreService.search) can serve top-K nearest-neighbour queries in
-- sub-50ms across a multi-tenant table with hundreds of thousands of rows.
--
-- HNSW requires pgvector >= 0.5.0 (available on Supabase Postgres 15+
-- which is the production target). If you're running this against an older
-- pgvector on a self-hosted instance, drop the HNSW statement and use the
-- IVFFlat fallback at the bottom of this file.
--
-- The `<=>` operator selects cosine distance — `vector_cosine_ops` is the
-- matching opclass. Our application layer converts distance to similarity
-- via `similarity = 1 - distance`.
--
-- Index parameters left at defaults (m=16, ef_construction=64). These are
-- good for the ~50-500 chunks per syllabus we expect in MVP. Tune as the
-- corpus grows.

CREATE INDEX IF NOT EXISTS vector_embeddings_embedding_hnsw_idx
  ON vector_embeddings
  USING hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- IVFFlat fallback (commented out — uncomment only on pgvector < 0.5.0).
-- ---------------------------------------------------------------------------
-- CREATE INDEX IF NOT EXISTS vector_embeddings_embedding_ivfflat_idx
--   ON vector_embeddings
--   USING ivfflat (embedding vector_cosine_ops)
--   WITH (lists = 100);
