-- ─────────────────────────────────────────────────────────────────
-- Golden Connect Partners ("Наши партнёры") — projects with referral-walk
-- algorithm ported from Business Network. Admin curates the catalog,
-- users add their own ref-link per partner, system walks the upline
-- to find the nearest sponsor who participates in the same partner.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  author_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  business_sphere TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  -- ACTIVE | PENDING | REJECTED — admin moderation gate.
  -- For Golden Connect MVP we auto-set ACTIVE since only admin can create.
  stages TEXT[],
  is_referral BOOLEAN NOT NULL DEFAULT TRUE,
  website TEXT,
  ref_link_template TEXT,
  -- e.g. 'https://example.com/?ref={CODE}' — informational, helps user
  -- format their own link. Not currently enforced.
  tags TEXT[],
  images TEXT[],
  budget DOUBLE PRECISION,
  equity DOUBLE PRECISION,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  moderated_at TIMESTAMP,
  moderation_reason TEXT,
  boosted_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_projects_author ON projects(author_user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_sphere ON projects(business_sphere);

CREATE TABLE IF NOT EXISTS project_referral_participations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  referral_link TEXT,
  project_username TEXT,
  invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  -- The sponsor that the walk-upline algorithm found in this project
  -- when this user submitted their link. NULL means user reached the
  -- top of the chain without finding any sponsor (joined cold).
  has_submitted_link BOOLEAN NOT NULL DEFAULT FALSE,
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  notified_at TIMESTAMP,
  -- L1 reward (+10 TRDX) flag — set when invited_by has been credited.
  l1_reward_paid BOOLEAN NOT NULL DEFAULT FALSE,
  l1_reward_paid_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, project_id)
);
CREATE INDEX IF NOT EXISTS idx_pp_project ON project_referral_participations(project_id);
CREATE INDEX IF NOT EXISTS idx_pp_user ON project_referral_participations(user_id);
CREATE INDEX IF NOT EXISTS idx_pp_inviter ON project_referral_participations(invited_by);
CREATE INDEX IF NOT EXISTS idx_pp_unpaid_l1 ON project_referral_participations(l1_reward_paid)
  WHERE l1_reward_paid = FALSE AND has_submitted_link = TRUE;

CREATE TABLE IF NOT EXISTS project_referrals (
  -- Multi-level audit log of who is whose referral at what depth.
  -- Built by createReferralChain after submitReferralLink succeeds.
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  referrer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, referrer_user_id, referred_user_id, level)
);
CREATE INDEX IF NOT EXISTS idx_pr_project ON project_referrals(project_id);
CREATE INDEX IF NOT EXISTS idx_pr_referrer ON project_referrals(referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_pr_referred ON project_referrals(referred_user_id);

CREATE TABLE IF NOT EXISTS project_notifications_log (
  -- Audit who got notified about what — prevents duplicate notifs and
  -- gives a clean history for support tickets like "did user X get the
  -- skip-warning for project Y?"
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  -- 'skip_missed' | 'new_participant' | 'author_new'
  payload JSONB,
  sent_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, project_id, kind, sent_at)
);
CREATE INDEX IF NOT EXISTS idx_pnl_user ON project_notifications_log(user_id);
CREATE INDEX IF NOT EXISTS idx_pnl_project ON project_notifications_log(project_id);
