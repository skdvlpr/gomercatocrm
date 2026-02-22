# WhatsApp CRM Integration — Архитектура и имплементация

> **Последнее обновление**: 23 февраля 2026
> **Ветка**: `fix/whatsapp/real-time-websocket`

---

## 1. Общая архитектура

### Высокоуровневая схема

```
┌──────────────────────────────────────────────────────────────┐
│                      Браузер (Frontend)                       │
│                                                               │
│   whatsapp-widget-init.js (standalone floating widget)        │
│   ┌─────────────┐   ┌────────────────┐  ┌───────────────┐   │
│   │  Chat UI     │   │  HTTP Polling   │  │  WebSocket    │   │
│   │  (4 экрана)  │   │  (каждую 1 сек) │  │  (WAMP/Autobahn)│ │
│   └─────────────┘   └──────┬─────────┘  └──────┬────────┘   │
│                             │                    │             │
└─────────────────────────────┼────────────────────┼────────────┘
                              │ REST API           │ WSS:8443
                              ▼                    ▼
┌──────────────────────────────────────────────────────────────┐
│                   EspoCRM Backend (PHP)                        │
│                                                               │
│   WhatsApp.php (Controller)     Pusher.php (WebSocket Server) │
│   ┌──────────────────────┐      ┌──────────────────────────┐ │
│   │ getChatMessages()    │      │ WAMP server (port 8080)  │ │
│   │ sendMessage()        │      │ Auth via AuthTokenCheck   │ │
│   │ webhook()            │      │ Topic-based subscription  │ │
│   │ getChats()           │      └──────────────────────────┘ │
│   │ status()             │                                    │
│   └──────────┬───────────┘                                    │
│              │                                                │
│   ┌──────────▼───────────┐      ┌──────────────────────────┐ │
│   │ WhatsAppClient.php   │      │ WebSocketService.php     │ │
│   │ (HTTP client к WAHA) │      │ (broadcast через Sender) │ │
│   └──────────┬───────────┘      └──────────────────────────┘ │
│              │                                                │
│   ┌──────────▼───────────┐                                    │
│   │ WhatsAppMessage      │                                    │
│   │ (Entity в MySQL)     │                                    │
│   └──────────────────────┘                                    │
└──────────────────────────────────────────────────────────────┘
                              │ HTTP
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                   WAHA API (Docker container)                 │
│           whatsapp-api:3000 (wwebjs-based)                    │
│                                                               │
│   /session/start, /session/status, /session/qr               │
│   /client/getChats, /client/getChatMessages                   │
│   /client/sendMessage, /client/getContacts                    │
│   → Webhook → EspoCRM /WhatsApp/action/webhook                │
└──────────────────────────────────────────────────────────────┘
```

### Стек технологий

| Компонент          | Технология                           | Расположение                                                          |
| ------------------ | ------------------------------------ | --------------------------------------------------------------------- |
| Frontend Widget    | Vanilla JS (standalone, ~1450 строк) | `client/custom/src/whatsapp-widget-init.js`                           |
| CSS Стили          | Inline в JS + `whatsapp-widget.css`  | `client/custom/css/whatsapp-widget.css`                               |
| Backend Controller | PHP Controller (EspoCRM)             | `custom/Espo/Custom/Controllers/WhatsApp.php`                         |
| API Client         | PHP HTTP Client (curl)               | `custom/Espo/Custom/Core/WhatsApp/WhatsAppClient.php`                 |
| WebSocket Service  | PHP Service (EspoCRM Sender)         | `custom/Espo/Modules/WhatsApp/Services/WebSocketService.php`          |
| Entity (ORM)       | EspoCRM Entity                       | `WhatsAppMessage` (таблица `whats_app_message`)                       |
| WhatsApp API       | WAHA (wwebjs-api) Docker             | `whatsapp-api:3000` (внутренний Docker)                               |
| WebSocket Server   | Ratchet/WAMP (часть EspoCRM)         | `application/Espo/Core/WebSocket/Pusher.php` **(НЕ МОДИФИЦИРОВАТЬ!)** |

> [!CAUTION]
> Папка `application/` — это ядро EspoCRM. **КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО** модифицировать файлы в ней. Все кастомизации должны быть в `custom/`.

---

## 2. Потоки данных (Message Flow)

### 2.1 Отправка сообщения (CRM → WhatsApp)

