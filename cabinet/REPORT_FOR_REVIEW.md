# Отчет по проекту Trendex Bot
Дата: 2026-04-10 (обновлено 2026-04-12: Sprint 1 stability)

---

## Sprint 2 — Динамические эфиры + полу-админка (2026-04-12)

### Что сделано
Захардкоженный блок эфира на главной заменён на **динамическую систему**: админы управляют эфирами через кабинет, изменения автоматически появляются на главной и в кабинете (единый компонент).

### Backend
- **storage.js** (~+200 строк):
  - Расширен `upsertEvent`: поля `speakers[]`, `topic`, `timezone`, `coverImage`, `recordingVideoId`, `tags[]`, `visibility`, `canceled`, `createdBy`, `updatedBy`
  - Новые функции: `listUpcomingEvents`, `listPastEvents`, `getNextUpcomingEvent`, `deleteEvent` (soft), `hardDeleteEvent`
  - `computeEventStatus`/`enrichEvent` — статус вычисляется: upcoming / live / past / canceled
  - Фильтры: `includeCanceled`, `includeUnpublished`
- **web-routes.js** (~+150 строк):
  - `requireAdmin` middleware — проверяет email в `contentAdminEmails`
  - `isContentAdmin(user)` хелпер
  - `publicEventShape(ev, {refCode})` — для публичной отдачи, с авто-собиранием URL записи через `/media?video=ID&ref=...`
  - Public: `GET /api/events/next`, `/api/events/upcoming`, `/api/events/past`
  - Admin: `GET/POST/PUT/DELETE /api/admin/events[:id]` (с `?hard=1` для полного удаления)
  - `/api/auth/me` возвращает `isAdmin: boolean`
  - Legacy `POST /api/events` теперь требует админа (было открыто любому юзеру — уязвимость)

### Frontend
- **public/site/js/broadcasts-block.js** (новый, ~270 строк) — единый компонент XHBroadcasts с `mount(container, opts)`:
  - Hero-секция с обложкой, датой в МСК, countdown-таймером, кнопками «Записаться» + «Поделиться»
  - Список предстоящих (grid cards)
  - Список прошедших (ссылки на `/media?video=ID`)
  - Fallback: «Следите за анонсами» + ссылка на TG-бот
  - В кабинете кнопка записи вызывает `POST /api/events/:id/subscribe`, на главной ведёт на `/register`
- **public/site/css/broadcasts-block.css** (новый, ~190 строк) — стили с префиксом `.xhb-*`, адаптив под 820px
- **index.html**: заменён статичный блок на `<div id="broadcasts-block">`, подключены JS+CSS, countdown hero теперь берёт дату из `/api/events/next`
- **cabinet.html**:
  - Страница `#/broadcasts` → тот же компонент XHBroadcasts
  - `renderDashBroadcast` (dashboard-карточка) переключена с `/api/site/config` на `/api/events/next`
  - Новая страница `#/admin-events`:
    - Sidebar-кнопка `.admin-only` скрыта по умолчанию, показывается при `me.isAdmin`
    - Список событий сгруппирован по статусу: live / upcoming / past / canceled
    - Модалка создания/редактирования с полями: title, topic, description, datetime-local, длительность, спикеры, обложка, join URL, ID видеозаписи, теги, isPublished, canceled
    - Кнопка «Выбрать из медиатеки» — модалка с поиском по `/api/public/media-library` для привязки записи
  - `updateSidebar` показывает `.admin-only` элементы при `me.isAdmin`

### Миграция
- **scripts/migrate-static-events.js** (новый) — одноразовый импорт `nextBroadcast` из site-content.js в `webEvents`
- Запущен на проде: `ev_00000001 — Иммунитет и восстановление организма` (2026-04-15 18:00 МСК)

### Развёртывание
- Первый админ: `volga90000@gmail.com` в `CONTENT_ADMIN_EMAILS` в `.env`
- Проверено на проде:
  - `GET /api/events/next` → возвращает импортированный эфир
  - `GET /api/events/upcoming` → список с 1 элементом
  - `/js/broadcasts-block.js` + `/css/broadcasts-block.css` → 200 OK
  - `/health` → 200 OK, uptime OK
- Sprint 1 модули (rate-limit, backups, monitoring) также задеплоены — были ошибочно пропущены ранее, теперь подняты

### Что дальше (опционально)
- Уведомления в TG при создании эфира (рассылка подписанным)
- Cron за 24ч/1ч до эфира → напоминания через бот
- Email-канал (как планировалось в Sprint 1, пропущен по запросу)

