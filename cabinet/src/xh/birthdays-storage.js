// Self-contained persistent storage for the Birthdays module.
// Keeps its own JSON file (data/birthdays.json) so we don't need to patch
// the main storage.js. Atomic writes via tmp+rename, debounced flush.

const fs = require('fs');
const path = require('path');

function makeId(prefix, counter) {
  return `${prefix}_${String(counter).padStart(8, '0')}`;
}

function createBirthdayStorage(config = {}) {
  const dataDir = path.resolve(process.cwd(), String(config.dataDir || './data'));
  const filePath = path.join(dataDir, 'birthdays.json');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  let state = {
    counter: 1,
    // ownerId -> array of birthday objects
    byOwner: {},
    // ownerId -> wizard state for multi-step input
    wizard: {},
    // ownerId -> last generated text per birthdayId
    lastText: {},
    // ownerId -> business_connection_id
    businessConn: {},
    // ownerId -> { lang, notifyTime, enabled }
    prefs: {},
    // ownerId -> { ymd: [bdIds already sent on that date] }
    sentLog: {},
    // ownerId -> mtproto session record (Phase 3)
    tgSessions: {},
  };

  // Load
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      state = Object.assign(state, parsed);
    }
  } catch (e) {
    console.warn('[birthdays-storage] failed to load, starting fresh:', e.message);
  }

  let saveTimer = null;
  function persist() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const tmp = filePath + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
        fs.renameSync(tmp, filePath);
      } catch (e) {
        console.error('[birthdays-storage] save error:', e.message);
      }
    }, 200);
  }

  function listBirthdayOwners() {
    return Object.keys(state.byOwner).filter(id => (state.byOwner[id] || []).length);
  }

  function listBirthdays(ownerId) {
    return state.byOwner[String(ownerId)] || [];
  }

  function getBirthday(ownerId, id) {
    const list = state.byOwner[String(ownerId)] || [];
    return list.find(b => b.id === id) || null;
  }

  function addBirthday(ownerId, data) {
    const oid = String(ownerId);
    const id = makeId('bd', state.counter++);
    const item = {
      id,
      ownerId: oid,
      name: String(data.name || '').trim(),
      day: +data.day, month: +data.month,
      year: data.year ? +data.year : null,
      tgUsername: data.tgUsername || null,
      tgUserId: data.tgUserId || null,
      note: data.note || null,
      source: data.source || 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (!state.byOwner[oid]) state.byOwner[oid] = [];
    state.byOwner[oid].push(item);
    persist();
    return id;
  }

  function updateBirthday(ownerId, id, patch) {
    const list = state.byOwner[String(ownerId)] || [];
    const idx = list.findIndex(b => b.id === id);
    if (idx === -1) return null;
    const updated = { ...list[idx], ...patch, updatedAt: new Date().toISOString() };
    list[idx] = updated;
    persist();
    return updated;
  }

  function deleteBirthday(ownerId, id) {
    const oid = String(ownerId);
    const list = state.byOwner[oid] || [];
    const before = list.length;
    state.byOwner[oid] = list.filter(b => b.id !== id);
    persist();
    return list.length !== state.byOwner[oid].length || before > state.byOwner[oid].length;
  }

  // Bulk import (used by MTProto sync) — dedupes by tgUserId or by name+date.
  function bulkUpsertFromTg(ownerId, items) {
    const oid = String(ownerId);
    const list = state.byOwner[oid] || [];
    const byKey = new Map();
    for (const b of list) {
      const k = b.tgUserId ? `tg:${b.tgUserId}` : `nm:${b.name.toLowerCase()}|${b.day}|${b.month}`;
      byKey.set(k, b);
    }
    let added = 0, updated = 0;
    for (const it of items) {
      const k = it.tgUserId ? `tg:${it.tgUserId}` : `nm:${(it.name||'').toLowerCase()}|${it.day}|${it.month}`;
      if (byKey.has(k)) {
        const existing = byKey.get(k);
        Object.assign(existing, {
          tgUsername: it.tgUsername || existing.tgUsername,
          tgUserId: it.tgUserId || existing.tgUserId,
          year: it.year || existing.year,
          source: 'tg-sync',
          updatedAt: new Date().toISOString(),
        });
        updated++;
      } else {
        const id = makeId('bd', state.counter++);
        list.push({
          id, ownerId: oid,
          name: it.name, day: +it.day, month: +it.month,
          year: it.year ? +it.year : null,
          tgUsername: it.tgUsername || null,
          tgUserId: it.tgUserId || null,
          note: null, source: 'tg-sync',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        added++;
      }
    }
    state.byOwner[oid] = list;
    persist();
    return { added, updated };
  }

  // Wizard state for multi-step input (e.g. add-birthday)
  function setBirthdayWizardState(ownerId, value) {
    const oid = String(ownerId);
    if (!value) delete state.wizard[oid];
    else state.wizard[oid] = { ...value, _ts: Date.now() };
    persist();
  }
  function getBirthdayWizardState(ownerId) {
    const w = state.wizard[String(ownerId)];
    if (!w) return null;
    // Auto-expire after 10 minutes
    if (Date.now() - (w._ts || 0) > 10 * 60 * 1000) {
      delete state.wizard[String(ownerId)];
      persist();
      return null;
    }
    return w;
  }
  function clearBirthdayWizardState(ownerId) {
    delete state.wizard[String(ownerId)];
    persist();
  }

  // Last-generated congratulation text (used by inline mode share + send)
  function saveBirthdayLastText(ownerId, birthdayId, text) {
    const oid = String(ownerId);
    if (!state.lastText[oid]) state.lastText[oid] = {};
    state.lastText[oid][birthdayId] = { text, ts: Date.now() };
    persist();
  }
  function getBirthdayLastText(ownerId, birthdayId) {
    const oid = String(ownerId);
    return state.lastText[oid]?.[birthdayId]?.text || null;
  }

  // Business Bot connection
  function setBusinessConnection(ownerId, connId) {
    state.businessConn[String(ownerId)] = connId;
    persist();
  }
  function getBusinessConnection(ownerId) {
    return state.businessConn[String(ownerId)] || null;
  }
  function clearBusinessConnection(ownerId) {
    delete state.businessConn[String(ownerId)];
    persist();
  }

  // Preferences
  function getBirthdayPrefs(ownerId) {
    return state.prefs[String(ownerId)] || { lang: 'ru', notifyTime: '09:00', enabled: true };
  }
  function setBirthdayPrefs(ownerId, patch) {
    const oid = String(ownerId);
    state.prefs[oid] = { ...getBirthdayPrefs(oid), ...patch };
    persist();
  }

  // Sent log (mark a birthday auto-sent today, prevent duplicate)
  function markBirthdaySent(ownerId, birthdayId) {
    const oid = String(ownerId);
    const ymd = (() => {
      const utc = new Date();
      const msk = new Date(utc.getTime() + 3 * 3600 * 1000);
      return `${msk.getUTCFullYear()}-${String(msk.getUTCMonth() + 1).padStart(2,'0')}-${String(msk.getUTCDate()).padStart(2,'0')}`;
    })();
    if (!state.sentLog[oid]) state.sentLog[oid] = {};
    if (!state.sentLog[oid][ymd]) state.sentLog[oid][ymd] = [];
    if (!state.sentLog[oid][ymd].includes(birthdayId)) {
      state.sentLog[oid][ymd].push(birthdayId);
      persist();
    }
  }
  function wasBirthdaySentToday(ownerId, birthdayId) {
    const oid = String(ownerId);
    const utc = new Date();
    const msk = new Date(utc.getTime() + 3 * 3600 * 1000);
    const ymd = `${msk.getUTCFullYear()}-${String(msk.getUTCMonth() + 1).padStart(2,'0')}-${String(msk.getUTCDate()).padStart(2,'0')}`;
    return !!state.sentLog[oid]?.[ymd]?.includes(birthdayId);
  }

  // MTProto session storage (Phase 3)
  function getTgSession(ownerId) { return state.tgSessions[String(ownerId)] || null; }
  function setTgSession(ownerId, rec) { state.tgSessions[String(ownerId)] = rec; persist(); }
  function clearTgSession(ownerId) { delete state.tgSessions[String(ownerId)]; persist(); }

  return {
    listBirthdayOwners,
    listBirthdays,
    getBirthday,
    addBirthday,
    updateBirthday,
    deleteBirthday,
    bulkUpsertFromTg,
    setBirthdayWizardState,
    getBirthdayWizardState,
    clearBirthdayWizardState,
    saveBirthdayLastText,
    getBirthdayLastText,
    setBusinessConnection,
    getBusinessConnection,
    clearBusinessConnection,
    getBirthdayPrefs,
    setBirthdayPrefs,
    markBirthdaySent,
    wasBirthdaySentToday,
    getTgSession, setTgSession, clearTgSession,
    _persist: persist,
  };
}

module.exports = { createBirthdayStorage };