```
1. Пользователь вводит текст в виджете → нажимает "Send"
2. JS: optimistic rendering (сообщение сразу показывается с галочкой ✓)
3. JS: POST /api/v1/WhatsApp/action/sendMessage {chatId, message}
4. PHP Controller: WhatsAppClient::sendMessage() → WAHA API
5. WAHA: POST /client/sendMessage/{sessionId} → WhatsApp серверы
6. PHP Controller: сохраняет сообщение в WhatsAppMessage entity (БД)
7. PHP Controller: WebSocketService::broadcastMessage() (если WS работает)
8. Response → JS: обновляет optimistic сообщение реальными данными
```

### 2.2 Получение входящего сообщения (WhatsApp → CRM)

Есть **два параллельных канала** доставки:

#### Канал A: Webhook (push, мгновенно)

```
1. WAHA получает сообщение от WhatsApp серверов
2. WAHA → POST /api/v1/WhatsApp/action/webhook (noAuth)
3. PHP Controller::postActionWebhook():
   a. Парсит payload (поддержка обоих форматов: data.body и data.message.body)
   b. Проверяет дубликаты по messageId (UNIQUE constraint в БД)
   c. Определяет chatId: fromMe ? to : from
   d. Сохраняет в WhatsAppMessage entity
   e. Вызывает WebSocketService::broadcastMessage()
4. В браузере: если WebSocket работает, onRealTimeMessage() обновляет UI
```

#### Канал B: HTTP Polling (pull, каждую 1 секунду)

```
1. JS: setInterval(pollMessages, 1000) — запускается при openChat()
2. JS: GET /api/v1/WhatsApp/action/getChatMessages?chatId=...&limit=50
3. PHP Controller::getActionGetChatMessages():
   a. Пробует получить свежие из WAHA API (getChatMessages)
   b. Любые НОВЫЕ сообщения из API сохраняет в БД (вставка с проверкой дубликатов)
   c. Читает ВСЁ из БД (объединённый результат webhook + API)
   d. Возвращает [{id, body, chatId, fromMe, timestamp, ack, status}, ...]
4. JS: сравнивает с state.messages, если есть новые — renderMessages()
```

> [!IMPORTANT]
> **Гибридный подход (API + DB)**: `getChatMessages` всегда пробует WAHA API сначала и сохраняет новые сообщения в БД. Даже если webhook перестанет работать, polling через API подхватит все сообщения. БД служит единым источником правды.

### 2.3 WebSocket (WAMP) — пока НЕ работает полностью

```
1. JS: new ab.Session(wss://host:8443/wss?authToken=...&userId=...)
2. Nginx проксирует к WAMP серверу (Ratchet, порт 8080)
3. Pusher.php: onOpen() → AuthTokenCheck → subscribeUser()
4. JS: подписывается на топик 'WhatsApp'
5. При входящем webhook: broadcastMessage() → Sender::send()
6. Pusher.php: onPublish() → рассылает подписчикам
```

**Текущий статус**: WebSocket возвращает **502 Bad Gateway** потому что nginx в DDEV не проксирует `/wss` на порт 8443 к WAMP серверу. Polling работает как надёжный fallback.

---

## 3. Ключевые файлы и их роли

### 3.1 Frontend: `whatsapp-widget-init.js`

**Путь**: `client/custom/src/whatsapp-widget-init.js`
**Подключение**: через `custom/Espo/Custom/Resources/metadata/app/client.json`

```json
{
  "scriptList": [
    "__APPEND__",
    "client/custom/src/whatsapp-widget-init.js?v=2028.8"
  ]
}
```

> [!TIP]
> При каждом изменении JS **обязательно** инкрементировать параметр `?v=` в `client.json`, иначе браузер загрузит кэшированную версию.

#### Ключевые объекты state:

```javascript
var state = {
  isOpen: false, // виджет открыт/закрыт
  screen: "login", // текущий экран: login | chatList | chat | contacts
  status: "disconnected", // статус WhatsApp сессии
  chatId: null, // ID открытого чата (например '53859493912625@lid')
  chatName: null, // имя открытого чата
  messages: [], // массив сообщений в открытом чате
  chats: [], // список всех чатов
  contacts: [], // список контактов
  subscribed: false, // подписан ли на WebSocket
  messagePollingActive: false, // работает ли polling
  messagePollInterval: null, // ID интервала polling
  wampConnection: null, // объект WAMP-соединения
};

var config = {
  pollInterval: 1000, // интервал polling (мс) — 1 секунда
  statusCheckInterval: 5000, // интервал проверки статуса сессии
};
```

