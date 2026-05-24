// Trendex AI task checker — Groq LLM + Vision для проверки отчётов исполнителей.
// Возвращает { score: 0-100, verdict: 'approve'|'reject'|'unclear', reasoning: '...' }
// Не принимает решение само — рекомендует. Финальное слово за рекламодателем.

const https = require('https');

const GROQ_KEYS = String(process.env.GROQ_KEYS || process.env.GROQ_API_KEY || '')
  .split(',').map(s => s.trim()).filter(Boolean);

const TEXT_MODEL = 'llama-3.3-70b-versatile';
const VISION_MODEL = 'llama-3.2-90b-vision-preview';
const VISION_FALLBACK = 'llama-3.2-11b-vision-preview';

function groqRequest(path, body) {
  return new Promise((resolve, reject) => {
    if (!GROQ_KEYS.length) return reject(new Error('no_groq_keys'));
    let attempt = 0;
    function tryNext() {
      const key = GROQ_KEYS[attempt % GROQ_KEYS.length];
      attempt++;
      const data = JSON.stringify(body);
      const req = https.request({
        method: 'POST', hostname: 'api.groq.com', path,
        headers: {
          'Authorization': 'Bearer ' + key,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        }, timeout: 25000,
      }, (res) => {
        let buf = ''; res.on('data', c => buf += c);
        res.on('end', () => {
          if (res.statusCode === 401 || res.statusCode === 403 || res.statusCode === 429) {
            if (attempt < GROQ_KEYS.length * 2) return tryNext();
            return reject(new Error('all_keys_failed_status_' + res.statusCode));
          }
          if (res.statusCode >= 400) return reject(new Error('groq_status_' + res.statusCode + ': ' + buf.slice(0, 200)));
          try { resolve(JSON.parse(buf)); } catch (e) { reject(e); }
        });
      });
      req.on('error', e => attempt < GROQ_KEYS.length * 2 ? tryNext() : reject(e));
      req.on('timeout', () => req.destroy(new Error('groq_timeout')));
      req.write(data); req.end();
    }
    tryNext();
  });
}

function parseVerdict(raw) {
  // Try to extract JSON {score, verdict, reasoning} from any text
  const m = raw.match(/\{[\s\S]*?\}/);
  if (!m) return { score: 50, verdict: 'unclear', reasoning: raw.slice(0, 300) };
  try {
    const j = JSON.parse(m[0]);
    const score = Math.max(0, Math.min(100, Number(j.score) || 0));
    const verdict = ['approve', 'reject', 'unclear', 'rework'].includes(String(j.verdict).toLowerCase())
      ? String(j.verdict).toLowerCase() : (score >= 70 ? 'approve' : score < 35 ? 'reject' : 'unclear');
    return { score, verdict, reasoning: String(j.reasoning || '').slice(0, 500) };
  } catch (e) {
    return { score: 50, verdict: 'unclear', reasoning: raw.slice(0, 300) };
  }
}

const SYSTEM_PROMPT = `Ты — модератор рекламной платформы Trendex. Проверяешь отчёты исполнителей о выполненных рекламных заданиях.
Анализируй ОТЧЁТ против КРИТЕРИЕВ от рекламодателя.
Верни СТРОГО JSON: {"score": <0-100>, "verdict": "approve"|"reject"|"rework"|"unclear", "reasoning": "<кратко на русском почему>"}
- score 70-100 + verdict approve = задание выполнено корректно
- score 0-34 + verdict reject = явный фейк/несоответствие
- score 35-69 + verdict rework = выполнено частично, нужна доработка
- verdict unclear = не хватает данных для решения, нужна ручная проверка`;

async function checkTextReport({ criteria, reportText, taskDescription }) {
  if (!GROQ_KEYS.length) return { score: 50, verdict: 'unclear', reasoning: 'AI недоступен (нет ключей)' };
  const userMsg = `ЗАДАНИЕ:\n${taskDescription || ''}\n\nКРИТЕРИИ ОТЧЁТА:\n${criteria}\n\nОТЧЁТ ИСПОЛНИТЕЛЯ:\n${reportText}\n\nВерни JSON-вердикт.`;
  try {
    const data = await groqRequest('/openai/v1/chat/completions', {
      model: TEXT_MODEL, max_tokens: 400, temperature: 0.2,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userMsg }],
    });
    const raw = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '';
    return parseVerdict(raw);
  } catch (e) {
    return { score: 50, verdict: 'unclear', reasoning: 'AI ошибка: ' + e.message };
  }
}

async function checkPhotoReport({ criteria, photoUrl, taskDescription }) {
  if (!GROQ_KEYS.length) return { score: 50, verdict: 'unclear', reasoning: 'AI недоступен' };
  const userMsg = `ЗАДАНИЕ: ${taskDescription || ''}\n\nКРИТЕРИИ: ${criteria}\n\nПроверь — соответствует ли фото-отчёт заданию. Верни JSON.`;
  for (const model of [VISION_MODEL, VISION_FALLBACK]) {
    try {
      const data = await groqRequest('/openai/v1/chat/completions', {
        model, max_tokens: 500, temperature: 0.2,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: [
            { type: 'text', text: userMsg },
            { type: 'image_url', image_url: { url: photoUrl } },
          ]},
        ],
      });
      const raw = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '';
      return parseVerdict(raw);
    } catch (e) {
      if (model === VISION_FALLBACK) return { score: 50, verdict: 'unclear', reasoning: 'AI vision ошибка: ' + e.message };
    }
  }
  return { score: 50, verdict: 'unclear', reasoning: 'AI vision недоступен' };
}

async function checkVoiceReport({ criteria, transcript, taskDescription }) {
  // Same as text but with note that source is voice
  return await checkTextReport({
    criteria, taskDescription,
    reportText: '[Голосовой отчёт, транскрипция Whisper]\n' + (transcript || ''),
  });
}

function quizCheck({ quiz, answers }) {
  // quiz: [{ q, options: [...], correct: <index> }]
  // answers: [<index>, ...]
  if (!Array.isArray(quiz) || !Array.isArray(answers)) {
    return { score: 0, verdict: 'reject', reasoning: 'Невалидные данные quiz/answers' };
  }
  let correct = 0;
  for (let i = 0; i < quiz.length; i++) {
    if (Number(answers[i]) === Number(quiz[i].correct)) correct++;
  }
  const total = quiz.length;
  const score = total > 0 ? Math.round((correct / total) * 100) : 0;
  return {
    score,
    verdict: score >= 70 ? 'approve' : score >= 35 ? 'rework' : 'reject',
    reasoning: `Правильных ответов: ${correct}/${total}`,
    correct, total,
  };
}

module.exports = {
  checkTextReport,
  checkPhotoReport,
  checkVoiceReport,
  quizCheck,
  hasGroqKeys: () => GROQ_KEYS.length > 0,
};
