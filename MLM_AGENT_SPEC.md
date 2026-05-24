# MLM_AGENT_SPEC — спецификация для внешнего TG-агента

Документ для нейросети/сервиса который автоматически обрабатывает контакты MLM-CRM Golden Connect и отправляет сообщения через Telegram-аккаунт владельца.

## Поток на верхнем уровне

```
┌──────────────────────┐    JSON-pack          ┌──────────────────────┐
│ Golden Connect CRM          │ ────────────────────► │ External TG-agent    │
│ crm.golden-connect.to      │                       │ (Telethon/GramJS)    │
│                      │ ◄──── status ──────── │                      │
└──────────────────────┘                       └──────────────────────┘
   операторский UI                                рассылка в TG
```

1. Оператор открывает контакт в `crm.golden-connect.to`
2. Жмёт **«📤 Pack для агента»** → бот отдаёт JSON через `GET /api/mlm/contacts/:username/agent-pack`
3. Этот JSON копируется/передаётся внешнему агенту
4. Агент пишет в Telegram сам (используя авторизованную сессию владельца)
5. Опционально: агент возвращает статус через `POST /api/mlm/contacts/:username/history` (требует JWT)

## JSON Schema (v1.0)

`GET /api/mlm/contacts/{username}/agent-pack` возвращает:

```json
{
  "ok": true,
  "pack": {
    "schema_version": "1.0",
    "contact": {
      "name": "Джамбулский Sergej",
      "username": "Sergej",
      "profile_url": "https://mlmbaza.com/lider/Sergej",
      "company": "Amway",
      "country": "Deutschland",
      "city": "Dortmund",
      "phone": "+491729459312",
      "email": null,
      "telegram": "https://t.me/Whiedagermany",
      "whatsapp": "https://chat.whatsapp.com/...",
      "description": "ВРЕМЯ ПОШЛО! ..."
    },
    "crm": {
      "status": "in-progress",
      "needs": "интересует автоматизация работы с холодными лидами",
      "next_call": "2026-05-15",
      "history": [
        { "ts": "2026-05-08T11:30:00Z", "direction": "out", "msg": "Привет, Sergej..." }
      ],
      "notes": "созваниваться после 18:00 МСК"
    },
    "handoff": {
      "suggested_channel": "telegram",
      "rate_limit_per_account_per_day": 30,
      "randomize_delay_seconds": [60, 240]
    }
  }
}
```

## Что должен делать внешний агент

### Шаг 1 — Авторизация в Telegram
Используется один из вариантов:
- **MTProto user-session** через [Telethon](https://github.com/LonamiWebs/Telethon) (Python) или [GramJS](https://gram.js.org) (Node)
- **QR-логин** или **phone+code** одноразово
- Сессия хранится в зашифрованном виде на стороне агента

### Шаг 2 — Парсинг pack'а
- `pack.contact.telegram` → достать `username` или `chat_id` из URL `https://t.me/USERNAME`
- Если ссылка приватная (`/+xyz`) — это инвайт, открыть его и получить целевой chat
- Если контакта нет в TG → fallback: `whatsapp` → `phone`

### Шаг 3 — Подготовка сообщения
- В большинстве случаев текст уже сгенерирован Golden Connect'ом и лежит в `pack.crm.history[-1].msg`
- Если нужно сгенерировать заново — использовать локально через тот же промпт что в `cabinet/src/routes/mlm-crm.js` (раздел `generate-pitch`)

### Шаг 4 — Безопасная отправка
**Критично — TG банит за массовый аутрич:**
- Не более `pack.handoff.rate_limit_per_account_per_day` (по умолчанию 30) сообщений в сутки **с одного аккаунта**
- Случайная задержка между сообщениями: `pack.handoff.randomize_delay_seconds` (60–240 сек)
- Если получатель не в контактах — сначала «прогрев» (взаимные просмотры профиля, реакции в общих чатах) — если возможно
- При получении `FloodWaitError` от Telegram — соблюдать timeout, не повторять
- Не отправлять более 3 сообщений подряд если нет ответа

### Шаг 5 — Возврат статуса в Golden Connect (опционально)
После отправки агент может вернуть статус:

```http
POST /cabinet/api/mlm/contacts/{username}/history
Cookie: golden-connect_session=...   (или Bearer JWT)
Content-Type: application/json

{
  "msg": "Текст отправленного сообщения",
  "direction": "out"
}
```

Также можно обновить статус контакта:

```http
PUT /cabinet/api/mlm/contacts/{username}/crm

{ "status": "in-progress", "notes": "Сообщение доставлено 2026-05-09 14:32" }
```

## Возможные `status` контакта в CRM

| status         | смысл                                          |
|----------------|------------------------------------------------|
| `new`          | контакт ещё не обработан                       |
| `in-progress`  | первое сообщение отправлено, идёт диалог       |
| `callback`     | назначен созвон (поле `next_call` заполнено)   |
| `closed`       | продажа состоялась / партнёрство заключено    |
| `skip`         | не интересно / не подходит / не отвечает      |

## Реализация на Python (Telethon) — минимальный пример

```python
from telethon import TelegramClient
import json, asyncio, random, requests

API_ID = ...        # с my.telegram.org
API_HASH = '...'
SESSION = 'my_session'   # файл сессии

async def process_pack(pack, golden-connect_token):
    contact = pack['contact']
    text = pack['crm']['history'][-1]['msg'] if pack['crm']['history'] else None
    if not text:
        return {'error': 'no message in pack'}

    async with TelegramClient(SESSION, API_ID, API_HASH) as client:
        # Resolve target chat
        if contact.get('telegram'):
            username = contact['telegram'].rstrip('/').split('/')[-1]
            entity = await client.get_entity(username)
            await client.send_message(entity, text)
        elif contact.get('phone'):
            entity = await client.get_entity(contact['phone'])
            await client.send_message(entity, text)
        else:
            return {'error': 'no telegram contact'}

    # Random delay before next contact
    await asyncio.sleep(random.uniform(*pack['handoff']['randomize_delay_seconds']))

    # Report back to Golden Connect
    requests.post(
        f"https://crm.golden-connect.to/api/mlm/contacts/{contact['username']}/history",
        json={'msg': text, 'direction': 'out'},
        headers={'Authorization': f'Bearer {golden-connect_token}'},
    )
    return {'ok': True}
```

## Юридический disclaimer

Массовая рассылка незнакомым лицам без явного согласия:
- нарушает Telegram TOS (риск бана аккаунта в течение 1-2 часов на «свежем» аккаунте без активности; «прогретый» с историей переписок продержится дольше)
- может нарушать ФЗ-152 о персональных данных (данные с mlmbaza.com публичны, но согласия на маркетинговые сообщения нет)
- получатель может пожаловаться → бан или иск

**Безопаснее:** использовать только как **подсказчика** оператору (текст → ручная отправка), а не как авто-рассылку.

## Версионирование

- `schema_version: '1.0'` — первичный релиз 2026-05-09
- Изменения в schema → bump major (2.0). Поля могут добавляться в minor.
