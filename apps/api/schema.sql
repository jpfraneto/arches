CREATE TABLE arch_casts (
  id UUID PRIMARY KEY,
  arch_id TEXT NOT NULL,
  text TEXT NOT NULL,
  dot_anky TEXT,
  fid BIGINT,
  username TEXT,
  parent_id UUID REFERENCES arch_casts(id),
  farcaster_hash TEXT,
  status TEXT NOT NULL CHECK (status IN ('submitted', 'confirmed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX arch_casts_arch_created_idx
  ON arch_casts (arch_id, created_at DESC);

-- v0 rule: the feed query must filter by arch_id so an Arch only shows casts
-- created through that Arch. This table is a local read plane, not a global
-- Farcaster index.
