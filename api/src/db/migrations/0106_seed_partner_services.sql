-- =====================================================================
-- 0106: Seed/curate GIFT CLUB project catalog (3 categories)
-- =====================================================================
-- 🔵 services : рекламные сервисы компаний-партнёров
--               (TrendexBiz, Traffic2Gift, Gift Club, AgentFlow)
-- 🟢 mlm      : продуктовые МЛМ компании (X-Health & Beauty)
-- 🔴 startups : стартапы (пока пусто — наполняется из админки)
-- Idempotent: вставляем партнёров только если их ещё нет по title.
-- author_user_id берём от уже существующих проектов (admin-сидер).
-- =====================================================================

-- иконки + сортировка для уже существующих сервисов
UPDATE projects SET icon = '🚀', sort_order = 10, category = 'services'
  WHERE title = 'Trendex — реклама, заработок, инструменты';
UPDATE projects SET icon = '🤖', sort_order = 40, category = 'services'
  WHERE title = 'AgentFlow — AI-агенты для бизнеса';

-- X-Health — продуктовая МЛМ → переносим в 🟢 категорию
UPDATE projects SET icon = '🌿', sort_order = 10, category = 'mlm'
  WHERE title = 'X-Health & Beauty';

-- Traffic2Gift (🔵 services)
INSERT INTO projects (author_user_id, title, description, business_sphere, status, is_referral, website, category, risk_flag, sort_order, icon)
SELECT (SELECT author_user_id FROM projects ORDER BY id LIMIT 1),
       'Traffic2Gift',
       'Сервис рекламного трафика и коротких брендированных ссылок экосистемы Солидар Клуба. Сдай свою реферальную ссылку Traffic2Gift — за каждого реферала 1-й линии получишь +10 TRDX.',
       'AD_SERVICES', 'ACTIVE', TRUE, 'https://t2gift.com', 'services', FALSE, 20, '🎯'
WHERE NOT EXISTS (SELECT 1 FROM projects WHERE title = 'Traffic2Gift');

-- Gift Club (🔵 services)
INSERT INTO projects (author_user_id, title, description, business_sphere, status, is_referral, website, category, risk_flag, sort_order, icon)
SELECT (SELECT author_user_id FROM projects ORDER BY id LIMIT 1),
       'Gift Club',
       'Подарочный клуб экосистемы Солидар: статусы Даритель, кешбэк-пул и реферальная сеть. Сдай свою реферальную ссылку Gift Club — за каждого реферала 1-й линии получишь +10 TRDX.',
       'AD_SERVICES', 'ACTIVE', TRUE, 'https://golden-connect.top', 'services', FALSE, 30, '💎'
WHERE NOT EXISTS (SELECT 1 FROM projects WHERE title = 'Gift Club');