---

## Sprint 1 — Стабильность (2026-04-12)

Добавлено 3 модуля и интеграция с сервером и API-роутами.

### 1. Бэкапы state.json
**Файл:** `src/backups.js` (новый, ~130 строк)

- Автоматическое копирование state.json в `data/backups/state-YYYYMMDD-HHMM.json`
- Интервал 6 часов (конфигурируемо: `BACKUP_INTERVAL_MS`)
- Retention 30 дней, старые файлы удаляются автоматически
- Первый бэкап через 60с после старта (чтобы не мешать boot)
- API: `createBackupManager(config)` → `{ start, stop, runBackup, getStatus, listBackups }`
- Атомарная запись state.json (tmp + rename) уже была в storage.js — OK

### 2. Мониторинг + алёрты в Telegram
**Файл:** `src/monitoring.js` (новый, ~140 строк)

- Отправляет стартовое сообщение в админ-чат (host, node, RSS, pid)
- Каждые 5 мин проверяет: память (RSS > 500 MB), доступность Telegram API (getMe), свежесть бэкапа (> 12ч)
- Debounce: один и тот же алёрт не чаще 1 раза в час
- Использует `MONITOR_CHAT_ID` или fallback на `SUPPORT_FORWARD_CHAT_ID`
- Если chat ID не задан — модуль просто логирует и не падает
- API: `createMonitoring({ config, bot, storage, startedAt, getBackupStatus })` → `{ start, stop, notifyAdmin, runChecks, getStatus }`

### 3. Rate limiter на API
**Файл:** `src/rate-limit.js` (новый, ~70 строк)

- In-memory sliding window, без внешних зависимостей
- 3 уровня:
  - `apiLimiter`: 300 req/min на IP — для всех `/api/*`
  - `publicLimiter`: 60 req/min — для `/api/public/*` (media-library, referral-profile, video-comments, video-reactions)
  - `authLimiter`: 10 req/min — для `/api/auth/login`, `/api/auth/register`, `/api/auth/bot/start` (защита от брутфорса)
- Respект `X-Forwarded-For` (с `trust proxy` в server.js)
- Возвращает 429 + `Retry-After` + `X-RateLimit-*` заголовки
- Отключается через `RATE_LIMIT_ENABLED=0`

### 4. Расширенный `/health` + admin backup trigger
**Файл:** `src/server.js` (изменён)

`GET /health` теперь возвращает:
```json
{
  "ok": true,
  "service": "trendex-cabinet",
  "uptimeSec": 12345,
  "pid": 42,
  "node": "v20.x",
  "memory": { "rssMb": 120, "heapUsedMb": 60, "heapTotalMb": 90 },
  "telegramUsersCount": 10,
  "webUsersCount": 9,
  "backup": { "lastAt": "...", "count": 12, "error": null },
  "monitor": { "enabled": true, "chatId": ..., "rssMb": 120, "activeAlerts": [] }
}
```

`POST /admin/backup/run` — ручной триггер бэкапа (требует `X-Admin-Token` = `ADMIN_TOKEN` env).

### 5. Конфиг
**Файл:** `src/config.js` (изменён)

Новые env-переменные:
```env
MONITOR_CHAT_ID=             # куда слать алёрты (fallback: SUPPORT_FORWARD_CHAT_ID)
MONITOR_INTERVAL_MS=300000   # 5 мин
MONITOR_MEMORY_MB=500        # порог RSS для алёрта
MONITOR_BACKUP_STALE_HOURS=12
BACKUP_DIR=                  # по умолчанию data/backups
BACKUP_RETENTION_DAYS=30
BACKUP_INTERVAL_MS=21600000  # 6 часов
RATE_LIMIT_ENABLED=1
RATE_LIMIT_API_PER_MIN=300
RATE_LIMIT_PUBLIC_PER_MIN=60
RATE_LIMIT_AUTH_PER_MIN=10
ADMIN_TOKEN=                 # для /admin/backup/run
```

### 6. Проверка
- `node --check` на всех 6 файлах: ✅ OK
- `app.set('trust proxy', 1)` добавлен для корректного IP за Nginx
- Бэкапы и мониторинг запускаются в колбэке `bot.start()` после подключения

---

## Исходный отчёт (медиатека, 2026-04-10)
Репозиторий: https://github.com/alphaleaders/trendex-cabinet
Сайт: https://trendex.biz/cabinet/

