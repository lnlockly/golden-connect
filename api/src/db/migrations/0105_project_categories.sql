-- =====================================================================
-- 0105: Project catalog categories + legitimize delivered_at
-- =====================================================================
-- GIFT CLUB project panel: каталог проектов в 3 категориях
--   services (🔵 рекламные сервисы партнёров)
--   mlm      (🟢 МЛМ компании)
--   startups (🔴 стартапы — повышенный риск)
-- delivered_at ранее создавалась ALTER-ом в runtime (projects.ts) — узакониваем.
-- =====================================================================

-- delivered_at для воркера уведомлений
ALTER TABLE project_notifications_log ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP;

-- категории каталога
ALTER TABLE projects ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'services'; -- services|mlm|startups
ALTER TABLE projects ADD COLUMN IF NOT EXISTS risk_flag BOOLEAN NOT NULL DEFAULT FALSE;  -- 🔴 повышенный риск (стартапы)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 100;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS icon TEXT;                                 -- эмодзи/URL логотипа

CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category, sort_order, created_at DESC);

COMMENT ON COLUMN projects.category IS 'Каталог GIFT CLUB: services | mlm | startups';
COMMENT ON COLUMN projects.risk_flag IS 'TRUE для стартапов — показывает дисклеймер повышенного риска';
