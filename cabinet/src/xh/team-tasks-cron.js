const { isSilenced: _gsIsSilenced } = require('./group-silence');
// Trendex: Morning auto-tasks — creates planner tasks for inviter about their team.
// Runs at 9:00 MSK daily (checks every 10 min, guards by date).

let lastRunDate = null; // YYYY-MM-DD

function isMskMorning9() {
  // 9:00 МСК = 6:00 UTC (±5 min)
  const h = new Date().getUTCHours();
  const m = new Date().getUTCMinutes();
  return h === 6 && m < 10;
}

function displayName(u) {
  return u.displayName || u.email || `User${u.id}`;
}

async function processAutoTasks(bot, storage) {
  try {
    if (!isMskMorning9()) return;
    const today = new Date().toISOString().slice(0, 10);
    if (lastRunDate === today) return;
    lastRunDate = today;

    // Need access to planner SQLite
    let db;
    try { db = require('../planner/db/database'); }
    catch (e) { console.error('[team_auto_tasks] planner db unavailable', e && e.message); return; }

    const allUsers = storage.listAllWebUsers ? storage.listAllWebUsers() : [];
    const byInviter = new Map();
    for (const u of allUsers) {
      if (!u.referredByUserId) continue;
      if (!byInviter.has(u.referredByUserId)) byInviter.set(u.referredByUserId, []);
      byInviter.get(u.referredByUserId).push(u);
    }

    for (const [inviterId, refs] of byInviter.entries()) {
      try {
        const inviter = storage.findWebUserById(inviterId);
        if (!inviter || !inviter.telegramUserId) continue;
        // Find planner user by tg_id
        const plannerUser = db.getUserByTgId ? db.getUserByTgId(inviter.telegramUserId) : null;
        if (!plannerUser) continue;

        const actions = storage.getNextActions(inviterId).slice(0, 5);
        for (const a of actions) {
          const ref = a.ref;
          const name = displayName(ref);
          const title = `👥 ${a.reason}: ${name}`;
          // Check duplicate: don't create same task title today for this user
          try {
            const existing = db.getDb().prepare(
              'SELECT 1 FROM tasks WHERE user_id = ? AND title = ? AND due_date = ? LIMIT 1'
            ).get(plannerUser.id, title, today);
            if (existing) continue;
            // Create task
            if (db.createTask) {
              db.createTask(plannerUser.id, {
                title,
                priority: a.priority >= 8 ? 2 : 3,
                due_date: today,
              });
              console.log(`[team_auto_task] created for inviter=${inviterId} ref=${ref.id}`);
            }
          } catch (e) {
            console.error('[team_auto_task_create]', e && e.message);
          }
        }
      } catch (e) {
        console.error('[team_auto_tasks_inviter]', inviterId, e && e.message);
      }
    }
  } catch (e) {
    console.error('[team_auto_tasks_fatal]', e && e.message);
  }
}

function startTeamTasksCron(bot, storage) {
  // Check every 10 min; actual run gated by time-of-day
  setInterval(() => { processAutoTasks(bot, storage); }, 10 * 60 * 1000).unref();
  console.log('[team_tasks_cron] started (morning auto-tasks 9:00 MSK)');
}

module.exports = { startTeamTasksCron, processAutoTasks };