---

## 1. Общая концепция проекта

**Цель:** Воронка привлечения людей на живые эфиры с профессорами Trendex & Beauty.
```
Лендинг → Регистрация → Welcome-анкета → Кабинет партнёра
  → Telegram-бот → Эфир → Продукты/Партнёрство (winwinbot)
```

**Стек:**
- Backend: Node.js / Express, grammY (Telegram)
- Хранилище: state.json (JSON-файл), SQLite отдельно для планировщика
- Frontend: ванильный JS, без фреймворков
- Деплой: сервер 81.91.177.204, PM2 (`trendex-cabinet`), порт 3810
- Путь: `/opt/trendex-cabinet`

---

## 2. Структура проекта

### Backend (src/)
| Файл | Размер | Описание |
|------|--------|----------|
| server.js | 422 стр. | Express-сервер, роуты страниц, SSR мета-тегов, SEO |
| web-routes.js | 2110 стр. | 115+ API роутов (auth, cabinet, media, tools, chats, events) |
| storage.js | 3684 стр. | JSON-хранилище: 171 функция, все сущности системы |
| bot.js | 717 стр. | Telegram-бот grammY: команды, клавиатуры, уведомления |
| site-content.js | ~800 стр. | 25 продуктов, тексты лендинга, конференции, промо-материалы |
| config.js | ~60 стр. | Все env-переменные, ссылки, пути |
| video-library.js | ~300 стр. | Видеотека: категории, поиск по ID, нормализация |
| quests-data.js | — | Система квестов/достижений |
| texts.js | — | Тексты бота и меню |

### Frontend (public/site/)
| Файл | Размер | Описание |
|------|--------|----------|
| index.html | 984 стр. | Главная страница (SPA-лендинг) |
| landing.js | 812 стр. | JS для лендинга: блоки, анимации, CTA |
| cabinet.html | 3829 стр. | Кабинет партнёра (20+ панелей, hash-роутинг) |
| app.js | 10904 стр. | Весь JS кабинета |
| styles.css | 870 стр. | Все стили |
| media-public.html | 423 стр. | Публичная медиатека с Plyr-плеером |
| register.html | — | Форма регистрации |
| login.html | — | Форма входа |
| faq.html | — | FAQ |
| reviews.html | — | Отзывы с каруселью |
| product.html | — | Страница продукта |
| landings-public.html | — | Все варианты лендингов |

### 20+ вариантов лендингов (public/site/)
aurora, biopunk, brutalist, catalog, couture, depth3d, family, health, lab, luxury, official, one-product, quiz, skeptic, swiss, synthwave, techdata, urgency, wellness, youth

### patches/ — 70+ патч-скриптов
Вся история изменений хранится как node-скрипты. Стратегия применения:
```
Write → C:\tmp\ → scp root@81.91.177.204:/tmp/ → ssh "node /tmp/patch.js"
```

---

## 3. Что реализовано — полный список

### 3.1 Регистрация и онбординг
- Форма: email + пароль (мин. 8 символов), без выбора роли
- Реферальный код из URL `?ref=` — скрытое поле
- После регистрации → кабинет + автоматический welcome-экран
- Welcome-экран: 2 пути (подписаться в бот / пригласить друзей)
- Шаг 3 welcome: мини-анкета (имя, город, интересы)
- onboardingCompletedAt = null → показать welcome вместо dashboard

### 3.2 Dashboard кабинета
- Обратный отсчёт до ближайшего эфира
- Growth-мотивация (5 уровней роста)
- KPI-карточки: рефералы, визиты, активность
- График рефералов
- Партнёрский путь (Path → Company → результат)

### 3.3 Система лендингов
- Маршрут `/` + `?landing=health/official/youth/...`
- `?ref=CODE` — реферальный код подставляется во все CTA
- SSR мета-тегов: title, description, og:image, canonical
- Multi-язычность (lang=ru/en)
- 20+ визуальных вариантов

### 3.4 Продукты (25 штук)
Страницы /product/:slug для каждого:
live-water, dihydroquercetin, oligochit-iod-53, oligochit-osteo, oligochit-zoo, hitabs, tempulis, reventus, alfa-nectar, hexanidine, provitera, silverfleece, formidium, women-complex, omega-3, balsams-vedova, boroflavin, h538 и другие.

Поля: id, slug, title, category, format, priceRub, shortDescription, story, useCases.