#### Экраны виджета:

| Экран      | Описание               | Ключевая функция                                          |
| ---------- | ---------------------- | --------------------------------------------------------- |
| `login`    | QR-код для авторизации | `pollQR()`                                                |
| `chatList` | Список чатов           | `loadChats()`, `renderChatList()`                         |
| `chat`     | Экран сообщений        | `openChat()`, `renderMessages()`, `startMessagePolling()` |
| `contacts` | Список контактов       | `loadContacts()`, `renderContacts()`                      |

#### Polling (ключевые функции):

- **`startMessagePolling()`**: Запускается при `openChat()`. Всегда пересоздаёт интервал (нет guard). Вызывает `pollMessages()` сразу, потом каждую секунду.
- **`pollMessages()`**: Вызывает `getChatMessages` API, сравнивает с `state.messages`, рендерит если есть изменения.
- **`stopMessagePolling()`**: Останавливает интервал и сбрасывает флаги.

### 3.2 Backend Controller: `WhatsApp.php`

**Путь**: `custom/Espo/Custom/Controllers/WhatsApp.php`

#### Endpoints (Actions):

| Метод | Action            | Описание                                 |
| ----- | ----------------- | ---------------------------------------- |
| GET   | `login`           | Стартует WAHA сессию, возвращает QR      |
| GET   | `qrCode`          | Получает QR (текст + base64 изображение) |
| GET   | `status`          | Статус сессии (CONNECTED / disconnected) |
| GET   | `getChats`        | Список чатов из WAHA API                 |
| GET   | `getChatMessages` | **Гибрид**: WAHA API + локальная БД      |
| GET   | `getContacts`     | Список контактов из WAHA API             |
| POST  | `sendMessage`     | Отправка через WAHA + сохранение в БД    |
| POST  | `webhook`         | Приём входящих от WAHA (noAuth)          |
| POST  | `saveSettings`    | Сохранение настроек интеграции           |
| POST  | `logout`          | Завершение сессии                        |

#### getChatMessages — гибридная логика (КЛЮЧЕВОЙ ЭНДПОИНТ):

```php
public function getActionGetChatMessages(Request $request, Response $response): array
{
    // 1. Пробуем WAHA API — получаем свежие сообщения с телефона
    $apiMessages = $this->getWhatsAppClient()->getChatMessages($chatId, $limit);

    // 2. Каждое новое сообщение из API сохраняем в БД
    foreach ($apiMessages as $apiMsg) {
        $exists = $entityManager->getRepository('WhatsAppMessage')
            ->where(['messageId' => $msgId])->findOne();
        if (!$exists) {
            // Создаём entity и сохраняем
            $entityManager->saveEntity($msgEntity);
        }
    }

    // 3. Читаем финальный результат из БД (API + webhook сообщения)
    $collection = $entityManager->getRepository('WhatsAppMessage')
        ->where(['chatId' => $chatId])
        ->order('timestamp', 'ASC')
        ->limit($limit)
        ->find();

    // 4. Маппим entity → формат frontend'а
    return ['success' => true, 'list' => $result];
}
```

### 3.3 WAHA Client: `WhatsAppClient.php`

**Путь**: `custom/Espo/Custom/Core/WhatsApp/WhatsAppClient.php`

Это HTTP-клиент к WAHA API (Docker-контейнер `whatsapp-api:3000`).

**Конфигурация** (в EspoCRM Settings):

```
whatsappApiUrl  → http://whatsapp-api:3000  (внутренний Docker URL)
whatsappApiKey  → секретный API-ключ
```

**Сессия**: `espocrm-session` (hardcoded в `$sessionId`)

### 3.4 WebSocket Service: `WebSocketService.php`

**Путь**: `custom/Espo/Modules/WhatsApp/Services/WebSocketService.php`

Использует EspoCRM `Sender` для отправки событий подписчикам.

> [!WARNING]
> **Текущая проблема**: Сервис использует `Espo\Core\WebSocket\Sender` и отправляет на топик `whatsapp.message.{chatId}`. Но frontend подписывается на топик `WhatsApp` (без chatId). Это **несовместимость**, которую нужно исправить чтобы WebSocket push работал.

### 3.5 Entity: `WhatsAppMessage`

**Таблица**: `whats_app_message`

