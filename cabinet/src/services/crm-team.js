// Work-team collaboration for the CRM (NOT the MLM downline).
//
// Owner creates a team, invites Trendex users by login/username/email,
// assigns roles, and the team shares a task board + activity feed. Lead
// reservations become team-scoped so members don't double-message a lead.
//
// All data lives in planner.db (SQLite) alongside the rest of the CRM.

let _db = null;
let _storage = null;
function init(db, storage) { _db = db; _storage = storage; applySchema(db); }

function applySchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS crm_team (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      archived_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_team_owner ON crm_team(owner_user_id);

    CREATE TABLE IF NOT EXISTS crm_team_member (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',     -- owner | admin | member
      status TEXT NOT NULL DEFAULT 'active',   -- active | removed
      invited_by INTEGER,
      joined_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_team_member ON crm_team_member(team_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_member_user ON crm_team_member(user_id, status);

    CREATE TABLE IF NOT EXISTS crm_team_invite (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL,
      login TEXT NOT NULL,          -- login/username/email entered by inviter (lowercased)
      role TEXT NOT NULL DEFAULT 'member',
      code TEXT NOT NULL,
      created_by INTEGER,
      created_at INTEGER NOT NULL,
      accepted_at INTEGER,
      accepted_by_user_id INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_invite_team ON crm_team_invite(team_id);
    CREATE INDEX IF NOT EXISTS idx_invite_login ON crm_team_invite(login);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_invite_code ON crm_team_invite(code);

    CREATE TABLE IF NOT EXISTS crm_team_task (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      assigned_to_user_id INTEGER,
      created_by INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',   -- open | in_progress | done
      priority TEXT NOT NULL DEFAULT 'normal', -- low | normal | high
      due_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      done_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_task_team ON crm_team_task(team_id, status);
    CREATE INDEX IF NOT EXISTS idx_task_assignee ON crm_team_task(assigned_to_user_id, status);

    CREATE TABLE IF NOT EXISTS crm_team_task_comment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_comment_task ON crm_team_task_comment(task_id);

    CREATE TABLE IF NOT EXISTS crm_team_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL,
      user_id INTEGER,
      action TEXT NOT NULL,
      meta TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_activity_team ON crm_team_activity(team_id, created_at);
  `);
  console.log('[crm-team] schema ready');
}

// ── helpers ─────────────────────────────────────────────────────
function _now() { return Date.now(); }
function _randCode() { return require('crypto').randomBytes(6).toString('hex'); }

function _userLabel(userId) {
  try {
    const u = _storage && _storage.getPublicWebUserById && _storage.getPublicWebUserById(userId);
    if (!u) return 'User#' + userId;
    return u.displayName || u.username || u.email || ('User#' + userId);
  } catch (_) { return 'User#' + userId; }
}

function _logActivity(teamId, userId, action, meta) {
  try {
    _db.prepare(`INSERT INTO crm_team_activity (team_id, user_id, action, meta, created_at) VALUES (?,?,?,?,?)`)
      .run(teamId, userId || null, action, meta ? JSON.stringify(meta) : null, _now());
  } catch (e) { console.error('[crm-team] activity log fail:', e.message); }
}

// role of a user in a team: 'owner' | 'admin' | 'member' | null
function roleOf(teamId, userId) {
  const r = _db.prepare(`SELECT role FROM crm_team_member WHERE team_id=? AND user_id=? AND status='active'`).get(Number(teamId), Number(userId));
  return r ? r.role : null;
}
function _requireRole(teamId, userId, roles) {
  const r = roleOf(teamId, userId);
  if (!r || !roles.includes(r)) { const e = new Error('forbidden'); e.code = 'forbidden'; throw e; }
  return r;
}

// Resolve a login/username/email entered by the inviter → webUser id (or null)
function _resolveInvitee(login) {
  const q = String(login || '').trim().toLowerCase().replace(/^@/, '');
  if (!q) return null;
  try {
    const all = _storage && _storage.listAllWebUsers ? _storage.listAllWebUsers() : [];
    const hit = all.find(u => u && (
      (u.username && String(u.username).toLowerCase() === q) ||
      (u.telegramUsername && String(u.telegramUsername).toLowerCase() === q) ||
      (u.email && String(u.email).toLowerCase() === q)
    ));
    return hit ? hit.id : null;
  } catch (_) { return null; }
}

// ── teams ───────────────────────────────────────────────────────
function createTeam(ownerUserId, name) {
  const nm = String(name || '').trim().slice(0, 80) || 'Моя команда';
  const r = _db.prepare(`INSERT INTO crm_team (owner_user_id, name, created_at) VALUES (?,?,?)`).run(Number(ownerUserId), nm, _now());
  const teamId = r.lastInsertRowid;
  _db.prepare(`INSERT INTO crm_team_member (team_id, user_id, role, status, invited_by, joined_at) VALUES (?,?,'owner','active',?,?)`)
    .run(teamId, Number(ownerUserId), Number(ownerUserId), _now());
  _logActivity(teamId, ownerUserId, 'team_created', { name: nm });
  return { ok: true, team: getTeam(teamId) };
}

function getTeam(teamId) {
  const t = _db.prepare(`SELECT * FROM crm_team WHERE id=?`).get(Number(teamId));
  if (!t) return null;
  const members = listMembers(teamId);
  return { id: t.id, name: t.name, owner_user_id: t.owner_user_id, created_at: t.created_at, member_count: members.length };
}

function myTeams(userId) {
  const rows = _db.prepare(`
    SELECT t.* FROM crm_team t
    JOIN crm_team_member m ON m.team_id=t.id
    WHERE m.user_id=? AND m.status='active' AND t.archived_at IS NULL
    ORDER BY t.created_at DESC
  `).all(Number(userId));
  return rows.map(t => ({
    id: t.id, name: t.name, owner_user_id: t.owner_user_id,
    role: roleOf(t.id, userId),
    member_count: _db.prepare(`SELECT COUNT(*) n FROM crm_team_member WHERE team_id=? AND status='active'`).get(t.id).n,
    open_tasks: _db.prepare(`SELECT COUNT(*) n FROM crm_team_task WHERE team_id=? AND status!='done'`).get(t.id).n,
  }));
}

function listMembers(teamId) {
  const rows = _db.prepare(`SELECT * FROM crm_team_member WHERE team_id=? AND status='active' ORDER BY joined_at ASC`).all(Number(teamId));
  return rows.map(m => ({
    user_id: m.user_id, role: m.role, joined_at: m.joined_at,
    label: _userLabel(m.user_id),
    open_tasks: _db.prepare(`SELECT COUNT(*) n FROM crm_team_task WHERE team_id=? AND assigned_to_user_id=? AND status!='done'`).get(teamId, m.user_id).n,
  }));
}

// ── invites ─────────────────────────────────────────────────────
function invite(teamId, byUserId, login, role) {
  _requireRole(teamId, byUserId, ['owner', 'admin']);
  const lg = String(login || '').trim().toLowerCase().replace(/^@/, '');
  if (!lg) { const e = new Error('login_required'); e.code = 'bad_request'; throw e; }
  const rl = ['admin', 'member'].includes(role) ? role : 'member';
  const inviteeId = _resolveInvitee(lg);
  // If the user exists → add directly as active member (instant join).
  if (inviteeId) {
    if (roleOf(teamId, inviteeId)) return { ok: true, already_member: true };
    _db.prepare(`INSERT OR REPLACE INTO crm_team_member (team_id, user_id, role, status, invited_by, joined_at) VALUES (?,?,?,'active',?,?)`)
      .run(teamId, inviteeId, rl, byUserId, _now());
    _logActivity(teamId, byUserId, 'member_added', { user: inviteeId, role: rl });
    // best-effort push notify
    try { _notifyUser(inviteeId, '👥 Тебя добавили в команду «' + (getTeam(teamId)?.name || '') + '» в Trendex CRM'); } catch (_) {}
    return { ok: true, added: true, user_id: inviteeId };
  }
  // Unknown login → store pending invite by login (claimed on their next access)
  const code = _randCode();
  _db.prepare(`INSERT INTO crm_team_invite (team_id, login, role, code, created_by, created_at) VALUES (?,?,?,?,?,?)`)
    .run(teamId, lg, rl, code, byUserId, _now());
  _logActivity(teamId, byUserId, 'invite_pending', { login: lg, role: rl });
  return { ok: true, pending: true, login: lg, code };
}

// Claim any pending invites for a user (call on CRM access). Matches by their
// username/tg-username/email against pending invite.login.
function claimPendingInvites(userId) {
  try {
    const u = _storage && _storage.getPublicWebUserById ? _storage.getPublicWebUserById(userId) : null;
    if (!u) return 0;
    const idents = [u.username, u.telegramUsername, u.email].filter(Boolean).map(x => String(x).toLowerCase().replace(/^@/, ''));
    if (!idents.length) return 0;
    const placeholders = idents.map(() => '?').join(',');
    const pending = _db.prepare(`SELECT * FROM crm_team_invite WHERE accepted_at IS NULL AND login IN (${placeholders})`).all(...idents);
    let claimed = 0;
    for (const inv of pending) {
      if (roleOf(inv.team_id, userId)) { continue; }
      _db.prepare(`INSERT OR REPLACE INTO crm_team_member (team_id, user_id, role, status, invited_by, joined_at) VALUES (?,?,?,'active',?,?)`)
        .run(inv.team_id, userId, inv.role, inv.created_by, _now());
      _db.prepare(`UPDATE crm_team_invite SET accepted_at=?, accepted_by_user_id=? WHERE id=?`).run(_now(), userId, inv.id);
      _logActivity(inv.team_id, userId, 'member_joined', { via: 'invite' });
      claimed++;
    }
    return claimed;
  } catch (e) { console.error('[crm-team] claim fail:', e.message); return 0; }
}

function setRole(teamId, byUserId, targetUserId, role) {
  _requireRole(teamId, byUserId, ['owner']);
  const rl = ['admin', 'member'].includes(role) ? role : 'member';
  _db.prepare(`UPDATE crm_team_member SET role=? WHERE team_id=? AND user_id=? AND role!='owner'`).run(rl, teamId, targetUserId);
  _logActivity(teamId, byUserId, 'role_changed', { user: targetUserId, role: rl });
  return { ok: true };
}

function removeMember(teamId, byUserId, targetUserId) {
  _requireRole(teamId, byUserId, ['owner', 'admin']);
  if (roleOf(teamId, targetUserId) === 'owner') { const e = new Error('cannot_remove_owner'); e.code = 'bad_request'; throw e; }
  _db.prepare(`UPDATE crm_team_member SET status='removed' WHERE team_id=? AND user_id=?`).run(teamId, targetUserId);
  _logActivity(teamId, byUserId, 'member_removed', { user: targetUserId });
  return { ok: true };
}

// ── tasks ───────────────────────────────────────────────────────
function listTasks(teamId, userId, opts = {}) {
  _requireRole(teamId, userId, ['owner', 'admin', 'member']);
  let sql = `SELECT * FROM crm_team_task WHERE team_id=?`;
  const args = [Number(teamId)];
  if (opts.status) { sql += ` AND status=?`; args.push(opts.status); }
  if (opts.assignee) { sql += ` AND assigned_to_user_id=?`; args.push(Number(opts.assignee)); }
  sql += ` ORDER BY (status='done') ASC, CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, COALESCE(due_at, 9e18) ASC, created_at DESC`;
  const rows = _db.prepare(sql).all(...args);
  return rows.map(_taskView);
}

function _taskView(t) {
  return {
    id: t.id, team_id: t.team_id, title: t.title, description: t.description,
    assigned_to_user_id: t.assigned_to_user_id,
    assignee_label: t.assigned_to_user_id ? _userLabel(t.assigned_to_user_id) : null,
    created_by: t.created_by, created_by_label: _userLabel(t.created_by),
    status: t.status, priority: t.priority, due_at: t.due_at,
    created_at: t.created_at, updated_at: t.updated_at, done_at: t.done_at,
    comment_count: _db.prepare(`SELECT COUNT(*) n FROM crm_team_task_comment WHERE task_id=?`).get(t.id).n,
  };
}

function createTask(teamId, byUserId, data) {
  _requireRole(teamId, byUserId, ['owner', 'admin', 'member']);
  const title = String(data.title || '').trim().slice(0, 200);
  if (!title) { const e = new Error('title_required'); e.code = 'bad_request'; throw e; }
  const assignee = data.assigned_to ? Number(data.assigned_to) : null;
  if (assignee && !roleOf(teamId, assignee)) { const e = new Error('assignee_not_in_team'); e.code = 'bad_request'; throw e; }
  const priority = ['low', 'normal', 'high'].includes(data.priority) ? data.priority : 'normal';
  const due = data.due_at ? Number(data.due_at) : null;
  const now = _now();
  const r = _db.prepare(`
    INSERT INTO crm_team_task (team_id, title, description, assigned_to_user_id, created_by, status, priority, due_at, created_at, updated_at)
    VALUES (?,?,?,?,?,'open',?,?,?,?)
  `).run(teamId, title, String(data.description || '').slice(0, 4000), assignee, byUserId, priority, due, now, now);
  _logActivity(teamId, byUserId, 'task_created', { task: r.lastInsertRowid, title });
  if (assignee && assignee !== byUserId) {
    try { _notifyUser(assignee, '📋 Тебе назначили задачу: «' + title + '»'); } catch (_) {}
  }
  return { ok: true, task: _taskView(_db.prepare(`SELECT * FROM crm_team_task WHERE id=?`).get(r.lastInsertRowid)) };
}

function updateTask(taskId, byUserId, patch) {
  const t = _db.prepare(`SELECT * FROM crm_team_task WHERE id=?`).get(Number(taskId));
  if (!t) { const e = new Error('task_not_found'); e.code = 'not_found'; throw e; }
  _requireRole(t.team_id, byUserId, ['owner', 'admin', 'member']);
  const sets = [];
  const args = [];
  if (patch.status && ['open', 'in_progress', 'done'].includes(patch.status)) {
    sets.push('status=?'); args.push(patch.status);
    if (patch.status === 'done') { sets.push('done_at=?'); args.push(_now()); }
    else { sets.push('done_at=NULL'); }
  }
  if ('assigned_to' in patch) {
    const a = patch.assigned_to ? Number(patch.assigned_to) : null;
    if (a && !roleOf(t.team_id, a)) { const e = new Error('assignee_not_in_team'); e.code = 'bad_request'; throw e; }
    sets.push('assigned_to_user_id=?'); args.push(a);
    if (a && a !== byUserId) { try { _notifyUser(a, '📋 Тебе переназначили задачу: «' + t.title + '»'); } catch (_) {} }
  }
  if ('title' in patch) { sets.push('title=?'); args.push(String(patch.title).slice(0, 200)); }
  if ('description' in patch) { sets.push('description=?'); args.push(String(patch.description).slice(0, 4000)); }
  if ('priority' in patch && ['low', 'normal', 'high'].includes(patch.priority)) { sets.push('priority=?'); args.push(patch.priority); }
  if ('due_at' in patch) { sets.push('due_at=?'); args.push(patch.due_at ? Number(patch.due_at) : null); }
  if (!sets.length) return { ok: true, unchanged: true };
  sets.push('updated_at=?'); args.push(_now());
  args.push(Number(taskId));
  _db.prepare(`UPDATE crm_team_task SET ${sets.join(', ')} WHERE id=?`).run(...args);
  _logActivity(t.team_id, byUserId, 'task_updated', { task: taskId, ...patch });
  return { ok: true, task: _taskView(_db.prepare(`SELECT * FROM crm_team_task WHERE id=?`).get(taskId)) };
}

function addComment(taskId, byUserId, text) {
  const t = _db.prepare(`SELECT * FROM crm_team_task WHERE id=?`).get(Number(taskId));
  if (!t) { const e = new Error('task_not_found'); e.code = 'not_found'; throw e; }
  _requireRole(t.team_id, byUserId, ['owner', 'admin', 'member']);
  const txt = String(text || '').trim().slice(0, 2000);
  if (!txt) { const e = new Error('text_required'); e.code = 'bad_request'; throw e; }
  _db.prepare(`INSERT INTO crm_team_task_comment (task_id, user_id, text, created_at) VALUES (?,?,?,?)`).run(taskId, byUserId, txt, _now());
  _logActivity(t.team_id, byUserId, 'task_comment', { task: taskId });
  // notify assignee + creator (except commenter)
  const targets = new Set([t.assigned_to_user_id, t.created_by].filter(x => x && x !== byUserId));
  for (const uid of targets) { try { _notifyUser(uid, '💬 Новый комментарий к задаче «' + t.title + '»'); } catch (_) {} }
  return { ok: true };
}

function listComments(taskId, userId) {
  const t = _db.prepare(`SELECT * FROM crm_team_task WHERE id=?`).get(Number(taskId));
  if (!t) return { ok: false, reason: 'not_found' };
  _requireRole(t.team_id, userId, ['owner', 'admin', 'member']);
  const rows = _db.prepare(`SELECT * FROM crm_team_task_comment WHERE task_id=? ORDER BY created_at ASC`).all(Number(taskId));
  return { ok: true, comments: rows.map(c => ({ id: c.id, user_id: c.user_id, label: _userLabel(c.user_id), text: c.text, created_at: c.created_at })) };
}

function activity(teamId, userId, limit = 50) {
  _requireRole(teamId, userId, ['owner', 'admin', 'member']);
  const rows = _db.prepare(`SELECT * FROM crm_team_activity WHERE team_id=? ORDER BY created_at DESC LIMIT ?`).all(Number(teamId), Math.min(200, limit));
  return rows.map(a => ({ id: a.id, user_id: a.user_id, label: a.user_id ? _userLabel(a.user_id) : 'система', action: a.action, meta: a.meta ? JSON.parse(a.meta) : null, created_at: a.created_at }));
}

// Optional bot push — wired from server.js if a bot instance is available.
let _botNotify = null;
function setNotifier(fn) { _botNotify = fn; }
function _notifyUser(userId, text) { if (_botNotify) _botNotify(userId, text); }

module.exports = {
  init, applySchema,
  roleOf,
  createTeam, getTeam, myTeams, listMembers,
  invite, claimPendingInvites, setRole, removeMember,
  listTasks, createTask, updateTask, addComment, listComments, activity,
  setNotifier,
};
