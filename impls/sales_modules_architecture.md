# GomercatoCRM — Sales Modules: Полный контекст и план имплементации

> **Создано**: 26 февраля 2026  
> **Назначение**: Контекстный документ для AI-агентов (Google Gemini, Copilot и др.)  
> **Статус проекта**: В активной разработке  
> **База**: EspoCRM 9.3.0 + DDEV (Docker локально)  
> **Репозиторий**: [github.com/skdvlpr/gomercatocrm](https://github.com/skdvlpr/gomercatocrm)

---

## 📖 ЧТО ТАКОЕ GOMERCATOCRM

GomercatoCRM — это кастомизированная версия [EspoCRM](https://www.espocrm.com/) (open-source CRM на PHP + JavaScript), адаптированная под бизнес **GoMercato.it** — итальянской компании из Турина (Пьемонт), занимающейся продажей комплексных digital-решений для увеличения продаж: CRM, AI-инструменты, маркетинговые каналы.

### Бизнес-контекст
- **Клиент**: GoMercato.it, Torino, Piemonte, Italia
- **Модель**: B2B + B2C продажи сложных digital-сервисов
- **Язык интерфейса CRM**: Italiano (it_IT) — основной, English — fallback
- **Окружение**: DDEV (local dev), EspoCRM 9.3.0
- **ИВА**: Стандартная Италия 22%, San Marino 17%

---

## ✅ ЧТО УЖЕ СДЕЛАНО (ИСТОРИЯ ПРОЕКТА)

### 1. WhatsApp Integration — ПОЛНОСТЬЮ РЕАЛИЗОВАНО ✅

Полная интеграция WhatsApp Business в EspoCRM через WAHA API (Docker). Подробная документация: [`impls/whatsapp_architecture.md`](./whatsapp_architecture.md)

#### Что было сделано:
- **Frontend виджет** (`client/custom/src/whatsapp-widget-init.js`) — ~1450 строк Vanilla JS
  - 4 экрана: login (QR), chatList, chat, contacts
  - HTTP Polling каждую 1 секунду как основной механизм
  - WebSocket WAMP (AutobahnJS) как real-time push
  - Optimistic rendering при отправке сообщений
- **Backend Controller** (`custom/Espo/Custom/Controllers/WhatsApp.php`)
  - 10 endpoints: login, qrCode, status, getChats, getChatMessages, getContacts, sendMessage, webhook, saveSettings, logout
  - Гибридный getChatMessages: WAHA API + локальная БД
- **WAHA Client** (`custom/Espo/Custom/Core/WhatsApp/WhatsAppClient.php`)
  - HTTP-клиент к WAHA Docker-контейнеру на `whatsapp-api:3000`
- **WebSocket Service** (`custom/Espo/Modules/WhatsApp/Services/WebSocketService.php`)
  - Broadcast через EspoCRM `Submission`
- **Entity WhatsAppMessage** — таблица `whats_app_message` в MySQL
  - UNIQUE constraint на `messageId` для защиты от дубликатов
- **Webhook** (noAuth) — приём входящих от WAHA
- **Nginx WebSocket proxy** (`.ddev/nginx/websocket.conf`) — WSS 8443 → WS 8080
- **Исправлены проблемы**: 502 Bad Gateway, auth token mismatch, topic mismatch, Sender→Submission

#### Ключевые файлы WhatsApp:
```
custom/Espo/Custom/
├── Controllers/WhatsApp.php
├── Core/WhatsApp/WhatsAppClient.php
├── Resources/
│   ├── metadata/
│   │   ├── entityDefs/WhatsAppMessage.json
│   │   ├── app/client.json             ← подключение JS виджета
│   │   ├── app/webSocket.json          ← регистрация WS топика
│   │   └── routes.json
│   └── i18n/it_IT/WhatsAppMessage.json
custom/Espo/Modules/WhatsApp/
└── Services/WebSocketService.php
client/custom/
├── src/whatsapp-widget-init.js
└── css/whatsapp-widget.css
.ddev/nginx/websocket.conf              ← WSS proxy
```

---

## 🔨 ЧТО НУЖНО СДЕЛАТЬ — SALES MODULE

### Цель
Создать отдельный модуль `Sales` внутри EspoCRM с 4 новыми сущностями для полного цикла продаж: от каталога товаров до подписанного контракта.

### Архитектура связей (ERD)

```
Opportunità (1) ──── (N) Proposta commerciale (Quote)
     │                          │
     │                          └── (N) Lista prodotti (ProductList)
     │                                        │
     │                                        └── (N) ProductListItem ──── (1) Prodotto
     │
     └── (1) Contratto  ←──── [AUTO-CREATED when Opportunity = Closed Won]
                  │
                  └── (ref.) Proposta accettata (Quote vincente — opzionale)
```

**Ключевая логика**:
- `Contract` создаётся **автоматически** из `Opportunity` при `stage = Closed Won` (НЕ из Quote)
- `Quote` всегда привязана к `Opportunity` (standalone создание запрещено)
- `ProductList` нельзя создать из UI напрямую (только через Quote)
- При создании Quote → автоматически создаётся первая ProductList `Gruppo 1`

### Расположение файлов модуля

```
custom/Espo/Modules/Sales/         ← отдельный модуль (НЕ в Custom/)
├── Module.php
├── Entities/
│   ├── Product.php
│   ├── Quote.php
│   ├── ProductList.php
│   ├── ProductListItem.php
│   └── Contract.php
├── Resources/
│   ├── metadata/
│   │   ├── entityDefs/
│   │   ├── scopes/
│   │   └── clientDefs/
│   ├── i18n/
│   │   ├── it_IT/
│   │   └── en_US/
│   └── layouts/
├── Hooks/
│   ├── Quote/
│   │   ├── CreateDefaultProductList.php
│   │   ├── GenerateNumber.php
│   │   └── ValidateAmount.php
│   └── Opportunity/
│       └── CreateContract.php
├── Controllers/
│   └── ProductList.php
└── Services/
    ├── QuotePdfService.php
    └── ContractNumberGenerator.php
```

---

## 📋 ДЕТАЛЬНЫЕ ОПИСАНИЯ СУЩНОСТЕЙ

### 1. Product — Prodotto (`products` в БД)

**Видимость в UI**: ✅ Доступна через меню «Prodotti»  
**Создание из UI**: ✅ Да, как обычная сущность (Accounts, Leads и т.д.)

#### Поля:

| Поле | Тип | Обязательное | Описание |
|------|-----|:---:|----------|
| `name` | varchar(249) | ✅ | Название продукта/услуги |
| `status` | enum | ✅ | Active/Inactive → Attivo/Inattivo |
| `type` | enum | ✅ | Product/Service → Prodotto/Servizio |
| `price` | currency (EUR) | ✅ | Базовая цена |
| `sku` | varchar(100), UNIQUE | ✅ | Уникальный код для импорта/интеграций |
| `description` | text | — | Полное описание (выводится в PDF) |
| `stockQuantity` | float, min:0 | — | Количество на складе |
| `infiniteStock` | bool | — | Бесконечный запас (игнорирует stockQuantity) |
| `minPrice` | currency | — | Минимальная цена (floor price), нельзя делать скидку ниже |
| `vatRate` | enum | — | Aliquota IVA: 0% / 4% / 10% / 17%(San Marino) / 22%(Italia), default 22% |
| `referenceCountry` | enum | — | Italia / San Marino / Estero — для автозаполнения IVA |
| `category` | enum | — | Hardware / Software / Servizi / Manutenzione / Licenze |
| `unitOfMeasure` | enum | — | pz / ora / kg / mese / anno / licenza |
| `image` | file/image | — | Превью в PDF |
| `internalNotes` | text | — | Внутренние заметки (не в PDF) |

---

### 2. Quote — Proposta commerciale (`quotes` в БД)

**Видимость в UI**: ✅ Доступна через меню «Proposte commerciali»  
**Создание из UI**: ✅ Да, но **только из Opportunity** (обязательная связь)  
**PDF**: ✅ Генерация PDF с логотипом компании, переменными и таблицей продуктов

#### Поля:

| Поле | Тип | Обязательное | Описание |
|------|-----|:---:|----------|
| `name` | varchar(249) | ✅ | Название предложения |
| `number` | varchar(50), readOnly | — | Авто: `PROP-{ANNO}-{SEQ}` (es. `PROP-2026-00001`) |
| `status` | enum | ✅ | Draft/Sent/Accepted/Rejected → Bozza/Inviata/Accettata/Rifiutata |
| `opportunity` | belongsTo Opportunity | ✅ | Родительская Opportunità |
| `account` | belongsTo Account | — | Клиент (наследуется из Opportunity) |
| `contact` | belongsTo Contact | — | Контактное лицо клиента |
| `validUntil` | date | — | Срок действия |
| `globalDiscount` | float(0-100) | — | Скидка на всё предложение (%) |
| `taxableAmount` | currency, readOnly | — | Imponibile (без IVA) |
| `totalVat` | currency, readOnly | — | Сумма IVA |
| `totalAmount` | currency, readOnly | — | Totale con IVA (рассчитывается автоматически) |
| `language` | enum | — | Italiano / English (для мультиязычного PDF) |
| `notesForClient` | text | — | Заметки для клиента (видны в PDF) |
| `internalNotes` | text | — | Внутренние заметки (не в PDF) |
| `productLists` | hasMany ProductList | — | Группы товаров |

#### Бизнес-правила:
- Если `totalAmount > Opportunity.amount` → предупреждение при сохранении
- При создании Quote → автоматически создаётся ProductList «Gruppo 1»
- Нумерация авто: `PROP-{ANNO}-{SEQ:05d}`

---

### 3. ProductList — Lista prodotti (`product_lists` в БД)

**Видимость в UI**: ❌ НЕ появляется в меню навигации  
**Создание из UI напрямую**: ❌ ЗАПРЕЩЕНО — только через Quote  
**Доступность для Formula/Formula Sandbox**: ✅ Да

#### Поля:

| Поле | Тип | Обязательное | Описание |
|------|-----|:---:|----------|
| `name` | varchar(100) | ✅ | Default: `Gruppo 1`, `Gruppo 2`, ... |
| `quote` | belongsTo Quote | ✅ | Родительская Quote |
| `order` | int | — | Порядок группы в предложении (для drag&drop) |
| `subtotal` | currency, readOnly | — | Сумма строк группы (авто) |
| `groupDescription` | text | — | Текст над списком группы в PDF |
| `items` | hasMany ProductListItem | — | Строки с товарами |

#### Дочерняя сущность: ProductListItem (`product_list_items` в БД)

| Поле | Тип | Обязательное | Описание |
|------|-----|:---:|----------|
| `product` | belongsTo Product | ✅ | Ссылка на продукт |
| `quantity` | float, default:1 | ✅ | Количество |
| `unitPrice` | currency | ✅ | Цена за единицу (предзаполняется из Product, изменяемо) |
| `discount` | float(0-100), default:0 | — | Скидка (%) |
| `totalWithoutDiscount` | currency, readOnly | — | qty × unitPrice |
| `lineTotal` | currency, readOnly | — | qty × unitPrice × (1 - discount/100) |
| `vatRate` | float | — | IVA (%) — наследуется из Product, изменяемо |
| `lineDescription` | text | — | Дополнительный текст строки в PDF |

---

### 4. Contract — Contratto (`contracts` в БД)

**Видимость в UI**: ✅ Доступна через меню «Contratti»  
**Создание**: Автоматически при `Opportunity.stage = Closed Won` (через Hook), плюс возможность ручного создания  
**PDF**: ✅ Генерация с переменными + foreach по ProductList

#### Поля:

| Поле | Тип | Обязательное | Описание |
|------|-----|:---:|----------|
| `name` | varchar(249) | ✅ | Название контракта |
| `number` | varchar(50), UNIQUE, readOnly | — | Авто: `CON-{ANNO}-{SEQ}` (es. `CON-2026-00001`) |
| `status` | enum | ✅ | Active/Expired/Cancelled/Renewed → Attivo/Scaduto/Disdetto/Rinnovato |
| `opportunity` | belongsTo Opportunity | ✅ | Родительская Opportunità |
| `account` | belongsTo Account | ✅ | Клиент (наследуется из Opportunity) |
| `winningQuote` | belongsTo Quote | — | Принятое предложение (опционально) |
| `contact` | belongsTo Contact | — | Контактное лицо (подписант) |
| `signed` | bool | — | Firmato |
| `renewed` | bool | — | Rinnovato |
| `value` | currency | ✅ | Стоимость контракта (EUR) |
| `signDate` | date | — | Data firma |
| `startDate` | date | — | Дата начала действия |
| `expirationDate` | date | — | Data scadenza |
| `cancellationDate` | date | — | Data disdetta |
| `durationMonths` | int, readOnly | — | Рассчитывается: startDate → expirationDate |
| `autoRenewal` | bool | — | Автопродление |
| `renewalNoticeDays` | int, default:30 | — | Дней до дедлайна для уведомления |
| `terms` | text | — | Termini e condizioni |
| `internalNotes` | text | — | Внутренние заметки |
| `assignedUser` | people | — | Ответственный (постпродажа) |

#### Бизнес-правила:
- Создаётся автоматически при `Opportunity.stage → Closed Won`
- Проверка: если контракт уже существует для этой Opportunity → не создавать второй
- Авто-нумерация: `CON-{ANNO}-{SEQ:05d}`
- Авто-копирование: `name`, `amount→value`, `accountId` из Opportunity
- Авто-поиск: Quote с `status=Accepted` → заполнение `winningQuote`

---

## 🏗️ ПОШАГОВЫЙ ПЛАН ИМПЛЕМЕНТАЦИИ

### ПРАВИЛО №1 — НИКОГДА НЕ ТРОГАТЬ `application/`

> ⛔ Папка `application/` — это ядро EspoCRM. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО модифицировать файлы в ней.
> ✅ Все кастомизации ТОЛЬКО в `custom/`.

### ПРАВИЛО №2 — После каждого изменения metadata:
```bash
ddev exec php clear_cache.php && ddev exec php rebuild.php
```

### ПРАВИЛО №3 — Naming conventions
- Сущности: `PascalCase` (`ProductList`)
- Поля: `camelCase` (`totalAmount`)
- Таблицы БД: `snake_case` (`product_list`)
- Модуль `Sales`: namespace `Espo\Modules\Sales`

---

### ФАЗА 0 — Подготовка окружения

#### 0.1 Изучить документацию
- [docs.espocrm.com/development/metadata](https://docs.espocrm.com/development/metadata/)
- [docs.espocrm.com/development/hooks](https://docs.espocrm.com/development/hooks/)
- [docs.espocrm.com/user-guide/pdf-templates](https://docs.espocrm.com/user-guide/pdf-templates/)

#### 0.2 Понять существующую структуру
```
custom/
├── Espo/Custom/                  ← уже существует (WhatsApp, etc.)
│   ├── Controllers/WhatsApp.php
│   ├── Core/WhatsApp/
│   └── Resources/metadata/...
custom/Espo/Modules/
├── WhatsApp/                     ← модуль WhatsApp (существует)
│   └── Services/WebSocketService.php
└── Sales/                        ← СОЗДАТЬ НОВЫЙ МОДУЛЬ
```

#### 0.3 Создать структуру директорий Sales
```bash
mkdir -p custom/Espo/Modules/Sales/Resources/metadata/entityDefs
mkdir -p custom/Espo/Modules/Sales/Resources/metadata/scopes
mkdir -p custom/Espo/Modules/Sales/Resources/metadata/clientDefs
mkdir -p custom/Espo/Modules/Sales/Resources/i18n/it_IT
mkdir -p custom/Espo/Modules/Sales/Resources/i18n/en_US
mkdir -p custom/Espo/Modules/Sales/Resources/layouts
mkdir -p custom/Espo/Modules/Sales/Entities
mkdir -p custom/Espo/Modules/Sales/Hooks/Quote
mkdir -p custom/Espo/Modules/Sales/Hooks/Opportunity
mkdir -p custom/Espo/Modules/Sales/Controllers
mkdir -p custom/Espo/Modules/Sales/Services
```

#### 0.4 Создать Module.php
```php
<?php
// custom/Espo/Modules/Sales/Module.php
namespace Espo\Modules\Sales;

class Module
{
    public function getOrder(): int
    {
        return 11;
    }
}
```

#### 0.5 Зарегистрировать модуль
Проверить/создать `custom/modules.json`:
```json
["Sales"]
```
Если файл уже существует с `["WhatsApp"]` — добавить `Sales`:
```json
["WhatsApp", "Sales"]
```

#### 0.6 Проверить регистрацию
```bash
ddev exec php clear_cache.php && ddev exec php rebuild.php
# Проверить логи на ошибки autoload
```

---

### ФАЗА 1 — Сущность Product

#### 1.1 entityDefs
Файл: `custom/Espo/Modules/Sales/Resources/metadata/entityDefs/Product.json`
```json
{
  "fields": {
    "name": { "type": "varchar", "required": true, "trim": true, "maxLength": 249 },
    "status": {
      "type": "enum",
      "options": ["Active", "Inactive"],
      "default": "Active",
      "required": true,
      "style": { "Active": "success", "Inactive": "danger" }
    },
    "type": {
      "type": "enum",
      "options": ["Product", "Service"],
      "default": "Product",
      "required": true
    },
    "price": { "type": "currency", "required": true, "default": 0 },
    "sku": { "type": "varchar", "maxLength": 100 },
    "description": { "type": "text" },
    "stockQuantity": { "type": "float", "min": 0, "default": 0 },
    "infiniteStock": { "type": "bool", "default": false },
    "minPrice": { "type": "currency" },
    "vatRate": {
      "type": "enum",
      "options": ["22", "10", "4", "17", "0"],
      "default": "22"
    },
    "referenceCountry": {
      "type": "enum",
      "options": ["Italia", "SanMarino", "Estero"],
      "default": "Italia"
    },
    "category": {
      "type": "enum",
      "options": ["Hardware", "Software", "Servizi", "Manutenzione", "Licenze", ""]
    },
    "unitOfMeasure": {
      "type": "enum",
      "options": ["pz", "ora", "kg", "mese", "anno", "licenza", ""]
    },
    "image": { "type": "image" },
    "internalNotes": { "type": "text" }
  },
  "collection": { "sortBy": "name", "asc": true }
}
```

#### 1.2 scopes
Файл: `custom/Espo/Modules/Sales/Resources/metadata/scopes/Product.json`
```json
{
  "entity": true, "object": true, "layouts": true,
  "tab": true, "acl": true, "module": "Sales",
  "stream": false, "importable": true, "exportable": true,
  "customizable": true, "type": "Base"
}
```

#### 1.3 Переводы it_IT
Файл: `custom/Espo/Modules/Sales/Resources/i18n/it_IT/Product.json`
```json
{
  "labels": {
    "Create Product": "Crea Prodotto",
    "Product": "Prodotto",
    "Products": "Prodotti"
  },
  "fields": {
    "name": "Nome", "status": "Stato", "type": "Tipo",
    "price": "Prezzo", "sku": "Codice SKU",
    "description": "Descrizione",
    "stockQuantity": "Quantità in magazzino",
    "infiniteStock": "Scorta infinita",
    "minPrice": "Prezzo minimo (floor)",
    "vatRate": "Aliquota IVA",
    "referenceCountry": "Paese di riferimento",
    "category": "Categoria",
    "unitOfMeasure": "Unità di misura",
    "image": "Immagine",
    "internalNotes": "Note interne"
  },
  "options": {
    "status": { "Active": "Attivo", "Inactive": "Inattivo" },
    "type": { "Product": "Prodotto", "Service": "Servizio" },
    "vatRate": { "22": "22% (Italia)", "10": "10%", "4": "4%", "17": "17% (San Marino)", "0": "0% (Esente)" },
    "referenceCountry": { "Italia": "Italia", "SanMarino": "San Marino", "Estero": "Estero" },
    "category": { "Hardware": "Hardware", "Software": "Software", "Servizi": "Servizi", "Manutenzione": "Manutenzione", "Licenze": "Licenze" },
    "unitOfMeasure": { "pz": "pz", "ora": "ora", "kg": "kg", "mese": "mese", "anno": "anno", "licenza": "licenza" }
  }
}
```

#### 1.4 Проверка
```bash
ddev exec php clear_cache.php && ddev exec php rebuild.php
# Ожидаемый результат: «Prodotti» появляется в меню навигации
# Проверить таблицу: ddev mysql -e "DESCRIBE product;"
```

---

### ФАЗА 2 — Сущность Quote (Proposta commerciale)

#### 2.1 entityDefs
Файл: `custom/Espo/Modules/Sales/Resources/metadata/entityDefs/Quote.json`
```json
{
  "fields": {
    "name": { "type": "varchar", "required": true, "maxLength": 249 },
    "number": { "type": "varchar", "maxLength": 50, "readOnly": true, "index": true },
    "status": {
      "type": "enum",
      "options": ["Draft", "Sent", "Accepted", "Rejected"],
      "default": "Draft",
      "required": true,
      "style": { "Draft": "default", "Sent": "primary", "Accepted": "success", "Rejected": "danger" }
    },
    "validUntil": { "type": "date" },
    "globalDiscount": { "type": "float", "min": 0, "max": 100, "default": 0 },
    "taxableAmount": { "type": "currency", "default": 0, "readOnly": true },
    "totalVat": { "type": "currency", "default": 0, "readOnly": true },
    "totalAmount": { "type": "currency", "default": 0, "readOnly": true },
    "language": { "type": "enum", "options": ["Italiano", "English"], "default": "Italiano" },
    "notesForClient": { "type": "text" },
    "internalNotes": { "type": "text" }
  },
  "links": {
    "opportunity": { "type": "belongsTo", "entity": "Opportunity", "foreign": "quotes", "required": true },
    "account": { "type": "belongsTo", "entity": "Account" },
    "contact": { "type": "belongsTo", "entity": "Contact" },
    "productLists": { "type": "hasMany", "entity": "ProductList", "foreign": "quote" }
  },
  "collection": { "sortBy": "createdAt", "asc": false }
}
```

#### 2.2 scopes
Файл: `custom/Espo/Modules/Sales/Resources/metadata/scopes/Quote.json`
```json
{
  "entity": true, "object": true, "layouts": true,
  "tab": true, "acl": true, "module": "Sales",
  "stream": true, "importable": false, "exportable": true,
  "customizable": true, "type": "Base"
}
```

#### 2.3 Связь с Opportunity (добавить в существующий файл)
Файл: `custom/Espo/Modules/Sales/Resources/metadata/entityDefs/Opportunity.json`
```json
{
  "links": {
    "quotes": { "type": "hasMany", "entity": "Quote", "foreign": "opportunity" }
  }
}
```

#### 2.4 Hook — авто-нумерация
Файл: `custom/Espo/Modules/Sales/Hooks/Quote/GenerateNumber.php`
```php
<?php
namespace Espo\Modules\Sales\Hooks\Quote;

use Espo\ORM\Entity;
use Espo\Core\Hook\Hook\BeforeSave;
use Espo\Core\ORM\EntityManager;

class GenerateNumber implements BeforeSave
{
    public function __construct(private EntityManager $entityManager) {}

    public function process(Entity $entity, array $options): void
    {
        if (!$entity->isNew() || $entity->get('number')) return;
        $year = date('Y');
        $last = $this->entityManager->getRepository('Quote')
            ->where(['number*' => 'PROP-' . $year . '-%'])
            ->order('createdAt', 'DESC')->findOne();
        $seq = $last ? ((int) substr($last->get('number'), -5)) + 1 : 1;
        $entity->set('number', sprintf('PROP-%s-%05d', $year, $seq));
    }
}
```

#### 2.5 Hook — создание первой ProductList
Файл: `custom/Espo/Modules/Sales/Hooks/Quote/CreateDefaultProductList.php`
```php
<?php
namespace Espo\Modules\Sales\Hooks\Quote;

use Espo\ORM\Entity;
use Espo\Core\Hook\Hook\AfterSave;
use Espo\Core\ORM\EntityManager;

class CreateDefaultProductList implements AfterSave
{
    public function __construct(private EntityManager $entityManager) {}

    public function process(Entity $entity, array $options): void
    {
        if (!$entity->isNew()) return;
        $list = $this->entityManager->getNewEntity('ProductList');
        $list->set([
            'name' => 'Gruppo 1',
            'order' => 1,
            'quoteId' => $entity->getId()
        ]);
        $this->entityManager->saveEntity($list);
    }
}
```

#### 2.6 Hook — валидация суммы
Файл: `custom/Espo/Modules/Sales/Hooks/Quote/ValidateAmount.php`
```php
<?php
namespace Espo\Modules\Sales\Hooks\Quote;

use Espo\ORM\Entity;
use Espo\Core\Hook\Hook\BeforeSave;
use Espo\Core\ORM\EntityManager;
use Espo\Core\Exceptions\Error;

class ValidateAmount implements BeforeSave
{
    public function __construct(private EntityManager $entityManager) {}

    public function process(Entity $entity, array $options): void
    {
        $opportunityId = $entity->get('opportunityId');
        if (!$opportunityId) return;
        $opp = $this->entityManager->getRepository('Opportunity')->getById($opportunityId);
        if (!$opp) return;
        $oppAmount = (float) $opp->get('amount');
        $quoteTotal = (float) $entity->get('totalAmount');
        if ($oppAmount > 0 && $quoteTotal > $oppAmount) {
            // Soft warning via metadata — non blocca il salvataggio
            // Per blocco hard: throw new Error('Quote supera il valore Opportunità');
            $entity->set('_amountWarning', true);
        }
    }
}
```

#### 2.7 Переводы it_IT Quote
Файл: `custom/Espo/Modules/Sales/Resources/i18n/it_IT/Quote.json`
```json
{
  "labels": {
    "Create Quote": "Crea Proposta",
    "Quote": "Proposta commerciale",
    "Quotes": "Proposte commerciali"
  },
  "fields": {
    "name": "Nome proposta", "number": "Numero proposta",
    "status": "Stato", "validUntil": "Valida fino al",
    "globalDiscount": "Sconto globale (%)",
    "taxableAmount": "Imponibile", "totalVat": "IVA totale",
    "totalAmount": "Totale con IVA", "language": "Lingua proposta",
    "notesForClient": "Note per il cliente", "internalNotes": "Note interne",
    "opportunity": "Opportunità", "account": "Cliente",
    "contact": "Contatto", "productLists": "Liste prodotti"
  },
  "options": {
    "status": { "Draft": "Bozza", "Sent": "Inviata", "Accepted": "Accettata", "Rejected": "Rifiutata" },
    "language": { "Italiano": "Italiano", "English": "English" }
  }
}
```

---

### ФАЗА 3 — ProductList + ProductListItem

#### 3.1 entityDefs ProductList
Файл: `custom/Espo/Modules/Sales/Resources/metadata/entityDefs/ProductList.json`
```json
{
  "fields": {
    "name": { "type": "varchar", "required": true, "default": "Gruppo 1", "maxLength": 100 },
    "order": { "type": "int", "default": 1 },
    "subtotal": { "type": "currency", "default": 0, "readOnly": true },
    "groupDescription": { "type": "text" }
  },
  "links": {
    "quote": { "type": "belongsTo", "entity": "Quote", "foreign": "productLists", "required": true },
    "items": { "type": "hasMany", "entity": "ProductListItem", "foreign": "productList" }
  },
  "collection": { "sortBy": "order", "asc": true }
}
```

#### 3.2 scopes ProductList — ЗАПРЕЩЕНО в меню!
Файл: `custom/Espo/Modules/Sales/Resources/metadata/scopes/ProductList.json`
```json
{
  "entity": true,
  "object": false,
  "layouts": false,
  "tab": false,
  "acl": "Quote",
  "module": "Sales",
  "type": "Base"
}
```
> ⚠️ `"tab": false` + `"object": false` — гарантирует, что ProductList не появится в меню навигации

#### 3.3 entityDefs ProductListItem
Файл: `custom/Espo/Modules/Sales/Resources/metadata/entityDefs/ProductListItem.json`
```json
{
  "fields": {
    "quantity": { "type": "float", "min": 0.001, "default": 1, "required": true },
    "unitPrice": { "type": "currency", "required": true },
    "discount": { "type": "float", "min": 0, "max": 100, "default": 0 },
    "totalWithoutDiscount": { "type": "currency", "readOnly": true },
    "lineTotal": { "type": "currency", "readOnly": true },
    "vatRate": { "type": "float", "default": 22 },
    "lineDescription": { "type": "text" }
  },
  "links": {
    "productList": { "type": "belongsTo", "entity": "ProductList", "foreign": "items", "required": true },
    "product": { "type": "belongsTo", "entity": "Product", "required": true }
  }
}
```

#### 3.4 scopes ProductListItem — тоже скрыт
Файл: `custom/Espo/Modules/Sales/Resources/metadata/scopes/ProductListItem.json`
```json
{ "entity": true, "object": false, "tab": false, "module": "Sales", "type": "Base" }
```

---

### ФАЗА 4 — Сущность Contract

#### 4.1 entityDefs
Файл: `custom/Espo/Modules/Sales/Resources/metadata/entityDefs/Contract.json`
```json
{
  "fields": {
    "name": { "type": "varchar", "required": true, "maxLength": 249 },
    "number": { "type": "varchar", "maxLength": 50, "readOnly": true, "index": true },
    "status": {
      "type": "enum",
      "options": ["Active", "Expired", "Cancelled", "Renewed"],
      "default": "Active",
      "required": true,
      "style": { "Active": "success", "Expired": "danger", "Cancelled": "default", "Renewed": "primary" }
    },
    "signed": { "type": "bool", "default": false },
    "renewed": { "type": "bool", "default": false },
    "autoRenewal": { "type": "bool", "default": false },
    "renewalNoticeDays": { "type": "int", "default": 30 },
    "value": { "type": "currency", "required": true },
    "signDate": { "type": "date" },
    "startDate": { "type": "date" },
    "expirationDate": { "type": "date" },
    "cancellationDate": { "type": "date" },
    "durationMonths": { "type": "int", "readOnly": true },
    "terms": { "type": "text" },
    "internalNotes": { "type": "text" }
  },
  "links": {
    "opportunity": { "type": "belongsTo", "entity": "Opportunity", "foreign": "contract", "required": true },
    "account": { "type": "belongsTo", "entity": "Account", "required": true },
    "contact": { "type": "belongsTo", "entity": "Contact" },
    "winningQuote": { "type": "belongsTo", "entity": "Quote" }
  },
  "collection": { "sortBy": "createdAt", "asc": false }
}
```

#### 4.2 scopes
Файл: `custom/Espo/Modules/Sales/Resources/metadata/scopes/Contract.json`
```json
{
  "entity": true, "object": true, "layouts": true,
  "tab": true, "acl": true, "module": "Sales",
  "stream": true, "importable": false, "exportable": true,
  "customizable": true, "type": "Base"
}
```

#### 4.3 Hook — авто-создание контракта при Closed Won
Файл: `custom/Espo/Modules/Sales/Hooks/Opportunity/CreateContract.php`
```php
<?php
namespace Espo\Modules\Sales\Hooks\Opportunity;

use Espo\ORM\Entity;
use Espo\Core\Hook\Hook\AfterSave;
use Espo\Core\ORM\EntityManager;

class CreateContract implements AfterSave
{
    public function __construct(private EntityManager $entityManager) {}

    public function process(Entity $entity, array $options): void
    {
        $stage = $entity->get('stage');
        $prevStage = $entity->getFetched('stage');

        // Только при переходе -> Closed Won
        if ($stage !== 'Closed Won' || $prevStage === 'Closed Won') return;

        // Проверяем: нет ли уже контракта
        $existing = $this->entityManager->getRepository('Contract')
            ->where(['opportunityId' => $entity->getId()])->findOne();
        if ($existing) return;

        // Ищем принятую Quote
        $acceptedQuote = $this->entityManager->getRepository('Quote')
            ->where(['opportunityId' => $entity->getId(), 'status' => 'Accepted'])
            ->findOne();

        // Авто-нумерация
        $year = date('Y');
        $last = $this->entityManager->getRepository('Contract')
            ->where(['number*' => 'CON-' . $year . '-%'])
            ->order('createdAt', 'DESC')->findOne();
        $seq = $last ? ((int) substr($last->get('number'), -5)) + 1 : 1;
        $number = sprintf('CON-%s-%05d', $year, $seq);

        // Создаём контракт
        $contract = $this->entityManager->getNewEntity('Contract');
        $contract->set([
            'name'          => 'Contratto - ' . $entity->get('name'),
            'number'        => $number,
            'status'        => 'Active',
            'value'         => $entity->get('amount'),
            'opportunityId' => $entity->getId(),
            'accountId'     => $entity->get('accountId'),
            'winningQuoteId'=> $acceptedQuote ? $acceptedQuote->getId() : null,
        ]);
        $this->entityManager->saveEntity($contract);
    }
}
```

#### 4.4 Переводы it_IT Contract
Файл: `custom/Espo/Modules/Sales/Resources/i18n/it_IT/Contract.json`
```json
{
  "labels": {
    "Create Contract": "Crea Contratto",
    "Contract": "Contratto",
    "Contracts": "Contratti"
  },
  "fields": {
    "name": "Nome contratto", "number": "Numero contratto",
    "status": "Stato", "signed": "Firmato", "renewed": "Rinnovato",
    "autoRenewal": "Rinnovo automatico",
    "renewalNoticeDays": "Giorni preavviso rinnovo",
    "value": "Valore (EUR)", "signDate": "Data firma",
    "startDate": "Data inizio", "expirationDate": "Data scadenza",
    "cancellationDate": "Data disdetta", "durationMonths": "Durata (mesi)",
    "terms": "Termini e condizioni", "internalNotes": "Note interne",
    "opportunity": "Opportunità", "account": "Cliente",
    "contact": "Contatto firmatario", "winningQuote": "Proposta accettata"
  },
  "options": {
    "status": { "Active": "Attivo", "Expired": "Scaduto", "Cancelled": "Disdetto", "Renewed": "Rinnovato" }
  }
}
```

---

### ФАЗА 5 — PDF Templates

#### 5.1 PDF для Quote
- EspoCRM нативно поддерживает PDF Templates (`Admin > PDF Templates`)
- Синтаксис шаблонов: Handlebars-подобный
- Установить логотип: `Admin > Company Settings > Logo`

**Переменные Quote для PDF**:
```
{{name}} — название предложения
{{number}} — PROP-2026-00001
{{account.name}} — название клиента
{{contact.name}} — имя контакта
{{validUntil}} — срок действия
{{taxableAmount}} — imponibile
{{totalVat}} — IVA totale
{{totalAmount}} — totale con IVA
{{notesForClient}} — note per cliente
```

**Таблица продуктов (foreach)**:
```handlebars
{{#each productLists}}
<h3>{{name}}</h3>
<table border="1">
  <tr><th>Prodotto</th><th>Qtà</th><th>U.M.</th><th>Prezzo</th><th>Sconto</th><th>Totale</th></tr>
  {{#each items}}
  <tr>
    <td>{{product.name}}</td>
    <td>{{quantity}}</td>
    <td>{{product.unitOfMeasure}}</td>
    <td>{{unitPrice}}</td>
    <td>{{discount}}%</td>
    <td>{{lineTotal}}</td>
  </tr>
  {{/each}}
</table>
<p>Subtotale gruppo: <strong>{{subtotal}}</strong></p>
{{/each}}
```

> ⚠️ Проверить поддержку `each` в версии EspoCRM 9.3.0. При необходимости использовать кастомный PDF рендерер (Twig / Mustache).

---

### ФАЗА 6 — Тестирование

#### Сценарий Happy Path:
1. `Admin > Products` → создать 3 продукта с разными vatRate
2. CRM → Account → Lead → Opportunity
3. В Opportunity → создать Quote → проверить авто-номер `PROP-2026-00001`
4. В Quote → добавить продукты в `Gruppo 1` → проверить расчёт subtotal
5. Нажать `+` → добавить `Gruppo 2` с другими продуктами
6. Изменить статус Quote → `Accepted`
7. Изменить Opportunity.stage → `Closed Won`
8. Проверить: Contract создан автоматически с номером `CON-2026-00001`
9. Проверить в Contract: account, opportunity, winningQuote заполнены
10. Сгенерировать PDF Quote — проверить таблицу продуктов

#### Edge Cases:
- Opportunity → Closed Won дважды → Contract создаётся только один раз ✅
- Quote.totalAmount > Opportunity.amount → предупреждение ✅
- Попытка создать ProductList из URL напрямую → должна быть ошибка ✅
- Product с `minPrice = 100` → скидка до unitPrice < 100 → валидация блокирует ✅

---

### ФАЗА 7 — Deploy

```bash
# 1. Все файлы закоммичены
git add custom/Espo/Modules/Sales/
git commit -m "feat(sales): add Sales module - Product, Quote, ProductList, Contract"
git push

# 2. На сервере
php clear_cache.php && php rebuild.php

# 3. Проверить логи
tail -f data/logs/espo.log
```

---

## ⚙️ ПРАВИЛА РАБОТЫ С ESPOCRM (ОБЯЗАТЕЛЬНО ЧИТАТЬ)

1. **НИКОГДА** не трогать `application/` — это ядро системы
2. **ВСЕГДА** использовать `custom/` для кастомизаций
3. После каждого изменения metadata: `php clear_cache.php && php rebuild.php`
4. После изменения JS: инкрементировать `?v=` в `client.json`
5. Hooks = business logic. Controllers = только API endpoints (если необходимо)
6. Namespace модуля Sales: `Espo\Modules\Sales\...`
7. Namespace WhatsApp (уже существует): `Espo\Modules\WhatsApp\...`
8. Namespace старый Custom (WhatsApp Controller): `Espo\Custom\...`

---

## 📁 ПОЛНАЯ СТРУКТУРА РЕПОЗИТОРИЯ

```
gomercatocrm/                        ← root EspoCRM 9.3.0
├── application/                     ← ⛔ ЯДРО, НЕ ТРОГАТЬ
├── client/
│   └── custom/
│       ├── src/
│       │   └── whatsapp-widget-init.js    ← WhatsApp Frontend Widget
│       └── css/
│           └── whatsapp-widget.css
├── custom/
│   └── Espo/
│       ├── Custom/                  ← старый namespace (WhatsApp Controller)
│       │   ├── Controllers/
│       │   │   └── WhatsApp.php
│       │   ├── Core/WhatsApp/
│       │   │   └── WhatsAppClient.php
│       │   └── Resources/
│       │       └── metadata/
│       │           ├── entityDefs/WhatsAppMessage.json
│       │           ├── app/client.json
│       │           ├── app/webSocket.json
│       │           └── routes.json
│       └── Modules/
│           ├── WhatsApp/            ← модуль WhatsApp
│           │   └── Services/WebSocketService.php
│           └── Sales/               ← ✅ НОВЫЙ МОДУЛЬ (создать)
│               ├── Module.php
│               ├── Entities/
│               ├── Hooks/
│               ├── Controllers/
│               ├── Services/
│               └── Resources/
├── impls/
│   ├── whatsapp_architecture.md     ← документация WhatsApp
│   └── sales_modules_architecture.md ← этот файл
├── .ddev/
│   └── nginx/websocket.conf         ← WSS proxy
└── README.md
```

---

## 🔗 Полезные ссылки

- **EspoCRM Docs**: [docs.espocrm.com](https://docs.espocrm.com)
- **EspoCRM Forum**: [forum.espocrm.com](https://forum.espocrm.com)
- **GitHub repo**: [github.com/skdvlpr/gomercatocrm](https://github.com/skdvlpr/gomercatocrm)
- **Notion (план)**: [Sales modules creation](https://www.notion.so/3118d469d40580ab9a02ec2afb75c0f5)
- **EspoCRM PDF Templates**: [docs.espocrm.com/user-guide/pdf-templates](https://docs.espocrm.com/user-guide/pdf-templates/)
- **EspoCRM Hooks**: [docs.espocrm.com/development/hooks](https://docs.espocrm.com/development/hooks/)
- **EspoCRM Metadata**: [docs.espocrm.com/development/metadata](https://docs.espocrm.com/development/metadata/)
