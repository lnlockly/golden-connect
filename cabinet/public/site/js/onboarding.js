
/* ════════════════ ONBOARDING WIZARD — 10 шагов, $1 reward ════════════════ */
(function() {
  if (window._goldenConnectOnbWired) return;
  window._goldenConnectOnbWired = true;

  const QUESTIONS = [
    { n: 1, key: 'name', text: 'Как тебя называть?', sub: 'Просто имя — будем обращаться лично', type: 'text', icon: '👋' },
    { n: 2, key: 'goal', text: 'Зачем ты пришёл в Golden Connect?', sub: 'Поможет составить точный план', type: 'choice', icon: '🎯',
      options: [
        ['💵', 'Зарабатывать на партнёрке', 'income_partner'],
        ['📋', 'Зарабатывать на бирже заданий', 'income_jobs'],
        ['🚀', 'Запустить свою рекламу', 'launch_ads'],
        ['🛒', 'Продавать цифровые товары', 'sell_digital'],
        ['🤔', 'Просто посмотреть пока', 'just_looking'],
      ] },
    { n: 3, key: 'income', text: 'Какой доход хочешь получать в месяц?', sub: '', type: 'choice', icon: '💵',
      options: [['💚','$50-100','50_100'],['💙','$300-500','300_500'],['💜','$1000-3000','1000_3000'],['🔥','$5000+','5000_plus']] },
    { n: 4, key: 'time', text: 'Сколько времени готов уделять в день?', sub: '', type: 'choice', icon: '⏱',
      options: [['⚡','~30 минут','30m'],['🌟','1-2 часа','1_2h'],['🚀','3-4 часа','3_4h'],['💪','Полный день','full_day']] },
    { n: 5, key: 'experience', text: 'Опыт в онлайн-маркетинге?', sub: '', type: 'choice', icon: '💼',
      options: [['🌱','Совсем нет','newbie'],['🤝','Был в МЛМ','mlm'],['🎯','Арбитраж/таргет','ads'],['📺','Веду блог','blogger'],['🏆','Опытный','pro']] },
    { n: 6, key: 'budget', text: 'Бюджет на старт?', sub: 'FREE тоже можно — но с тарифом откроется больше уровней', type: 'choice', icon: '💰',
      options: [['🆓','$0 (только бесплатно)','0'],['🚀','~$45 (LAUNCH)','45'],['⚡','~$90 (BOOST)','90'],['🔥','~$135 (ROCKET)','135'],['💎','$300+','300_plus']] },
    { n: 7, key: 'network', text: 'Сколько людей в окружении могут заинтересоваться?', sub: 'Друзья, коллеги, подписчики', type: 'choice', icon: '👥',
      options: [['👤','~10-30','10_30'],['👥','~50-100','50_100'],['🏘','~200-500','200_500'],['🌆','1000+','1000_plus']] },
    { n: 8, key: 'channels', text: 'Где ты активен в соцсетях?', sub: '', type: 'choice', icon: '📱',
      options: [['✈️','Telegram','telegram'],['📷','Instagram','instagram'],['🌐','VK','vk'],['📺','YouTube/TikTok','youtube_tiktok'],['🌈','Везде понемногу','all'],['🚫','Нигде толком','none']] },
    { n: 9, key: 'fear', text: 'Что больше всего пугает на старте?', sub: 'AI учтёт это в твоём плане', type: 'choice', icon: '🚧',
      options: [['❓','Не понимаю с чего начать','no_start'],['👻','Где брать клиентов','no_clients'],['💸','Не окупить вложения','no_roi'],['⏰','Мало времени','no_time'],['🛡','Боюсь обмана','scam_fear'],['😎','Ничего не пугает','no_fear']] },
    { n: 10, key: 'bonus', text: 'Получить бонус $1 + персональный план?', sub: '', type: 'choice', icon: '🎁',
      options: [['🚀','Получить план и $1','yes'],['🤔','Пока без плана','no_plan']] },
  ];
  const ONB_KEY = 'goldenConnect_onb_seen';

  function api(method, url, body) {
    return fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin', body: body ? JSON.stringify(body) : undefined,
    }).then(r => r.json()).catch(() => ({ ok: false }));
  }

  let state = { step: 0, answers: {}, completed: false };

  async function checkNeeded() {
    const r = await api('GET', '/cabinet/api/onboarding/state');
    if (!r || !r.ok) return false;
    state = { step: r.step || 0, answers: r.answers || {}, completed: !!r.completed, plan: r.plan };
    return !r.completed;
  }

  function buildModal() {
    const wrap = document.createElement('div');
    wrap.id = 'trx-onb-overlay';
    wrap.className = 'trx-onb-overlay';
    wrap.innerHTML = '<div class="trx-onb-card">' +
      '<div class="trx-onb-progress" id="trx-onb-progress"></div>' +
      '<div class="trx-onb-body" id="trx-onb-body"></div>' +
      '<div class="trx-onb-footer" id="trx-onb-footer"></div>' +
    '</div>';
    document.body.appendChild(wrap);
    return wrap;
  }
  function renderProgress(step) {
    const dots = [];
    for (let i = 1; i <= 10; i++) dots.push('<div class="trx-onb-dot' + (i <= step ? ' active' : '') + (i === step ? ' current' : '') + '"></div>');
    return '<div class="trx-onb-bar">' + dots.join('') + '</div><div class="trx-onb-step-label">Шаг ' + step + ' из 10</div>';
  }
  function renderQ(q, currentAnswer) {
    let html = '<div class="trx-onb-icon">' + q.icon + '</div>' +
               '<h2 class="trx-onb-title">' + q.text + '</h2>' +
               (q.sub ? '<p class="trx-onb-sub">' + q.sub + '</p>' : '');
    if (q.type === 'choice') {
      html += '<div class="trx-onb-options">';
      q.options.forEach(opt => {
        const sel = currentAnswer === opt[2] ? ' selected' : '';
        html += '<button class="trx-onb-opt' + sel + '" data-value="' + opt[2] + '">' +
                '<span class="trx-onb-opt-emoji">' + opt[0] + '</span>' +
                '<span class="trx-onb-opt-label">' + opt[1] + '</span></button>';
      });
      html += '</div>';
    } else {
      const v = (currentAnswer || '').replace(/"/g, '&quot;');
      html += '<input type="text" class="trx-onb-input" id="trx-onb-input" placeholder="Напиши имя..." maxlength="60" value="' + v + '" />';
    }
    return html;
  }
  function renderFooter(step, q) {
    const skip = step < 10 ? '<button class="trx-onb-skip" id="trx-onb-skip-btn">Свернуть (пройти позже)</button>' : '';
    if (q.type === 'text') return skip + '<button class="trx-onb-next" id="trx-onb-next-btn">Дальше →</button>';
    return skip;
  }
  async function saveAnswer(step, value) {
    state.answers[String(step)] = value;
    state.step = Math.max(step, state.step);
    return api('POST', '/cabinet/api/onboarding/answer', { step, answer: value, source: 'cabinet' });
  }
  async function showStep(stepIdx, modal) {
    const q = QUESTIONS[stepIdx - 1];
    const body = modal.querySelector('#trx-onb-body');
    const footer = modal.querySelector('#trx-onb-footer');
    const prog = modal.querySelector('#trx-onb-progress');
    prog.innerHTML = renderProgress(stepIdx);
    body.innerHTML = renderQ(q, state.answers[String(stepIdx)]);
    footer.innerHTML = renderFooter(stepIdx, q);
    body.querySelectorAll('.trx-onb-opt').forEach(btn => {
      btn.addEventListener('click', async () => {
        const val = btn.getAttribute('data-value');
        body.querySelectorAll('.trx-onb-opt').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        await saveAnswer(stepIdx, val);
        if (stepIdx >= 10) await complete(modal);
        else setTimeout(() => showStep(stepIdx + 1, modal), 150);
      });
    });
    const nextBtn = footer.querySelector('#trx-onb-next-btn');
    if (nextBtn) {
      const inp = body.querySelector('#trx-onb-input');
      if (inp) {
        setTimeout(() => inp.focus(), 100);
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); nextBtn.click(); } });
      }
      nextBtn.addEventListener('click', async () => {
        const val = (inp && inp.value || '').trim();
        if (!val) { inp.classList.add('error'); inp.focus(); return; }
        await saveAnswer(stepIdx, val.slice(0, 60));
        if (stepIdx >= 10) await complete(modal);
        else showStep(stepIdx + 1, modal);
      });
    }
    const skipBtn = footer.querySelector('#trx-onb-skip-btn');
    if (skipBtn) skipBtn.addEventListener('click', () => {
      try { localStorage.setItem(ONB_KEY + '_dismissed_at', Date.now()); } catch (e) {}
      modal.remove();
    });
  }
  async function complete(modal) {
    const body = modal.querySelector('#trx-onb-body');
    const footer = modal.querySelector('#trx-onb-footer');
    const prog = modal.querySelector('#trx-onb-progress');
    prog.innerHTML = renderProgress(10);
    body.innerHTML = '<div class="trx-onb-icon">⚡</div>' +
                     '<h2 class="trx-onb-title">Генерирую персональный план...</h2>' +
                     '<p class="trx-onb-sub">AI анализирует ответы — ~10 секунд</p>' +
                     '<div class="trx-onb-spinner"></div>';
    footer.innerHTML = '';
    const r = await api('POST', '/cabinet/api/onboarding/complete', { source: 'cabinet' });
    if (!r || !r.ok) {
      body.innerHTML = '<div class="trx-onb-icon">⚠️</div><h2 class="trx-onb-title">Ошибка</h2>' +
        '<p class="trx-onb-sub">Не удалось сохранить план. Попробуй позже.</p>';
      footer.innerHTML = '<button class="trx-onb-next" onclick="document.getElementById(\'trx-onb-overlay\').remove()">Закрыть</button>';
      return;
    }
    state.completed = true; state.plan = r.plan;
    const reward = r.reward_paid ? '<div class="trx-onb-reward">🎁 +$1 на gift-баланс зачислено</div>' : '';
    body.innerHTML = '<div class="trx-onb-icon trx-onb-celebrate">🎉</div>' +
                     '<h2 class="trx-onb-title">Готово! План создан</h2>' +
                     reward +
                     '<div class="trx-onb-badge">🎖 Бейдж: Onboarded</div>' +
                     '<div class="trx-onb-plan-preview">' + (r.plan || '').replace(/\n/g, '<br>') + '</div>';
    footer.innerHTML = '<button class="trx-onb-next" id="trx-onb-go-plan">Открыть Мой план →</button>';
    document.getElementById('trx-onb-go-plan').addEventListener('click', () => {
      modal.remove();
      try { localStorage.setItem(ONB_KEY + '_done', '1'); } catch (e) {}
      try { window.location.hash = '#/my_plan'; } catch (e) {}
      try { if (typeof window.goPage === 'function') window.goPage('my_plan'); } catch (e) {}
    });
  }
  async function show(opts) {
    const force = opts && opts.force;
    let needed = true;
    try { needed = await checkNeeded(); } catch (e) { needed = true; }
    // For explicit user clicks (force), always open. For auto-show, skip if completed.
    if (!force && !needed) return false;
    const modal = buildModal();
    // If user wants to retake (already completed), start from step 1; else continue.
    const startStep = force ? 1 : Math.min((state.step || 0) + 1, 10);
    showStep(startStep, modal);
    return true;
  }
  function maybeAuto() {
    try {
      const dismissed = parseInt(localStorage.getItem(ONB_KEY + '_dismissed_at') || '0', 10);
      if (dismissed && (Date.now() - dismissed < 24 * 3600 * 1000)) return;
    } catch (e) {}
    setTimeout(show, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', maybeAuto);
  else maybeAuto();
  window.showGoldenConnectOnboarding = function () { return show({ force: true }); };

  /* ─── #/my_plan page (modernized: adaptive paths + optional AI plan) ─── */
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]; }); }

  async function loadMyPlan() {
    const root = document.getElementById('myPlanContent') || document.getElementById('my_planContent');
    if (!root) return;
    root.innerHTML = '<div class="trx-plan-loading">⚡ Подбираем твой план...</div>';

    // Fetch BOTH adaptive recommendations and legacy AI plan in parallel
    let rec = null, ai = null;
    try {
      const [recRes, aiRes] = await Promise.all([
        api('GET', '/cabinet/api/onboarding/recommend').catch(() => null),
        api('GET', '/cabinet/api/onboarding/plan').catch(() => null),
      ]);
      rec = recRes && recRes.ok ? recRes : null;
      ai = aiRes && aiRes.ok && aiRes.plan ? aiRes : null;
    } catch (_) {}

    const profile = (rec && rec.profile) || {};
    const paths = (rec && rec.paths) || [];

    let html = '';

    // Hero
    html += '<div class="cab-card" style="background:linear-gradient(135deg,rgba(0,212,255,0.08),rgba(177,74,237,0.08));border:1px solid rgba(0,212,255,0.25);text-align:center;padding:24px;margin-bottom:18px">';
    html += '<div style="font-size:42px;margin-bottom:8px">🎯</div>';
    html += '<h2 style="margin:0 0 8px;color:#fff">Мой план в Golden Connect</h2>';
    html += '<p style="margin:0 auto 8px;color:#cbd5e1;font-size:14px;line-height:1.6;max-width:640px">Адаптивные пути на основе твоего профиля. Выбери что ближе и поехали.</p>';
    html += '</div>';

    // Profile summary
    html += '<div class="cab-card" style="margin-bottom:18px">';
    html += '<h3 style="margin:0 0 10px">📋 Твой профиль</h3>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;font-size:13px;color:#cbd5e1">';
    html += '<div><b>Уровень:</b> ' + _esc(profile.experienceLevel || '—') + '</div>';
    html += '<div><b>Бюджет/мес:</b> $' + (profile.monthlyBudget || 0) + '</div>';
    html += '<div><b>Источник трафика:</b> ' + _esc(profile.trafficSource || '—') + '</div>';
    const socActive = profile.socials ? Object.entries(profile.socials).filter(function(e){return e[1]}).map(function(e){return e[0]}).join(', ') : '';
    html += '<div><b>Соцсети:</b> ' + (socActive ? _esc(socActive) : '—') + '</div>';
    html += '</div></div>';

    // Adaptive paths
    if (paths.length) {
      paths.forEach(function (p, i) {
        const color = ['#10b981', '#00d4ff', '#fbbf24', '#94a3b8', '#FF2E97'][i] || '#94a3b8';
        html += '<div class="cab-card" style="border-top:3px solid ' + color + ';margin-bottom:14px">';
        html += '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">';
        html += '<div><h3 style="margin:0;color:#fff;font-size:18px">' + _esc(p.title) + '</h3>';
        if (i === 0) html += '<div style="font-size:11px;color:' + color + ';font-weight:700;text-transform:uppercase;margin-top:4px">★ Рекомендуем</div>';
        html += '</div></div>';
        html += '<p style="color:#cbd5e1;margin:8px 0 12px;font-size:14px">' + _esc(p.reason) + '</p>';
        html += '<ol style="padding-left:20px;color:#e2e8f0;font-size:13px;line-height:1.7;margin:8px 0 14px">';
        (p.steps || []).forEach(function (step) { html += '<li>' + _esc(step) + '</li>'; });
        html += '</ol>';
        if (p.cta) {
          html += '<a href="' + _esc(p.cta.url) + '" class="cab-btn cab-btn-primary" onclick="if(this.href.indexOf(\'#\')>=0){window.location.hash=this.href.split(\'#\').pop();return false;}">' + _esc(p.cta.label) + ' →</a>';
        }
        html += '</div>';
      });
    } else {
      html += '<div class="cab-card" style="text-align:center;padding:30px">';
      html += '<div style="font-size:42px;margin-bottom:10px">🎯</div>';
      html += '<h3 style="color:#fff">Заполни профиль чтобы получить план</h3>';
      html += '<p style="color:#cbd5e1;font-size:13px">Открой <b>Профиль</b> — укажи опыт, бюджет, источник трафика, соцсети. Тогда я подберу 1-3 оптимальных пути.</p>';
      html += '<a href="#/profile" onclick="navigateTo(\'profile\');return false;" class="cab-btn cab-btn-primary" style="margin-top:10px">Заполнить профиль →</a>';
      html += '</div>';
    }

    // Optional: legacy AI plan (if user passed old questionnaire)
    if (ai && ai.plan) {
      const aiHtml = String(ai.plan).replace(/\n/g, '<br>').replace(/\*([^\*]+)\*/g, '<b>$1</b>');
      html += '<div class="cab-card" style="margin-top:18px;border-left:3px solid #B14AED">';
      html += '<h3 style="margin:0 0 10px">🤖 Твой AI-план (расширенный)</h3>';
      html += '<div style="font-size:13px;color:#cbd5e1;margin-bottom:8px">' +
        (ai.completed_at ? 'Создан ' + new Date(ai.completed_at).toLocaleDateString() : '') +
        (ai.reward_paid ? ' · 🎁 $1 зачислено' : '') + '</div>';
      html += '<div style="color:#e2e8f0;font-size:14px;line-height:1.7">' + aiHtml + '</div>';
      html += '<button class="cab-btn cab-btn-sm" style="margin-top:14px" onclick="window.showGoldenConnectOnboarding && window.showGoldenConnectOnboarding()">↻ Перепройти AI-анкету</button>';
      html += '</div>';
    } else {
      html += '<div class="cab-card" style="margin-top:18px;text-align:center;padding:24px;background:rgba(177,74,237,0.06)">';
      html += '<div style="font-size:32px">🤖</div>';
      html += '<h3 style="color:#fff;margin:8px 0 6px">Хочешь больше детального AI-плана?</h3>';
      html += '<p style="color:#cbd5e1;font-size:13px;margin:0 auto 12px;max-width:420px">Пройди расширенную анкету (10 вопросов · 3 минуты): получишь AI-план на 30 дней + <b>$1 на gift-баланс</b>.</p>';
      html += '<button class="cab-btn cab-btn-primary" onclick="window.showGoldenConnectOnboarding && window.showGoldenConnectOnboarding()">🚀 Пройти AI-анкету</button>';
      html += '</div>';
    }

    root.innerHTML = html;
  }

  // Phase R: daily plan rendering + add-to-planner integration
  async function renderDailyPlan(root) {
    const slot = document.createElement('div');
    slot.className = 'cab-card';
    slot.style.cssText = 'margin-top:18px;border-left:3px solid #fbbf24';
    slot.innerHTML = '<div style="opacity:.7">⏳ Готовим план на сегодня…</div>';
    root.appendChild(slot);
    let r;
    try { r = await api('GET', '/cabinet/api/my-plan/daily'); }
    catch (_) { r = null; }
    if (!r || !r.ok || !Array.isArray(r.plan) || !r.plan.length) {
      slot.innerHTML = '<h3 style="margin:0 0 8px">📅 План на сегодня</h3><p style="color:#cbd5e1;font-size:13px">Не удалось сгенерировать план. Попробуй чуть позже.</p>';
      return;
    }
    const today = r.day || new Date().toISOString().slice(0, 10);
    const niceDate = new Date(today + 'T00:00:00').toLocaleDateString('ru-RU', { day:'numeric', month:'long', weekday:'long' });
    let html = '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:14px">';
    html += '<div><h3 style="margin:0;color:#fff">📅 План на сегодня</h3><div style="font-size:12px;color:#94a3b8">' + _esc(niceDate) + '</div></div>';
    html += '<button class="cab-btn cab-btn-sm" onclick="window._refreshDailyPlan()" title="Сгенерировать заново">↻ Новый план</button>';
    html += '</div>';
    html += '<div id="daily-plan-list" style="display:flex;flex-direction:column;gap:10px">';
    r.plan.forEach(function(t, i) {
      const colors = { growth:'#10b981', content:'#00d4ff', outreach:'#fbbf24', learning:'#B14AED', tech:'#94a3b8' };
      const color = colors[t.category] || '#94a3b8';
      const prio = t.priority === 1 ? '🔴' : t.priority === 2 ? '🟡' : '⚪';
      const suggTime = t.suggested_time ? ' · ⏰ ' + _esc(t.suggested_time) : '';
      html += '<div class="dp-task" data-idx="' + i + '" style="padding:12px;border-radius:8px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-left:3px solid ' + color + '">';
      html += '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:6px">';
      html += '<div style="font-weight:700;color:#fff;font-size:14px;flex:1">' + prio + ' ' + _esc(t.title) + '</div>';
      html += '<div style="font-size:11px;color:#94a3b8;white-space:nowrap">⏱ ' + (t.time_min || 15) + ' мин' + suggTime + '</div>';
      html += '</div>';
      if (t.description) html += '<div style="color:#cbd5e1;font-size:13px;line-height:1.5;margin-bottom:8px">' + _esc(t.description) + '</div>';
      html += '<button class="cab-btn cab-btn-sm cab-btn-primary" onclick="window._addPlanTask(' + i + ', this)" style="font-size:12px;padding:6px 12px">+ В планировщик</button>';
      html += '</div>';
    });
    html += '</div>';
    slot.innerHTML = html;
    // Stash plan data so add button can read it
    window._currentDailyPlan = { plan: r.plan, day: today };
  }

  window._addPlanTask = async function(idx, btn) {
    const data = window._currentDailyPlan;
    if (!data || !data.plan[idx]) return;
    const t = data.plan[idx];
    btn.disabled = true;
    btn.textContent = '⏳';
    try {
      await api('POST', '/cabinet/api/planner', {
        title: t.title,
        description: t.description || '',
        priority: t.priority || 2,
        due_date: data.day,
        due_time: t.suggested_time || null,
      });
      btn.textContent = '✓ Добавлено';
      btn.style.background = '#10b981';
      btn.style.borderColor = '#10b981';
    } catch (e) {
      btn.disabled = false;
      btn.textContent = '+ В планировщик';
      if (window.toast) window.toast('Не удалось добавить: ' + (e.message || ''), 'error');
    }
  };

  window._refreshDailyPlan = async function() {
    try { await api('POST', '/cabinet/api/my-plan/daily/refresh'); }
    catch (_) {}
    if (window.loadMyPlanPage) window.loadMyPlanPage();
  };

  // Patch loadMyPlan to render daily plan section at the end
  const _origLoadMyPlan = loadMyPlan;
  loadMyPlan = async function() {
    await _origLoadMyPlan();
    const root = document.getElementById('myPlanContent') || document.getElementById('my_planContent');
    if (root) await renderDailyPlan(root);
  };

    window.loadMyPlanPage = loadMyPlan;

  // hook into router
  const _origLoad = window.loadPage;
  window.loadPage = function(page) {
    if (page === 'my_plan' || page === 'myplan') { loadMyPlan(); return; }
    if (typeof _origLoad === 'function') return _origLoad(page);
  };
})();