| Поле        | Тип              | Описание                                |
| ----------- | ---------------- | --------------------------------------- |
| `id`        | VARCHAR          | EspoCRM auto-generated ID               |
| `body`      | TEXT             | Текст сообщения                         |
| `chatId`    | VARCHAR          | ID чата (например `53859493912625@lid`) |
| `fromMe`    | BOOLEAN          | Отправлено мной?                        |
| `timestamp` | DATETIME         | Время сообщения                         |
| `status`    | VARCHAR          | Статус: Sent / Received                 |
| `messageId` | VARCHAR (UNIQUE) | ID сообщения из WhatsApp                |

---

## 4. Маршруты API

**Файл**: `custom/Espo/Custom/Resources/routes.json`

Все эндпоинты доступны по `GET/POST /api/v1/WhatsApp/action/{actionName}`.

Webhook (`POST /WhatsApp/action/webhook`) имеет флаг `"noAuth": true` — не требует авторизации (вызывается WAHA сервером).

---

## 5. WebSocket — детали и проблемы

### 5.1 Архитектура WebSocket в EspoCRM

EspoCRM использует **WAMP (Web Application Messaging Protocol)** через:

- **Сервер**: Ratchet (`application/Espo/Core/WebSocket/Pusher.php`) — слушает порт `8080`
- **Клиент**: AutobahnJS (`ab.Session`) — подключается к `wss://host:8443`
- **Прокси**: Nginx проксирует `wss://host:8443` → `ws://localhost:8080`

### 5.2 Аутентификация WebSocket

```
URL: wss://host:8443/wss?authToken=TOKEN&userId=USERID
       |              |    |                |
       |              |    |                └── из localStorage('espo-user').lastUserId
       |              |    └── из cookie 'auth-token' или localStorage('espo-user-auth')
       |              └── Путь /wss добавляется для wss: протокола
       └── Порт 8443 (ddev wss port)
```

**Процесс аутентификации на сервере**:

1. `Pusher::onOpen()` — извлекает `authToken` и `userId` из query params
2. Запускает subprocess: `php command.php AuthTokenCheck {authToken} {userId}`
3. Если exit code = 0 → `subscribeUser($conn, $userId)` + `sendWelcome($conn)`
4. Если exit code ≠ 0 → `closeConnection($conn)`

### 5.3 Топики (Topics)

EspoCRM проверяет топики через `isTopicAllowed()` в `Pusher.php`:

- Топик должен быть описан в метаданных `app > webSocket`
- Стандартные: `newNotification`, `popupNotifications.event`, `recordUpdate.*`, `appParamsUpdate`

> [!NOTE]
> Для WhatsApp топика нужно создать файл:
> `custom/Espo/Custom/Resources/metadata/app/webSocket.json`
>
> ```json
> {
>   "categories": {
>     "WhatsApp": {
>       "paramList": [],
>       "accessCheckCommand": ""
>     }
>   }
> }
> ```
>
> Без этого файла подписка на топик `WhatsApp` будет **молча отклонена** сервером.

### 5.4 Текущие проблемы WebSocket

| Проблема                    | Причина                                                                  | Статус            |
| --------------------------- | ------------------------------------------------------------------------ | ----------------- |
| **502 Bad Gateway**         | Nginx не проксирует `/wss` к WAMP серверу                                | ❌ Не исправлено  |
| **Несовместимость топиков** | Backend: `whatsapp.message.{chatId}`, Frontend: `WhatsApp`               | ❌ Не исправлено  |
| **Sender vs Submission**    | `WebSocketService` использует `Sender`, может потребоваться `Submission` | ⚠️ Нужна проверка |

### 5.5 Как починить WebSocket (план)

1. **Nginx**: Добавить в DDEV конфиг проксирование WebSocket:

   ```nginx
   location /wss {
       proxy_pass http://localhost:8080;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "Upgrade";
   }
   ```

2. **Топик**: Обеспечить что `WebSocketService` и frontend используют одинаковый топик. Варианты:
   - Frontend подписывается на `WhatsApp`, backend публикует в `WhatsApp`
   - Или использовать `whatsapp.message.*` с wildcard

3. **WebSocketService**: Проверить, нужно ли использовать `Submission` вместо `Sender` (зависит от версии EspoCRM).

---

## 6. Частые проблемы и их решения

### 6.1 Сообщения не появляются в реальном времени

**Симптом**: Написал сообщение с телефона — в виджете не появляется.

**Диагностика**:

