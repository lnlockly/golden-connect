const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function createStorage(config = {}) {
  const dataDir = path.resolve(process.cwd(), String(config.dataDir || './data'));
  const statePath = path.join(dataDir, 'state.json');

  // Strip /cabinet from publicBaseUrl so referral links land on the
  // marketing landing (https://trendex.biz/?ref=X) rather than the
  // cabinet login page.
  function landingBaseUrl() {
    const raw = String(config.publicBaseUrl || '').replace(/\/+$/, '');
    return raw.replace(/\/cabinet$/, '') || 'https://trendex.biz';
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function hashSha256(value) {
    return crypto.createHash('sha256').update(String(value || '')).digest('hex');
  }

  function hashPassword(password, salt) {
    const resolvedSalt = String(salt || crypto.randomBytes(16).toString('hex'));
    const hash = crypto.pbkdf2Sync(String(password || ''), resolvedSalt, 120000, 32, 'sha256').toString('hex');
    return { hash, salt: resolvedSalt };
  }

  function verifyPassword(password, salt, expectedHash) {
    if (!salt || !expectedHash) return false;
    const normalizedExpected = String(expectedHash || '').trim().toLowerCase();
    const normalizedSalt = String(salt || '').trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(normalizedExpected)) return false;
    if (!/^[a-f0-9]{32,64}$/.test(normalizedSalt)) return false;
    const actual = hashPassword(password, normalizedSalt).hash;
    return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(normalizedExpected, 'hex'));
  }

  function makeId(prefix, counter) {
    return `${prefix}_${String(counter).padStart(8, '0')}`;
  }

  function initialState() {
  
  return {
      users: {},
      supportMessages: [],
      webUsers: {},
      webSessions: {},
      webBotAuthRequests: {},
      marketingVisitors: {},
      marketingEvents: [],
      webTasks: {},
      webProtocols: {},
      webFavorites: {},
      webSupportRequests: {},
      webNotifications: {},
      webActivityFeed: {},
      webLeadDesk: {},
      webVideoComments: {},
      webVideoReactions: {},
      webOrders: {},
      webWithdrawals: {},
      mediaLibraryEntries: [],
      shortLinks: {},
      webAiMessages: {},
      webQuestProgress: {},
      webEvents: [],
      webEventSubscriptions: {},
      webPlannerTasks: [],
      telegramMonitorChats: {},
      telegramMonitorEvents: [],
      telegramMonitorDigests: [],
      telegramMonitorRecipients: {},
      requiredChatGuards: {},
      counters: {
        webUser: 0,
        webSession: 0,
        webTask: 0,
        webProtocol: 0,
        webFavorite: 0,
        webSupportRequest: 0,
        webSupportMessage: 0,
        webVideoComment: 0,
        webNotification: 0,
        webActivity: 0,
        webOrder: 0,
        webWithdrawal: 0,
        mediaLibraryEntry: 0,
        shortLink: 0,
        webAiMessage: 0,
        marketingEvent: 0,
        webEvent: 0,
        webQuestCompletion: 0,
        telegramMonitorEvent: 0,
        telegramMonitorDigest: 0
      }
    };
  }

  function ensureStateFile() {
    fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(statePath)) {
      fs.writeFileSync(statePath, JSON.stringify(initialState(), null, 2), 'utf8');
    }
  }

  function normalizeState(rawState) {
    const state = rawState && typeof rawState === 'object' ? rawState : {};
    if (!state.users || typeof state.users !== 'object') state.users = {};
    if (!Array.isArray(state.supportMessages)) state.supportMessages = [];
    if (!state.webUsers || typeof state.webUsers !== 'object') state.webUsers = {};
    // One-time backfill: existing webUsers without username
    if (!state._usernameBackfillDone) {
      let backfilled = 0;
      for (const u of Object.values(state.webUsers || {})) {
        if (!u || u.username) continue;
        // Derive default
        let base;
        if (u.telegramUsername) base = String(u.telegramUsername).toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g,'_').replace(/^_+|_+$/g,'').slice(0,32);
        else if (u.email) base = String(u.email).split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g,'_').replace(/^_+|_+$/g,'').slice(0,32);
        else base = 'user_' + u.id;
        if (!base || base.length < 3) base = 'user_' + u.id;
        // Uniqueness check
        let candidate = base;
        let suffix = 1;
        const all = Object.values(state.webUsers || {});
        while (all.some(o => o && o.username && o.username === candidate && o.id !== u.id)) {
          suffix++;
          candidate = base + '_' + suffix;
        }
        u.username = candidate;
        u.usernameLockedAt = u.usernameLockedAt || (u.createdAt || new Date().toISOString());
        backfilled++;
      }
      state._usernameBackfillDone = true;
      if (backfilled > 0) console.log('[storage] one-time username backfill: ' + backfilled + ' webUsers');
    }
    if (!state.webSessions || typeof state.webSessions !== 'object') state.webSessions = {};
    if (!state.webBotAuthRequests || typeof state.webBotAuthRequests !== 'object') state.webBotAuthRequests = {};
    if (!state.marketingVisitors || typeof state.marketingVisitors !== 'object') state.marketingVisitors = {};
    if (!Array.isArray(state.marketingEvents)) state.marketingEvents = [];
    if (!state.webTasks || typeof state.webTasks !== 'object') state.webTasks = {};
    if (!state.webProtocols || typeof state.webProtocols !== 'object') state.webProtocols = {};
    if (!state.webFavorites || typeof state.webFavorites !== 'object') state.webFavorites = {};
    if (!state.webSupportRequests || typeof state.webSupportRequests !== 'object') state.webSupportRequests = {};
    if (!state.webNotifications || typeof state.webNotifications !== 'object') state.webNotifications = {};
    if (!state.webActivityFeed || typeof state.webActivityFeed !== 'object') state.webActivityFeed = {};
    if (!state.webLeadDesk || typeof state.webLeadDesk !== 'object') state.webLeadDesk = {};
    if (!state.webVideoComments || typeof state.webVideoComments !== 'object') state.webVideoComments = {};
    if (!state.webVideoReactions || typeof state.webVideoReactions !== 'object') state.webVideoReactions = {};
    if (!state.webOrders || typeof state.webOrders !== 'object') state.webOrders = {};
    if (!state.chatRooms || typeof state.chatRooms !== 'object') state.chatRooms = {};
    if (!state.chatMessages || typeof state.chatMessages !== 'object') state.chatMessages = {};
    if (!state.webWithdrawals || typeof state.webWithdrawals !== 'object') state.webWithdrawals = {};
    if (!Array.isArray(state.mediaLibraryEntries)) state.mediaLibraryEntries = [];
    if (!state.shortLinks || typeof state.shortLinks !== 'object') state.shortLinks = {};
    if (!state.webAiMessages || typeof state.webAiMessages !== 'object') state.webAiMessages = {};
    if (!state.webQuestProgress || typeof state.webQuestProgress !== 'object') state.webQuestProgress = {};
    if (!Array.isArray(state.webEvents)) state.webEvents = [];
    if (!state.webEventSubscriptions || typeof state.webEventSubscriptions !== 'object') state.webEventSubscriptions = {};
    if (!Array.isArray(state.webPlannerTasks)) state.webPlannerTasks = [];
    if (!state.telegramMonitorChats || typeof state.telegramMonitorChats !== 'object') state.telegramMonitorChats = {};
    if (!Array.isArray(state.telegramMonitorEvents)) state.telegramMonitorEvents = [];
    if (!Array.isArray(state.telegramMonitorDigests)) state.telegramMonitorDigests = [];
    if (!state.telegramMonitorRecipients || typeof state.telegramMonitorRecipients !== 'object') state.telegramMonitorRecipients = {};
    if (!state.requiredChatGuards || typeof state.requiredChatGuards !== 'object') state.requiredChatGuards = {};
    if (!state.counters || typeof state.counters !== 'object') state.counters = {};
    for (const key of [
      'webUser',
      'webSession',
      'webTask',
      'webProtocol',
      'webFavorite',
      'webSupportRequest',
      'webSupportMessage',
      'webVideoComment',
      'webNotification',
      'webActivity',
      'webOrder',
      'webWithdrawal',
      'mediaLibraryEntry',
      'shortLink',
      'webAiMessage',
      'marketingEvent',
      'webEvent',
      'webQuestCompletion',
      'telegramMonitorEvent',
      'telegramMonitorDigest'
    ]) {
      if (!Number.isFinite(Number(state.counters[key]))) state.counters[key] = 0;
    }
    return state;
  }

  function readState() {
    ensureStateFile();
    try {
      const raw = fs.readFileSync(statePath, 'utf8');
      return normalizeState(JSON.parse(raw));
    } catch (error) {
      const backupPath = `${statePath}.broken-${Date.now()}`;
      try {
        fs.copyFileSync(statePath, backupPath);
      } catch {}
      const state = initialState();
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
      return state;
    }
  }

  function writeState(state) {
    ensureStateFile();
    const tempPath = `${statePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tempPath, statePath);
  }

  function nextCounter(state, key) {
    const current = Number(state.counters[key] || 0);
    state.counters[key] = current + 1;
    return state.counters[key];
  }

  function normalizeEmail(value) {
    const email = String(value || '').trim().toLowerCase();
    if (!email) return '';
    if (email.length > 254) return '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
    return email;
  }

  function normalizeDisplayName(value) {
    const text = String(value || '').trim();
    return text ? text.slice(0, 120) : null;
  }

  function normalizeTelegramId(value) {
    return normalizePositiveInt(value);
  }

  function normalizeTelegramUsername(value) {
    const text = String(value || '').trim().replace(/^@+/, '');
    return text ? text.slice(0, 64) : null;
  }

  function normalizeCode(value) {
    const text = String(value || '').trim().toLowerCase();
    if (!text) return '';
    if (!/^[a-z0-9_-]{4,64}$/.test(text)) return '';
    return text;
  }

  function normalizePositiveInt(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return 0;
    return Math.floor(num);
  }

  function normalizeAmount(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return 0;
    return Math.round(num * 100) / 100;
  }

  function normalizeShortText(value, maxLength = 160) {
    const text = String(value || '').trim();
    return text ? text.slice(0, Math.max(1, maxLength)) : null;
  }

  function normalizeLongText(value, maxLength = 2000) {
    const text = String(value || '').trim();
    return text ? text.slice(0, Math.max(1, maxLength)) : null;
  }

  function normalizeVisitorId(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    return text.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 96);
  }

  function normalizeUrl(value, maxLength = 600) {
    const text = String(value || '').trim();
    return text ? text.slice(0, Math.max(1, maxLength)) : null;
  }

  function normalizePath(value) {
    const text = String(value || '').trim();
    if (!text) return '/';
    return text.startsWith('/') ? text.slice(0, 240) : `/${text.slice(0, 239)}`;
  }

  function normalizeStringArray(value, options = {}) {
    const maxItems = Math.max(1, Number(options.maxItems || 12));
    const maxLength = Math.max(1, Number(options.maxLength || 60));
    const source = Array.isArray(value)
      ? value
      : String(value || '')
          .split(',')
          .map((item) => item.trim());
    const output = [];
    const seen = new Set();
    for (const item of source) {
      const text = String(item || '').trim();
      if (!text) continue;
      const normalized = text.slice(0, maxLength);
      const key = normalized.toLowerCase();
      if (seen.has(key)) continue;
      output.push(normalized);
      seen.add(key);
      if (output.length >= maxItems) break;
    }
    return output;
  }

  function normalizeBoolean(value, fallback = false) {
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
      if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    }
    return Boolean(value);
  }

  function normalizeDateOnly(value) {
    const text = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
  }

  function normalizeDateTime(value) {
    const text = String(value || '').trim();
    if (!text) return null;
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  }

  function normalizeTelegramMonitorChatId(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (/^-?\d+$/.test(text)) return String(text);
    return text.replace(/^@+/, '').trim().toLowerCase();
  }

  function normalizeTelegramUsername(value) {
    const text = String(value || '').trim().replace(/^@+/, '').toLowerCase();
    return text ? text.slice(0, 64) : null;
  }

  function normalizeTelegramMonitorText(value, maxLength = 4000) {
    const text = String(value || '')
      .replace(/\s+/g, ' ')
      .trim();
    return text ? text.slice(0, Math.max(1, maxLength)) : '';
  }

  function normalizeTelegramMonitorChat(row = {}) {
    const chatId = normalizeTelegramMonitorChatId(row.chatId || row.id || row.telegramChatId);
    if (!chatId) return null;
    return {
      chatId,
      numericChatId: /^-?\d+$/.test(chatId) ? Number(chatId) : null,
      title: normalizeShortText(row.title, 180),
      username: normalizeTelegramUsername(row.username),
      type: normalizeShortText(row.type, 40) || 'unknown',
      isForum: normalizeBoolean(row.isForum, false),
      description: normalizeLongText(row.description, 500),
      inviteLink: normalizeUrl(row.inviteLink || row.invite_link),
      enabled: normalizeBoolean(row.enabled, true),
      memberCount: normalizePositiveInt(row.memberCount),
      messageCount: normalizePositiveInt(row.messageCount),
      lastMessageAt: normalizeDateTime(row.lastMessageAt),
      lastMessageText: normalizeLongText(row.lastMessageText, 500),
      lastActor: normalizeShortText(row.lastActor, 160),
      lastDigestAt: normalizeDateTime(row.lastDigestAt),
      createdAt: normalizeDateTime(row.createdAt) || nowIso(),
      updatedAt: normalizeDateTime(row.updatedAt) || nowIso(),
    };
  }

  function normalizeTelegramMonitorRecipient(row = {}) {
    const telegramUserId = normalizePositiveInt(row.telegramUserId || row.userId || row.id);
    if (!telegramUserId) return null;
    return {
      telegramUserId,
      username: normalizeTelegramUsername(row.username),
      firstName: normalizeShortText(row.firstName, 120),
      isActive: normalizeBoolean(row.isActive, true),
      createdAt: normalizeDateTime(row.createdAt) || nowIso(),
      updatedAt: normalizeDateTime(row.updatedAt) || nowIso(),
      lastSentAt: normalizeDateTime(row.lastSentAt),
    };
  }

  function normalizeRequiredChatGuardKey(userId, chatId) {
    const normalizedUserId = normalizePositiveInt(userId);
    const normalizedChatId = normalizeTelegramMonitorChatId(chatId);
    if (!normalizedUserId || !normalizedChatId) return '';
    return `${normalizedUserId}:${normalizedChatId}`;
  }

  function normalizeRequiredChatGuard(row = {}, fallback = {}) {
    const userId = normalizePositiveInt(row.userId || fallback.userId);
    const chatId = normalizeTelegramMonitorChatId(row.chatId || fallback.chatId);
    if (!userId || !chatId) return null;
    const reminderCount = Number(row.reminderCount || 0);
    return {
      userId,
      chatId,
      isMember: normalizeBoolean(row.isMember, false),
      status: normalizeShortText(row.status, 40) || (normalizeBoolean(row.isMember, false) ? 'member' : 'missing'),
      lastCheckedAt: normalizeDateTime(row.lastCheckedAt),
      nextCheckAt: normalizeDateTime(row.nextCheckAt),
      lastReminderAt: normalizeDateTime(row.lastReminderAt),
      reminderCount: Number.isFinite(reminderCount) && reminderCount > 0 ? Math.floor(reminderCount) : 0,
      errorMessage: normalizeShortText(row.errorMessage, 280),
      updatedAt: normalizeDateTime(row.updatedAt) || nowIso(),
    };
  }

  function normalizeTaskStatus(value, fallback = 'todo') {
    const normalized = String(value || '').trim().toLowerCase();
    if (['todo', 'in_progress', 'done', 'skipped'].includes(normalized)) return normalized;
    if (normalized === 'completed') return 'done';
    return fallback;
  }

  function computeProgressPercent(completed, total) {
    const resolvedTotal = Math.max(0, Number(total || 0));
    if (!resolvedTotal) return 0;
    const resolvedCompleted = Math.max(0, Math.min(resolvedTotal, Number(completed || 0)));
    return Math.round((resolvedCompleted / resolvedTotal) * 100);
  }

  function normalizeNotificationSettings(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      email: normalizeBoolean(source.email, true),
      telegram: normalizeBoolean(source.telegram, true),
      browser: normalizeBoolean(source.browser, true),
      reminders: normalizeBoolean(source.reminders, true),
      digest: normalizeBoolean(source.digest, false),
      marketing: normalizeBoolean(source.marketing, false)
    };
  }

  function inferMarketingSourceChannel(touch = {}) {
    const utmSource = String(touch.utmSource || '').trim().toLowerCase();
    const referrer = String(touch.referrer || '').trim().toLowerCase();
    const pageUrl = String(touch.pageUrl || '').trim().toLowerCase();

    if (touch.referralCode) return 'referral';
    if (utmSource) return utmSource;
    if (referrer.includes('t.me') || pageUrl.includes('t.me')) return 'telegram';
    if (referrer.includes('instagram')) return 'instagram';
    if (referrer.includes('facebook')) return 'facebook';
    if (referrer.includes('google')) return 'google';
    if (referrer.includes('youtube')) return 'youtube';
    if (referrer.includes('vk.com')) return 'vk';
    return 'direct';
  }

  function normalizeMarketingTouch(data = {}) {
    const touch = {
      pagePath: normalizePath(data.pagePath || data.path || '/'),
      pageUrl: normalizeUrl(data.pageUrl || data.url),
      referrer: normalizeUrl(data.referrer),
      referralCode: normalizeCode(data.referralCode || data.ref),
      utmSource: normalizeShortText(data.utmSource || data.utm_source, 80),
      utmMedium: normalizeShortText(data.utmMedium || data.utm_medium, 80),
      utmCampaign: normalizeShortText(data.utmCampaign || data.utm_campaign, 120),
      utmContent: normalizeShortText(data.utmContent || data.utm_content, 120),
      utmTerm: normalizeShortText(data.utmTerm || data.utm_term, 120),
      sourceChannel: normalizeShortText(data.sourceChannel, 80),
      deviceType: normalizeShortText(data.deviceType, 40),
      browser: normalizeShortText(data.browser, 80),
      language: normalizeShortText(data.language, 40),
      locale: normalizeShortText(data.locale, 40)
    };

    touch.sourceChannel = touch.sourceChannel || inferMarketingSourceChannel(touch);
    return touch;
  }

  function ensureWebUserMeta(row = {}) {
    const profileSource = row.profile && typeof row.profile === 'object' ? row.profile : {};
    const preferencesSource = row.preferences && typeof row.preferences === 'object' ? row.preferences : {};
    const onboardingSource = row.onboarding && typeof row.onboarding === 'object' ? row.onboarding : {};
    const focusAreas = normalizeStringArray(
      onboardingSource.focusAreas !== undefined ? onboardingSource.focusAreas : row.focusAreas,
      { maxItems: 8, maxLength: 40 }
    );
    const goalsSummary = normalizeLongText(
      onboardingSource.goalsSummary !== undefined ? onboardingSource.goalsSummary : row.goalsSummary,
      500
    );
    const experienceLevel = normalizeShortText(
      onboardingSource.experienceLevel !== undefined ? onboardingSource.experienceLevel : row.experienceLevel || 'new',
      20
    ) || 'new';
    const preferredContact = normalizeShortText(
      preferencesSource.preferredContact !== undefined ? preferencesSource.preferredContact : row.preferredContact || 'telegram',
      40
    ) || 'telegram';
    const notificationSettings = normalizeNotificationSettings(
      preferencesSource.notificationSettings !== undefined ? preferencesSource.notificationSettings : row.notificationSettings
    );
    const onboardingCompletedAt = onboardingSource.completedAt || row.onboardingCompletedAt || null;
    const completedSteps = normalizeStringArray(onboardingSource.completedSteps, { maxItems: 12, maxLength: 40 });
    const profile = {
      headline: normalizeShortText(profileSource.headline, 140),
      phone: normalizeShortText(profileSource.phone, 40),
      city: normalizeShortText(profileSource.city !== undefined ? profileSource.city : row.city, 80),
      country: normalizeShortText(profileSource.country, 80),
      timezone: normalizeShortText(profileSource.timezone, 80),
      birthDate: normalizeDateOnly(profileSource.birthDate),
      notes: normalizeLongText(profileSource.notes, 800),
      // Trendex extended onboarding fields
      niche: normalizeShortText(profileSource.niche, 80),
      trafficSource: normalizeShortText(profileSource.trafficSource, 80),
      monthlyBudget: normalizeShortText(profileSource.monthlyBudget, 40),
      workSchedule: normalizeShortText(profileSource.workSchedule, 80),
      socialTelegram: normalizeShortText(profileSource.socialTelegram, 120),
      socialInstagram: normalizeShortText(profileSource.socialInstagram, 120),
      socialYoutube: normalizeShortText(profileSource.socialYoutube, 200),
      socialTiktok: normalizeShortText(profileSource.socialTiktok, 200)
    };
    const preferences = {
      preferredContact,
      language: normalizeShortText(preferencesSource.language || 'ru', 12) || 'ru',
      theme: normalizeShortText(preferencesSource.theme || 'system', 20) || 'system',
      reminderTime: normalizeShortText(preferencesSource.reminderTime || '09:00', 5) || '09:00',
      notificationSettings
    };
    const onboarding = {
      status: normalizeShortText(onboardingSource.status, 20)
        || (onboardingCompletedAt ? 'completed' : (completedSteps.length || focusAreas.length || goalsSummary ? 'in_progress' : 'pending')),
      currentStep: normalizeShortText(onboardingSource.currentStep || 'profile', 40) || 'profile',
      completedSteps,
      completedAt: onboardingCompletedAt,
      primaryGoal: normalizeShortText(onboardingSource.primaryGoal, 120),
      focusAreas,
      goalsSummary,
      experienceLevel,
      preferredPace: normalizeShortText(onboardingSource.preferredPace || 'steady', 20) || 'steady',
      communicationStyle: normalizeShortText(onboardingSource.communicationStyle || 'guided', 20) || 'guided'
    };
    const profileCompletion = computeProgressPercent(
      [
        profile.phone,
        profile.city,
        profile.country,
        profile.timezone,
        onboarding.primaryGoal || goalsSummary,
        focusAreas.length ? 'focus' : ''
      ].filter(Boolean).length,
      6
    );

    return {
      userRole: normalizeShortText(row.userRole || 'hybrid', 20) || 'hybrid',
      experienceLevel,
      focusAreas,
      goalsSummary,
      city: profile.city,
      preferredContact,
      onboardingCompletedAt,
      activeProtocolId: normalizeShortText(row.activeProtocolId, 80),
      savedProtocolIds: normalizeStringArray(row.savedProtocolIds, { maxItems: 20, maxLength: 80 }),
      savedProductIds: normalizeStringArray(row.savedProductIds, { maxItems: 50, maxLength: 80 }),
      savedContentIds: normalizeStringArray(row.savedContentIds, { maxItems: 50, maxLength: 80 }),
      notificationSettings,
      profile,
      preferences,
      onboarding,
      profileCompletion
    };
  }

  function deriveAuthMethods(row) {
    const methods = [];
    if (row && row.email && row.passwordHash) methods.push('email');
    if (normalizeTelegramId(row && row.telegramUserId)) methods.push('telegram');
    return methods.length ? methods : ['email'];
  }

  function buildTelegramDisplayName(profile = {}) {
    const parts = [profile.first_name, profile.last_name]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    if (parts.length) return normalizeDisplayName(parts.join(' '));
    const username = normalizeTelegramUsername(profile.username || profile.telegramUsername);
    if (username) return normalizeDisplayName(`@${username}`);
    const telegramUserId = normalizeTelegramId(profile.id || profile.telegramUserId);
    return telegramUserId ? `Telegram ${telegramUserId}` : 'Telegram user';
  }


  // ===== Username utilities (Phase A+B) =====
  const RESERVED_USERNAMES = new Set(['admin','support','bot','trendex','system','official','help','me','user','root','volga9000']);
  function sanitizeUsername(raw) {
    if (!raw) return '';
    return String(raw).toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32);
  }
  function ensureUniqueUsername(state, base, excludeId) {
    if (!base || base.length < 3) base = 'user_' + (excludeId || crypto.randomBytes(2).toString('hex'));
    if (RESERVED_USERNAMES.has(base)) base = base + '_user';
    const all = Object.values(state.webUsers || {});
    let candidate = base;
    let suffix = 1;
    while (all.some(u => u && u.username && String(u.username).toLowerCase() === candidate && u.id !== excludeId)) {
      suffix++;
      candidate = base + '_' + suffix;
    }
    return candidate;
  }
  function deriveDefaultUsername(profile, id) {
    if (profile.username) {
      const c = sanitizeUsername(profile.username);
      if (c && c.length >= 3) return c;
    }
    if (profile.telegramUsername) {
      const c = sanitizeUsername(profile.telegramUsername);
      if (c && c.length >= 3) return c;
    }
    if (profile.email) {
      const prefix = String(profile.email).split('@')[0];
      const c = sanitizeUsername(prefix);
      if (c && c.length >= 3) return c;
    }
    return 'user_' + (id || crypto.randomBytes(3).toString('hex'));
  }

  function publicWebUser(row) {
    if (!row) return null;
    const meta = ensureWebUserMeta(row);
    return {
      id: normalizePositiveInt(row.id),
      username: row.username || null,
      usernameLockedAt: row.usernameLockedAt || null,
      email: row.email || null,
      displayName: row.displayName || null,
      telegramUserId: normalizeTelegramId(row.telegramUserId) || null,
      telegramUsername: normalizeTelegramUsername(row.telegramUsername),
      telegramLinked: Boolean(normalizeTelegramId(row.telegramUserId)),
      authMethods: deriveAuthMethods(row),
      referralCode: row.referralCode || null,
      referredByUserId: normalizePositiveInt(row.referredByUserId) || null,
      points: Number(row.points || 0),
      referralsCount: Number(row.referralsCount || 0),
      userRole: meta.userRole,
      experienceLevel: meta.experienceLevel,
      focusAreas: meta.focusAreas,
      goalsSummary: meta.goalsSummary,
      city: meta.city,
      preferredContact: meta.preferredContact,
      onboardingCompletedAt: meta.onboardingCompletedAt,
      activeProtocolId: meta.activeProtocolId,
      savedProtocolIds: meta.savedProtocolIds,
      savedProductIds: meta.savedProductIds,
      savedContentIds: meta.savedContentIds,
      notificationSettings: meta.notificationSettings,
      profile: meta.profile,
      preferences: meta.preferences,
      onboarding: meta.onboarding,
      profileCompletion: meta.profileCompletion,
      createdAt: row.createdAt || null,
      updatedAt: row.updatedAt || null,
      lastLoginAt: row.lastLoginAt || null,
      status: row.status || 'active',
      trendexRefLink: row.trendexRefLink || null,
      // Team/CRM fields
      trendexRefLinkSetAt: row.trendexRefLinkSetAt || null,
      lastActivityAt: row.lastActivityAt || null,
      lastAction: row.lastAction || null,
      activityLog: Array.isArray(row.activityLog) ? row.activityLog.slice(-30) : [],
      referralStage: row.referralStage || null,
      referralStageHistory: Array.isArray(row.referralStageHistory) ? row.referralStageHistory : [],
      inviterNotes: (row.inviterNotes && typeof row.inviterNotes === 'object') ? row.inviterNotes : {},
      inviterSnoozeUntil: (row.inviterSnoozeUntil && typeof row.inviterSnoozeUntil === 'object') ? row.inviterSnoozeUntil : {},
      inviterContactedAt: (row.inviterContactedAt && typeof row.inviterContactedAt === 'object') ? row.inviterContactedAt : {},
      badges: Array.isArray(row.badges) ? row.badges : [],
      teamStats: (row.teamStats && typeof row.teamStats === 'object') ? row.teamStats : {},
      // [trdx-fields] Genesis TRDX token balance + recent ledger entries
      trxBalance: Number(row.trxBalance || 0),
      trxLedger: Array.isArray(row.trxLedger) ? row.trxLedger.slice(-30) : [],
      trxLastAwardedTier: row.trxLastAwardedTier || 'free',
    };
  }

  function publicSession(row) {
    if (!row) return null;
    return {
      id: row.id || null,
      userId: normalizePositiveInt(row.userId) || null,
      createdAt: row.createdAt || null,
      expiresAt: row.expiresAt || null,
      lastSeenAt: row.lastSeenAt || null
    };
  }

  function publicOrder(row) {
    if (!row) return null;
    return {
      id: normalizePositiveInt(row.id) || null,
      userId: normalizePositiveInt(row.userId) || null,
      productId: row.productId || null,
      productName: row.productName || null,
      quantity: Number(row.quantity || 0),
      total: Number(row.total || 0),
      currency: row.currency || 'USD',
      status: row.status || 'created',
      note: row.note || null,
      createdAt: row.createdAt || null,
      updatedAt: row.updatedAt || null
    };
  }

  function publicWithdrawal(row) {
    if (!row) return null;
    return {
      id: normalizePositiveInt(row.id) || null,
      userId: normalizePositiveInt(row.userId) || null,
      amount: Number(row.amount || 0),
      method: row.method || 'bank_card',
      payoutDetails: row.payoutDetails || null,
      note: row.note || null,
      status: row.status || 'pending',
      createdAt: row.createdAt || null,
      updatedAt: row.updatedAt || null
    };
  }

  function publicShortLink(row) {
    if (!row) return null;
    return {
      id: normalizePositiveInt(row.id) || null,
      userId: normalizePositiveInt(row.userId) || null,
      code: row.code || null,
      slug: row.slug || row.code || null,
      title: row.title || null,
      url: row.url || null,
      shortUrl: row.shortUrl || null,
      clicks: Number(row.clicks || 0),
      lastClickedAt: row.lastClickedAt || null,
      createdAt: row.createdAt || null,
      updatedAt: row.updatedAt || null
    };
  }

  function normalizeMediaEntryKind(value, fallback = 'message') {
    const normalized = String(value || '').trim().toLowerCase();
    if (['message', 'link', 'asset', 'bundle', 'video'].includes(normalized)) return normalized;
    return fallback;
  }

  function normalizeLeadStageId(value, fallback = null) {
    const normalized = String(value || '').trim().toLowerCase();
    if (['awareness', 'interest', 'conversation', 'handoff', 'duplication'].includes(normalized)) return normalized;
    return fallback;
  }

  function publicMediaLibraryEntry(row) {
    if (!row) return null;
    return {
      id: normalizePositiveInt(row.id) || null,
      title: row.title || null,
      summary: row.summary || null,
      kind: normalizeMediaEntryKind(row.kind, 'message'),
      scenarioId: row.scenarioId || 'all',
      languageId: row.languageId || 'all',
      productIds: Array.isArray(row.productIds) ? row.productIds.slice(0, 20) : [],
      tags: Array.isArray(row.tags) ? row.tags.slice(0, 20) : [],
      channel: row.channel || null,
      text: row.text || null,
      url: row.url || null,
      videoUrl: row.videoUrl || null,
      shareUrl: row.shareUrl || null,
      imageUrl: row.imageUrl || null,
      categoryId: row.categoryId || null,
      categoryLabel: row.categoryLabel || null,
      speaker: row.speaker || null,
      speakers: Array.isArray(row.speakers) ? row.speakers.slice(0, 6) : [],
      products: Array.isArray(row.products) ? row.products.slice(0, 12) : [],
      durationSec: Math.max(0, Number(row.durationSec || 0) || 0),
      shareText: row.shareText || null,
      transcript: row.transcript || row.transcriptFull || row.transcript_text || null,
      transcriptPreview: row.transcriptPreview || null,
      keyPoints: Array.isArray(row.keyPoints) ? row.keyPoints.slice(0, 6) : [],
      sourcePlatform: row.sourcePlatform || null,
      sourceExternalId: row.sourceExternalId || null,
      isFeatured: normalizeBoolean(row.isFeatured, false),
      featuredScore: Number(row.featuredScore || 0) || 0,
      createdByUserId: normalizePositiveInt(row.createdByUserId) || null,
      status: row.status || 'active',
      createdAt: row.createdAt || null,
      updatedAt: row.updatedAt || null
    };
  }

  function publicLeadDeskEntry(row) {
    if (!row) return null;
    return {
      visitorId: normalizeVisitorId(row.visitorId),
      ownerUserId: normalizePositiveInt(row.ownerUserId) || null,
      stageOverride: normalizeLeadStageId(row.stageOverride),
      note: row.note || null,
      ownerTag: row.ownerTag || null,
      followUpAt: row.followUpAt || null,
      pinned: normalizeBoolean(row.pinned, false),
      createdAt: row.createdAt || null,
      updatedAt: row.updatedAt || null,
    };
  }

  function getLeadDeskBucket(state, ownerId, createIfMissing = false) {
    const key = String(normalizePositiveInt(ownerId) || 0);
    if (!key || key === '0') return null;
    const current = state.webLeadDesk[key];
    if (current && typeof current === 'object' && !Array.isArray(current)) return current;
    if (!createIfMissing) return null;
    state.webLeadDesk[key] = {};
    return state.webLeadDesk[key];
  }

  function publicAiMessage(row) {
    if (!row) return null;
    return {
      id: normalizePositiveInt(row.id) || null,
      userId: normalizePositiveInt(row.userId) || null,
      role: row.role || 'user',
      content: row.content || '',
      createdAt: row.createdAt || null
    };
  }

  function publicTask(row) {
    if (!row) return null;
    const status = normalizeTaskStatus(row.status, 'todo');
    return {
      id: normalizePositiveInt(row.id) || null,
      userId: normalizePositiveInt(row.userId) || null,
      title: row.title || null,
      description: row.description || null,
      category: row.category || 'general',
      status,
      priority: row.priority || 'medium',
      dueAt: row.dueAt || null,
      protocolId: row.protocolId || null,
      phaseId: row.phaseId || null,
      source: row.source || 'custom',
      tags: Array.isArray(row.tags) ? row.tags.slice(0, 20) : [],
      notes: row.notes || null,
      completedAt: row.completedAt || null,
      isCompleted: status === 'done',
      createdAt: row.createdAt || null,
      updatedAt: row.updatedAt || null
    };
  }

  function publicSupportRequest(row) {
    if (!row) return null;
    const messages = Array.isArray(row.messages) && row.messages.length
      ? row.messages.map((item) => ({
          id: item.id || null,
          role: item.role || 'member',
          author: item.author || item.role || 'member',
          message: item.message || null,
          createdAt: item.createdAt || null
        }))
      : [{
          id: null,
          role: 'member',
          author: 'member',
          message: row.message || null,
          createdAt: row.createdAt || null
        }].filter((item) => item.message);
    const lastMessage = messages.length ? messages[messages.length - 1] : null;
    return {
      id: normalizePositiveInt(row.id) || null,
      userId: normalizePositiveInt(row.userId) || null,
      topic: row.topic || 'general',
      subject: row.subject || null,
      message: row.message || null,
      status: row.status || 'open',
      priority: row.priority || 'normal',
      preferredContact: row.preferredContact || 'telegram',
      messages,
      messagesCount: messages.length,
      lastMessageAt: lastMessage ? lastMessage.createdAt : null,
      lastMessagePreview: lastMessage ? lastMessage.message : null,
      createdAt: row.createdAt || null,
      updatedAt: row.updatedAt || null
    };
  }

  function publicNotification(row) {
    if (!row) return null;
    return {
      id: normalizePositiveInt(row.id) || null,
      userId: normalizePositiveInt(row.userId) || null,
      kind: row.kind || 'system',
      title: row.title || null,
      message: row.message || null,
      actionView: row.actionView || null,
      actionLabel: row.actionLabel || null,
      actionUrl: row.actionUrl || null,
      level: row.level || 'info',
      meta: row.meta && typeof row.meta === 'object' ? row.meta : {},
      readAt: row.readAt || null,
      unread: !row.readAt,
      createdAt: row.createdAt || null
    };
  }

  function publicProtocolRecord(row) {
    if (!row) return null;
    return {
      id: normalizePositiveInt(row.id) || null,
      userId: normalizePositiveInt(row.userId) || null,
      templateId: row.templateId || null,
      title: row.title || null,
      summary: row.summary || null,
      status: row.status || 'active',
      currentPhaseId: row.currentPhaseId || null,
      progressPercent: Number(row.progressPercent || 0),
      completedTasks: Number(row.completedTasks || 0),
      totalTasks: Number(row.totalTasks || 0),
      durationDays: Number(row.durationDays || 0),
      intensity: row.intensity || null,
      goals: Array.isArray(row.goals) ? row.goals.slice(0, 12) : [],
      productIds: Array.isArray(row.productIds) ? row.productIds.slice(0, 20) : [],
      contentIds: Array.isArray(row.contentIds) ? row.contentIds.slice(0, 20) : [],
      phases: Array.isArray(row.phases) ? row.phases : [],
      notes: row.notes || null,
      activatedAt: row.activatedAt || row.createdAt || null,
      completedAt: row.completedAt || null,
      createdAt: row.createdAt || null,
      updatedAt: row.updatedAt || null
    };
  }

  function publicFavorite(row) {
    if (!row) return null;
    return {
      id: normalizePositiveInt(row.id) || null,
      userId: normalizePositiveInt(row.userId) || null,
      kind: row.kind || 'content',
      itemId: row.itemId || null,
      title: row.title || null,
      summary: row.summary || null,
      url: row.url || null,
      meta: row.meta && typeof row.meta === 'object' ? row.meta : {},
      createdAt: row.createdAt || null,
      updatedAt: row.updatedAt || null
    };
  }

  function publicActivityItem(row) {
    if (!row) return null;
    return {
      id: normalizePositiveInt(row.id) || null,
      userId: normalizePositiveInt(row.userId) || null,
      kind: row.kind || 'system',
      title: row.title || null,
      text: row.text || null,
      view: row.view || 'overview',
      entityId: row.entityId || null,
      meta: row.meta && typeof row.meta === 'object' ? row.meta : {},
      createdAt: row.createdAt || null
    };
  }

  function publicMarketingVisitor(row) {
    if (!row) return null;
    return {
      visitorId: normalizeVisitorId(row.visitorId),
      userId: normalizePositiveInt(row.userId) || null,
      firstTouch: row.firstTouch && typeof row.firstTouch === 'object' ? row.firstTouch : null,
      lastTouch: row.lastTouch && typeof row.lastTouch === 'object' ? row.lastTouch : null,
      visitsCount: Number(row.visitsCount || 0),
      lastEventType: row.lastEventType || null,
      firstVisitAt: row.firstVisitAt || null,
      lastSeenAt: row.lastSeenAt || null,
      createdAt: row.createdAt || null,
      updatedAt: row.updatedAt || null
    };
  }

  function publicMarketingEvent(row) {
    if (!row) return null;
    return {
      id: normalizePositiveInt(row.id) || null,
      visitorId: normalizeVisitorId(row.visitorId),
      userId: normalizePositiveInt(row.userId) || null,
      eventType: row.eventType || 'unknown',
      pagePath: row.pagePath || '/',
      panel: row.panel || null,
      ctaId: row.ctaId || null,
      ctaLabel: row.ctaLabel || null,
      intentHint: row.intentHint || null,
      meta: row.meta && typeof row.meta === 'object' ? row.meta : {},
      createdAt: row.createdAt || null
    };
  }

  function getMarketingVisitorState(state, visitorId) {
    const normalized = normalizeVisitorId(visitorId);
    if (!normalized) return null;
    return state.marketingVisitors[normalized] || null;
  }

  function countReferralStatsFromState(state, userId, maxDepth = 5) {
    const ownerId = normalizePositiveInt(userId);
    const root = state.webUsers[String(ownerId)];
    if (!root) {
      return {
        directReferrals: 0,
        totalReferrals: 0,
        countsByLevel: [],
      };
    }

    const nodes = Object.values(state.webUsers);
    const direct = nodes.filter((user) => normalizePositiveInt(user.referredByUserId) === ownerId);
    const countsByLevel = [];
    let currentLevel = [ownerId];
    const visited = new Set([ownerId]);

    for (let depth = 1; depth <= Math.max(1, Math.min(10, maxDepth)); depth += 1) {
      const nextLevel = [];
      for (const currentId of currentLevel) {
        for (const user of nodes) {
          if (normalizePositiveInt(user.referredByUserId) === currentId && !visited.has(user.id)) {
            visited.add(user.id);
            nextLevel.push(user.id);
          }
        }
      }
      countsByLevel.push(nextLevel.length);
      currentLevel = nextLevel;
      if (!currentLevel.length) break;
    }

    return {
      directReferrals: direct.length,
      totalReferrals: visited.size - 1,
      countsByLevel,
    };
  }

  function buildMarketingScores(visitor, events, user, referralStats) {
    const visitsCount = Number((visitor && visitor.visitsCount) || 0);
    const eventCount = Array.isArray(events) ? events.length : 0;
    const authEvents = events.filter((item) => ['auth_start', 'auth_complete', 'telegram_auth_start'].includes(item.eventType)).length;
    const productEvents = events.filter((item) => ['product_view', 'order_create', 'catalog_open'].includes(item.eventType)).length;
    const aiEvents = events.filter((item) => ['ai_preview', 'ai_chat_start', 'ai_message'].includes(item.eventType)).length;
    const partnerEvents = events.filter((item) => ['partner_view', 'copy_referral', 'share_referral', 'share_channel_click', 'open_partner'].includes(item.eventType)).length;
    const referralCodePresent = Boolean(visitor && visitor.firstTouch && visitor.firstTouch.referralCode);
    const userRole = String((user && user.userRole) || '').trim().toLowerCase();
    const roleBoost = userRole === 'partner' ? 28 : userRole === 'hybrid' ? 18 : 0;
    const directReferrals = Number((referralStats && referralStats.directReferrals) || 0);

    const fit = Math.max(5, Math.min(100,
      15
      + roleBoost
      + (referralCodePresent ? 10 : 0)
      + (visitor && visitor.firstTouch && visitor.firstTouch.sourceChannel === 'referral' ? 10 : 0)
      + (partnerEvents ? 14 : 0)
    ));

    const engagement = Math.max(5, Math.min(100,
      (visitsCount * 12)
      + (eventCount * 6)
      + (aiEvents * 6)
      + (authEvents * 10)
      + (productEvents * 6)
    ));

    const intent = Math.max(0, Math.min(100,
      (productEvents * 18)
      + (authEvents * 14)
      + (aiEvents * 8)
      + (String(visitor && visitor.lastEventType || '').includes('order') ? 12 : 0)
      + (visitsCount > 1 ? 8 : 0)
    ));

    const partnerPotential = Math.max(0, Math.min(100,
      roleBoost
      + (partnerEvents * 20)
      + (referralCodePresent ? 12 : 0)
      + (directReferrals ? 16 : 0)
      + (Number((user && user.points) || 0) >= Number(config.pointsPerReferral || 100) ? 10 : 0)
    ));

    return {
      fit,
      engagement,
      intent,
      partnerPotential,
    };
  }

  function buildMarketingJourneyStage(scores, visitor, user, referralStats) {
    const directReferrals = Number((referralStats && referralStats.directReferrals) || 0);
    if (user && directReferrals > 0) {
      return {
        id: 'partner_active',
        label: 'Партнер активен',
        summary: 'У пользователя уже есть первые регистрации в структуре и можно усиливать дубликацию.',
      };
    }
    if (user && scores.partnerPotential >= 55) {
      return {
        id: 'partner_ready',
        label: 'Готов к дубликации',
        summary: 'Самое время давать личную ссылку, готовые тексты и запускать первые приглашения.',
      };
    }
    if (user && scores.engagement >= 35) {
      return {
        id: 'activated',
        label: 'Активирован',
        summary: 'Пользователь уже внутри кабинета и готов к следующему осмысленному шагу.',
      };
    }
    if (scores.intent >= 45 || scores.engagement >= 22) {
      return {
        id: 'evaluating',
        label: 'Оценивает предложение',
        summary: 'Нужно быстро показать лучший сценарий: каталог, AI или партнёрский вход.',
      };
    }
    if (visitor && Number(visitor.visitsCount || 0) > 1) {
      return {
        id: 'engaged',
        label: 'Возвращается',
        summary: 'Повторные визиты уже есть, можно усиливать CTA и доводить до регистрации.',
      };
    }
    return {
      id: 'new',
      label: 'Новый визит',
      summary: 'Первая задача системы — быстро объяснить ценность и провести к понятному действию.',
    };
  }

  function describeLeadStage(stageId = 'awareness') {
    const value = String(stageId || 'awareness').trim().toLowerCase();
    const map = {
      awareness: {
        id: 'awareness',
        title: 'Внимание',
        summary: 'Лид только входит в воронку и ещё не получил сильный угол подачи.',
        panel: 'landings',
        nextMove: 'Показать один подходящий лендинг и убрать лишние ссылки.',
      },
      interest: {
        id: 'interest',
        title: 'Интерес',
        summary: 'Есть сигналы по продуктам, AI или материалам, но диалог ещё не закреплён.',
        panel: 'materials',
        nextMove: 'Дать proof, один продуктовый вход и короткий follow-up.',
      },
      conversation: {
        id: 'conversation',
        title: 'Диалог',
        summary: 'Ссылки уже открываются или отправляются, пора фиксировать канал и сценарий.',
        panel: 'links',
        nextMove: 'Собрать tracked link, short link или QR под конкретный канал.',
      },
      handoff: {
        id: 'handoff',
        title: 'Перевод',
        summary: 'Лид уже подходит к регистрации и нуждается в мягком переводе в следующий шаг.',
        panel: 'links',
        nextMove: 'Проверить company link, FAQ и сценарий передачи.',
      },
      duplication: {
        id: 'duplication',
        title: 'Дубликация',
        summary: 'Лид уже стал частью системы и его можно переводить в ритм действий и сопровождения.',
        panel: 'tasks',
        nextMove: 'Передать duplication-kit: задачи, материалы, FAQ и запуск.',
      },
    };
    return map[value] || map.awareness;
  }

  function describeLeadFollowUp(followUpAt) {
    const isoValue = normalizeDateTime(followUpAt);
    if (!isoValue) {
      return {
        id: 'none',
        label: null,
      };
    }
    const target = new Date(isoValue).getTime();
    const now = Date.now();
    const diff = target - now;
    if (diff < 0) {
      return {
        id: 'overdue',
        label: 'Просрочен follow-up',
      };
    }
    if (diff <= 24 * 60 * 60 * 1000) {
      return {
        id: 'today',
        label: 'Follow-up сегодня',
      };
    }
    if (diff <= 3 * 24 * 60 * 60 * 1000) {
      return {
        id: 'soon',
        label: 'Follow-up скоро',
      };
    }
    return {
      id: 'planned',
      label: 'Follow-up запланирован',
    };
  }

  function buildLeadBoard(relatedVisitors, events, state, ownerUser = null) {
    const visitorItems = Array.isArray(relatedVisitors) ? relatedVisitors : [];
    const eventItems = Array.isArray(events) ? events : [];
    const ownerUserId = normalizePositiveInt(ownerUser && ownerUser.id) || null;
    const leadDeskBucket = ownerUserId ? getLeadDeskBucket(state, ownerUserId, false) : null;
    const leads = visitorItems.map((visitor) => {
      const visitorId = normalizeVisitorId(visitor && visitor.visitorId);
      if (!visitorId) return null;
      const manualEntry = leadDeskBucket ? leadDeskBucket[visitorId] || null : null;
      const visitorEvents = eventItems
        .filter((item) => normalizeVisitorId(item && item.visitorId) === visitorId)
        .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
      const eventCounts = visitorEvents.reduce((acc, item) => {
        const key = String(item && item.eventType || 'unknown');
        acc[key] = Number(acc[key] || 0) + 1;
        return acc;
      }, {});
      const linkedUserRow = normalizePositiveInt(visitor && visitor.userId) ? state.webUsers[String(visitor.userId)] || null : null;
      const linkedUser = linkedUserRow ? publicWebUser(linkedUserRow) : null;
      const sourceChannel = String((visitor && visitor.firstTouch && visitor.firstTouch.sourceChannel) || 'direct');
      const aiSignals = Number(eventCounts.ai_preview || 0) + Number(eventCounts.ai_message || 0) + Number(eventCounts.ai_prompt_click || 0);
      const productSignals = Number(eventCounts.product_view || 0) + Number(eventCounts.catalog_open || 0) + Number(eventCounts.order_create || 0);
      const shareSignals = Number(eventCounts.copy_referral || 0) + Number(eventCounts.share_referral || 0) + Number(eventCounts.share_channel_click || 0);
      const authSignals = Number(eventCounts.auth_start || 0) + Number(eventCounts.telegram_auth_start || 0) + Number(eventCounts.auth_complete || 0);
      const lastEvent = visitorEvents[visitorEvents.length - 1] || null;
      let stageId = 'awareness';
      if (linkedUser && ownerUserId && normalizePositiveInt(linkedUser.referredByUserId) === ownerUserId) {
        stageId = 'duplication';
      } else if (Number(eventCounts.auth_complete || 0) > 0) {
        stageId = 'handoff';
      } else if (shareSignals > 0 || authSignals > 0 || Number(eventCounts.landing_open_materials || 0) > 0) {
        stageId = 'conversation';
      } else if (productSignals > 0 || aiSignals > 0) {
        stageId = 'interest';
      }
      if (manualEntry && normalizeLeadStageId(manualEntry.stageOverride)) {
        stageId = normalizeLeadStageId(manualEntry.stageOverride, stageId);
      }
      const stage = describeLeadStage(stageId);
      const followUpInfo = describeLeadFollowUp(manualEntry && manualEntry.followUpAt);
      const landingId = String((lastEvent && lastEvent.meta && (lastEvent.meta.landingId || lastEvent.meta.landing)) || (visitor && visitor.firstTouch && visitor.firstTouch.pagePath) || '').trim();
      const languageId = String((lastEvent && lastEvent.meta && (lastEvent.meta.languageId || lastEvent.meta.language)) || (visitor && visitor.firstTouch && visitor.firstTouch.language) || '').trim();
      return {
        visitorId,
        sourceChannel,
        stageId: stage.id,
        stageTitle: stage.title,
        stageSummary: stage.summary,
        nextPanel: stage.panel,
        nextMove: stage.nextMove,
        title: linkedUser && (linkedUser.displayName || linkedUser.email)
          ? (linkedUser.displayName || linkedUser.email)
          : `Lead ${visitorId.slice(0, 8)}`,
        subtitle: linkedUser && (linkedUser.email || linkedUser.telegramUsername)
          ? (linkedUser.email || linkedUser.telegramUsername)
          : `${sourceChannel} · ${String(visitor && visitor.firstTouch && visitor.firstTouch.pagePath || '/').trim() || '/'}`,
        visitsCount: Number((visitor && visitor.visitsCount) || 0),
        aiSignals,
        productSignals,
        shareSignals,
        authSignals,
        lastEventType: String((visitor && visitor.lastEventType) || (lastEvent && lastEvent.eventType) || '').trim() || null,
        lastEventLabel: String((lastEvent && (lastEvent.ctaLabel || lastEvent.eventType)) || '').trim() || null,
        firstLandingPath: String((visitor && visitor.firstTouch && visitor.firstTouch.pagePath) || '/').trim() || '/',
        landingId: landingId || null,
        languageId: languageId || null,
        utmCampaign: String((visitor && visitor.firstTouch && visitor.firstTouch.utmCampaign) || '').trim() || null,
        firstSeenAt: visitor && visitor.firstVisitAt ? visitor.firstVisitAt : null,
        lastSeenAt: visitor && visitor.lastSeenAt ? visitor.lastSeenAt : null,
        linkedUserId: normalizePositiveInt(linkedUser && linkedUser.id) || null,
        linkedEmail: linkedUser && linkedUser.email ? linkedUser.email : null,
        linkedTelegramUsername: linkedUser && linkedUser.telegramUsername ? linkedUser.telegramUsername : null,
        linkedTelegramId: normalizePositiveInt(linkedUser && linkedUser.telegramUserId) || null,
        linkedDisplayName: linkedUser && linkedUser.displayName ? linkedUser.displayName : null,
        stageOverride: manualEntry && normalizeLeadStageId(manualEntry.stageOverride) ? normalizeLeadStageId(manualEntry.stageOverride) : null,
        manualStage: Boolean(manualEntry && normalizeLeadStageId(manualEntry.stageOverride)),
        note: manualEntry && manualEntry.note ? manualEntry.note : null,
        ownerTag: manualEntry && manualEntry.ownerTag ? manualEntry.ownerTag : null,
        followUpAt: manualEntry && manualEntry.followUpAt ? manualEntry.followUpAt : null,
        followUpStatusId: followUpInfo.id,
        followUpLabel: followUpInfo.label,
        pinned: Boolean(manualEntry && manualEntry.pinned),
        leadDeskUpdatedAt: manualEntry && manualEntry.updatedAt ? manualEntry.updatedAt : null,
        recentEvents: visitorEvents.slice(-6).reverse().map(publicMarketingEvent),
      };
    }).filter(Boolean);

    const stageOrder = { duplication: 0, handoff: 1, conversation: 2, interest: 3, awareness: 4 };
    const sortedLeads = leads.sort((left, right) => {
      const leftPinned = left.pinned ? 0 : 1;
      const rightPinned = right.pinned ? 0 : 1;
      if (leftPinned !== rightPinned) return leftPinned - rightPinned;
      const followUpOrder = { overdue: 0, today: 1, soon: 2, planned: 3, none: 4 };
      const leftFollowUpWeight = followUpOrder[left.followUpStatusId] ?? 9;
      const rightFollowUpWeight = followUpOrder[right.followUpStatusId] ?? 9;
      if (leftFollowUpWeight !== rightFollowUpWeight) return leftFollowUpWeight - rightFollowUpWeight;
      const leftWeight = stageOrder[left.stageId] ?? 9;
      const rightWeight = stageOrder[right.stageId] ?? 9;
      if (leftWeight !== rightWeight) return leftWeight - rightWeight;
      if (left.followUpAt || right.followUpAt) {
        const leftFollowUp = String(left.followUpAt || '');
        const rightFollowUp = String(right.followUpAt || '');
        if (leftFollowUp !== rightFollowUp) return leftFollowUp.localeCompare(rightFollowUp);
      }
      return String(right.lastSeenAt || '').localeCompare(String(left.lastSeenAt || ''));
    });

    const summary = sortedLeads.reduce((acc, item) => {
      acc[item.stageId] = Number(acc[item.stageId] || 0) + 1;
      return acc;
    }, {
      awareness: 0,
      interest: 0,
      conversation: 0,
      handoff: 0,
      duplication: 0,
    });

    return {
      total: sortedLeads.length,
      byStage: summary,
      items: sortedLeads.slice(0, 24),
    };
  }

  function buildDuplicationKit(user, visitor, referralStats, scores) {
    if (!user) return null;
    const displayName = user.displayName || user.email || 'партнер';
    const referralLink = config.publicBaseUrl
      ? `${landingBaseUrl()}/?ref=${encodeURIComponent(user.referralCode || '')}`
      : null;
    const sourceChannel = String((visitor && visitor.firstTouch && visitor.firstTouch.sourceChannel) || 'direct');
    const partnerTone = scores.partnerPotential >= 55 ? 'партнерский' : 'мягкий';

    return {
      referralLink,
      status: partnerTone,
      headline: scores.partnerPotential >= 55
        ? 'У тебя уже есть хороший сигнал на партнёрский запуск.'
        : 'Можно мягко прогревать аудиторию через материалы и AI.',
      templates: [
        {
          id: 'invite_catalog',
          title: 'Приглашение в каталог',
          text: `${displayName}, посмотри удобный кабинет Trendex: каталог, AI-консультант и материалы в одном месте. Моя ссылка: ${referralLink || config.publicBaseUrl || ''}`.trim(),
        },
        {
          id: 'invite_partner',
          title: 'Приглашение в партнёрку',
          text: `Я собрал(а) удобный вход в Trendex: продукты, кабинет, AI и партнерская система. Если хочешь посмотреть, как устроены материалы, ссылки и возможности роста, заходи по ссылке: ${referralLink || config.publicBaseUrl || ''}`.trim(),
        },
        {
          id: 'invite_ai',
          title: 'Приглашение через AI',
          text: `Там можно не просто посмотреть продукты, а сразу спросить AI, что подойдет под твои цели. Ссылка: ${referralLink || config.publicBaseUrl || ''}`.trim(),
        },
      ],
      angles: [
        `Лучший текущий заход: ${sourceChannel}`,
        `Фокус на ${scores.partnerPotential >= 55 ? 'партнерке и дубликации' : 'каталоге и первом доверии'}`,
        `Текущие прямые регистрации: ${Number((referralStats && referralStats.directReferrals) || 0)}`,
      ],
    };
  }

  function buildMarketingAnalytics(relatedVisitors, events, referralStats, scores) {
    const visitors = Array.isArray(relatedVisitors) ? relatedVisitors : [];
    const eventItems = Array.isArray(events) ? events : [];
    const eventCounts = eventItems.reduce((acc, item) => {
      const key = String(item && item.eventType || 'unknown');
      acc[key] = Number(acc[key] || 0) + 1;
      return acc;
    }, {});
    const sourceCounts = visitors.reduce((acc, item) => {
      const key = String((item && item.firstTouch && item.firstTouch.sourceChannel) || 'direct');
      acc[key] = Number(acc[key] || 0) + 1;
      return acc;
    }, {});
    const panelCounts = eventItems.reduce((acc, item) => {
      const key = String(item && item.panel || 'unknown');
      acc[key] = Number(acc[key] || 0) + 1;
      return acc;
    }, {});
    const ctaCounts = eventItems.reduce((acc, item) => {
      const key = String(item && (item.ctaLabel || item.ctaId) || '').trim();
      if (!key) return acc;
      acc[key] = Number(acc[key] || 0) + 1;
      return acc;
    }, {});
    const landingSignalCounts = eventItems.reduce((acc, item) => {
      const key = String(item && item.meta && (item.meta.landingId || item.meta.landing) || '').trim();
      if (!key) return acc;
      acc[key] = Number(acc[key] || 0) + 1;
      return acc;
    }, {});
    const languageSignalCounts = eventItems.reduce((acc, item) => {
      const key = String(item && item.meta && (item.meta.languageId || item.meta.language) || '').trim();
      if (!key) return acc;
      acc[key] = Number(acc[key] || 0) + 1;
      return acc;
    }, {});

    const sources = Object.entries(sourceCounts)
      .map(([source, count]) => ({ source, count: Number(count || 0) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const topEvents = Object.entries(eventCounts)
      .map(([eventType, count]) => ({ eventType, count: Number(count || 0) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    const panels = Object.entries(panelCounts)
      .map(([panel, count]) => ({ panel, count: Number(count || 0) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    const topCtas = Object.entries(ctaCounts)
      .map(([label, count]) => ({ label, count: Number(count || 0) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    const landingSignals = Object.entries(landingSignalCounts)
      .map(([landingId, count]) => ({ landingId, count: Number(count || 0) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
    const languageSignals = Object.entries(languageSignalCounts)
      .map(([languageId, count]) => ({ languageId, count: Number(count || 0) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const funnel = {
      visits: visitors.reduce((sum, item) => sum + Number((item && item.visitsCount) || 0), 0),
      authStarts: Number(eventCounts.auth_start || 0) + Number(eventCounts.telegram_auth_start || 0),
      authCompletes: Number(eventCounts.auth_complete || 0),
      aiSignals: Number(eventCounts.ai_preview || 0) + Number(eventCounts.ai_message || 0) + Number(eventCounts.ai_prompt_click || 0),
      productSignals: Number(eventCounts.product_view || 0) + Number(eventCounts.catalog_open || 0) + Number(eventCounts.order_create || 0),
      referralsShared: Number(eventCounts.copy_referral || 0) + Number(eventCounts.share_referral || 0) + Number(eventCounts.share_channel_click || 0),
      directReferrals: Number((referralStats && referralStats.directReferrals) || 0),
    };

    const recommendations = [];
    if (scores.partnerPotential >= 55 && funnel.referralsShared === 0) {
      recommendations.push('Пора вынести реферальную ссылку в первые действия и отправить 3-5 личных касаний.');
    }
    if (scores.intent >= 45 && funnel.authCompletes === 0) {
      recommendations.push('Есть намерение, но нет входа в кабинет. Нужен более жёсткий CTA на регистрацию или Telegram-вход.');
    }
    if (funnel.aiSignals > 0 && funnel.authCompletes === 0) {
      recommendations.push('AI уже прогревает интерес. Стоит дожимать в персональную ссылку, лендинг и кабинет.');
    }
    if (!recommendations.length) {
      recommendations.push('Система уже собирает сигналы. Следующий фокус — усиливать наиболее частый сценарий, а не распыляться.');
    }

    return {
      visitorsCount: visitors.length,
      trackedEventsCount: eventItems.length,
      sources,
      topEvents,
      panels,
      topCtas,
      landingSignals,
      languageSignals,
      funnel,
      recommendations,
    };
  }

  function buildMarketingContextFromState(state, options = {}) {
    const userId = normalizePositiveInt(options.userId);
    const visitorId = normalizeVisitorId(options.visitorId);
    const userRow = userId ? state.webUsers[String(userId)] || null : null;
    let visitor = visitorId ? state.marketingVisitors[visitorId] || null : null;

    if (!visitor && userId) {
      visitor = Object.values(state.marketingVisitors)
        .filter((item) => normalizePositiveInt(item && item.userId) === userId)
        .sort((a, b) => String(b.updatedAt || b.lastSeenAt || '').localeCompare(String(a.updatedAt || a.lastSeenAt || '')))[0] || null;
    }

    const publicUser = userRow ? publicWebUser(userRow) : null;
    const partnerReferralCode = normalizeCode(publicUser && publicUser.referralCode);
    const fallbackVisitors = Object.values(state.marketingVisitors)
      .filter((item) => {
        if (visitor && item.visitorId === visitor.visitorId) return true;
        if (userId && normalizePositiveInt(item && item.userId) === userId) return true;
        return false;
      })
      .slice(-40);
    const referralVisitors = partnerReferralCode
      ? Object.values(state.marketingVisitors)
        .filter((item) => normalizeCode(item && item.firstTouch && item.firstTouch.referralCode) === partnerReferralCode)
        .slice(-80)
      : [];
    const relatedVisitors = referralVisitors.length ? referralVisitors : fallbackVisitors;
    const relatedVisitorIds = new Set(relatedVisitors.map((item) => normalizeVisitorId(item && item.visitorId)).filter(Boolean));
    const events = state.marketingEvents
      .filter((item) => {
        if (relatedVisitorIds.has(normalizeVisitorId(item && item.visitorId))) return true;
        if (!referralVisitors.length && visitor && item.visitorId === visitor.visitorId) return true;
        if (!referralVisitors.length && userId && normalizePositiveInt(item.userId) === userId) return true;
        return false;
      })
      .slice(-120);

    const referralStats = userId ? countReferralStatsFromState(state, userId, 5) : { directReferrals: 0, totalReferrals: 0, countsByLevel: [] };
    const scores = buildMarketingScores(visitor, events, publicUser, referralStats);
    const journey = buildMarketingJourneyStage(scores, visitor, publicUser, referralStats);
    const duplicationKit = buildDuplicationKit(publicUser, visitor, referralStats, scores);
    const analytics = buildMarketingAnalytics(relatedVisitors, events, referralStats, scores);
    const leadBoard = buildLeadBoard(relatedVisitors, events, state, publicUser);
    const sourceChannel = String((visitor && visitor.firstTouch && visitor.firstTouch.sourceChannel) || 'direct');
    const referralCode = visitor && visitor.firstTouch ? visitor.firstTouch.referralCode : null;

    const nextActions = [];
    if (!publicUser) {
      if (scores.partnerPotential >= 45 || referralCode) {
        nextActions.push(
          { id: 'telegram_auth', label: 'Войти через Telegram', kind: 'telegram' },
          { id: 'partner_section', label: 'Смотреть партнёрку', kind: 'scroll', target: 'partner-section' },
          { id: 'content_section', label: 'Открыть материалы', kind: 'scroll', target: 'content-section' },
        );
      } else if (scores.intent >= 45) {
        nextActions.push(
          { id: 'create_account', label: 'Получить личные ссылки и кабинет', kind: 'auth', target: 'register' },
          { id: 'products_section', label: 'Открыть каталог', kind: 'scroll', target: 'products-section' },
          { id: 'ai_preview', label: 'Спросить AI', kind: 'scroll', target: 'content-section' },
        );
      } else {
        nextActions.push(
          { id: 'create_account', label: 'Создать кабинет', kind: 'auth', target: 'register' },
          { id: 'products_section', label: 'Открыть каталог', kind: 'scroll', target: 'products-section' },
          { id: 'login_telegram', label: 'Войти через Telegram', kind: 'telegram' },
        );
      }
    } else {
      if (scores.partnerPotential >= 55 && Number(referralStats.directReferrals || 0) === 0) {
        nextActions.push(
          { id: 'open_partner', label: 'Запустить партнёрский контур', kind: 'panel', target: 'partner' },
          { id: 'copy_referral', label: 'Скопировать реферальную ссылку', kind: 'copy_referral' },
          { id: 'open_content', label: 'Открыть материалы', kind: 'panel', target: 'content' },
        );
      } else if (!publicUser.activeProtocolId) {
        nextActions.push(
          { id: 'open_roadmap', label: 'Выбрать сценарий', kind: 'panel', target: 'roadmap' },
          { id: 'open_ai', label: 'Спросить AI', kind: 'panel', target: 'ai' },
          { id: 'open_products', label: 'Открыть каталог', kind: 'panel', target: 'products' },
        );
      } else {
        nextActions.push(
          { id: 'open_dashboard', label: 'Открыть кабинет', kind: 'scroll', target: 'dashboard' },
          { id: 'open_products', label: 'Открыть каталог', kind: 'panel', target: 'products' },
          { id: 'open_partner', label: 'Партнёрский контур', kind: 'panel', target: 'partner' },
        );
      }
    }

    return {
      visitor: publicMarketingVisitor(visitor),
      traffic: {
        sourceChannel,
        referralCode: referralCode || null,
        utmSource: visitor && visitor.firstTouch ? visitor.firstTouch.utmSource : null,
        utmMedium: visitor && visitor.firstTouch ? visitor.firstTouch.utmMedium : null,
        utmCampaign: visitor && visitor.firstTouch ? visitor.firstTouch.utmCampaign : null,
        firstLandingPath: visitor && visitor.firstTouch ? visitor.firstTouch.pagePath : '/',
        visitsCount: Number((visitor && visitor.visitsCount) || 0),
        lastSeenAt: visitor && visitor.lastSeenAt ? visitor.lastSeenAt : null,
      },
      scores,
      journey,
      nextActions,
      cta: {
        primary: nextActions[0] || null,
        secondary: nextActions[1] || null,
        note: referralCode
          ? 'Пользователь пришёл по рекомендации, поэтому стоит быстрее подводить к регистрации и материалам.'
          : sourceChannel === 'direct'
            ? 'Для прямого трафика лучше срабатывает быстрый вход в кабинет и каталог.'
            : `Текущий основной источник: ${sourceChannel}.`,
      },
      duplicationKit,
      analytics,
      leadSummary: leadBoard,
      leadBoard: leadBoard.items,
      performance: {
        directReferrals: Number(referralStats.directReferrals || 0),
        totalReferrals: Number(referralStats.totalReferrals || 0),
        points: Number((publicUser && publicUser.points) || 0),
      },
      recentEvents: events.slice(-6).map(publicMarketingEvent),
    };
  }

  function upsertMarketingVisit(data = {}) {
    const state = readState();
    const visitorId = normalizeVisitorId(data.visitorId);
    if (!visitorId) throw new Error('VISITOR_ID_REQUIRED');
    const now = nowIso();
    const touch = normalizeMarketingTouch(data);
    const userId = normalizePositiveInt(data.userId) || null;
    const existing = state.marketingVisitors[visitorId] || null;

    state.marketingVisitors[visitorId] = {
      visitorId,
      userId: userId || normalizePositiveInt(existing && existing.userId) || null,
      firstTouch: existing && existing.firstTouch ? existing.firstTouch : touch,
      lastTouch: touch,
      visitsCount: Number(existing && existing.visitsCount || 0) + 1,
      lastEventType: existing && existing.lastEventType ? existing.lastEventType : 'visit',
      firstVisitAt: existing && existing.firstVisitAt ? existing.firstVisitAt : now,
      lastSeenAt: now,
      createdAt: existing && existing.createdAt ? existing.createdAt : now,
      updatedAt: now,
    };

    writeState(state);
    return {
      visitor: publicMarketingVisitor(state.marketingVisitors[visitorId]),
      context: buildMarketingContextFromState(state, {
        visitorId,
        userId: state.marketingVisitors[visitorId].userId,
      }),
    };
  }

  function attachMarketingVisitor(visitorId, userId) {
    const state = readState();
    const normalizedVisitorId = normalizeVisitorId(visitorId);
    const normalizedUserId = normalizePositiveInt(userId);
    if (!normalizedVisitorId || !normalizedUserId) return null;
    const visitor = state.marketingVisitors[normalizedVisitorId];
    if (!visitor) return null;
    visitor.userId = normalizedUserId;
    visitor.updatedAt = nowIso();
    writeState(state);
    return publicMarketingVisitor(visitor);
  }

  function recordMarketingEvent(data = {}) {
    const state = readState();
    const visitorId = normalizeVisitorId(data.visitorId);
    const userId = normalizePositiveInt(data.userId) || null;
    const eventType = normalizeShortText(data.eventType, 80);
    if (!visitorId || !eventType) throw new Error('MARKETING_EVENT_INVALID');

    const visitor = state.marketingVisitors[visitorId] || null;
    const id = nextCounter(state, 'marketingEvent');
    const row = {
      id,
      visitorId,
      userId: userId || normalizePositiveInt(visitor && visitor.userId) || null,
      eventType,
      pagePath: normalizePath(data.pagePath || data.path || (visitor && visitor.lastTouch && visitor.lastTouch.pagePath) || '/'),
      panel: normalizeShortText(data.panel, 40),
      ctaId: normalizeShortText(data.ctaId, 80),
      ctaLabel: normalizeShortText(data.ctaLabel, 160),
      intentHint: normalizeShortText(data.intentHint, 80),
      meta: data.meta && typeof data.meta === 'object' ? data.meta : {},
      createdAt: nowIso(),
    };

    state.marketingEvents.push(row);
    if (state.marketingEvents.length > 5000) {
      state.marketingEvents = state.marketingEvents.slice(-5000);
    }

    if (visitor) {
      visitor.userId = row.userId || visitor.userId || null;
      visitor.lastEventType = row.eventType;
      visitor.lastSeenAt = row.createdAt;
      visitor.updatedAt = row.createdAt;
    }

    if (row.userId && ['copy_referral', 'share_referral', 'share_channel_click'].includes(row.eventType)) {
      pushActivityState(state, row.userId, {
        kind: 'marketing',
        title: row.eventType === 'copy_referral'
          ? 'Реферальная ссылка скопирована'
          : row.eventType === 'share_channel_click'
            ? 'Открыт канал шеринга'
            : 'Реферальный материал отправлен',
        text: row.ctaLabel || 'Партнёрский контур получил новый сигнал активности.',
        view: 'partner',
        meta: row.meta,
      });
    }

    writeState(state);
    return publicMarketingEvent(row);
  }

  function getMarketingContext(options = {}) {
    const state = readState();
    return buildMarketingContextFromState(state, options);
  }

  function touchUser(from) {
    const state = readState();
    const id = String(from.id);
    const now = nowIso();
    const existing = state.users[id] || {};
    state.users[id] = {
      id: from.id,
      username: from.username || '',
      firstName: from.first_name || '',
      lastName: from.last_name || '',
      languageCode: from.language_code || '',
      referredBy: existing.referredBy || null,
      referralsCount: Number(existing.referralsCount || 0),
      points: Number(existing.points || 0),
      firstSeenAt: existing.firstSeenAt || now,
      lastSeenAt: now
    };
    writeState(state);
    return state.users[id];
  }

  function registerStart(from, startParam) {
    const state = readState();
    const id = String(from.id);
    const now = nowIso();
    const existing = state.users[id] || {};
    const wasNew = !state.users[id];

    state.users[id] = {
      id: from.id,
      username: from.username || '',
      firstName: from.first_name || '',
      lastName: from.last_name || '',
      languageCode: from.language_code || '',
      referredBy: existing.referredBy || null,
      referralsCount: Number(existing.referralsCount || 0),
      points: Number(existing.points || 0),
      firstSeenAt: existing.firstSeenAt || now,
      lastSeenAt: now
    };

    if (wasNew && /^ref_\d+$/.test(String(startParam || ''))) {
      const referrerId = String(startParam).slice(4);
      if (referrerId && referrerId !== id) {
        state.users[id].referredBy = Number(referrerId);
        const referrer = state.users[referrerId];
        if (referrer) {
          referrer.referralsCount = Number(referrer.referralsCount || 0) + 1;
          referrer.points = Number(referrer.points || 0) + Number(config.pointsPerReferral || 100);
        }
      }
    }

    writeState(state);
    return state.users[id];
  }

  function getUser(userId) {
    const state = readState();
    return state.users[String(userId)] || null;
  }

  function getUsersCount() {
    const state = readState();
    return Object.keys(state.users).length;
  }

  function logSupportMessage(from, text, context = {}) {
    const state = readState();
    state.supportMessages.push({
      id: `${Date.now()}_${from.id}`,
      userId: from.id,
      username: from.username || '',
      firstName: from.first_name || '',
      lastName: from.last_name || '',
      text: String(text || '').trim(),
      source: context.source || 'message',
      createdAt: nowIso()
    });
    if (state.supportMessages.length > 1000) {
      state.supportMessages = state.supportMessages.slice(-1000);
    }
    writeState(state);
  }

  function ensureUniqueReferralCode(state, preferred) {
    let code = normalizeCode(preferred);
    if (!code) code = `xh_${crypto.randomBytes(4).toString('hex')}`;
    const used = new Set(
      Object.values(state.webUsers)
        .map((user) => normalizeCode(user && user.referralCode))
        .filter(Boolean)
    );
    while (used.has(code)) {
      code = `xh_${crypto.randomBytes(4).toString('hex')}`;
    }
    return code;
  }

  function findWebUserByEmail(email) {
    const normalized = normalizeEmail(email);
    if (!normalized) return null;
    const state = readState();
    return Object.values(state.webUsers).find((user) => user && user.email === normalized) || null;
  }

  function findWebUserByTelegramId(telegramUserId) {
    const normalized = normalizeTelegramId(telegramUserId);
    if (!normalized) return null;
    const state = readState();
    return Object.values(state.webUsers)
      .find((user) => normalizeTelegramId(user && user.telegramUserId) === normalized) || null;
  }

  function findWebUserById(userId) {
    const state = readState();
    return state.webUsers[String(normalizePositiveInt(userId))] || null;
  }

  function getPublicWebUserById(userId) {
    return publicWebUser(findWebUserById(userId));
  }

  function findWebUserByReferralCode(code) {
    const normalized = normalizeCode(code);
    if (!normalized) return null;
    const state = readState();
    return Object.values(state.webUsers).find((user) => user && normalizeCode(user.referralCode) === normalized) || null;
  }

  // ─────────────────────────────────────────────
  // MAGIC LOGIN (bot → site) + TELEGRAM LINK (site → bot)
  // ─────────────────────────────────────────────

  // Magic login: bot generates token → user opens link → auto-login on site
  function createMagicLoginToken(telegramUserId) {
    const tgId = normalizeTelegramId(telegramUserId);
    if (!tgId) return null;
    const state = readState();
    // Find webUser by telegramUserId
    const user = Object.values(state.webUsers || {}).find(
      (u) => u && normalizeTelegramId(u.telegramUserId) === tgId
    );
    if (!user) return null;
    const token = crypto.randomBytes(32).toString('base64url');
    if (!state.magicLoginTokens) state.magicLoginTokens = {};
    // Clean expired
    const now = Date.now();
    for (const [k, v] of Object.entries(state.magicLoginTokens)) {
      if (Date.parse(v.expiresAt) < now) delete state.magicLoginTokens[k];
    }
    state.magicLoginTokens[token] = {
      userId: user.id,
      telegramUserId: tgId,
      expiresAt: new Date(now + 15 * 60 * 1000).toISOString(),
      createdAt: nowIso(),
    };
    writeState(state);
    return { token, userId: user.id, expiresAt: state.magicLoginTokens[token].expiresAt };
  }

  function verifyMagicLoginToken(token) {
    const raw = String(token || '').trim();
    if (!raw) return null;
    const state = readState();
    if (!state.magicLoginTokens) return null;
    const entry = state.magicLoginTokens[raw];
    if (!entry) return null;
    if (Date.parse(entry.expiresAt) < Date.now()) {
      delete state.magicLoginTokens[raw];
      writeState(state);
      return null;
    }
    // Consume token (one-time use)
    delete state.magicLoginTokens[raw];
    writeState(state);
    const user = state.webUsers[String(entry.userId)];
    return user ? publicWebUser(user) : null;
  }

  // Telegram link: site generates token → user opens bot → bot links TG to webUser
  function createTelegramLinkToken(webUserId) {
    const uid = normalizePositiveInt(webUserId);
    if (!uid) return null;
    const state = readState();
    const user = state.webUsers[String(uid)];
    if (!user) return null;
    const token = crypto.randomBytes(24).toString('base64url');
    if (!state.telegramLinkTokens) state.telegramLinkTokens = {};
    // Clean expired
    const now = Date.now();
    for (const [k, v] of Object.entries(state.telegramLinkTokens)) {
      if (Date.parse(v.expiresAt) < now) delete state.telegramLinkTokens[k];
    }
    state.telegramLinkTokens[token] = {
      userId: uid,
      expiresAt: new Date(now + 15 * 60 * 1000).toISOString(),
      createdAt: nowIso(),
    };
    writeState(state);
    return { token, userId: uid, expiresAt: state.telegramLinkTokens[token].expiresAt };
  }

  function completeTelegramLink(token, telegramProfile) {
    const raw = String(token || '').trim();
    if (!raw || !telegramProfile || !telegramProfile.id) return { ok: false, reason: 'invalid' };
    const state = readState();
    if (!state.telegramLinkTokens) return { ok: false, reason: 'no_tokens' };
    const entry = state.telegramLinkTokens[raw];
    if (!entry) return { ok: false, reason: 'not_found' };
    if (Date.parse(entry.expiresAt) < Date.now()) {
      delete state.telegramLinkTokens[raw];
      writeState(state);
      return { ok: false, reason: 'expired' };
    }
    // Consume token
    delete state.telegramLinkTokens[raw];
    const user = state.webUsers[String(entry.userId)];
    if (!user) { writeState(state); return { ok: false, reason: 'user_not_found' }; }
    // Check not already linked to another TG
    const tgId = normalizeTelegramId(telegramProfile.id);
    // Link
    user.telegramUserId = tgId;
    user.telegramUsername = normalizeTelegramUsername(telegramProfile.username);
    user.telegramLinkedAt = nowIso();
    user.updatedAt = nowIso();
    writeState(state);
    return { ok: true, user: publicWebUser(user) };
  }

  function getTelegramLinkStatus(webUserId) {
    const uid = normalizePositiveInt(webUserId);
    if (!uid) return { linked: false };
    const state = readState();
    const user = state.webUsers[String(uid)];
    if (!user) return { linked: false };
    const tgId = normalizeTelegramId(user.telegramUserId);
    return {
      linked: Boolean(tgId),
      telegramUserId: tgId || null,
      username: user.telegramUsername || null,
      linkedAt: user.telegramLinkedAt || null,
    };
  }

  // Welcome drip tracking
  function setDripSent(userId, dayKey) {
    const id = normalizePositiveInt(userId);
    if (!id) return;
    const state = readState();
    const user = state.webUsers[String(id)];
    if (!user) return;
    if (!user.dripSchedule || typeof user.dripSchedule !== 'object') user.dripSchedule = {};
    user.dripSchedule[dayKey] = nowIso();
    user.updatedAt = nowIso();
    writeState(state);
  }

  // Returns a shallow snapshot of webUsers keyed by id (for analytics/top)
  function listAllWebUsers() {
    const state = readState();
    return Object.values(state.webUsers || {});
  }

  // Attribute existing user to an inviter (only if not already attributed)
  function setWebUserReferredBy(userId, inviterId) {
    const id = normalizePositiveInt(userId);
    const inv = normalizePositiveInt(inviterId);
    if (!id || !inv || id === inv) return false;
    const state = readState();
    const user = state.webUsers[String(id)];
    const inviter = state.webUsers[String(inv)];
    if (!user || !inviter) return false;
    if (normalizePositiveInt(user.referredByUserId)) return false; // already set
    user.referredByUserId = inv;
    user.updatedAt = nowIso();
    inviter.referralsCount = Number(inviter.referralsCount || 0) + 1;
    inviter.updatedAt = nowIso();
    writeState(state);
    return true;
  }

  // ─────────────────────────────────────────────
  // TEAM / REFERRAL CRM (activity tracking, stages, notes, snooze, badges)
  // ─────────────────────────────────────────────

  const TEAM_STAGES = {
    INVITED: 'invited',
    JOINED: 'joined',
    ONBOARDED: 'onboarded',
    ENGAGED: 'engaged',
    CONVERTED: 'converted',
    DORMANT: 'dormant',
    LOST: 'lost',
  };

  // Log a user's activity (every message/callback in bot)
  function logReferralActivity(userId, action, context) {
    const id = normalizePositiveInt(userId);
    if (!id) return;
    const state = readState();
    const user = state.webUsers[String(id)];
    if (!user) return;
    if (!Array.isArray(user.activityLog)) user.activityLog = [];
    const entry = { at: nowIso(), action: String(action || '').slice(0, 80) };
    if (context) entry.ctx = String(context).slice(0, 120);
    user.activityLog.push(entry);
    if (user.activityLog.length > 30) user.activityLog = user.activityLog.slice(-30);
    user.lastActivityAt = entry.at;
    user.lastAction = entry.action;
    user.updatedAt = entry.at;
    writeState(state);
  }

  // Compute current stage based on user fields + activityLog
  function computeReferralStage(user) {
    if (!user) return TEAM_STAGES.INVITED;
    // CONVERTED: company link set
    if (user.trendexRefLink && String(user.trendexRefLink).trim()) {
      return TEAM_STAGES.CONVERTED;
    }
    // If no telegram and no activity — invited (not yet interacted)
    const hasTg = Boolean(normalizeTelegramId(user.telegramUserId));
    const meta = ensureWebUserMeta(user);
    const onboarded = !!meta.onboardingCompletedAt;
    const lastActivity = user.lastActivityAt ? Date.parse(user.lastActivityAt) : 0;
    const now = Date.now();
    const daysSinceActive = lastActivity ? (now - lastActivity) / 86400000 : 9999;

    // LOST: 30+ days inactive, not converted
    if (lastActivity && daysSinceActive > 30) return TEAM_STAGES.LOST;
    // DORMANT: 7+ days inactive
    if (lastActivity && daysSinceActive > 7) return TEAM_STAGES.DORMANT;

    if (!hasTg && !lastActivity) return TEAM_STAGES.INVITED;

    if (!onboarded) return TEAM_STAGES.JOINED;

    // ENGAGED: event subscribed OR >5 actions in last 7d OR >3 tasks (in planner.db — too slow to check, use activityLog heuristic)
    const recentActions = (user.activityLog || []).filter((e) => {
      return e.at && (now - Date.parse(e.at)) < 7 * 86400000;
    }).length;
    // Check event subscriptions
    const state = readState();
    let hasEventSub = false;
    if (state.webEventSubscriptions) {
      for (const evSubs of Object.values(state.webEventSubscriptions)) {
        if (evSubs && evSubs[String(user.id)]) { hasEventSub = true; break; }
      }
    }
    if (hasEventSub || recentActions >= 5) return TEAM_STAGES.ENGAGED;

    return TEAM_STAGES.ONBOARDED;
  }

  // Transition stage: update + record history
  function transitionReferralStage(userId, newStage) {
    const id = normalizePositiveInt(userId);
    if (!id) return null;
    const state = readState();
    const user = state.webUsers[String(id)];
    if (!user) return null;
    const oldStage = user.referralStage || null;
    if (oldStage === newStage) return null;
    user.referralStage = newStage;
    if (!Array.isArray(user.referralStageHistory)) user.referralStageHistory = [];
    user.referralStageHistory.push({ stage: newStage, at: nowIso(), from: oldStage });
    if (user.referralStageHistory.length > 50) user.referralStageHistory = user.referralStageHistory.slice(-50);
    if (newStage === TEAM_STAGES.CONVERTED && !user.trendexRefLinkSetAt) {
      user.trendexRefLinkSetAt = nowIso();
    }
    user.updatedAt = nowIso();
    writeState(state);
    return { old: oldStage, new: newStage };
  }

  // Recompute stage and transition if changed
  function refreshReferralStage(userId) {
    const state = readState();
    const user = state.webUsers[String(normalizePositiveInt(userId))];
    if (!user) return null;
    const newStage = computeReferralStage(user);
    if (newStage !== user.referralStage) {
      return transitionReferralStage(user.id, newStage);
    }
    return null;
  }

  // List all invitees (referrals) of a given inviter
  function listInviteeReferrals(inviterId) {
    const inv = normalizePositiveInt(inviterId);
    if (!inv) return [];
    const state = readState();
    const all = Object.values(state.webUsers || {});
    return all
      .filter((u) => u && normalizePositiveInt(u.referredByUserId) === inv)
      .map((u) => publicWebUser(u));
  }

  // Get single referral card
  function getReferralCard(inviterId, refUserId) {
    const inv = normalizePositiveInt(inviterId);
    const refId = normalizePositiveInt(refUserId);
    if (!inv || !refId) return null;
    const state = readState();
    const user = state.webUsers[String(refId)];
    if (!user) return null;
    if (normalizePositiveInt(user.referredByUserId) !== inv) return null;
    return publicWebUser(user);
  }

  // Inviter notes on a ref
  function setInviterNote(inviterId, refUserId, note) {
    const inv = normalizePositiveInt(inviterId);
    const refId = normalizePositiveInt(refUserId);
    if (!inv || !refId) return false;
    const state = readState();
    const user = state.webUsers[String(refId)];
    if (!user || normalizePositiveInt(user.referredByUserId) !== inv) return false;
    if (!user.inviterNotes || typeof user.inviterNotes !== 'object') user.inviterNotes = {};
    user.inviterNotes[String(inv)] = String(note || '').slice(0, 2000);
    user.updatedAt = nowIso();
    writeState(state);
    return true;
  }

  function getInviterNote(inviterId, refUserId) {
    const inv = normalizePositiveInt(inviterId);
    const refId = normalizePositiveInt(refUserId);
    if (!inv || !refId) return '';
    const state = readState();
    const user = state.webUsers[String(refId)];
    if (!user) return '';
    return (user.inviterNotes && user.inviterNotes[String(inv)]) || '';
  }

  // Snooze — inviter won't be pinged about this ref until given date
  function setInviterSnooze(inviterId, refUserId, untilIso) {
    const inv = normalizePositiveInt(inviterId);
    const refId = normalizePositiveInt(refUserId);
    if (!inv || !refId) return false;
    const state = readState();
    const user = state.webUsers[String(refId)];
    if (!user || normalizePositiveInt(user.referredByUserId) !== inv) return false;
    if (!user.inviterSnoozeUntil || typeof user.inviterSnoozeUntil !== 'object') user.inviterSnoozeUntil = {};
    user.inviterSnoozeUntil[String(inv)] = untilIso || nowIso();
    user.updatedAt = nowIso();
    writeState(state);
    return true;
  }

  function clearInviterSnooze(inviterId, refUserId) {
    const inv = normalizePositiveInt(inviterId);
    const refId = normalizePositiveInt(refUserId);
    const state = readState();
    const user = state.webUsers[String(refId)];
    if (!user) return false;
    if (user.inviterSnoozeUntil) delete user.inviterSnoozeUntil[String(inv)];
    writeState(state);
    return true;
  }

  function isSnoozed(inviterId, refUser) {
    if (!refUser || !refUser.inviterSnoozeUntil) return false;
    const until = refUser.inviterSnoozeUntil[String(inviterId)];
    if (!until) return false;
    return Date.parse(until) > Date.now();
  }

  // Mark as contacted — updates inviterContactedAt
  function markInviterContacted(inviterId, refUserId) {
    const inv = normalizePositiveInt(inviterId);
    const refId = normalizePositiveInt(refUserId);
    if (!inv || !refId) return false;
    const state = readState();
    const user = state.webUsers[String(refId)];
    if (!user) return false;
    if (!user.inviterContactedAt || typeof user.inviterContactedAt !== 'object') user.inviterContactedAt = {};
    user.inviterContactedAt[String(inv)] = nowIso();
    user.updatedAt = nowIso();
    writeState(state);
    return true;
  }

  // Team stats for inviter
  function getTeamStats(inviterId) {
    const refs = listInviteeReferrals(inviterId);
    const counts = { total: refs.length, joined: 0, onboarded: 0, engaged: 0, converted: 0, dormant: 0, lost: 0, invited: 0 };
    for (const r of refs) {
      const stage = r.referralStage || computeReferralStage(r);
      if (counts[stage] !== undefined) counts[stage] += 1;
    }
    return counts;
  }

  // Funnel: percentages of users who passed each stage
  function getTeamFunnel(inviterId) {
    const refs = listInviteeReferrals(inviterId);
    const total = refs.length;
    if (!total) return { total: 0, joined: 0, onboarded: 0, engaged: 0, converted: 0 };
    let joined = 0, onboarded = 0, engaged = 0, converted = 0;
    for (const r of refs) {
      const hist = Array.isArray(r.referralStageHistory) ? r.referralStageHistory : [];
      const seen = new Set(hist.map((h) => h.stage));
      const current = r.referralStage || computeReferralStage(r);
      // current is latest, also check if visited
      if (current !== 'invited') seen.add('joined');
      if (['onboarded', 'engaged', 'converted', 'dormant', 'lost'].includes(current)) seen.add('onboarded');
      if (['engaged', 'converted'].includes(current)) { seen.add('engaged'); }
      if (current === 'converted') seen.add('converted');
      if (seen.has('joined')) joined++;
      if (seen.has('onboarded')) onboarded++;
      if (seen.has('engaged')) engaged++;
      if (seen.has('converted')) converted++;
    }
    return { total, joined, onboarded, engaged, converted };
  }

  // Refs that need attention from inviter
  function getNextActions(inviterId) {
    const inv = normalizePositiveInt(inviterId);
    const refs = listInviteeReferrals(inv);
    const now = Date.now();
    const state = readState();
    const actions = [];
    for (const r of refs) {
      // Skip snoozed
      if (r.inviterSnoozeUntil && r.inviterSnoozeUntil[String(inv)]) {
        const until = Date.parse(r.inviterSnoozeUntil[String(inv)]);
        if (until > now) continue;
      }
      const stage = r.referralStage || computeReferralStage(r);
      if (stage === 'converted') continue; // already won
      const lastContact = (r.inviterContactedAt && r.inviterContactedAt[String(inv)]) || null;
      const contactedAgo = lastContact ? (now - Date.parse(lastContact)) / 86400000 : 999;
      const lastActive = r.lastActivityAt ? (now - Date.parse(r.lastActivityAt)) / 86400000 : 999;

      let priority = 0; // higher = more urgent
      let reason = '';
      if (stage === 'joined' && contactedAgo > 1) { priority = 10; reason = 'Зашёл — поздоровайтесь'; }
      else if (stage === 'onboarded' && contactedAgo > 2) { priority = 9; reason = 'Прошёл онбординг, пора написать'; }
      else if (stage === 'engaged' && contactedAgo > 3) { priority = 8; reason = 'Активен — обсудите компанию'; }
      else if (stage === 'dormant' && contactedAgo > 3) { priority = 7; reason = 'Уснул — пора пингануть'; }
      else if (stage === 'lost' && contactedAgo > 7) { priority = 3; reason = 'Давно тишина — попробуйте вернуть'; }
      else continue;
      actions.push({ ref: r, priority, reason, lastActive, contactedAgo });
    }
    return actions.sort((a, b) => b.priority - a.priority);
  }

  // Badges — compute from refs
  const BADGES = {
    first_contact: { id: 'first_contact', icon: '🥇', title: 'Первый контакт', desc: 'Пригласил первого партнёра' },
    activator:     { id: 'activator',     icon: '🔥', title: 'Активатор',       desc: '5 активных в команде' },
    closer:        { id: 'closer',        icon: '✅', title: 'Закрыватель',     desc: '1 партнёр в компании' },
    funnel_master: { id: 'funnel_master', icon: '💎', title: 'Мастер воронки',  desc: '5 в компании' },
    leader:        { id: 'leader',        icon: '🏆', title: 'Лидер',           desc: '20 в команде' },
  };

  function computeBadges(inviterId) {
    const stats = getTeamStats(inviterId);
    const earned = [];
    if (stats.total >= 1) earned.push(BADGES.first_contact);
    if (stats.engaged >= 5 || (stats.engaged + stats.converted) >= 5) earned.push(BADGES.activator);
    if (stats.converted >= 1) earned.push(BADGES.closer);
    if (stats.converted >= 5) earned.push(BADGES.funnel_master);
    if (stats.total >= 20) earned.push(BADGES.leader);
    return earned;
  }

  function syncBadges(inviterId) {
    const id = normalizePositiveInt(inviterId);
    if (!id) return { newBadges: [], all: [] };
    const state = readState();
    const user = state.webUsers[String(id)];
    if (!user) return { newBadges: [], all: [] };
    if (!Array.isArray(user.badges)) user.badges = [];
    const current = computeBadges(id);
    const existing = new Set(user.badges.map((b) => b && b.id).filter(Boolean));
    const newBadges = [];
    for (const b of current) {
      if (!existing.has(b.id)) {
        user.badges.push({ ...b, earnedAt: nowIso() });
        newBadges.push(b);
      }
    }
    if (newBadges.length) { user.updatedAt = nowIso(); writeState(state); }
    return { newBadges, all: user.badges };
  }

    // [trdx-fields] Award TRDX to user, append ledger entry (mutates state arg).
  function _awardTrxInternal(state, userId, amount, reason, refUserId) {
    const u = state.webUsers[String(userId)];
    if (!u) return null;
    u.trxBalance = Number(u.trxBalance || 0) + Number(amount || 0);
    if (!Array.isArray(u.trxLedger)) u.trxLedger = [];
    u.trxLedger.push({ ts: nowIso(), amount: Number(amount), reason: String(reason || ''), refUserId: refUserId || null });
    if (u.trxLedger.length > 200) u.trxLedger = u.trxLedger.slice(-200);
    u.updatedAt = nowIso();
    return Number(u.trxBalance);
  }
  function awardTrx(userId, amount, reason, refUserId) {
    const state = readState();
    const newBal = _awardTrxInternal(state, userId, amount, reason, refUserId);
    if (newBal == null) return null;
    writeState(state);
    return newBal;
  }
  function getTrxBalance(userId) {
    const state = readState();
    const u = state.webUsers[String(userId)];
    return u ? Number(u.trxBalance || 0) : 0;
  }
  function getTrxLedger(userId, limit) {
    const state = readState();
    const u = state.webUsers[String(userId)];
    if (!u || !Array.isArray(u.trxLedger)) return [];
    const arr = u.trxLedger.slice(-(limit || 50));
    return arr.reverse();
  }
  function getTrxLeaderboard(limit) {
    const state = readState();
    const lim = Math.min(500, Math.max(1, Number(limit) || 100));
    return Object.values(state.webUsers || {})
      .filter(u => u && (u.status || 'active') === 'active')
      .map(u => ({
        id: u.id,
        displayName: u.displayName || u.username || ('user_' + u.id),
        referralCode: u.referralCode || null,
        trxBalance: Number(u.trxBalance || 0),
        referralsCount: Number(u.referralsCount || 0),
      }))
      .sort((a, b) => b.trxBalance - a.trxBalance)
      .slice(0, lim);
  }
  function setTrxLastAwardedTier(userId, tierCode) {
    const state = readState();
    const u = state.webUsers[String(userId)];
    if (!u) return false;
    u.trxLastAwardedTier = tierCode;
    u.updatedAt = nowIso();
    writeState(state);
    return true;
  }
  function listWebUsersForTrxScan() {
    const state = readState();
    return Object.values(state.webUsers || {})
      .filter(u => u && u.referredByUserId)
      .map(u => ({
        id: u.id,
        email: u.email || null,
        telegramUserId: u.telegramUserId || null,
        referredByUserId: u.referredByUserId,
        trxLastAwardedTier: u.trxLastAwardedTier || 'free',
      }));
  }
  function backfillRegistrationBonus() {
    // One-shot: +100 TRDX to every user lacking a 'registration' or 'registration_backfill' ledger entry.
    const state = readState();
    let n = 0;
    const now = nowIso();
    for (const uid of Object.keys(state.webUsers || {})) {
      const u = state.webUsers[uid];
      if (!u) continue;
      const ledger = Array.isArray(u.trxLedger) ? u.trxLedger : [];
      const has = ledger.some(e => e && (e.reason === 'registration' || e.reason === 'registration_backfill'));
      if (has) continue;
      u.trxBalance = Number(u.trxBalance || 0) + 100;
      ledger.push({ ts: now, amount: 100, reason: 'registration_backfill', refUserId: null });
      u.trxLedger = ledger;
      if (!u.trxLastAwardedTier) u.trxLastAwardedTier = 'free';
      u.updatedAt = now;
      n++;
    }
    if (n > 0) writeState(state);
    return n;
  }

  function createWebUser(data = {}) {
    const state = readState();
    const email = normalizeEmail(data.email);
    const telegramUserId = normalizeTelegramId(data.telegramUserId || data.telegramId);
    if (!email && !telegramUserId) throw new Error('IDENTITY_REQUIRED');

    if (email && Object.values(state.webUsers).some((user) => user && user.email === email)) {
      throw new Error('EMAIL_EXISTS');
    }

    if (telegramUserId && Object.values(state.webUsers).some((user) => normalizeTelegramId(user && user.telegramUserId) === telegramUserId)) {
      throw new Error('TELEGRAM_EXISTS');
    }

    let passwordHash = null;
    let passwordSalt = null;
    if (email) {
      passwordHash = String(data.passwordHash || '').trim().toLowerCase();
      passwordSalt = String(data.passwordSalt || '').trim().toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(passwordHash)) throw new Error('Invalid password hash');
      if (!/^[a-f0-9]{32,64}$/.test(passwordSalt)) throw new Error('Invalid password salt');
    }

    const id = nextCounter(state, 'webUser');
    const now = nowIso();
    const referralCode = ensureUniqueReferralCode(state, data.referralCode || `xh${id}${crypto.randomBytes(2).toString('hex')}`);
    const telegramUsername = normalizeTelegramUsername(data.telegramUsername || (data.telegramProfile && data.telegramProfile.username));
    const displayName = normalizeDisplayName(data.displayName) || (telegramUserId ? buildTelegramDisplayName(data.telegramProfile || data) : null);
    const referredByUserId = normalizePositiveInt(data.referredByUserId) || null;
    const meta = ensureWebUserMeta(data);

    // Username (Phase A): user-supplied or derived from email/tg/id
    const _suggestedUsername = String(data.username || '').trim();
    let _username = _suggestedUsername
      ? sanitizeUsername(_suggestedUsername)
      : deriveDefaultUsername({ telegramUsername, email }, id);
    _username = ensureUniqueUsername(state, _username, id);

    state.webUsers[String(id)] = {
      id,
      username: _username,
      usernameLockedAt: now,
      email: email || null,
      passwordHash,
      passwordSalt,
      displayName,
      telegramUserId: telegramUserId || null,
      telegramUsername,
      userRole: meta.userRole,
      experienceLevel: meta.experienceLevel,
      focusAreas: meta.focusAreas,
      goalsSummary: meta.goalsSummary,
      city: meta.city,
      preferredContact: meta.preferredContact,
      onboardingCompletedAt: meta.onboardingCompletedAt,
      activeProtocolId: meta.activeProtocolId,
      savedProtocolIds: meta.savedProtocolIds,
      savedProductIds: meta.savedProductIds,
      savedContentIds: meta.savedContentIds,
      notificationSettings: meta.notificationSettings,
      profile: meta.profile,
      preferences: meta.preferences,
      onboarding: meta.onboarding,
      referralCode,
      referredByUserId,
      points: Number(data.points || 0),
      referralsCount: Number(data.referralsCount || 0),
      status: 'active',
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
      // [trdx-fields] Genesis TRDX: registration bonus +100
      trxBalance: 100,
      trxLedger: [{ ts: now, amount: 100, reason: 'registration', refUserId: null }],
      trxLastAwardedTier: 'free',
    };

    if (referredByUserId && state.webUsers[String(referredByUserId)]) {
      const referrer = state.webUsers[String(referredByUserId)];
      referrer.referralsCount = Number(referrer.referralsCount || 0) + 1;
      referrer.points = Number(referrer.points || 0) + Number(config.pointsPerReferral || 100);
      // [trdx-fields] +50 TRDX referrer for free referral
      referrer.trxBalance = Number(referrer.trxBalance || 0) + 50;
      if (!Array.isArray(referrer.trxLedger)) referrer.trxLedger = [];
      referrer.trxLedger.push({ ts: now, amount: 50, reason: 'referral_free', refUserId: id });
      referrer.updatedAt = now;
    }

    writeState(state);
    return publicWebUser(state.webUsers[String(id)]);
  }

  function ensureWebUserFromTelegram(profile = {}) {
    const state = readState();
    const telegramUserId = normalizeTelegramId(profile.id || profile.telegramUserId);
    if (!telegramUserId) throw new Error('INVALID_TELEGRAM_USER');

    const telegramUsername = normalizeTelegramUsername(profile.username || profile.telegramUsername);
    const displayName = buildTelegramDisplayName(profile);
    const now = nowIso();
    let row = Object.values(state.webUsers)
      .find((user) => normalizeTelegramId(user && user.telegramUserId) === telegramUserId) || null;

    if (row) {
      row.telegramUsername = telegramUsername || row.telegramUsername || null;
      if (!row.displayName && displayName) row.displayName = displayName;
      // Auto-fill firstName/lastName from TG profile if not yet set
      if (!row.firstName && profile.first_name) row.firstName = String(profile.first_name).trim().slice(0, 120);
      if (!row.lastName && profile.last_name) row.lastName = String(profile.last_name).trim().slice(0, 120);
      row.updatedAt = now;
      writeState(state);
      // Fire-and-forget TG photo + info sync to api
      try { require('./services/tg-photo-sync').syncTgProfile(telegramUserId); } catch (_) {}
      return publicWebUser(row);
    }

    const id = nextCounter(state, 'webUser');
    const referralCode = ensureUniqueReferralCode(state, `xh${id}${crypto.randomBytes(2).toString('hex')}`);
    const meta = ensureWebUserMeta(profile);
    row = {
      id,
      username: ensureUniqueUsername(state, deriveDefaultUsername({ telegramUsername }, id), id),
      usernameLockedAt: nowIso(),
      email: null,
      passwordHash: null,
      passwordSalt: null,
      displayName,
      firstName: profile.first_name ? String(profile.first_name).trim().slice(0, 120) : null,
      lastName: profile.last_name ? String(profile.last_name).trim().slice(0, 120) : null,
      telegramUserId,
      telegramUsername,
      userRole: meta.userRole,
      experienceLevel: meta.experienceLevel,
      focusAreas: meta.focusAreas,
      goalsSummary: meta.goalsSummary,
      city: meta.city,
      preferredContact: meta.preferredContact,
      onboardingCompletedAt: meta.onboardingCompletedAt,
      activeProtocolId: meta.activeProtocolId,
      savedProtocolIds: meta.savedProtocolIds,
      savedProductIds: meta.savedProductIds,
      savedContentIds: meta.savedContentIds,
      notificationSettings: meta.notificationSettings,
      profile: meta.profile,
      preferences: meta.preferences,
      onboarding: meta.onboarding,
      referralCode,
      referredByUserId: null,
      points: 0,
      referralsCount: 0,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null
    };

    state.webUsers[String(id)] = row;
    writeState(state);
    // Fire-and-forget TG photo + info sync to api
    try { require('./services/tg-photo-sync').syncTgProfile(telegramUserId); } catch (_) {}
    return publicWebUser(row);
  }

  function updateWebUserLogin(userId) {
    const state = readState();
    const id = String(normalizePositiveInt(userId));
    const row = state.webUsers[id];
    if (!row) return null;
    row.lastLoginAt = nowIso();
    row.updatedAt = row.lastLoginAt;
    writeState(state);
    return publicWebUser(row);
  }

  function setWebUserPassword(userId, passwordHash, passwordSalt) {
    const state = readState();
    const id = String(normalizePositiveInt(userId));
    const row = state.webUsers[id];
    if (!row) return null;
    const nextHash = String(passwordHash || '').trim().toLowerCase();
    const nextSalt = String(passwordSalt || '').trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(nextHash)) throw new Error('Invalid password hash');
    if (!/^[a-f0-9]{32,64}$/.test(nextSalt)) throw new Error('Invalid password salt');
    row.passwordHash = nextHash;
    row.passwordSalt = nextSalt;
    row.updatedAt = nowIso();
    writeState(state);
    return publicWebUser(row);
  }

  function createWebSession(userId, sessionTokenHash, options = {}) {
    const state = readState();
    const tokenHash = String(sessionTokenHash || '').trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(tokenHash)) throw new Error('Invalid session token hash');
    const id = makeId('sess', nextCounter(state, 'webSession'));
    const user = state.webUsers[String(normalizePositiveInt(userId))];
    if (!user) throw new Error('Unknown user');

    const now = nowIso();
    const expiresAt = options.expiresAt || new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
    state.webSessions[tokenHash] = {
      id,
      userId: user.id,
      tokenHash,
      ip: String(options.ip || '').trim() || null,
      userAgent: String(options.userAgent || '').trim() || null,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
      expiresAt,
      revokedAt: null
    };
    writeState(state);
    return publicSession(state.webSessions[tokenHash]);
  }

  function cleanupExpiredWebSessions(state) {
    const now = Date.now();
    let changed = false;
    for (const [tokenHash, session] of Object.entries(state.webSessions)) {
      const expiresAt = Date.parse(session && session.expiresAt ? session.expiresAt : '');
      const revokedAt = session && session.revokedAt ? Date.parse(session.revokedAt) : 0;
      const revokedExpired = revokedAt && Number.isFinite(revokedAt) && revokedAt < now - (30 * 24 * 60 * 60 * 1000);
      if ((Number.isFinite(expiresAt) && expiresAt <= now) || revokedExpired) {
        delete state.webSessions[tokenHash];
        changed = true;
      }
    }
    return changed;
  }

  function cleanupExpiredBotAuthRequests(state) {
    const now = Date.now();
    let changed = false;
    for (const [requestId, request] of Object.entries(state.webBotAuthRequests)) {
      const expiresAt = Date.parse(request && request.expiresAt ? request.expiresAt : '');
      const completedAt = Date.parse(request && request.completedAt ? request.completedAt : '');
      if ((Number.isFinite(expiresAt) && expiresAt <= now) || (Number.isFinite(completedAt) && completedAt <= now - (24 * 60 * 60 * 1000))) {
        delete state.webBotAuthRequests[requestId];
        changed = true;
      }
    }
    return changed;
  }

  function createMagicLink(tgId, profile = {}) {
    const state = readState();
    if (!state.webMagicLinks) state.webMagicLinks = {};
    const token = crypto.randomBytes(24).toString('base64url');
    const ttlMs = 15 * 60 * 1000;
    state.webMagicLinks[token] = {
      token,
      tgId: Number(tgId),
      profile: profile || {},
      createdAt: nowIso(),
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      usedAt: null,
    };
    writeState(state);
    return state.webMagicLinks[token];
  }

  function consumeMagicLink(token) {
    const state = readState();
    if (!state.webMagicLinks) return null;
    const row = state.webMagicLinks[String(token || '').trim()];
    if (!row) return null;
    if (row.usedAt) return null;
    if (new Date(row.expiresAt).getTime() < Date.now()) {
      delete state.webMagicLinks[token];
      writeState(state);
      return null;
    }
    row.usedAt = nowIso();
    writeState(state);
    return { tgId: row.tgId, profile: row.profile };
  }

  function createBotAuthRequest(options = {}) {
    const state = readState();
    cleanupExpiredBotAuthRequests(state);
    const requestId = crypto.randomBytes(18).toString('base64url');
    const now = nowIso();
    const expiresAt = new Date(Date.now() + (10 * 60 * 1000)).toISOString();

    state.webBotAuthRequests[requestId] = {
      requestId,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      expiresAt,
      completedAt: null,
      ip: String(options.ip || '').trim() || null,
      userAgent: String(options.userAgent || '').trim() || null,
      userId: null,
      telegramUserId: null
    };

    writeState(state);
    return {
      requestId,
      status: 'pending',
      expiresAt
    };
  }

  function getBotAuthRequest(requestId) {
    const state = readState();
    const changed = cleanupExpiredBotAuthRequests(state);
    const normalizedId = String(requestId || '').trim();
    const row = normalizedId ? state.webBotAuthRequests[normalizedId] : null;
    if (changed) writeState(state);
    if (!row) return null;
    return {
      requestId: row.requestId,
      status: row.status || 'pending',
      expiresAt: row.expiresAt || null,
      completedAt: row.completedAt || null,
      user: row.userId ? publicWebUser(state.webUsers[String(row.userId)]) : null
    };
  }

  function completeBotAuthRequest(requestId, profile = {}) {
    const state = readState();
    cleanupExpiredBotAuthRequests(state);
    const normalizedId = String(requestId || '').trim();
    const row = normalizedId ? state.webBotAuthRequests[normalizedId] : null;
    if (!row) {
      writeState(state);
      return { ok: false, reason: 'not_found' };
    }

    if (Date.parse(row.expiresAt || '') <= Date.now()) {
      delete state.webBotAuthRequests[normalizedId];
      writeState(state);
      return { ok: false, reason: 'expired' };
    }

    const telegramUserId = normalizeTelegramId(profile.id || profile.telegramUserId);
    if (!telegramUserId) {
      return { ok: false, reason: 'invalid_telegram_user' };
    }

    const telegramUsername = normalizeTelegramUsername(profile.username || profile.telegramUsername);
    const displayName = buildTelegramDisplayName(profile);
    const meta = ensureWebUserMeta(profile);
    let user = Object.values(state.webUsers)
      .find((candidate) => normalizeTelegramId(candidate && candidate.telegramUserId) === telegramUserId) || null;

    if (user) {
      user.telegramUsername = telegramUsername || user.telegramUsername || null;
      if (!user.displayName && displayName) user.displayName = displayName;
      if (!user.firstName && profile.first_name) user.firstName = String(profile.first_name).trim().slice(0, 120);
      if (!user.lastName && profile.last_name) user.lastName = String(profile.last_name).trim().slice(0, 120);
      if (!user.profile || typeof user.profile !== 'object') user.profile = meta.profile;
      if (!user.preferences || typeof user.preferences !== 'object') user.preferences = meta.preferences;
      if (!user.onboarding || typeof user.onboarding !== 'object') user.onboarding = meta.onboarding;
      user.updatedAt = nowIso();
    } else {
      const id = nextCounter(state, 'webUser');
      const referralCode = ensureUniqueReferralCode(state, `xh${id}${crypto.randomBytes(2).toString('hex')}`);
      user = {
        id,
        email: null,
        passwordHash: null,
        passwordSalt: null,
        displayName,
        firstName: profile.first_name ? String(profile.first_name).trim().slice(0, 120) : null,
        lastName: profile.last_name ? String(profile.last_name).trim().slice(0, 120) : null,
        telegramUserId,
        telegramUsername,
        userRole: meta.userRole,
        experienceLevel: meta.experienceLevel,
        focusAreas: meta.focusAreas,
        goalsSummary: meta.goalsSummary,
        city: meta.city,
        preferredContact: meta.preferredContact,
        onboardingCompletedAt: meta.onboardingCompletedAt,
        activeProtocolId: meta.activeProtocolId,
        savedProtocolIds: meta.savedProtocolIds,
        savedProductIds: meta.savedProductIds,
        savedContentIds: meta.savedContentIds,
        notificationSettings: meta.notificationSettings,
        profile: meta.profile,
        preferences: meta.preferences,
        onboarding: meta.onboarding,
        referralCode,
        referredByUserId: null,
        points: 0,
        referralsCount: 0,
        status: 'active',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        lastLoginAt: null
      };
      state.webUsers[String(id)] = user;
    }

    row.status = 'completed';
    row.completedAt = nowIso();
    row.updatedAt = row.completedAt;
    row.userId = user.id;
    row.telegramUserId = telegramUserId;

    writeState(state);
    return {
      ok: true,
      requestId: row.requestId,
      status: row.status,
      expiresAt: row.expiresAt,
      user: publicWebUser(user)
    };
  }

  function getWebSession(sessionTokenHash) {
    const state = readState();
    if (cleanupExpiredWebSessions(state)) writeState(state);

    const tokenHash = String(sessionTokenHash || '').trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(tokenHash)) return null;
    const session = state.webSessions[tokenHash];
    if (!session || session.revokedAt) return null;
    if (Date.parse(session.expiresAt) <= Date.now()) return null;
    const user = state.webUsers[String(session.userId)];
    if (!user || user.status !== 'active') return null;
    return {
      ...publicSession(session),
      user: publicWebUser(user)
    };
  }

  function touchWebSession(sessionId) {
    const state = readState();
    const now = nowIso();
    for (const session of Object.values(state.webSessions)) {
      if (session && session.id === sessionId) {
        session.lastSeenAt = now;
        session.updatedAt = now;
        writeState(state);
        return publicSession(session);
      }
    }
    return null;
  }

  function revokeWebSession(sessionTokenHash) {
    const state = readState();
    const tokenHash = String(sessionTokenHash || '').trim().toLowerCase();
    const session = state.webSessions[tokenHash];
    if (!session) return null;
    session.revokedAt = nowIso();
    session.updatedAt = session.revokedAt;
    writeState(state);
    return publicSession(session);
  }

  function revokeWebSessionsByUser(userId) {
    const state = readState();
    const id = normalizePositiveInt(userId);
    const now = nowIso();
    let revoked = 0;
    for (const session of Object.values(state.webSessions)) {
      if (session && normalizePositiveInt(session.userId) === id && !session.revokedAt) {
        session.revokedAt = now;
        session.updatedAt = now;
        revoked += 1;
      }
    }
    if (revoked) writeState(state);
    return revoked;
  }

  function pushNotificationState(state, userId, data = {}) {
    const ownerId = normalizePositiveInt(userId);
    if (!ownerId) return null;
    if (!state.webNotifications[String(ownerId)]) state.webNotifications[String(ownerId)] = [];
    const id = nextCounter(state, 'webNotification');
    const row = {
      id,
      userId: ownerId,
      kind: normalizeShortText(data.kind || 'system', 40) || 'system',
      title: normalizeShortText(data.title, 140) || 'Обновление в кабинете',
      message: normalizeLongText(data.message, 600) || null,
      actionView: normalizeShortText(data.actionView, 40),
      actionLabel: normalizeShortText(data.actionLabel, 80),
      actionUrl: normalizeShortText(data.actionUrl, 240),
      level: normalizeShortText(data.level || 'info', 20) || 'info',
      meta: data.meta && typeof data.meta === 'object' ? data.meta : {},
      readAt: null,
      createdAt: nowIso()
    };
    state.webNotifications[String(ownerId)].push(row);
    if (state.webNotifications[String(ownerId)].length > 120) {
      state.webNotifications[String(ownerId)] = state.webNotifications[String(ownerId)].slice(-120);
    }
    return publicNotification(row);
  }

  function pushActivityState(state, userId, data = {}) {
    const ownerId = normalizePositiveInt(userId);
    if (!ownerId) return null;
    if (!state.webActivityFeed[String(ownerId)]) state.webActivityFeed[String(ownerId)] = [];
    const row = {
      id: nextCounter(state, 'webActivity'),
      userId: ownerId,
      kind: normalizeShortText(data.kind || 'system', 40) || 'system',
      title: normalizeShortText(data.title, 140) || 'Portal activity',
      text: normalizeLongText(data.text, 600) || null,
      view: normalizeShortText(data.view || 'overview', 40) || 'overview',
      entityId: normalizeShortText(data.entityId, 120),
      meta: data.meta && typeof data.meta === 'object' ? data.meta : {},
      createdAt: nowIso()
    };
    state.webActivityFeed[String(ownerId)].push(row);
    if (state.webActivityFeed[String(ownerId)].length > 200) {
      state.webActivityFeed[String(ownerId)] = state.webActivityFeed[String(ownerId)].slice(-200);
    }
    return publicActivityItem(row);
  }

  function refreshProtocolProgress(state, userId, protocolTemplateId) {
    const ownerId = normalizePositiveInt(userId);
    const templateId = normalizeShortText(protocolTemplateId, 80);
    if (!ownerId || !templateId) return null;
    const tasks = (state.webTasks[String(ownerId)] || []).filter((item) => String(item.protocolId || '') === templateId);
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((item) => normalizeTaskStatus(item.status, 'todo') === 'done').length;
    const records = (state.webProtocols[String(ownerId)] || [])
      .filter((item) => String(item.templateId || '') === templateId)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const active = records.find((item) => item.status === 'active') || records[0] || null;
    if (!active) return null;
    active.totalTasks = totalTasks;
    active.completedTasks = completedTasks;
    active.progressPercent = computeProgressPercent(completedTasks, totalTasks);
    active.updatedAt = nowIso();
    if (totalTasks > 0 && completedTasks >= totalTasks && active.status === 'active') {
      active.status = 'completed';
      active.completedAt = active.completedAt || active.updatedAt;
    }
    return publicProtocolRecord(active);
  }

  function updateWebUserProfile(userId, data = {}) {
    const state = readState();
    const id = String(normalizePositiveInt(userId));
    const row = state.webUsers[id];
    if (!row) return null;
    const wasOnboardingCompleted = Boolean(row.onboardingCompletedAt);
    const nextMeta = ensureWebUserMeta({
      ...row,
      ...data,
      profile: {
        ...(row.profile && typeof row.profile === 'object' ? row.profile : {}),
        ...(data.profile && typeof data.profile === 'object' ? data.profile : {}),
        city: data.city !== undefined ? data.city : undefined
      },
      preferences: {
        ...(row.preferences && typeof row.preferences === 'object' ? row.preferences : {}),
        ...(data.preferences && typeof data.preferences === 'object' ? data.preferences : {}),
        preferredContact: data.preferredContact !== undefined ? data.preferredContact : undefined,
        notificationSettings: data.notificationSettings !== undefined ? data.notificationSettings : undefined
      },
      onboarding: {
        ...(row.onboarding && typeof row.onboarding === 'object' ? row.onboarding : {}),
        ...(data.onboarding && typeof data.onboarding === 'object' ? data.onboarding : {}),
        focusAreas: data.focusAreas !== undefined ? data.focusAreas : undefined,
        goalsSummary: data.goalsSummary !== undefined ? data.goalsSummary : undefined,
        experienceLevel: data.experienceLevel !== undefined ? data.experienceLevel : undefined
      },
      focusAreas: data.focusAreas !== undefined ? data.focusAreas : row.focusAreas,
      savedProtocolIds: data.savedProtocolIds !== undefined ? data.savedProtocolIds : row.savedProtocolIds,
      savedProductIds: data.savedProductIds !== undefined ? data.savedProductIds : row.savedProductIds,
      savedContentIds: data.savedContentIds !== undefined ? data.savedContentIds : row.savedContentIds,
      notificationSettings: data.notificationSettings !== undefined ? data.notificationSettings : row.notificationSettings
    });

    if (data.email !== undefined) {
      const nextEmail = normalizeEmail(data.email);
      if (nextEmail) {
        const duplicate = Object.values(state.webUsers).find((user) => (
          user
          && String(user.id) !== id
          && user.email === nextEmail
        ));
        if (duplicate) throw new Error('EMAIL_EXISTS');
        row.email = nextEmail;
      }
    }
    row.displayName = normalizeDisplayName(data.displayName !== undefined ? data.displayName : row.displayName) || row.displayName || null;
    row.userRole = nextMeta.userRole;
    row.experienceLevel = nextMeta.experienceLevel;
    row.focusAreas = nextMeta.focusAreas;
    row.goalsSummary = nextMeta.goalsSummary;
    row.city = nextMeta.city;
    row.preferredContact = nextMeta.preferredContact;
    row.onboardingCompletedAt = data.completeOnboarding
      ? (row.onboardingCompletedAt || nowIso())
      : nextMeta.onboardingCompletedAt;
    row.activeProtocolId = nextMeta.activeProtocolId;
    row.savedProtocolIds = nextMeta.savedProtocolIds;
    row.savedProductIds = nextMeta.savedProductIds;
    row.savedContentIds = nextMeta.savedContentIds;
    row.notificationSettings = nextMeta.notificationSettings;
    if (data.trendexRefLink !== undefined) row.trendexRefLink = String(data.trendexRefLink || '').trim() || null;
    row.profile = nextMeta.profile;
    row.preferences = nextMeta.preferences;
    row.onboarding = {
      ...nextMeta.onboarding,
      completedAt: data.completeOnboarding
        ? (row.onboardingCompletedAt || nowIso())
        : nextMeta.onboarding.completedAt
    };
    row.updatedAt = nowIso();
    pushActivityState(state, row.id, {
      kind: 'profile',
      title: 'Profile updated',
      text: row.displayName || row.email || `user_${row.id}`,
      view: 'profile',
      entityId: `profile_${row.id}`,
    });
    if (!wasOnboardingCompleted && row.onboardingCompletedAt) {
      pushNotificationState(state, row.id, {
        kind: 'onboarding',
        title: 'Кабинет готов к запуску',
        message: 'Рабочее пространство собрано. Можно открывать сценарии и материалы.',
        actionView: 'roadmap',
        actionLabel: 'Открыть сценарии',
        level: 'success',
      });
      pushActivityState(state, row.id, {
        kind: 'onboarding',
        title: 'Кабинет готов к запуску',
        text: 'Настройка кабинета завершена.',
        view: 'roadmap',
        entityId: `profile_${row.id}`,
      });
    }
    writeState(state);
    return publicWebUser(row);
  }

  function getSavedCollections(userId) {
    const user = findWebUserById(userId);
    const meta = ensureWebUserMeta(user || {});
    return {
      protocolIds: meta.savedProtocolIds,
      productIds: meta.savedProductIds,
      contentIds: meta.savedContentIds
    };
  }

  function toggleSavedItem(userId, kind, itemId) {
    const state = readState();
    const id = String(normalizePositiveInt(userId));
    const row = state.webUsers[id];
    if (!row) return null;
    const normalizedKind = String(kind || '').trim().toLowerCase();
    const normalizedItemId = normalizeShortText(itemId, 120);
    if (!normalizedItemId) return null;

    const fieldName = normalizedKind === 'product'
      ? 'savedProductIds'
      : normalizedKind === 'content'
        ? 'savedContentIds'
        : normalizedKind === 'protocol'
          ? 'savedProtocolIds'
          : '';
    if (!fieldName) return null;
    if (!state.webFavorites[id]) state.webFavorites[id] = [];

    const current = normalizeStringArray(row[fieldName], { maxItems: 50, maxLength: 80 });
    const idx = current.indexOf(normalizedItemId);
    const existingFavoriteIndex = state.webFavorites[id]
      .findIndex((item) => item && item.kind === normalizedKind && item.itemId === normalizedItemId);
    let saved = false;
    if (idx >= 0) {
      current.splice(idx, 1);
      if (existingFavoriteIndex >= 0) state.webFavorites[id].splice(existingFavoriteIndex, 1);
    } else {
      current.unshift(normalizedItemId);
      saved = true;
      if (existingFavoriteIndex < 0) {
        state.webFavorites[id].unshift({
          id: nextCounter(state, 'webFavorite'),
          userId: row.id,
          kind: normalizedKind,
          itemId: normalizedItemId,
          title: null,
          summary: null,
          url: null,
          meta: {},
          createdAt: nowIso(),
          updatedAt: nowIso()
        });
      }
    }
    row[fieldName] = current.slice(0, 50);
    row.updatedAt = nowIso();

    if (saved) {
      pushNotificationState(state, row.id, {
        kind: 'saved',
        title: 'Добавлено в личную подборку',
        message: `Элемент "${normalizedItemId}" сохранен в кабинете.`,
        actionView: normalizedKind === 'product' ? 'products' : normalizedKind === 'protocol' ? 'roadmap' : 'content',
        actionLabel: 'Открыть'
      });
    }

    pushActivityState(state, row.id, {
      kind: 'favorite',
      title: saved ? 'Item saved' : 'Item removed from favorites',
      text: `${normalizedKind}:${normalizedItemId}`,
      view: normalizedKind === 'product' ? 'products' : normalizedKind === 'protocol' ? 'roadmap' : 'content',
      entityId: normalizedItemId,
    });
    writeState(state);
    return {
      saved,
      kind: normalizedKind,
      itemId: normalizedItemId,
      collections: getSavedCollections(row.id)
    };
  }

  function listFavorites(userId, limit = 100, kind) {
    const state = readState();
    const ownerId = normalizePositiveInt(userId);
    const normalizedKind = normalizeShortText(kind, 20);
    const items = (state.webFavorites[String(ownerId)] || [])
      .filter((item) => !normalizedKind || item.kind === normalizedKind)
      .slice()
      .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
      .slice(0, Math.max(1, Math.min(300, Number(limit) || 100)))
      .map(publicFavorite);
    if (items.length) return items;

    const collections = getSavedCollections(ownerId);
    return []
      .concat((collections.protocolIds || []).map((itemId, index) => publicFavorite({ id: index + 1, userId: ownerId, kind: 'protocol', itemId })))
      .concat((collections.productIds || []).map((itemId, index) => publicFavorite({ id: index + 1001, userId: ownerId, kind: 'product', itemId })))
      .concat((collections.contentIds || []).map((itemId, index) => publicFavorite({ id: index + 2001, userId: ownerId, kind: 'content', itemId })))
      .filter((item) => !normalizedKind || item.kind === normalizedKind)
      .slice(0, Math.max(1, Math.min(300, Number(limit) || 100)));
  }

  function saveFavorite(userId, data = {}) {
    const ownerId = String(normalizePositiveInt(userId));
    const normalizedKind = String(data.kind || '').trim().toLowerCase();
    const normalizedItemId = normalizeShortText(data.itemId, 120);
    if (!normalizedKind || !normalizedItemId) return null;
    const existing = listFavorites(userId, 500, normalizedKind)
      .find((item) => item.itemId === normalizedItemId);
    if (!existing) {
      const toggled = toggleSavedItem(userId, normalizedKind, normalizedItemId);
      if (!toggled || !toggled.saved) return null;
    }
    const state = readState();
    if (!state.webFavorites[ownerId]) state.webFavorites[ownerId] = [];
    let row = state.webFavorites[ownerId]
      .find((item) => item.kind === normalizedKind && item.itemId === normalizedItemId) || null;
    if (!row) {
      row = {
        id: nextCounter(state, 'webFavorite'),
        userId: normalizePositiveInt(userId),
        kind: normalizedKind,
        itemId: normalizedItemId,
        title: null,
        summary: null,
        url: null,
        meta: {},
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      state.webFavorites[ownerId].unshift(row);
    }
    row.title = normalizeShortText(data.title, 140) || row.title || null;
    row.summary = normalizeLongText(data.summary, 400) || row.summary || null;
    row.url = normalizeShortText(data.url, 240) || row.url || null;
    row.meta = data.meta && typeof data.meta === 'object' ? data.meta : row.meta || {};
    row.updatedAt = nowIso();
    writeState(state);
    return publicFavorite(row);
  }

  function removeFavorite(userId, kind, itemId) {
    const state = readState();
    const ownerId = String(normalizePositiveInt(userId));
    const row = state.webUsers[ownerId];
    if (!row) return null;
    const normalizedKind = String(kind || '').trim().toLowerCase();
    const normalizedItemId = normalizeShortText(itemId, 120);
    if (!normalizedItemId) return null;
    const fieldName = normalizedKind === 'product'
      ? 'savedProductIds'
      : normalizedKind === 'content'
        ? 'savedContentIds'
        : normalizedKind === 'protocol'
          ? 'savedProtocolIds'
          : '';
    if (!fieldName) return null;

    row[fieldName] = normalizeStringArray(row[fieldName], { maxItems: 50, maxLength: 80 })
      .filter((item) => item !== normalizedItemId);
    if (state.webFavorites[ownerId]) {
      state.webFavorites[ownerId] = state.webFavorites[ownerId]
        .filter((item) => !(item.kind === normalizedKind && item.itemId === normalizedItemId));
    }
    row.updatedAt = nowIso();
    pushActivityState(state, row.id, {
      kind: 'favorite',
      title: 'Item removed from favorites',
      text: `${normalizedKind}:${normalizedItemId}`,
      view: normalizedKind === 'product' ? 'products' : normalizedKind === 'protocol' ? 'roadmap' : 'content',
      entityId: normalizedItemId,
    });
    writeState(state);
    return {
      ok: true,
      kind: normalizedKind,
      itemId: normalizedItemId
    };
  }

  function listTasks(userId, limit = 200) {
    const state = readState();
    const ownerId = normalizePositiveInt(userId);
    return (state.webTasks[String(ownerId)] || [])
      .slice()
      .sort((a, b) => {
        if (normalizeTaskStatus(a.status || 'todo') !== normalizeTaskStatus(b.status || 'todo')) {
          return normalizeTaskStatus(a.status || 'todo') === 'done' ? 1 : -1;
        }
        return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
      })
      .slice(0, Math.max(1, Math.min(500, Number(limit) || 200)))
      .map(publicTask);
  }

  function upsertTask(userId, data = {}) {
    const state = readState();
    const ownerId = normalizePositiveInt(userId);
    const user = state.webUsers[String(ownerId)];
    if (!user) throw new Error('Unknown user');
    if (!state.webTasks[String(ownerId)]) state.webTasks[String(ownerId)] = [];

    const taskId = normalizePositiveInt(data.id);
    const now = nowIso();
    let row = taskId
      ? state.webTasks[String(ownerId)].find((item) => normalizePositiveInt(item.id) === taskId) || null
      : null;

    if (!row) {
      row = {
        id: nextCounter(state, 'webTask'),
        userId: ownerId,
        title: normalizeShortText(data.title, 120) || 'Новая задача',
        description: normalizeLongText(data.description, 400),
        category: normalizeShortText(data.category || 'general', 40) || 'general',
        status: normalizeTaskStatus(data.status || 'todo', 'todo'),
        priority: normalizeShortText(data.priority || 'medium', 20) || 'medium',
        dueAt: data.dueAt || null,
        protocolId: normalizeShortText(data.protocolId, 80),
        phaseId: normalizeShortText(data.phaseId, 80),
        source: normalizeShortText(data.source || 'custom', 40) || 'custom',
        tags: normalizeStringArray(data.tags, { maxItems: 20, maxLength: 40 }),
        notes: normalizeLongText(data.notes, 400),
        completedAt: null,
        createdAt: now,
        updatedAt: now
      };
      if (row.status === 'done') row.completedAt = now;
      state.webTasks[String(ownerId)].push(row);
      pushActivityState(state, ownerId, {
        kind: 'task',
        title: 'Task created',
        text: row.title,
        view: 'planner',
        entityId: String(row.id),
      });
      pushNotificationState(state, ownerId, {
        kind: 'task',
        title: 'Новая задача в планировщике',
        message: row.title,
        actionView: 'planner',
        actionLabel: 'Открыть'
      });
    } else {
      row.title = normalizeShortText(data.title !== undefined ? data.title : row.title, 120) || row.title;
      row.description = normalizeLongText(data.description !== undefined ? data.description : row.description, 400);
      row.category = normalizeShortText(data.category !== undefined ? data.category : row.category, 40) || row.category || 'general';
      row.priority = normalizeShortText(data.priority !== undefined ? data.priority : row.priority, 20) || row.priority || 'medium';
      row.dueAt = data.dueAt !== undefined ? (data.dueAt || null) : row.dueAt || null;
      row.phaseId = normalizeShortText(data.phaseId !== undefined ? data.phaseId : row.phaseId, 80);
      row.tags = normalizeStringArray(data.tags !== undefined ? data.tags : row.tags, { maxItems: 20, maxLength: 40 });
      row.notes = normalizeLongText(data.notes !== undefined ? data.notes : row.notes, 400);
      if (data.status !== undefined) {
        row.status = normalizeTaskStatus(data.status, row.status || 'todo');
      }
      if (data.completed !== undefined) {
        row.status = Boolean(data.completed) ? 'done' : 'todo';
      }
      row.completedAt = row.status === 'done' ? (row.completedAt || now) : null;
      row.updatedAt = now;
    }

    if (row.protocolId) refreshProtocolProgress(state, ownerId, row.protocolId);
    writeState(state);
    return publicTask(row);
  }

  function toggleTask(userId, taskId, completed) {
    const state = readState();
    const ownerId = normalizePositiveInt(userId);
    const id = normalizePositiveInt(taskId);
    const row = (state.webTasks[String(ownerId)] || []).find((item) => normalizePositiveInt(item.id) === id) || null;
    if (!row) return null;
    const nextCompleted = completed === undefined ? normalizeTaskStatus(row.status, 'todo') !== 'done' : Boolean(completed);
    row.status = nextCompleted ? 'done' : 'todo';
    row.completedAt = nextCompleted ? nowIso() : null;
    row.updatedAt = nowIso();
    if (nextCompleted) {
      pushNotificationState(state, ownerId, {
        kind: 'task',
        title: 'Задача выполнена',
        message: row.title,
        actionView: 'planner',
        actionLabel: 'Планировщик'
      });
    }
    pushActivityState(state, ownerId, {
      kind: 'task',
      title: nextCompleted ? 'Task completed' : 'Task reopened',
      text: row.title,
      view: 'planner',
      entityId: String(row.id),
    });
    if (row.protocolId) refreshProtocolProgress(state, ownerId, row.protocolId);
    writeState(state);
    return publicTask(row);
  }

  function activateProtocol(userId, protocol = {}) {
    const state = readState();
    const ownerId = normalizePositiveInt(userId);
    const row = state.webUsers[String(ownerId)];
    if (!row) throw new Error('Unknown user');
    const protocolId = normalizeShortText(protocol.id, 80);
    if (!protocolId) throw new Error('Invalid protocol');

    const meta = ensureWebUserMeta(row);
    const now = nowIso();
    row.activeProtocolId = protocolId;
    row.savedProtocolIds = [protocolId, ...meta.savedProtocolIds.filter((item) => item !== protocolId)].slice(0, 20);
    row.onboardingCompletedAt = row.onboardingCompletedAt || now;
    row.onboarding = {
      ...(meta.onboarding || {}),
      status: 'completed',
      completedAt: row.onboardingCompletedAt
    };
    row.updatedAt = now;

    if (!state.webProtocols[String(ownerId)]) state.webProtocols[String(ownerId)] = [];
    const existingActiveProtocol = state.webProtocols[String(ownerId)]
      .find((item) => item.templateId === protocolId && item.status === 'active');
    if (!existingActiveProtocol) {
      state.webProtocols[String(ownerId)].unshift({
        id: nextCounter(state, 'webProtocol'),
        userId: ownerId,
        templateId: protocolId,
        title: normalizeShortText(protocol.title, 160) || protocolId,
        summary: normalizeLongText(protocol.summary, 600),
        status: 'active',
        currentPhaseId: Array.isArray(protocol.phases) && protocol.phases[0] ? protocol.phases[0].id || null : null,
        progressPercent: 0,
        completedTasks: 0,
        totalTasks: 0,
        durationDays: Number(protocol.durationDays || 0),
        intensity: normalizeShortText(protocol.intensity || protocol.audience, 40),
        goals: normalizeStringArray(protocol.goals || protocol.outcomes, { maxItems: 12, maxLength: 80 }),
        productIds: normalizeStringArray(protocol.recommendedProductIds || protocol.productIds, { maxItems: 20, maxLength: 80 }),
        contentIds: normalizeStringArray(protocol.contentItemIds, { maxItems: 20, maxLength: 80 }),
        phases: Array.isArray(protocol.phases) ? protocol.phases : [],
        notes: null,
        activatedAt: now,
        completedAt: null,
        createdAt: now,
        updatedAt: now
      });
    }

    if (!state.webTasks[String(ownerId)]) state.webTasks[String(ownerId)] = [];
    const existingTitles = new Set(
      state.webTasks[String(ownerId)]
        .filter((item) => item.protocolId === protocolId)
        .map((item) => String(item.title || '').trim().toLowerCase())
    );

    const taskBlueprints = Array.isArray(protocol.taskBlueprints) && protocol.taskBlueprints.length
      ? protocol.taskBlueprints
      : Array.isArray(protocol.tasks)
        ? protocol.tasks
        : [];

    for (const task of taskBlueprints) {
      const title = normalizeShortText(task && task.title, 120);
      if (!title || existingTitles.has(title.toLowerCase())) continue;
      const relativeDay = Number(task && task.relativeDay);
      let dueAt = task && task.dueAt ? task.dueAt : null;
      if (!dueAt && Number.isFinite(relativeDay)) {
        dueAt = new Date(Date.now() + (relativeDay * 24 * 60 * 60 * 1000)).toISOString();
      }
      state.webTasks[String(ownerId)].push({
        id: nextCounter(state, 'webTask'),
        userId: ownerId,
        title,
        description: normalizeLongText(task.description || task.note, 400),
        category: normalizeShortText(task.category || 'protocol', 40) || 'protocol',
        status: normalizeTaskStatus(task.status || 'todo', 'todo'),
        priority: normalizeShortText(task.priority || 'medium', 20) || 'medium',
        dueAt,
        protocolId,
        phaseId: normalizeShortText(task.phaseId, 80),
        source: 'protocol',
        tags: normalizeStringArray(task.tags, { maxItems: 20, maxLength: 40 }),
        notes: normalizeLongText(task.notes, 400),
        completedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso()
      });
      existingTitles.add(title.toLowerCase());
    }

    pushNotificationState(state, ownerId, {
      kind: 'protocol',
      title: 'Активирован новый сценарий',
      message: normalizeShortText(protocol.title, 140) || protocolId,
      actionView: 'roadmap',
      actionLabel: 'Открыть сценарий'
    });

    refreshProtocolProgress(state, ownerId, protocolId);
    pushActivityState(state, ownerId, {
      kind: 'protocol',
      title: 'Protocol activated',
      text: normalizeShortText(protocol.title, 140) || protocolId,
      view: 'roadmap',
      entityId: protocolId,
    });
    writeState(state);
    return publicWebUser(row);
  }

  function listProtocolRecords(userId, limit = 100) {
    const state = readState();
    const ownerId = normalizePositiveInt(userId);
    return (state.webProtocols[String(ownerId)] || [])
      .slice()
      .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
      .slice(0, Math.max(1, Math.min(300, Number(limit) || 100)))
      .map(publicProtocolRecord);
  }

  function updateProtocolRecord(userId, protocolRecordId, data = {}) {
    const state = readState();
    const ownerId = normalizePositiveInt(userId);
    const targetId = normalizePositiveInt(protocolRecordId);
    const protocolKey = normalizeShortText(protocolRecordId, 80);
    const row = (state.webProtocols[String(ownerId)] || [])
      .find((item) => normalizePositiveInt(item.id) === targetId || item.templateId === protocolKey) || null;
    if (!row) return null;
    if (data.status !== undefined) row.status = normalizeShortText(data.status, 20) || row.status || 'active';
    if (data.currentPhaseId !== undefined) row.currentPhaseId = normalizeShortText(data.currentPhaseId, 80);
    if (data.notes !== undefined) row.notes = normalizeLongText(data.notes, 800);
    if (data.title !== undefined) row.title = normalizeShortText(data.title, 160) || row.title;
    if (data.completed === true) {
      row.status = 'completed';
      row.completedAt = row.completedAt || nowIso();
    }
    row.updatedAt = nowIso();
    pushActivityState(state, ownerId, {
      kind: 'protocol',
      title: 'Protocol updated',
      text: row.title,
      view: 'roadmap',
      entityId: row.templateId || String(row.id),
    });
    writeState(state);
    return publicProtocolRecord(row);
  }

  function createSupportRequest(userId, data = {}) {
    const state = readState();
    const ownerId = normalizePositiveInt(userId);
    const user = state.webUsers[String(ownerId)];
    if (!user) throw new Error('Unknown user');
    const subject = normalizeShortText(data.subject || data.topic || 'Новый запрос', 140);
    const message = normalizeLongText(data.message, 1600);
    if (!message) throw new Error('EMPTY_MESSAGE');
    const now = nowIso();
    const initialMessage = {
      id: makeId('smsg', nextCounter(state, 'webSupportMessage')),
      role: 'member',
      author: 'member',
      message,
      createdAt: now
    };
    const row = {
      id: nextCounter(state, 'webSupportRequest'),
      userId: ownerId,
      topic: normalizeShortText(data.topic || 'general', 40) || 'general',
      subject,
      message,
      status: 'open',
      priority: normalizeShortText(data.priority || 'normal', 20) || 'normal',
      preferredContact: normalizeShortText(data.preferredContact || user.preferredContact || 'telegram', 40) || 'telegram',
      messages: [initialMessage],
      createdAt: now,
      updatedAt: now
    };
    if (!state.webSupportRequests[String(ownerId)]) state.webSupportRequests[String(ownerId)] = [];
    state.webSupportRequests[String(ownerId)].push(row);
    pushNotificationState(state, ownerId, {
      kind: 'support',
      title: 'Запрос в поддержку отправлен',
      message: subject,
      actionView: 'support',
      actionLabel: 'Открыть поддержку'
    });
    pushActivityState(state, ownerId, {
      kind: 'support',
      title: 'Support request created',
      text: subject,
      view: 'support',
      entityId: String(row.id),
    });
    writeState(state);
    return publicSupportRequest(row);
  }

  function listSupportRequests(userId, limit = 100) {
    const state = readState();
    const ownerId = normalizePositiveInt(userId);
    return (state.webSupportRequests[String(ownerId)] || [])
      .slice()
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, Math.max(1, Math.min(300, Number(limit) || 100)))
      .map(publicSupportRequest);
  }

  function appendSupportRequestMessage(userId, supportRequestId, data = {}) {
    const state = readState();
    const ownerId = normalizePositiveInt(userId);
    const requestId = normalizePositiveInt(supportRequestId);
    const row = (state.webSupportRequests[String(ownerId)] || [])
      .find((item) => normalizePositiveInt(item.id) === requestId) || null;
    if (!row) return null;
    const message = normalizeLongText(data.message, 1600);
    if (!message) throw new Error('EMPTY_MESSAGE');
    if (!Array.isArray(row.messages)) row.messages = [];
    row.messages.push({
      id: makeId('smsg', nextCounter(state, 'webSupportMessage')),
      role: normalizeShortText(data.role || 'member', 20) || 'member',
      author: normalizeShortText(data.author || data.role || 'member', 40) || 'member',
      message,
      createdAt: nowIso()
    });
    row.message = message;
    row.updatedAt = nowIso();
    pushActivityState(state, ownerId, {
      kind: 'support',
      title: 'Support thread updated',
      text: row.subject || message,
      view: 'support',
      entityId: String(row.id),
    });
    writeState(state);
    return publicSupportRequest(row);
  }

  function normalizeVideoKey(value) {
    const text = String(value || '').trim();
    return text ? text.slice(0, 160) : '';
  }

  function publicVideoComment(row) {
    if (!row || typeof row !== 'object') return null;
    return {
      id: row.id,
      author: row.author || 'Партнёр',
      message: row.message || '',
      createdAt: row.createdAt || null,
    };
  }

  function listVideoComments(videoId, limit = 80) {
    const state = readState();
    const key = normalizeVideoKey(videoId);
    if (!key) return [];
    const items = (state.webVideoComments[key] || [])
      .slice()
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, Math.max(1, Math.min(200, Number(limit) || 80)))
      .map(publicVideoComment)
      .filter(Boolean);
    return items;
  }

  function addVideoComment(userId, videoId, data = {}) {
    const state = readState();
    const ownerId = normalizePositiveInt(userId);
    const key = normalizeVideoKey(videoId);
    if (!ownerId || !key) return null;
    const user = state.webUsers[String(ownerId)];
    if (!user) throw new Error('Unknown user');
    const message = normalizeLongText(data.message, 1200);
    if (!message) throw new Error('EMPTY_MESSAGE');
    const author = normalizeDisplayName(data.author || user.displayName || user.email || 'Партнёр') || 'Партнёр';
    const now = nowIso();
    const comment = {
      id: makeId('vmsg', nextCounter(state, 'webVideoComment')),
      userId: ownerId,
      author,
      message,
      createdAt: now,
    };
    if (!state.webVideoComments[key]) state.webVideoComments[key] = [];
    state.webVideoComments[key].push(comment);
    if (state.webVideoComments[key].length > 500) {
      state.webVideoComments[key] = state.webVideoComments[key].slice(-500);
    }
    writeState(state);
    return publicVideoComment(comment);
  }

  function buildVideoReactionSummary(row, userId) {
    const users = row && typeof row.users === 'object' ? row.users : {};
    let likes = 0;
    let dislikes = 0;
    Object.values(users).forEach((value) => {
      if (value === 'like') likes += 1;
      if (value === 'dislike') dislikes += 1;
    });
    const userReaction = userId ? (users[String(userId)] || null) : null;
    return { likes, dislikes, userReaction };
  }

  function getVideoReactions(videoId, userId = null) {
    const state = readState();
    const key = normalizeVideoKey(videoId);
    if (!key) return null;
    const row = state.webVideoReactions[key] || { users: {} };
    return buildVideoReactionSummary(row, userId);
  }

  function setVideoReaction(userId, videoId, reaction) {
    const state = readState();
    const ownerId = normalizePositiveInt(userId);
    const key = normalizeVideoKey(videoId);
    if (!ownerId || !key) return null;
    const user = state.webUsers[String(ownerId)];
    if (!user) throw new Error('Unknown user');
    const normalized = String(reaction || '').trim().toLowerCase();
    const value = normalized === 'like' || normalized === 'dislike' ? normalized : null;
    if (!state.webVideoReactions[key] || typeof state.webVideoReactions[key] !== 'object') {
      state.webVideoReactions[key] = { users: {}, updatedAt: nowIso() };
    }
    const row = state.webVideoReactions[key];
    if (!row.users || typeof row.users !== 'object') row.users = {};
    if (value) {
      row.users[String(ownerId)] = value;
    } else {
      delete row.users[String(ownerId)];
    }
    row.updatedAt = nowIso();
    writeState(state);
    return buildVideoReactionSummary(row, ownerId);
  }

  function listNotifications(userId, limit = 100) {
    const state = readState();
    const ownerId = normalizePositiveInt(userId);
    return (state.webNotifications[String(ownerId)] || [])
      .slice()
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, Math.max(1, Math.min(300, Number(limit) || 100)))
      .map(publicNotification);
  }

  function markNotificationRead(userId, notificationId) {
    const state = readState();
    const ownerId = normalizePositiveInt(userId);
    const id = normalizePositiveInt(notificationId);
    const row = (state.webNotifications[String(ownerId)] || []).find((item) => normalizePositiveInt(item.id) === id) || null;
    if (!row) return null;
    row.readAt = row.readAt || nowIso();
    writeState(state);
    return publicNotification(row);
  }

  function markAllNotificationsRead(userId) {
    const state = readState();
    const ownerId = normalizePositiveInt(userId);
    let updated = 0;
    for (const row of state.webNotifications[String(ownerId)] || []) {
      if (!row.readAt) {
        row.readAt = nowIso();
        updated += 1;
      }
    }
    if (updated) writeState(state);
    return updated;
  }

  function listActivityFeed(userId, limit = 100) {
    const state = readState();
    const ownerId = normalizePositiveInt(userId);
    return (state.webActivityFeed[String(ownerId)] || [])
      .slice()
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, Math.max(1, Math.min(300, Number(limit) || 100)))
      .map(publicActivityItem);
  }

  function createOrder(userId, data = {}) {
    const state = readState();
    const id = nextCounter(state, 'webOrder');
    const ownerId = normalizePositiveInt(userId);
    const user = state.webUsers[String(ownerId)];
    if (!user) throw new Error('Unknown user');

    const now = nowIso();
    const quantity = Number.isFinite(Number(data.quantity)) ? Math.max(1, Math.floor(Number(data.quantity))) : 1;
    const unitPrice = normalizeAmount(data.unitPrice || data.price || 0);
    const total = normalizeAmount(data.total || (unitPrice * quantity));
    state.webOrders[String(id)] = {
      id,
      userId: ownerId,
      productId: String(data.productId || '').trim() || null,
      productName: String(data.productName || '').trim() || null,
      quantity,
      unitPrice,
      total,
      currency: String(data.currency || 'USD').trim().toUpperCase(),
      status: String(data.status || 'created').trim().toLowerCase(),
      note: String(data.note || '').trim() || null,
      meta: data.meta && typeof data.meta === 'object' ? data.meta : {},
      createdAt: now,
      updatedAt: now
    };
    pushNotificationState(state, ownerId, {
      kind: 'order',
      title: 'Новая заявка на продукт',
      message: state.webOrders[String(id)].productName || state.webOrders[String(id)].productId || 'Заявка создана',
      actionView: 'products',
      actionLabel: 'Открыть каталог'
    });
    writeState(state);
    return publicOrder(state.webOrders[String(id)]);
  }

  function listOrders(userId, limit = 100) {
    const state = readState();
    const ownerId = normalizePositiveInt(userId);
    return Object.values(state.webOrders)
      .filter((order) => normalizePositiveInt(order.userId) === ownerId)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, Math.max(1, Math.min(500, Number(limit) || 100)))
      .map(publicOrder);
  }

  function createWithdrawal(userId, data = {}) {
    const state = readState();
    const id = nextCounter(state, 'webWithdrawal');
    const ownerId = normalizePositiveInt(userId);
    const user = state.webUsers[String(ownerId)];
    if (!user) throw new Error('Unknown user');

    const now = nowIso();
    const amount = normalizeAmount(data.amount || data.amountUsd);
    if (!amount) throw new Error('Invalid amount');
    state.webWithdrawals[String(id)] = {
      id,
      userId: ownerId,
      amount,
      method: String(data.method || 'bank_card').trim().toLowerCase(),
      payoutDetails: String(data.payoutDetails || '').trim() || null,
      note: String(data.note || '').trim() || null,
      status: String(data.status || 'pending').trim().toLowerCase(),
      createdAt: now,
      updatedAt: now
    };
    pushNotificationState(state, ownerId, {
      kind: 'withdrawal',
      title: 'Заявка на вывод отправлена',
      message: `${amount} RUB`,
      actionView: 'withdrawals',
      actionLabel: 'Открыть вывод'
    });
    writeState(state);
    return publicWithdrawal(state.webWithdrawals[String(id)]);
  }

  function listMediaLibraryEntries(limit = 300) {
    const state = readState();
    return (Array.isArray(state.mediaLibraryEntries) ? state.mediaLibraryEntries : [])
      .filter((item) => item && String(item.status || 'active') !== 'deleted')
      .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
      .slice(0, Math.max(1, Math.min(1000, Number(limit) || 300)))
      .map(publicMediaLibraryEntry);
  }

  function listLeadDeskEntries(userId, limit = 120) {
    const state = readState();
    const ownerId = normalizePositiveInt(userId);
    const bucket = getLeadDeskBucket(state, ownerId, false);
    if (!bucket) return [];
    return Object.values(bucket)
      .filter(Boolean)
      .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
      .slice(0, Math.max(1, Math.min(400, Number(limit) || 120)))
      .map(publicLeadDeskEntry);
  }

  function upsertLeadDeskEntry(userId, visitorId, data = {}) {
    const state = readState();
    const ownerId = normalizePositiveInt(userId);
    const normalizedVisitorId = normalizeVisitorId(visitorId);
    const user = state.webUsers[String(ownerId)];
    if (!user) throw new Error('Unknown user');
    if (!normalizedVisitorId) throw new Error('LEAD_VISITOR_REQUIRED');
    if (!state.marketingVisitors[normalizedVisitorId]) throw new Error('LEAD_NOT_FOUND');

    const bucket = getLeadDeskBucket(state, ownerId, true);
    const existing = bucket[normalizedVisitorId] || null;
    const now = nowIso();
    const row = existing || {
      visitorId: normalizedVisitorId,
      ownerUserId: ownerId,
      createdAt: now,
    };

    row.stageOverride = normalizeLeadStageId(data.stageOverride || data.stageId);
    row.note = normalizeLongText(data.note, 2000);
    row.ownerTag = normalizeShortText(data.ownerTag || data.tag, 60);
    row.followUpAt = normalizeDateTime(data.followUpAt);
    row.pinned = normalizeBoolean(data.pinned, false);
    row.updatedAt = now;

    bucket[normalizedVisitorId] = row;

    pushActivityState(state, ownerId, {
      kind: 'lead_desk',
      title: existing ? 'Lead desk updated' : 'Lead desk entry created',
      text: row.ownerTag || normalizedVisitorId,
      view: 'rating',
      entityId: normalizedVisitorId,
    });

    writeState(state);
    return publicLeadDeskEntry(row);
  }

  function removeLeadDeskEntry(userId, visitorId) {
    const state = readState();
    const ownerId = normalizePositiveInt(userId);
    const normalizedVisitorId = normalizeVisitorId(visitorId);
    const bucket = getLeadDeskBucket(state, ownerId, false);
    if (!bucket || !normalizedVisitorId || !bucket[normalizedVisitorId]) return null;
    const removed = bucket[normalizedVisitorId];
    delete bucket[normalizedVisitorId];
    if (!Object.keys(bucket).length) {
      delete state.webLeadDesk[String(ownerId)];
    }
    pushActivityState(state, ownerId, {
      kind: 'lead_desk',
      title: 'Lead desk entry cleared',
      text: removed && (removed.ownerTag || removed.visitorId) ? (removed.ownerTag || removed.visitorId) : normalizedVisitorId,
      view: 'rating',
      entityId: normalizedVisitorId,
    });
    writeState(state);
    return publicLeadDeskEntry(removed);
  }

  function upsertMediaLibraryEntry(userId, data = {}) {
    const state = readState();
    const ownerId = normalizePositiveInt(userId);
    const user = state.webUsers[String(ownerId)];
    if (!user) throw new Error('Unknown user');
    if (!Array.isArray(state.mediaLibraryEntries)) state.mediaLibraryEntries = [];

    const entryId = normalizePositiveInt(data.id);
    const now = nowIso();
    let row = entryId
      ? state.mediaLibraryEntries.find((item) => normalizePositiveInt(item && item.id) === entryId) || null
      : null;

    const normalizedKind = normalizeMediaEntryKind(data.kind, row ? row.kind : 'message');
    const normalizedTitle = normalizeShortText(data.title, 160);
    const normalizedSummary = normalizeLongText(data.summary || data.description, 600);
    const normalizedText = normalizeLongText(data.text || data.content, 12000);
    const normalizedUrl = normalizeUrl(data.url || data.targetUrl, 1200);
    const normalizedVideoUrl = normalizeUrl(data.videoUrl, 1200);
    const normalizedShareUrl = normalizeUrl(data.shareUrl, 1200);
    const normalizedImageUrl = normalizeUrl(data.imageUrl || data.image, 1200);
    const normalizedScenarioId = normalizeShortText(data.scenarioId || 'all', 40) || 'all';
    const normalizedLanguageId = normalizeShortText(data.languageId || 'all', 20) || 'all';
    const normalizedChannel = normalizeShortText(data.channel, 40);
    const normalizedProductIds = normalizeStringArray(data.productIds, { maxItems: 20, maxLength: 80 });
    const normalizedTags = normalizeStringArray(data.tags, { maxItems: 20, maxLength: 40 });
    const normalizedCategoryId = normalizeShortText(data.categoryId, 40);
    const normalizedCategoryLabel = normalizeShortText(data.categoryLabel, 80);
    const normalizedSpeaker = normalizeShortText(data.speaker, 120);
    const normalizedSpeakers = normalizeStringArray(data.speakers, { maxItems: 6, maxLength: 120 });
    const normalizedProducts = normalizeStringArray(data.products, { maxItems: 12, maxLength: 120 });
    const normalizedDurationSec = Math.max(0, parseInt(data.durationSec, 10) || 0);
    const normalizedShareText = normalizeLongText(data.shareText, 4000);
    const normalizedTranscriptPreview = normalizeLongText(data.transcriptPreview, 4000);
    const normalizedKeyPoints = normalizeStringArray(data.keyPoints, { maxItems: 6, maxLength: 220 });
    const normalizedSourcePlatform = normalizeShortText(data.sourcePlatform, 40);
    const normalizedSourceExternalId = normalizeShortText(data.sourceExternalId, 120);
    const normalizedIsFeatured = normalizeBoolean(data.isFeatured, false);
    const normalizedFeaturedScore = Math.max(0, Number(data.featuredScore || 0) || 0);

    if (!normalizedTitle) throw new Error('Media entry title required');
    if (!normalizedSummary && !normalizedText && !normalizedUrl && !normalizedVideoUrl && !normalizedImageUrl) {
      throw new Error('Media entry content required');
    }

    if (!row) {
      row = {
        id: nextCounter(state, 'mediaLibraryEntry'),
        createdByUserId: ownerId,
        createdAt: now,
      };
      state.mediaLibraryEntries.unshift(row);
      pushNotificationState(state, ownerId, {
        kind: 'media_library',
        title: 'Добавлен материал в медиатеку',
        message: normalizedTitle,
        actionView: 'media',
        actionLabel: 'Открыть медиатеку',
        level: 'info'
      });
      pushActivityState(state, ownerId, {
        kind: 'media_library',
        title: 'Media entry created',
        text: normalizedTitle,
        view: 'media',
        entityId: String(row.id),
      });
    } else {
      pushActivityState(state, ownerId, {
        kind: 'media_library',
        title: 'Media entry updated',
        text: normalizedTitle,
        view: 'media',
        entityId: String(row.id),
      });
    }

    row.title = normalizedTitle;
    row.summary = normalizedSummary;
    row.kind = normalizedKind;
    row.scenarioId = normalizedScenarioId;
    row.languageId = normalizedLanguageId;
    row.productIds = normalizedProductIds;
    row.tags = normalizedTags;
    row.channel = normalizedChannel;
    row.text = normalizedText;
    row.url = normalizedUrl;
    row.videoUrl = normalizedVideoUrl;
    row.shareUrl = normalizedShareUrl;
    row.imageUrl = normalizedImageUrl;
    row.categoryId = normalizedCategoryId;
    row.categoryLabel = normalizedCategoryLabel;
    row.speaker = normalizedSpeaker;
    row.speakers = normalizedSpeakers;
    row.products = normalizedProducts;
    row.durationSec = normalizedDurationSec;
    row.shareText = normalizedShareText;
    row.transcriptPreview = normalizedTranscriptPreview;
    row.keyPoints = normalizedKeyPoints;
    row.sourcePlatform = normalizedSourcePlatform;
    row.sourceExternalId = normalizedSourceExternalId;
    row.isFeatured = normalizedIsFeatured;
    row.featuredScore = normalizedFeaturedScore;
    row.status = 'active';
    row.updatedAt = now;

    writeState(state);
    return publicMediaLibraryEntry(row);
  }

  function removeMediaLibraryEntry(userId, entryId) {
    const state = readState();
    const ownerId = normalizePositiveInt(userId);
    const id = normalizePositiveInt(entryId);
    if (!ownerId || !id) return null;
    const index = state.mediaLibraryEntries.findIndex((item) => normalizePositiveInt(item && item.id) === id);
    if (index < 0) return null;
    const [removed] = state.mediaLibraryEntries.splice(index, 1);
    pushNotificationState(state, ownerId, {
      kind: 'media_library',
      title: 'Материал удалён из медиатеки',
      message: removed && removed.title ? removed.title : 'Элемент удалён',
      actionView: 'media',
      actionLabel: 'Открыть медиатеку',
      level: 'info'
    });
    pushActivityState(state, ownerId, {
      kind: 'media_library',
      title: 'Media entry removed',
      text: removed && removed.title ? removed.title : 'Media entry',
      view: 'media',
      entityId: String(id),
    });
    writeState(state);
    return publicMediaLibraryEntry(removed);
  }

  function ensureShortLinkCode(state, preferredCode) {
    const normalizedPreferred = normalizeCode(preferredCode);
    if (normalizedPreferred && !Object.values(state.shortLinks).some((item) => item && item.code === normalizedPreferred)) {
      return normalizedPreferred;
    }

    let code = '';
    do {
      code = normalizeCode(`xh${Math.random().toString(36).slice(2, 8)}`);
    } while (!code || Object.values(state.shortLinks).some((item) => item && item.code === code));
    return code;
  }

  function getShortLinks(userId, limit = 200) {
    const state = readState();
    const ownerId = normalizePositiveInt(userId);
    return Object.values(state.shortLinks)
      .filter((item) => normalizePositiveInt(item && item.userId) === ownerId)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, Math.max(1, Math.min(500, Number(limit) || 200)))
      .map(publicShortLink);
  }

  function createShortLink(userId, data = {}) {
    const state = readState();
    const ownerId = normalizePositiveInt(userId);
    const user = state.webUsers[String(ownerId)];
    if (!user) throw new Error('Unknown user');

    const targetUrl = normalizeUrl(data.url);
    if (!targetUrl) throw new Error('Invalid short link url');

    const title = normalizeShortText(data.title, 140) || 'Referral link';
    const code = ensureShortLinkCode(state, data.slug || data.code);
    const now = nowIso();
    const id = nextCounter(state, 'shortLink');
    const publicBaseUrl = String(config.publicBaseUrl || '').trim().replace(/\/$/, '');
    const shortUrl = publicBaseUrl ? `${publicBaseUrl}/s/${encodeURIComponent(code)}` : `/s/${encodeURIComponent(code)}`;

    state.shortLinks[String(id)] = {
      id,
      userId: ownerId,
      code,
      slug: code,
      title,
      url: targetUrl,
      shortUrl,
      clicks: 0,
      lastClickedAt: null,
      createdAt: now,
      updatedAt: now
    };

    pushNotificationState(state, ownerId, {
      kind: 'short_link',
      title: 'Создана короткая ссылка',
      message: title,
      actionView: 'tools',
      actionLabel: 'Открыть инструменты',
      level: 'info'
    });
    pushActivityState(state, ownerId, {
      kind: 'short_link',
      title: 'Короткая ссылка готова',
      text: `${title} -> ${code}`,
      view: 'tools',
      entityId: String(id)
    });

    writeState(state);
    return publicShortLink(state.shortLinks[String(id)]);
  }

  function getShortLinkByCode(code) {
    const state = readState();
    const normalized = normalizeCode(code);
    if (!normalized) return null;
    const item = Object.values(state.shortLinks).find((entry) => entry && entry.code === normalized);
    return item ? publicShortLink(item) : null;
  }

  function incrementShortLinkClick(code) {
    const state = readState();
    const normalized = normalizeCode(code);
    if (!normalized) return null;
    const item = Object.values(state.shortLinks).find((entry) => entry && entry.code === normalized);
    if (!item) return null;
    item.clicks = Number(item.clicks || 0) + 1;
    item.lastClickedAt = nowIso();
    item.updatedAt = item.lastClickedAt;
    writeState(state);
    return publicShortLink(item);
  }

  function listWithdrawals(userId, limit = 100) {
    const state = readState();
    const ownerId = normalizePositiveInt(userId);
    return Object.values(state.webWithdrawals)
      .filter((item) => normalizePositiveInt(item.userId) === ownerId)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, Math.max(1, Math.min(500, Number(limit) || 100)))
      .map(publicWithdrawal);
  }

  function appendAiMessage(userId, data = {}) {
    const state = readState();
    const ownerId = normalizePositiveInt(userId);
    const user = state.webUsers[String(ownerId)];
    if (!user) throw new Error('Unknown user');

    const id = nextCounter(state, 'webAiMessage');
    const now = nowIso();
    if (!state.webAiMessages[String(ownerId)]) state.webAiMessages[String(ownerId)] = [];
    state.webAiMessages[String(ownerId)].push({
      id,
      userId: ownerId,
      role: String(data.role || 'user').trim().toLowerCase(),
      content: String(data.content || '').trim(),
      meta: data.meta && typeof data.meta === 'object' ? data.meta : {},
      createdAt: now
    });
    if (state.webAiMessages[String(ownerId)].length > 200) {
      state.webAiMessages[String(ownerId)] = state.webAiMessages[String(ownerId)].slice(-200);
    }
    writeState(state);
    return publicAiMessage(state.webAiMessages[String(ownerId)][state.webAiMessages[String(ownerId)].length - 1]);
  }

  function listAiMessages(userId, limit = 100) {
    const state = readState();
    const ownerId = normalizePositiveInt(userId);
    return (state.webAiMessages[String(ownerId)] || [])
      .slice(-Math.max(1, Math.min(500, Number(limit) || 100)))
      .map(publicAiMessage);
  }

  function countWebUsers() {
    const state = readState();
    return Object.keys(state.webUsers).length;
  }

  function getReferralStats(userId, maxDepth = 5) {
    const state = readState();
    const ownerId = normalizePositiveInt(userId);
    const root = state.webUsers[String(ownerId)];
    if (!root) return null;
    const counts = countReferralStatsFromState(state, ownerId, maxDepth);
    const nodes = Object.values(state.webUsers);
    const direct = nodes.filter((user) => normalizePositiveInt(user.referredByUserId) === ownerId);

    return {
      referralCode: root.referralCode || null,
      referredByUserId: normalizePositiveInt(root.referredByUserId) || null,
      referralLink: config.publicBaseUrl ? `${landingBaseUrl()}/?ref=${encodeURIComponent(root.referralCode || '')}` : null,
      directReferrals: Number(counts.directReferrals || 0),
      totalReferrals: Number(counts.totalReferrals || 0),
      points: Number(root.points || 0),
      countsByLevel: counts.countsByLevel,
      directReferralsList: direct.map(publicWebUser)
    };
  }

  // ─────────────────────────────────────────────
  // QUEST SYSTEM
  // ─────────────────────────────────────────────

  function getQuestProgress(userId) {
    const state = readState();
    return state.webQuestProgress[userId] || {};
  }

  // completedIds: string[], loginStreak: number, points: number
  function getQuestStats(userId) {
    const state = readState();
    const progress = state.webQuestProgress[userId] || {};
    const completedIds = Object.keys(progress).filter((id) => progress[id] && progress[id].completedAt);
    const totalXp = completedIds.reduce((sum, id) => {
      return sum + (progress[id].xp || 0);
    }, 0);
    const loginStreak = Number((state.webUsers[userId] || {}).loginStreak || 0);
    return { completedIds, totalXp, loginStreak };
  }

  function completeQuest(userId, questId, xp) {
    const state = readState();
    if (!state.webQuestProgress[userId]) state.webQuestProgress[userId] = {};
    const existing = state.webQuestProgress[userId][questId];
    if (existing && existing.completedAt) return existing; // already done

    state.counters.webQuestCompletion = (state.counters.webQuestCompletion || 0) + 1;
    const record = {
      questId,
      xp: Number(xp || 0),
      completedAt: nowIso(),
    };
    state.webQuestProgress[userId][questId] = record;

    // Push notification
    pushNotificationState(state, userId, {
      kind: 'quest_complete',
      title: `+${xp} XP! Задание выполнено`,
      message: null,
      actionView: 'tasks',
      actionLabel: 'Открыть задания',
      actionUrl: '#/tasks',
      level: 'success',
      meta: { questId, xp },
    });

    writeState(state);
    return record;
  }

  function resetQuestForRepeat(userId, questId) {
    const state = readState();
    if (!state.webQuestProgress[userId]) return;
    delete state.webQuestProgress[userId][questId];
    writeState(state);
  }

  function updateLoginStreak(userId) {
    const state = readState();
    const user = state.webUsers[userId];
    if (!user) return 0;

    const today = nowIso().slice(0, 10);
    const lastLogin = String(user.lastLoginDate || '').slice(0, 10);

    if (lastLogin === today) return Number(user.loginStreak || 1);

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (lastLogin === yesterday) {
      user.loginStreak = (Number(user.loginStreak) || 1) + 1;
    } else {
      user.loginStreak = 1;
    }
    user.lastLoginDate = today;
    writeState(state);
    return user.loginStreak;
  }

  // ─────────────────────────────────────────────
  // EVENTS (конференции / эфиры)
  // ─────────────────────────────────────────────

  function computeEventStatus(ev) {
    if (!ev) return 'past';
    if (ev.canceled) return 'canceled';
    const start = Date.parse(ev.startsAt || 0);
    if (!start) return 'upcoming';
    const duration = Math.max(1, Number(ev.durationMinutes) || 60);
    const end = start + duration * 60 * 1000;
    const now = Date.now();
    if (now < start) return 'upcoming';
    if (now <= end) return 'live';
    return 'past';
  }

  function enrichEvent(ev) {
    if (!ev) return ev;
    return { ...ev, status: computeEventStatus(ev) };
  }

  function listEvents({ upcoming = false, includeCanceled = false, includeUnpublished = false } = {}) {
    const state = readState();
    const events = Array.isArray(state.webEvents) ? state.webEvents : [];
    let filtered = events.slice();
    if (!includeUnpublished) filtered = filtered.filter((e) => e.isPublished !== false);
    if (!includeCanceled) filtered = filtered.filter((e) => !e.canceled);
    if (upcoming) {
      const now = Date.now();
      return filtered
        .filter((e) => e.startsAt && Date.parse(e.startsAt) > now - 3600000)
        .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
        .map(enrichEvent);
    }
    return filtered
      .sort((a, b) => Date.parse(b.startsAt || 0) - Date.parse(a.startsAt || 0))
      .map(enrichEvent);
  }

  function getNextUpcomingEvent() {
    const list = listEvents({ upcoming: true });
    return list[0] || null;
  }

  function listUpcomingEvents(limit = 10) {
    return listEvents({ upcoming: true }).slice(0, Math.max(1, Number(limit) || 10));
  }

  function listPastEvents(limit = 20) {
    const state = readState();
    const events = Array.isArray(state.webEvents) ? state.webEvents : [];
    const now = Date.now();
    return events
      .filter((e) => {
        if (e.canceled) return false;
        if (e.isPublished === false) return false;
        if (!e.startsAt) return false;
        const start = Date.parse(e.startsAt);
        const duration = Math.max(1, Number(e.durationMinutes) || 60);
        return start + duration * 60 * 1000 < now;
      })
      .sort((a, b) => Date.parse(b.startsAt || 0) - Date.parse(a.startsAt || 0))
      .slice(0, Math.max(1, Number(limit) || 20))
      .map(enrichEvent);
  }

  function upsertEvent(data) {
    const state = readState();
    if (!Array.isArray(state.webEvents)) state.webEvents = [];

    const id = data.id || (() => {
      state.counters.webEvent = (state.counters.webEvent || 0) + 1;
      return makeId('ev', state.counters.webEvent);
    })();

    const idx = state.webEvents.findIndex((e) => e.id === id);
    const prev = idx >= 0 ? state.webEvents[idx] : null;
    const speakersArr = Array.isArray(data.speakers)
      ? data.speakers.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 10)
      : (prev && Array.isArray(prev.speakers) ? prev.speakers : []);
    const tagsArr = Array.isArray(data.tags)
      ? data.tags.map((t) => String(t || '').trim()).filter(Boolean).slice(0, 15)
      : (prev && Array.isArray(prev.tags) ? prev.tags : []);
    const record = {
      id,
      title: String(data.title || (prev && prev.title) || '').slice(0, 200),
      description: String(data.description || (prev && prev.description) || '').slice(0, 2000),
      speakerName: String(
        data.speakerName !== undefined ? data.speakerName : (prev && prev.speakerName) || ''
      ).slice(0, 200),
      speakers: speakersArr,
      topic: String(data.topic !== undefined ? data.topic : (prev && prev.topic) || '').slice(0, 100),
      startsAt: data.startsAt || (prev && prev.startsAt) || null,
      durationMinutes: Number(data.durationMinutes) || (prev && prev.durationMinutes) || 60,
      timezone: String(data.timezone || (prev && prev.timezone) || 'Europe/Moscow').slice(0, 60),
      joinUrl: String(data.joinUrl !== undefined ? data.joinUrl : (prev && prev.joinUrl) || '').slice(0, 500),
      coverImage: String(data.coverImage !== undefined ? data.coverImage : (prev && prev.coverImage) || '').slice(0, 500),
      recordingUrl: String(data.recordingUrl !== undefined ? data.recordingUrl : (prev && prev.recordingUrl) || '').slice(0, 500),
      recordingVideoId: String(data.recordingVideoId !== undefined ? data.recordingVideoId : (prev && prev.recordingVideoId) || '').slice(0, 120),
      tags: tagsArr,
      visibility: ['public', 'cabinet_only'].indexOf(data.visibility) >= 0
        ? data.visibility
        : ((prev && prev.visibility) || 'public'),
      isPublished: data.isPublished !== undefined ? Boolean(data.isPublished) : (prev ? prev.isPublished !== false : true),
      canceled: data.canceled !== undefined ? Boolean(data.canceled) : (prev ? Boolean(prev.canceled) : false),
      createdBy: (prev && prev.createdBy) || data.createdBy || null,
      updatedBy: data.updatedBy || (prev && prev.updatedBy) || null,
      createdAt: (prev && prev.createdAt) || nowIso(),
      updatedAt: nowIso(),
    };

    if (idx >= 0) {
      state.webEvents[idx] = record;
    } else {
      state.webEvents.push(record);
      // Уведомить всех пользователей о новом эфире
      Object.keys(state.webUsers).forEach((uid) => {
        pushNotificationState(state, Number(uid), {
          kind: 'event_new',
          title: `Новый эфир: ${record.title}`,
          message: record.startsAt ? `Начало: ${new Date(record.startsAt).toLocaleString('ru-RU')}` : null,
          actionView: 'tasks',
          actionLabel: 'Подписаться',
          actionUrl: '#/tasks',
          level: 'info',
          meta: { eventId: id },
        });
      });
    }

    writeState(state);
    return record;
  }

  function getEvent(eventId) {
    const state = readState();
    const ev = (Array.isArray(state.webEvents) ? state.webEvents : []).find((e) => e.id === eventId) || null;
    return ev ? enrichEvent(ev) : null;
  }

  function deleteEvent(eventId) {
    const state = readState();
    if (!Array.isArray(state.webEvents)) return false;
    const idx = state.webEvents.findIndex((e) => e.id === eventId);
    if (idx < 0) return false;
    state.webEvents[idx] = {
      ...state.webEvents[idx],
      canceled: true,
      updatedAt: nowIso(),
    };
    writeState(state);
    return true;
  }

  function hardDeleteEvent(eventId) {
    const state = readState();
    if (!Array.isArray(state.webEvents)) return false;
    const before = state.webEvents.length;
    state.webEvents = state.webEvents.filter((e) => e.id !== eventId);
    if (state.webEvents.length === before) return false;
    if (state.webEventSubscriptions) delete state.webEventSubscriptions[eventId];
    writeState(state);
    return true;
  }

  function subscribeToEvent(userId, eventId) {
    const state = readState();
    if (!state.webEventSubscriptions) state.webEventSubscriptions = {};
    if (!state.webEventSubscriptions[eventId]) state.webEventSubscriptions[eventId] = {};
    const existing = state.webEventSubscriptions[eventId][userId] || {};
    state.webEventSubscriptions[eventId][userId] = {
      subscribedAt: existing.subscribedAt || nowIso(),
      phases: existing.phases || {},
      attendedAt: existing.attendedAt || null,
    };

    pushNotificationState(state, userId, {
      kind: 'event_subscribed',
      title: 'Вы записаны на эфир',
      message: 'Напомним каждый день за 2/1/0 дней и за час до начала',
      actionView: 'tasks',
      actionLabel: 'Открыть',
      actionUrl: '#/tasks',
      level: 'success',
      meta: { eventId },
    });

    writeState(state);
    return state.webEventSubscriptions[eventId][userId];
  }

  // ─────────────────────────────────────────────
  // PLANNER (упрощённый порт alpha-planner)
  // ─────────────────────────────────────────────

  function todayDateStr(tz = 'Europe/Moscow') {
    try {
      const d = new Date();
      const opt = { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' };
      const parts = new Intl.DateTimeFormat('en-CA', opt).formatToParts(d);
      const y = parts.find(p => p.type === 'year').value;
      const m = parts.find(p => p.type === 'month').value;
      const day = parts.find(p => p.type === 'day').value;
      return `${y}-${m}-${day}`;
    } catch (e) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function tomorrowDateStr(tz = 'Europe/Moscow') {
    const d = new Date(Date.now() + 24 * 3600 * 1000);
    const opt = { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' };
    const parts = new Intl.DateTimeFormat('en-CA', opt).formatToParts(d);
    return parts.find(p => p.type === 'year').value + '-' +
      parts.find(p => p.type === 'month').value + '-' +
      parts.find(p => p.type === 'day').value;
  }

  function createPlannerTask(userId, data = {}) {
    const state = readState();
    if (!Array.isArray(state.webPlannerTasks)) state.webPlannerTasks = [];
    state.counters.webPlannerTask = (state.counters.webPlannerTask || 0) + 1;
    const task = {
      id: makeId('pt', state.counters.webPlannerTask),
      userId: normalizePositiveInt(userId),
      title: String(data.title || '').slice(0, 300),
      description: String(data.description || '').slice(0, 1000),
      dueDate: data.dueDate || todayDateStr(),
      dueTime: data.dueTime || null,
      priority: ['low', 'normal', 'high'].includes(data.priority) ? data.priority : 'normal',
      category: String(data.category || '').slice(0, 50),
      status: 'active',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      completedAt: null,
    };
    state.webPlannerTasks.push(task);
    writeState(state);
    return task;
  }

  function listUserPlannerTasks(userId, opts = {}) {
    const state = readState();
    const uid = normalizePositiveInt(userId);
    const tasks = (state.webPlannerTasks || []).filter(t => Number(t.userId) === uid);
    const filter = opts.filter || 'all'; // today | tomorrow | week | active | done | all
    const today = todayDateStr();
    const tomorrow = tomorrowDateStr();
    let result = tasks;
    if (filter === 'today') result = tasks.filter(t => t.dueDate === today && t.status === 'active');
    else if (filter === 'tomorrow') result = tasks.filter(t => t.dueDate === tomorrow && t.status === 'active');
    else if (filter === 'week') {
      const weekEnd = new Date(Date.now() + 7 * 86400 * 1000).toISOString().slice(0, 10);
      result = tasks.filter(t => t.dueDate <= weekEnd && t.status === 'active');
    } else if (filter === 'active') result = tasks.filter(t => t.status === 'active');
    else if (filter === 'done') result = tasks.filter(t => t.status === 'done');
    return result.sort((a, b) => {
      const aD = a.dueDate || '9999-99-99';
      const bD = b.dueDate || '9999-99-99';
      if (aD !== bD) return aD < bD ? -1 : 1;
      return (a.dueTime || '99:99') < (b.dueTime || '99:99') ? -1 : 1;
    });
  }

  function completePlannerTask(taskId, userId) {
    const state = readState();
    const uid = normalizePositiveInt(userId);
    const task = (state.webPlannerTasks || []).find(t => t.id === taskId && Number(t.userId) === uid);
    if (!task) return null;
    task.status = 'done';
    task.completedAt = nowIso();
    task.updatedAt = nowIso();
    writeState(state);
    return task;
  }

  function deletePlannerTask(taskId, userId) {
    const state = readState();
    const uid = normalizePositiveInt(userId);
    const idx = (state.webPlannerTasks || []).findIndex(t => t.id === taskId && Number(t.userId) === uid);
    if (idx < 0) return false;
    state.webPlannerTasks.splice(idx, 1);
    writeState(state);
    return true;
  }

  function getPlannerTaskById(taskId) {
    const state = readState();
    return (state.webPlannerTasks || []).find(t => t.id === taskId) || null;
  }

  // Mark a reminder phase as sent for a subscription (idempotent)
  // [event-rsvp] User RSVP to an event: 'attend' (will come), 'record' (will watch
  // the recording), 'skip' (won't come). Click same response twice → un-RSVP.
  function recordEventRsvp(userId, eventId, response) {
    const valid = ['attend', 'record', 'skip'];
    if (!valid.includes(response)) return false;
    const uid = normalizePositiveInt(userId);
    if (!uid || !eventId) return false;
    const state = readState();
    if (!state.webEventRsvp) state.webEventRsvp = {};
    if (!state.webEventRsvp[eventId]) state.webEventRsvp[eventId] = {};
    const prev = state.webEventRsvp[eventId][uid];
    if (prev && prev.response === response) {
      // Toggle off
      delete state.webEventRsvp[eventId][uid];
      writeState(state);
      return { action: 'cleared', previous: prev.response };
    }
    state.webEventRsvp[eventId][uid] = { response, at: nowIso() };

    // Auto-subscribe the user if they said 'attend' or 'record' — gives them
    // the existing 5 subscriber-phase reminders too.
    if (response === 'attend' || response === 'record') {
      try { subscribeToEvent(uid, eventId); } catch (_) {}
    }

    writeState(state);
    return { action: 'set', previous: prev ? prev.response : null };
  }

  function getEventRsvp(eventId, userId) {
    const state = readState();
    const r = state.webEventRsvp && state.webEventRsvp[eventId] && state.webEventRsvp[eventId][userId];
    return r ? r.response : null;
  }

  function getEventRsvpStats(eventId) {
    const state = readState();
    const map = (state.webEventRsvp && state.webEventRsvp[eventId]) || {};
    const counts = { attend: 0, record: 0, skip: 0, total: 0 };
    Object.values(map).forEach(r => {
      if (counts[r.response] != null) counts[r.response]++;
      counts.total++;
    });
    return counts;
  }

  // [global-reminders] dedup for broadcast-to-all phases (T-12h, T-6h, T-15min).
  // Subscribers use webEventSubscriptions; non-subscribers can't share that path
  // so a parallel store `webEventGlobalSent[eventId][userId][phase] = isoTs` is used.
  function markEventGlobalReminderSent(userId, eventId, phase) {
    const state = readState();
    if (!state.webEventGlobalSent) state.webEventGlobalSent = {};
    if (!state.webEventGlobalSent[eventId]) state.webEventGlobalSent[eventId] = {};
    if (!state.webEventGlobalSent[eventId][userId]) state.webEventGlobalSent[eventId][userId] = {};
    if (state.webEventGlobalSent[eventId][userId][phase]) return false;
    state.webEventGlobalSent[eventId][userId][phase] = nowIso();
    writeState(state);
    return true;
  }

  function wasEventGlobalReminderSent(userId, eventId, phase) {
    const state = readState();
    return !!(state.webEventGlobalSent &&
              state.webEventGlobalSent[eventId] &&
              state.webEventGlobalSent[eventId][userId] &&
              state.webEventGlobalSent[eventId][userId][phase]);
  }

  function markEventReminderSent(userId, eventId, phase) {
    const state = readState();
    if (!state.webEventSubscriptions) return false;
    if (!state.webEventSubscriptions[eventId]) return false;
    const sub = state.webEventSubscriptions[eventId][userId];
    if (!sub) return false;
    if (!sub.phases || typeof sub.phases !== 'object') sub.phases = {};
    if (sub.phases[phase]) return false;
    sub.phases[phase] = nowIso();
    writeState(state);
    return true;
  }

  function unsubscribeFromEvent(userId, eventId) {
    const state = readState();
    if (!state.webEventSubscriptions) return;
    if (!state.webEventSubscriptions[eventId]) return;
    delete state.webEventSubscriptions[eventId][userId];
    writeState(state);
  }

  function getEventSubscribers(eventId) {
    const state = readState();
    if (!state.webEventSubscriptions) return {};
    return state.webEventSubscriptions[eventId] || {};
  }

  function isSubscribedToEvent(userId, eventId) {
    const state = readState();
    if (!state.webEventSubscriptions) return false;
    return !!(state.webEventSubscriptions[eventId] && state.webEventSubscriptions[eventId][userId]);
  }

  // Отметить посещение эфира (для auto-квестов)
  function markEventAttended(userId, eventId) {
    const state = readState();
    if (!state.webEventSubscriptions) state.webEventSubscriptions = {};
    if (!state.webEventSubscriptions[eventId]) state.webEventSubscriptions[eventId] = {};
    if (!state.webEventSubscriptions[eventId][userId]) {
      state.webEventSubscriptions[eventId][userId] = { subscribedAt: nowIso() };
    }
    state.webEventSubscriptions[eventId][userId].attendedAt = nowIso();
    writeState(state);

    // Считаем сколько всего посетил
    let total = 0;
    Object.keys(state.webEventSubscriptions).forEach((eid) => {
      if (state.webEventSubscriptions[eid][userId] && state.webEventSubscriptions[eid][userId].attendedAt) total++;
    });
    return total;
  }

  // Получить список эфиров на которые подписан пользователь
  function listUserEventSubscriptions(userId) {
    const state = readState();
    if (!state.webEventSubscriptions) return [];
    const events = Array.isArray(state.webEvents) ? state.webEvents : [];
    const result = [];
    Object.keys(state.webEventSubscriptions).forEach((eventId) => {
      if (state.webEventSubscriptions[eventId][userId]) {
        const ev = events.find((e) => e.id === eventId);
        if (ev) {
          result.push({
            ...ev,
            subscription: state.webEventSubscriptions[eventId][userId],
          });
        }
      }
    });
    return result.sort((a, b) => Date.parse(a.startsAt || 0) - Date.parse(b.startsAt || 0));
  }

  function listTelegramMonitorChats() {
    const state = readState();
    return Object.values(state.telegramMonitorChats || {})
      .map((row) => normalizeTelegramMonitorChat(row))
      .filter(Boolean)
      .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
  }

  function getTelegramMonitorChat(chatId) {
    const state = readState();
    const key = normalizeTelegramMonitorChatId(chatId);
    if (!key) return null;
    return normalizeTelegramMonitorChat(state.telegramMonitorChats && state.telegramMonitorChats[key]);
  }

  function upsertTelegramMonitorChat(data = {}) {
    const state = readState();
    const row = normalizeTelegramMonitorChat(data);
    if (!row) return null;
    const current = normalizeTelegramMonitorChat(state.telegramMonitorChats[row.chatId] || row) || row;
    const merged = {
      ...current,
      ...row,
      createdAt: current.createdAt || row.createdAt || nowIso(),
      updatedAt: nowIso(),
    };
    state.telegramMonitorChats[row.chatId] = merged;
    writeState(state);
    return merged;
  }

  function setTelegramMonitorChatEnabled(chatId, enabled) {
    const state = readState();
    const key = normalizeTelegramMonitorChatId(chatId);
    if (!key) return null;
    const current = normalizeTelegramMonitorChat(state.telegramMonitorChats[key] || { chatId: key });
    if (!current) return null;
    current.enabled = normalizeBoolean(enabled, true);
    current.updatedAt = nowIso();
    state.telegramMonitorChats[key] = current;
    writeState(state);
    return current;
  }

  function listTelegramMonitorRecipients() {
    const state = readState();
    return Object.values(state.telegramMonitorRecipients || {})
      .map((row) => normalizeTelegramMonitorRecipient(row))
      .filter(Boolean)
      .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
  }

  function registerTelegramMonitorRecipient(data = {}) {
    const state = readState();
    const row = normalizeTelegramMonitorRecipient(data);
    if (!row) return null;
    const current = normalizeTelegramMonitorRecipient(state.telegramMonitorRecipients[row.telegramUserId] || row) || row;
    const merged = {
      ...current,
      ...row,
      isActive: true,
      createdAt: current.createdAt || row.createdAt || nowIso(),
      updatedAt: nowIso(),
    };
    state.telegramMonitorRecipients[row.telegramUserId] = merged;
    writeState(state);
    return merged;
  }

  function unregisterTelegramMonitorRecipient(telegramUserId) {
    const state = readState();
    const key = normalizePositiveInt(telegramUserId);
    if (!key || !state.telegramMonitorRecipients[key]) return null;
    const current = normalizeTelegramMonitorRecipient(state.telegramMonitorRecipients[key]);
    if (!current) return null;
    current.isActive = false;
    current.updatedAt = nowIso();
    state.telegramMonitorRecipients[key] = current;
    writeState(state);
    return current;
  }

  function touchTelegramMonitorRecipientDelivery(telegramUserId) {
    const state = readState();
    const key = normalizePositiveInt(telegramUserId);
    if (!key || !state.telegramMonitorRecipients[key]) return null;
    const current = normalizeTelegramMonitorRecipient(state.telegramMonitorRecipients[key]);
    if (!current) return null;
    current.lastSentAt = nowIso();
    current.updatedAt = nowIso();
    state.telegramMonitorRecipients[key] = current;
    writeState(state);
    return current;
  }

  function addTelegramMonitorEvent(data = {}) {
    const state = readState();
    const chatId = normalizeTelegramMonitorChatId(data.chatId || (data.chat && data.chat.id));
    if (!chatId) return null;
    const eventType = normalizeShortText(data.eventType || data.type, 40) || 'message';
    const messageId = normalizePositiveInt(data.messageId);
    const threadId = normalizePositiveInt(data.threadId || data.messageThreadId);
    const createdAt = normalizeDateTime(data.createdAt || data.sentAt || data.date) || nowIso();
    const editedAt = normalizeDateTime(data.editedAt || data.editDate);
    const text = normalizeTelegramMonitorText(data.text || data.caption || data.body, 4000);
    const authorUsername = normalizeTelegramUsername(data.authorUsername || data.username);
    const authorName = normalizeShortText(data.authorName || data.fullName || data.firstName, 160);
    const mediaKind = normalizeShortText(data.mediaKind || data.kind || data.attachmentType, 40);
    const sourceKey = [chatId, messageId || 'na', eventType, editedAt || createdAt].join(':');

    const duplicate = (state.telegramMonitorEvents || []).find((item) => item && item.sourceKey === sourceKey);
    if (duplicate) return duplicate;

    const event = {
      id: makeId('tgm_event', nextCounter(state, 'telegramMonitorEvent')),
      sourceKey,
      chatId,
      chatTitle: normalizeShortText(data.chatTitle || (data.chat && data.chat.title), 180),
      chatUsername: normalizeTelegramUsername(data.chatUsername || (data.chat && data.chat.username)),
      chatType: normalizeShortText(data.chatType || (data.chat && data.chat.type), 40) || 'unknown',
      isForum: normalizeBoolean(data.isForum || (data.chat && data.chat.is_forum), false),
      eventType,
      messageId: messageId || null,
      threadId: threadId || null,
      text,
      preview: text ? text.slice(0, 280) : null,
      authorId: normalizePositiveInt(data.authorId || data.userId || data.fromId) || null,
      authorName,
      authorUsername,
      mediaKind: mediaKind || null,
      hasLink: normalizeBoolean(data.hasLink, /https?:\/\/|www\.|t\.me\//i.test(text)),
      isQuestion: normalizeBoolean(data.isQuestion, /[?？]/.test(text)),
      hasMention: normalizeBoolean(data.hasMention, /@\w+/i.test(text)),
      createdAt,
      editedAt,
    };

    if (!Array.isArray(state.telegramMonitorEvents)) state.telegramMonitorEvents = [];
    state.telegramMonitorEvents.push(event);

    const retentionDays = Math.max(1, Number(config.tgMonitorRetentionDays || 30));
    const maxEvents = Math.max(100, Number(config.tgMonitorMaxEvents || 10000));
    const minCreatedAt = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    state.telegramMonitorEvents = state.telegramMonitorEvents
      .filter((item) => Date.parse(item && item.createdAt ? item.createdAt : 0) >= minCreatedAt)
      .slice(-maxEvents);

    const currentChat = normalizeTelegramMonitorChat(state.telegramMonitorChats[chatId] || {
      chatId,
      title: event.chatTitle,
      username: event.chatUsername,
      type: event.chatType,
      isForum: event.isForum,
      createdAt,
    }) || {
      chatId,
      numericChatId: /^-?\d+$/.test(chatId) ? Number(chatId) : null,
      createdAt,
    };

    const countIncrement = eventType === 'message' || eventType === 'channel_post' ? 1 : 0;
    state.telegramMonitorChats[chatId] = {
      ...currentChat,
      chatId,
      title: event.chatTitle || currentChat.title,
      username: event.chatUsername || currentChat.username,
      type: event.chatType || currentChat.type,
      isForum: event.isForum || currentChat.isForum,
      enabled: currentChat.enabled !== false,
      messageCount: Math.max(0, Number(currentChat.messageCount || 0)) + countIncrement,
      lastMessageAt: createdAt,
      lastMessageText: text ? text.slice(0, 500) : currentChat.lastMessageText,
      lastActor: authorName || (authorUsername ? `@${authorUsername}` : currentChat.lastActor),
      updatedAt: nowIso(),
      createdAt: currentChat.createdAt || createdAt,
      lastDigestAt: currentChat.lastDigestAt || null,
      memberCount: normalizePositiveInt(data.memberCount || currentChat.memberCount),
      description: currentChat.description || normalizeLongText(data.chatDescription, 500),
      inviteLink: currentChat.inviteLink || normalizeUrl(data.chatInviteLink),
    };

    writeState(state);
    return event;
  }

  function listTelegramMonitorEvents(options = {}) {
    const state = readState();
    const chatId = normalizeTelegramMonitorChatId(options.chatId);
    const since = normalizeDateTime(options.since);
    const until = normalizeDateTime(options.until);
    const types = normalizeStringArray(options.types, { maxItems: 20, maxLength: 40 }).map((item) => item.toLowerCase());
    const limit = Math.max(1, Math.min(500, Number(options.limit || 50)));
    let events = Array.isArray(state.telegramMonitorEvents) ? state.telegramMonitorEvents.slice() : [];
    if (chatId) events = events.filter((item) => item && item.chatId === chatId);
    if (since) events = events.filter((item) => Date.parse(item.createdAt || 0) >= Date.parse(since));
    if (until) events = events.filter((item) => Date.parse(item.createdAt || 0) <= Date.parse(until));
    if (types.length) {
      events = events.filter((item) => types.includes(String(item.eventType || '').trim().toLowerCase()));
    }
    return events
      .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))
      .slice(0, limit);
  }

  function getTelegramMonitorStats(options = {}) {
    const events = listTelegramMonitorEvents({
      chatId: options.chatId,
      since: options.since,
      until: options.until,
      limit: options.limit || 500,
      types: options.types,
    });
    const authors = new Map();
    let linkCount = 0;
    let questionCount = 0;
    let mediaCount = 0;
    let editedCount = 0;
    let reactionCount = 0;

    events.forEach((item) => {
      const authorKey = String(item.authorUsername || item.authorId || item.authorName || '').trim();
      if (authorKey) {
        const current = authors.get(authorKey) || {
          key: authorKey,
          label: item.authorName || (item.authorUsername ? `@${item.authorUsername}` : String(item.authorId || 'Участник')),
          count: 0,
        };
        current.count += 1;
        authors.set(authorKey, current);
      }
      if (item.hasLink) linkCount += 1;
      if (item.isQuestion) questionCount += 1;
      if (item.mediaKind) mediaCount += 1;
      if (String(item.eventType || '').startsWith('edited')) editedCount += 1;
      if (String(item.eventType || '').includes('reaction')) reactionCount += 1;
    });

    return {
      totalEvents: events.length,
      linkCount,
      questionCount,
      mediaCount,
      editedCount,
      reactionCount,
      uniqueAuthors: authors.size,
      topAuthors: Array.from(authors.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
      latestEvent: events[0] || null,
      chats: listTelegramMonitorChats(),
    };
  }

  function saveTelegramMonitorDigest(data = {}) {
    const state = readState();
    const chatId = normalizeTelegramMonitorChatId(data.chatId);
    const digest = {
      id: makeId('tgm_digest', nextCounter(state, 'telegramMonitorDigest')),
      chatId: chatId || null,
      title: normalizeShortText(data.title, 180),
      summary: normalizeLongText(data.summary, 12000),
      model: normalizeShortText(data.model, 80),
      periodStartAt: normalizeDateTime(data.periodStartAt),
      periodEndAt: normalizeDateTime(data.periodEndAt) || nowIso(),
      createdAt: nowIso(),
      stats: data.stats && typeof data.stats === 'object' ? data.stats : {},
    };
    if (!Array.isArray(state.telegramMonitorDigests)) state.telegramMonitorDigests = [];
    state.telegramMonitorDigests.push(digest);
    state.telegramMonitorDigests = state.telegramMonitorDigests.slice(-365);
    if (chatId && state.telegramMonitorChats[chatId]) {
      const currentChat = normalizeTelegramMonitorChat(state.telegramMonitorChats[chatId]);
      if (currentChat) {
        currentChat.lastDigestAt = digest.createdAt;
        currentChat.updatedAt = nowIso();
        state.telegramMonitorChats[chatId] = currentChat;
      }
    }
    writeState(state);
    return digest;
  }

  function listTelegramMonitorDigests(options = {}) {
    const state = readState();
    const chatId = normalizeTelegramMonitorChatId(options.chatId);
    const limit = Math.max(1, Math.min(100, Number(options.limit || 20)));
    let rows = Array.isArray(state.telegramMonitorDigests) ? state.telegramMonitorDigests.slice() : [];
    if (chatId) rows = rows.filter((item) => item && item.chatId === chatId);
    return rows
      .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))
      .slice(0, limit);
  }

  function getRequiredChatGuard(userId, chatId) {
    const state = readState();
    const key = normalizeRequiredChatGuardKey(userId, chatId);
    if (!key) return null;
    return normalizeRequiredChatGuard(state.requiredChatGuards[key], {
      userId,
      chatId,
    });
  }

  function upsertRequiredChatGuard(userId, chatId, data = {}) {
    const state = readState();
    const key = normalizeRequiredChatGuardKey(userId, chatId);
    if (!key) return null;
    const current = normalizeRequiredChatGuard(state.requiredChatGuards[key], {
      userId,
      chatId,
    }) || normalizeRequiredChatGuard({
      userId,
      chatId,
      isMember: false,
      status: 'missing',
    });
    if (!current) return null;

    const merged = normalizeRequiredChatGuard({
      ...current,
      ...data,
      userId: current.userId,
      chatId: current.chatId,
      updatedAt: nowIso(),
    }, current);
    if (!merged) return null;
    state.requiredChatGuards[key] = merged;
    writeState(state);
    return merged;
  }

  // ─────────────────────────────────────────────
  // НОВЫЕ УВЕДОМЛЕНИЯ — триггеры
  // ─────────────────────────────────────────────

  function pushQuestChapterNotification(state, userId, chapterTitle) {
    pushNotificationState(state, userId, {
      kind: 'quest_chapter',
      title: `Глава «${chapterTitle}» разблокирована!`,
      message: 'Новые задания доступны в разделе заданий',
      actionView: 'tasks',
      actionLabel: 'Открыть задания',
      actionUrl: '#/tasks',
      level: 'success',
      meta: {},
    });
  }

  function pushStreakNotification(state, userId, days) {
    pushNotificationState(state, userId, {
      kind: 'quest_streak',
      title: `${days} дней подряд!`,
      message: days >= 30 ? 'Бонус ×2 к XP активен!' : days >= 14 ? 'Бонус ×1.5 к XP активен!' : 'Продолжай в том же духе!',
      actionView: 'tasks',
      actionLabel: 'Открыть задания',
      actionUrl: '#/tasks',
      level: 'success',
      meta: { days },
    });
  }

  function pushReferralNotification(state, ownerId, newUserName) {
    pushNotificationState(state, ownerId, {
      kind: 'referral_new',
      title: '+100 XP! Новый партнёр в структуре',
      message: newUserName ? `Зарегистрировался: ${newUserName}` : null,
      actionView: 'rating',
      actionLabel: 'Открыть структуру',
      actionUrl: '#/rating',
      level: 'success',
      meta: {},
    });
  }

  function pushSupportReplyNotification(state, userId, requestTitle) {
    pushNotificationState(state, userId, {
      kind: 'support_reply',
      title: 'Ответ от поддержки',
      message: requestTitle || null,
      actionView: 'support',
      actionLabel: 'Открыть поддержку',
      actionUrl: '#/support',
      level: 'info',
      meta: {},
    });
  }

  function pushEventReminderNotification(state, userId, event, hoursLeft) {
    pushNotificationState(state, userId, {
      kind: hoursLeft <= 1 ? 'event_reminder_1h' : 'event_reminder_24h',
      title: hoursLeft <= 1 ? `🔴 Через час эфир: ${event.title}` : `⏰ Завтра эфир: ${event.title}`,
      message: event.startsAt ? new Date(event.startsAt).toLocaleString('ru-RU') : null,
      actionView: 'tasks',
      actionLabel: 'Открыть',
      actionUrl: '#/tasks',
      level: 'warning',
      meta: { eventId: event.id },
    });
  }

  function pushEventRecordingNotification(state, userId, eventTitle) {
    pushNotificationState(state, userId, {
      kind: 'event_recording',
      title: `Запись эфира доступна: ${eventTitle}`,
      message: 'Смотри в медиацентре',
      actionView: 'media',
      actionLabel: 'Открыть медиацентр',
      actionUrl: '#/media',
      level: 'info',
      meta: {},
    });
  }

  function pushInactivityNotification(state, userId, days) {
    pushNotificationState(state, userId, {
      kind: 'inactivity',
      title: days >= 14 ? 'Серия прервана — начни снова!' : 'Соскучились! Новые задания ждут',
      message: 'Зайди в кабинет и продолжи путь партнёра',
      actionView: 'tasks',
      actionLabel: 'Открыть задания',
      actionUrl: '#/tasks',
      level: 'warning',
      meta: { days },
    });
  }

  // ===== Chat rooms =====
  function nowMs() { return Date.now(); }
  function makeId() { return 'cr_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36); }
  function makeInvite() { return Math.random().toString(36).slice(2, 10).toUpperCase(); }

  function listChatRooms(userId) {
    const uid = String(userId);
    const rooms = Object.values(state.chatRooms || {});
    const out = [];
    for (const r of rooms) {
      const isMember = (r.members || []).indexOf(uid) >= 0;
      const isPublic = !!r.isPublic;
      if (!isMember && !isPublic) continue;
      const msgs = state.chatMessages[r.id] || [];
      const last = msgs.length ? msgs[msgs.length - 1] : null;
      out.push({
        id: r.id,
        name: r.name,
        isPublic: !!r.isPublic,
        type: r.isPublic ? 'public' : 'private',
        ownerId: r.ownerId,
        inviteCode: r.inviteCode,
        memberCount: (r.members || []).length,
        createdAt: r.createdAt,
        lastMessage: last ? { text: last.text, createdAt: last.createdAt, senderName: last.displayName } : null,
        unreadCount: 0,
        amMember: isMember,
      });
    }
    out.sort((a, b) => (b.lastMessage?.createdAt || b.createdAt) - (a.lastMessage?.createdAt || a.createdAt));
    return out;
  }

  function createChatRoom(ownerId, name, isPublic) {
    const id = makeId();
    const now = nowMs();
    const room = {
      id,
      name: String(name || 'Чат').trim().slice(0, 80),
      isPublic: !!isPublic,
      ownerId: String(ownerId),
      members: [String(ownerId)],
      inviteCode: makeInvite(),
      createdAt: now,
      updatedAt: now,
    };
    state.chatRooms[id] = room;
    state.chatMessages[id] = [];
    writeState(state);
    return room;
  }

  function getChatRoom(id) {
    return state.chatRooms[id] || null;
  }

  function getChatRoomByInvite(code) {
    if (!code) return null;
    const list = Object.values(state.chatRooms || {});
    return list.find(r => r.inviteCode === code) || null;
  }

  function joinChatRoom(roomId, userId) {
    const r = state.chatRooms[roomId];
    if (!r) return null;
    const uid = String(userId);
    if (!r.members) r.members = [];
    if (r.members.indexOf(uid) < 0) {
      r.members.push(uid);
      r.updatedAt = nowMs();
      writeState(state);
    }
    return r;
  }

  function addChatMessage(roomId, userId, text, displayName) {
    const r = state.chatRooms[roomId];
    if (!r) return null;
    const uid = String(userId);
    const isMember = (r.members || []).indexOf(uid) >= 0;
    if (!isMember && !r.isPublic) return null;
    if (!isMember && r.isPublic) joinChatRoom(roomId, userId);
    if (!Array.isArray(state.chatMessages[roomId])) state.chatMessages[roomId] = [];
    const msg = {
      id: 'm_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
      roomId,
      userId: uid,
      displayName: String(displayName || 'Гость').slice(0, 80),
      text: String(text || '').slice(0, 4000),
      createdAt: nowMs(),
    };
    state.chatMessages[roomId].push(msg);
    if (state.chatMessages[roomId].length > 500) {
      state.chatMessages[roomId] = state.chatMessages[roomId].slice(-500);
    }
    r.updatedAt = msg.createdAt;
    writeState(state);
    return msg;
  }

  function getChatMessages(roomId, limit) {
    const list = state.chatMessages[roomId] || [];
    const lim = Math.max(1, Math.min(200, parseInt(limit, 10) || 100));
    return list.slice(-lim);
  }


  return {
    touchUser,
    registerStart,
    getUser,
    getUsersCount,
    logSupportMessage,
    hashSha256,
    hashPassword,
    verifyPassword,
    publicWebUser,
    publicSession,
    publicOrder,
    publicWithdrawal,
    publicShortLink,
    publicAiMessage,
    publicTask,
    publicProtocolRecord,
    publicFavorite,
    publicSupportRequest,
    publicNotification,
    publicActivityItem,
    publicMarketingVisitor,
    publicMarketingEvent,
    findWebUserByEmail,
    findWebUserByTelegramId,
    findWebUserById,
    setWebUserReferredBy,
    listAllWebUsers,
    setDripSent,
    createMagicLoginToken,
    verifyMagicLoginToken,
    createTelegramLinkToken,
    completeTelegramLink,
    getTelegramLinkStatus,
    // Team / CRM
    logReferralActivity,
    computeReferralStage,
    transitionReferralStage,
    refreshReferralStage,
    listInviteeReferrals,
    getReferralCard,
    setInviterNote,
    getInviterNote,
    setInviterSnooze,
    clearInviterSnooze,
    isSnoozed,
    markInviterContacted,
    getTeamStats,
    getTeamFunnel,
    getNextActions,
    computeBadges,
    syncBadges,
    TEAM_STAGES,
    BADGES,
    getPublicWebUserById,
    findWebUserByReferralCode,
    createWebUser,
    awardTrx,
    getTrxBalance,
    getTrxLedger,
    getTrxLeaderboard,
    setTrxLastAwardedTier,
    listWebUsersForTrxScan,
    backfillRegistrationBonus,
    ensureWebUserFromTelegram,
    updateWebUserProfile,
    getSavedCollections,
    toggleSavedItem,
    listFavorites,
    saveFavorite,
    removeFavorite,
    updateWebUserLogin,
    setWebUserPassword,
    createWebSession,
    getWebSession,
    touchWebSession,
    revokeWebSession,
    revokeWebSessionsByUser,
    createMagicLink,
    consumeMagicLink,
    createBotAuthRequest,
    getBotAuthRequest,
    completeBotAuthRequest,
    listTasks,
    upsertTask,
    toggleTask,
    activateProtocol,
    listProtocolRecords,
    updateProtocolRecord,
    createSupportRequest,
    listSupportRequests,
    appendSupportRequestMessage,
    listVideoComments,
    addVideoComment,
    getVideoReactions,
    setVideoReaction,
    listNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    listActivityFeed,
    createOrder,
    listOrders,
    createWithdrawal,
    listWithdrawals,
    listMediaLibraryEntries,
    listLeadDeskEntries,
    upsertLeadDeskEntry,
    removeLeadDeskEntry,
    upsertMediaLibraryEntry,
    removeMediaLibraryEntry,
    getShortLinks,
    createShortLink,
    getShortLinkByCode,
    incrementShortLinkClick,
    appendAiMessage,
    listAiMessages,
    upsertMarketingVisit,
    attachMarketingVisitor,
    recordMarketingEvent,
    getMarketingContext,
    countWebUsers,
    getReferralStats,
    // Quest system
    getQuestProgress,
    getQuestStats,
    completeQuest,
    resetQuestForRepeat,
    updateLoginStreak,
    // Events
    listEvents,
    listUpcomingEvents,
    listPastEvents,
    getNextUpcomingEvent,
    upsertEvent,
    deleteEvent,
    hardDeleteEvent,
    getEvent,
    computeEventStatus,
    markEventReminderSent,
    markEventGlobalReminderSent,
    wasEventGlobalReminderSent,
    recordEventRsvp,
    getEventRsvp,
    getEventRsvpStats,
    createPlannerTask,
    listUserPlannerTasks,
    completePlannerTask,
    deletePlannerTask,
    getPlannerTaskById,
    todayDateStr,
    tomorrowDateStr,
    subscribeToEvent,
    unsubscribeFromEvent,
    getEventSubscribers,
    isSubscribedToEvent,
    markEventAttended,
    listUserEventSubscriptions,
    listTelegramMonitorChats,
    getTelegramMonitorChat,
    upsertTelegramMonitorChat,
    setTelegramMonitorChatEnabled,
    listTelegramMonitorRecipients,
    registerTelegramMonitorRecipient,
    unregisterTelegramMonitorRecipient,
    touchTelegramMonitorRecipientDelivery,
    addTelegramMonitorEvent,
    listTelegramMonitorEvents,
    getTelegramMonitorStats,
    saveTelegramMonitorDigest,
    listTelegramMonitorDigests,
    getRequiredChatGuard,
    upsertRequiredChatGuard,
    // Notification helpers
    pushQuestChapterNotification,
    pushStreakNotification,
    pushReferralNotification,
    pushSupportReplyNotification,
    pushEventReminderNotification,
    pushEventRecordingNotification,
    pushInactivityNotification,
    // Chat
    listChatRooms,
    createChatRoom,
    getChatRoom,
    getChatRoomByInvite,
    joinChatRoom,
    addChatMessage,
    getChatMessages,
  };
}

module.exports = { createStorage };