### 3.5 Чат-система
- 19 API роутов: создание, сообщения, участники, реакции, закрепить
- Фронтенд: полная реализация в кабинете
- Уведомления в Telegram при новом сообщении (cooldown 12ч на чат)

### 3.6 Система конференций / эфиров
- Список эфиров из site-content.js (дата, тема, спикеры)
- Обратный отсчёт до ближайшего
- Подписка на напоминания
- Уведомления в бот за 24ч и 1ч

### 3.7 Публичная медиатека (последние изменения)
**URL:** https://trendex.biz/cabinet/media/

Реализовано:
- Страница `media-public.html` — поиск, фильтры по категориям, карточки видео, Plyr-плеер
- API `/api/public/media-library` — публичный список без тяжёлых полей (транскрипт)
- Режим одного видео: `/api/public/media-library?video=<id>`
- Открытие видео по прямой ссылке через URL-параметр `?video=...`
- Поддержка форматов ID: `xvideo_2GhfwDXeiMY`, `yt-2GhfwDXeiMY.mp4`, `2GhfwDXeiMY`
- Поиск по: external_id, video_file, source_url
- Реферальный параметр `ref` в ссылках — автоматически подставляется
- Fallback: если API медленно → строится mp4-URL напрямую

**Категории видео:**
broadcasts (Эфиры), products (Продукты), reviews (Отзывы), company (Компания), science (Технологии), instructions (Инструкции), business (Бизнес/Партнёрство), other.

**Формат тестовых ссылок:**
```
https://trendex.biz/cabinet/media/
https://trendex.biz/cabinet/media/?ref=xh2c241&src=video&video=xvideo_2GhfwDXeiMY
https://trendex.biz/cabinet/media/?ref=xh2c241&src=video&video=xvideo__8futNhyvUw
```

### 3.8 Кабинет — панели (20+)
| Панель | Содержимое |
|--------|-----------|
| dashboard | KPI, обратный отсчёт, growth, рефералы |
| products | Каталог продуктов, фильтры, "Заказать" → company link |
| materials | Промо-тексты (5 шт.), баннеры, QR, шеринг |
| landings | 3 карточки лендингов с preview, ссылкой с реф-кодом, QR |
| learning | 5 стартовых уроков: как начать, приглашать, записать на эфир |
| faq | 10 вопросов-ответов (аккордеон) |
| rating | Топ-10 по рефералам |
| tools | QR-код, хештеги, сократитель ссылок |
| chats | Система чатов (19 API) |
| events | Конференции и эфиры, подписка |
| media | Медиатека с видео |
| profile | Контакты, интересы, company link, привязка TG |
| planner | Задачи, привычки, AI-планирование (SQLite) |
| protocols | Шаблоны протоколов |
| notifications | Настройки уведомлений |

**Шеринг:** кнопки TG, WA, VK, X (Twitter) + копировать ссылку
**QR-коды:** на видео, на реферальные ссылки, на лендинги

### 3.9 Telegram-бот (@Trendex_bizbot)
**Привязка:**
1. Кабинет → Профиль → "Привязать Telegram" → генерируется token
2. Открывается `t.me/Trendex_bizbot?start=link_TOKEN`
3. Бот привязывает tg_chat_id к userId

**Команды:** /start, /cancel, /support, /ref + глубокие ссылки

**Клавиатуры:**
- Главное меню: Продукты, Конференции, Инструменты, Планировщик, Партнёрам
- Партнёрам: реф.ссылка, промо-материалы, структура
- Продукты: каталог 25 позиций

**Уведомления:**
- Новый реферал → спонсору в бот
- Новое сообщение в чате (cooldown 12ч)
- Напоминание об эфире за 24ч и 1ч

**Планировщик из бота:** /today, /week, /add [задача]

### 3.10 Company link система
- Каждый пользователь вводит свою ссылку компании (winwinbot)
- `COMPANY_REGISTRATION_URL_TEMPLATE` — шаблон с `{ref}` плейсхолдером
- Ссылка наследуется: если ref передан → ссылка реферера
- Все кнопки "Записаться/Зарегистрироваться в компании" → динамически
- Fallback: companyCatalog → companyMain

### 3.11 SEO
- robots.txt, sitemap.xml
- SSR мета-тегов на сервере для ботов
- Schema.org (Organization, Event, Product)
- Яндекс.Метрика + UTM + 11 целей конверсии
- Virtual pageviews для SPA hash-роутинга