```sql
-- Проверить, пришло ли сообщение в БД:
SELECT body, from_me, timestamp FROM whats_app_message
WHERE chat_id = 'CHAT_ID' ORDER BY timestamp DESC LIMIT 5;
```

**Причины и решения**:

| Причина                                      | Проверка                                      | Решение                                         |
| -------------------------------------------- | --------------------------------------------- | ----------------------------------------------- |
| `openChat()` не запускает polling            | Console: нет `Starting message polling`       | Добавить `startMessagePolling()` в `openChat()` |
| `state.messagePollingActive` guard блокирует | Повторный вход в чат не перезапускает polling | Убрать guard, всегда `clearInterval` + restart  |
| `state.isOpen` check в polling               | Виджет "думает" что закрыт                    | Убрать проверку `state.isOpen` из polling       |
| Webhook не отправляется WAHA                 | Лог пуст после отправки                       | Проверить WAHA webhook URL конфиг               |
| WAHA API возвращает пустоту                  | `getChatMessages` пуст                        | Реализован гибрид: API + DB                     |
| `client.json` версия не обновлена            | Старый JS в кэше                              | Инкрементировать `?v=`                          |

### 6.2 WebSocket 502 Bad Gateway

**Симптом**: `WebSocket connection to 'wss://.../:8443/wss' failed: 502`

**Причина**: Nginx в DDEV не настроен проксировать WebSocket.

**Временное решение**: Polling каждую 1 секунду работает как надёжный fallback.

### 6.3 Дубликаты сообщений в БД

**Симптом**: `SQLSTATE[23000] Duplicate entry for key 'UNIQ_MESSAGE_ID'`

**Причина**: И webhook и polling пытаются сохранить одно и то же сообщение.

**Решение**: Все операции сохранения обёрнуты в `try/catch (PDOException)` с проверкой `code == 23000 || strpos('1062')`. Это безопасно игнорирует дубликаты.

### 6.4 Кэш не обновляется

**Симптом**: Изменил код — ничего не поменялось в браузере.

**Решение**:

1. Инкрементировать `?v=` в `client.json`
2. Очистить кэш EspoCRM: `ddev exec php clear_cache.php`
3. Hard reload: `Ctrl+Shift+R` в браузере

### 6.5 chatId форматы

WhatsApp использует разные форматы chatId:

| Формат              | Описание                   | Пример                            |
| ------------------- | -------------------------- | --------------------------------- |
| `NUMBER@lid`        | Личный чат (новый формат)  | `53859493912625@lid`              |
| `NUMBER@c.us`       | Личный чат (старый формат) | `393202696323@c.us`               |
| `NUMBER@g.us`       | Групповой чат              | `120363383601897853@g.us`         |
| `NUMBER@newsletter` | Канал/Newsletter           | `120363326619186850@newsletter`   |
| `status@broadcast`  | Статус broadcast           | `status@broadcast` (игнорируется) |

---

## 7. Конфигурация

### 7.1 EspoCRM Settings

```
Admin > WhatsApp Integration:
  - whatsappApiUrl: http://whatsapp-api:3000
  - whatsappApiKey: <API key>
```

### 7.2 Metadata файлы

| Файл                                                                    | Назначение             |
| ----------------------------------------------------------------------- | ---------------------- |
| `custom/Espo/Custom/Resources/metadata/app/client.json`                 | Подключение JS скрипта |
| `custom/Espo/Custom/Resources/metadata/entityDefs/WhatsAppMessage.json` | Определение entity     |
| `custom/Espo/Custom/Resources/routes.json`                              | API маршруты           |

### 7.3 DDEV / Docker

WAHA работает в Docker-контейнере. Доступен по `http://whatsapp-api:3000` внутри Docker-сети.

WebSocket WAMP сервер запускается командой:

```bash
ddev exec php websocket.php
```

Слушает порт `8080` внутри контейнера. Nginx должен проксировать `wss://:8443` → `ws://localhost:8080`.

---

## 8. Чек-лист для деплоя

- [ ] Все изменения только в `custom/` (НЕ в `application/`)
- [ ] Версия в `client.json` инкрементирована
- [ ] Дебаг файлы удалены (backup JS, chats.json, wamp-debug.log)
- [ ] `console.log` в продакшн-коде минимальны
- [ ] Entity `WhatsAppMessage` имеет UNIQUE index на `messageId`
- [ ] Webhook endpoint доступен без авторизации
- [ ] WAHA API URL и ключ настроены в Admin
- [ ] `php clear_cache.php` выполнен после деплоя