### 3.12 Инструменты (в кабинете)
- QR-код генератор (api.qrserver.com)
- Хештег генератор (Groq AI)
- Сократитель ссылок (шорт-ссылки с реф-параметрами)
- Промо-посты: 5 готовых шаблонов с кнопками шеринга

### 3.13 Планировщик (SQLite)
- Задачи: CRUD (create/read/update/delete)
- Привычки (habit_log, ежедневный трекер)
- Напоминания через бот
- AI-помощник планирования (Groq)
- Команды бота: /today, /tomorrow, /week, /plan, /add, /done

---

## 4. Переменные окружения (ключевые)

```env
BOT_TOKEN=           # токен @Trendex_bizbot
PUBLIC_BASE_URL=https://trendex.biz/cabinet
DATA_DIR=./data      # state.json
PORT=3810
TRENDEX_VIDEO_DB_PATH=../data/tiktok-publisher.db
TRENDEX_VIDEO_DIR=../trendex-videos
TRENDEX_VIDEO_PUBLIC_PATH=/video-library
COMPANY_REGISTRATION_URL_TEMPLATE=https://my.winwinbot.com/bot/1/trendex_bot?REFID={ref}
ARSENAL_API_BASE_URL=https://app.arsenalprofi.com
```

---

## 5. Деплой

```bash
# Применить патч:
scp /c/tmp/patch.js root@81.91.177.204:/tmp/
ssh root@81.91.177.204 "node /tmp/patch.js"

# Обновить файл напрямую:
scp file.js root@81.91.177.204:/opt/trendex-cabinet/src/
ssh root@81.91.177.204 "pm2 restart trendex-cabinet"

# Логи:
ssh root@81.91.177.204 "pm2 logs trendex-cabinet --lines 50"
```

---

## 6. Статистика проекта (PLAN_IMPROVEMENTS.md)

- 13 страниц (все 200 OK)
- 20 панелей кабинета, 24 кнопки sidebar
- 115 API роутов, 171 storage функция
- 25 продуктов, 20+ лендингов
- 70+ патч-скриптов в /patches/
- Планировщик SQLite, бот с 14+ командами
- 190 медиа файлов в видеотеке

---

## 7. Основные файлы с изменениями (медиатека)

| Файл | Что изменено |
|------|-------------|
| `public/site/media-public.html` | Публичная медиатека: поиск, фильтры, Plyr, открытие по `video=` |
| `src/server.js` | Роут `/media`, редирект с `/` при `src=video&video=...` |
| `src/web-routes.js` | `/api/public/media-library` + режим одного видео |
| `src/video-library.js` | Поиск по id, нормализация форматов, публичные карточки |
| `src/storage.js` | Публичные поля (без полного транскрипта) |
| `public/site/cabinet.html` | Реферальные ссылки, QR, шеринг, SEO-тексты для постов |

---

## 8. Возможные проблемы и решения

| Симптом | Решение |
|---------|---------|
| Видео не открывается по ссылке | Ctrl+F5, проверить формат ID в URL |
| Медленная загрузка медиатеки | Большой JSON с видео — используется lazy load |
| Ссылка company не подставляется | Проверить COMPANY_REGISTRATION_URL_TEMPLATE в .env |
| Бот не отправляет уведомления | Проверить tg_chat_id привязку пользователя |
| pm2 не рестартует | `pm2 status`, проверить лог `pm2 logs trendex-cabinet` |

---

## 9. Планы (не реализованы)

По приоритету из PLAN_IMPROVEMENTS.md:

**Приоритет 1 — конверсия:**
- Email-рассылка после регистрации (дрип 5 писем за 7 дней)
- Web Push уведомления
- Прогресс-бар онбординга
- AI персональные рекомендации

**Приоритет 2 — инструменты партнёров:**
- AI-генератор постов (Groq → 3 варианта → шеринг)
- Шаблоны Stories/Reels
- Генератор баннеров
- CRM: статусы рефералов, заметки, напоминания, теги

**Приоритет 3 — аналитика:**
- Воронка конверсии (Chart.js)
- UTM-аналитика по источникам
- Когортный анализ

**Приоритет 4 — геймификация:**
- Еженедельные челленджи
- Достижения (badges)
- Leaderboard в реальном времени
- Streak (серия дней)

**Приоритет 5 — техническое:**
- Миграция state.json → SQLite
- CDN для медиа
- Service Worker / PWA
- Автоматические бэкапы
