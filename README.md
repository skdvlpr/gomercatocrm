# GoMercato CRM

![GoMercato Logo](https://www.gomercato.it/_next/image?url=%2Fimg%2Flogo-long-gray.png&w=384&q=75)

EspoCRM customized for GoMercato.

## Quick Start

1. **Install DDEV**: https://ddev.com/get-started/
2. **Clone and start**:
   ```bash
   git clone <repo-url>
   cd gmcrm
   ddev start
   ```
3. **Open**: https://gmcrm.ddev.site
4. **Database connection** (for install wizard):
   - Host: `db`
   - Database: `db`
   - User: `db`
   - Password: `db`
5. **After Installation**: Run `ddev restart` to setup automatic jobs.

## 📱 WhatsApp Integration Guide

### 🔑 Production Setup (Important)

The default API Key for the WhatsApp integration is configured for local development (`espocrm-secret-key`). **For production environments, you must change this to a secure random string.**

**Steps to change the API Key:**

1.  **Update Container Config**: Edit `.ddev/docker-compose.whatsapp.yaml` (or your production `docker-compose.yaml`):
    ```yaml
    environment:
      - API_KEY=your-secure-random-key
    ```
2.  **Update EspoCRM Config**: Edit `data/config.php`:
    ```php
    'whatsappApiKey' => 'your-secure-random-key',
    ```
3.  **Restart Services**:
    ```bash
    ddev restart
    # Or for production:
    docker-compose down && docker-compose up -d
    ```

This section details the custom WhatsApp widget integration, including its architecture, components, and usage.

### 🏗 Architecture Overview

The integration relies on a robust real-time architecture utilizing WhatsApp Web.js (WAHA), ZeroMQ, and WebSockets (WAMP via Ratchet).

1.  **DDEV Services**:
    - `web`: The main PHP-FPM container running EspoCRM.
    - `daemon`: A dedicated container running the EspoCRM WebSocket daemon (`websocket.php`) and background jobs.
    - `wwebjs-api`: A dedicated Node.js container running the WhatsApp HTTP API (WAHA).
2.  **Message Flow (Incoming)**:
    - WAHA receives a message from WhatsApp servers.
    - WAHA sends an HTTP POST Webhook to `WhatsApp/action/webhook`.
    - EspoCRM saves the message to the database.
    - EspoCRM pushes the event via ZeroMQ (`tcp://127.0.0.1:5555`) to the WebSocket Daemon.
    - The Ratchet Daemon broadcasts the message via WebSocket (WAMP) to all subscribed frontend clients.
3.  **Frontend Widget**: A pure JavaScript widget (`whatsapp-widget-init.js`) injected globally. It maintains a persistent WebSocket connection for zero-latency updates, with an intelligent HTTP polling fallback if the socket drops.

### 🧩 Components Breakdown

#### 1. Frontend Widget (`client/custom/src/whatsapp-widget-init.js`)

This is the core of the client-side logic. It floats independently of the main application router.

- **Real-Time Engine**:
  - Establishes a WAMP WebSocket connection (`/wss` -> `auth-token`).
  - Subscribes to the `WhatsApp` topic to receive instant messages and read-receipts (`message_ack`).
  - **Fallback Polling**: If WebSocket fails, it intelligently falls back to HTTP polling (`action/getChatMessages`) every second.
- **DOM Memoization**: Uses string-hashing HTML caching during renders to prevent DOM thrashing and text-selection loss during high-frequency updates.
- **Lazy Loading**: Uses `IntersectionObserver` to load contact Profile Pictures only when scrolled into view.
- **UI Layers**: Login (QR code), Chat List, Contact List, and active Chat View (with Emoji Picker).

#### 2. Backend Controller (`custom/Espo/Custom/Controllers/WhatsApp.php`)

Handles HTTP requests from the widget and incoming webhooks from WAHA.

- **Endpoints**:
  - `actionWebhook`: High-performance ingestion endpoint for WAHA webhooks. Triggers ZeroMQ broadcasts.
  - `actionStatus` / `actionLogin` / `actionLogout`: Manages the WAHA session lifecycle.
  - `actionQrCode`: Fetches the live QR code from WAHA.
  - `actionSendMessage`: Sends text out via WAHA and returns optimistic message IDs.
  - `actionGetProfilePic`: Proxies profile picture downloads from WhatsApp CDN to local cache (`client/custom/whatsapp-avatars/`) to fix CORS/expiration issues.

#### 3. WebSocket Configuration

Real-time functionality requires specific infrastructure configurations:

- **Nginx Proxy**: `.ddev/nginx/websocket.conf` intercepts traffic to `/wss` and proxies it to the Ratchet daemon on `127.0.0.1:8443`.
- **Topic Whitelist**: The `WhatsApp` WAMP topic is explicitly whitelisted in `custom/Espo/Custom/Resources/metadata/app/webSocket.json`.
- **ZeroMQ**: Used internally by EspoCRM `WebSocketService` to bridge standard HTTP FPM requests to the persistent Ratchet PHP daemon.

#### 4. Metadata Injection (`custom/Espo/Custom/Resources/metadata/app/client.json`)

Registers the script to be loaded globally across all EspoCRM pages.

```json
{
  "scriptList": [
    "__APPEND__",
    "client/custom/src/whatsapp-widget-init.js?v=2028.11"
  ]
}
```

### ⚙️ Setup & Configuration

1.  **Prerequisites**: Ensure the Node.js based WhatsApp API service is running (if external).
2.  **Enable Integration**:
    - Go to **Administration > Integrations > WhatsApp**.
    - Tick **Enabled**.
    - Save.

### 🚀 Usage Guide

1.  **Open**: Click the green WhatsApp floating button in the bottom-right corner.
2.  **Connect**:
    - If not connected, you will see a "Generate QR Code" button.
    - Click it and scan the QR code with your phone (Linked Devices).
3.  **Chat**:
    - **Existing Chats**: Select a chat from the list to continue conversation.
    - **New Chat**: Click the `+` icon, search for a contact, and select them.
4.  **Disconnect**: Click the `Logout` icon (top-right of widget) to sever the connection.

### 🛠 Troubleshooting

| Issue                     | Possible Cause                     | Solution                                                                     |
| :------------------------ | :--------------------------------- | :--------------------------------------------------------------------------- |
| **Widget not appearing**  | Metadata cache or file permissions | Run `php command.php rebuild`. Check browser console for JS errors.          |
| **"Network Error"**       | Backend API failure                | Check `data/logs/espo-*.log` for 500 errors. Ensure controller exists.       |
| **QR Code won't load**    | Session already active or timeout  | Click "Refresh QR". If stuck, restart the backend service.                   |
| **Filtering not working** | Browser autocomplete interference  | Ensure `autocomplete="off"` is present on inputs (fixed in latest version).  |
| **Visual Bugs**           | CSS Caching                        | Hard reload (Ctrl+F5). CSS is versioned but browser cache can be aggressive. |

---

## Auto-features

- ✅ Cron runs every minute (via ddev-cron addon)
- ✅ Cache clears on every `ddev start`/`restart`
- ✅ **CSV Lead Import**: A custom feature to import leads from Google Sheets.
  - **Setup Required**:
    1. Go to **Administration > Scheduled Jobs**.
    2. Create a new Job: `CsvLeadImport`.
    3. Set Scheduling (e.g., `* * * * *` for every minute).

## 🏗 Architecture & Extensibility Guide

This section explains the core components of EspoCRM and how to extend them correctly.

### 1. Controllers (`custom/Espo/Custom/Controllers/`)

**Purpose**: Handle HTTP requests, parse input, check permissions, and return responses.
**Base Class**: Extend `Espo\Core\Controllers\Record` for standard entities or `Espo\Core\Controllers\Base` for custom logic.
**Key Rules**:

- **Naming**: Class name **must** match the scope/entity name (e.g., `CsvLeadImport`).
- **Actions**: Methods must be named `action{Name}`. The prefix (`post`, `get`, `delete`) matches the HTTP method defined in `routes.json`.
- **Dependencies**: Use `$this->injectableFactory->create(MyService::class)` to load services.

### 2. Services (`custom/Espo/Custom/Services/`)

**Purpose**: Contain business logic. Controllers should be thin; Services should do the heavy lifting.
**Base Class**: Extend `Espo\Core\Services\Base` or `Espo\Core\Record\Service`.
**Key Rules**:

- **Injection**: Services are instantiated via dependency injection.
- **Transactions**: Handle database transactions here if multiple records are modified.

### 3. Entities (`custom/Espo/Custom/Entities/`)

**Purpose**: Represent a single database record.
**Base Class**: Extend `Espo\ORM\Entity`.
**Key Rules**:

- **Get/Set**: Use `$entity->get('fieldName')` and `$entity->set('fieldName', $value)`.
- **Type Hinting**: Define constants for field names to avoid magic strings.

### 4. Routes (`custom/Espo/Custom/Resources/routes.json`)

**Purpose**: Map URLs to Controller Actions.
**Action**: After editing, run `php command.php rebuild`.

## 🛠 Troubleshooting Guide

### 🐛 General Button Debugging Workflow

If a custom button is not working, follow this path to find the issue:

#### Step 1: Frontend Definition (The "Click")

1.  **Check `clientDefs`**: Look in `custom/Espo/Custom/Resources/metadata/clientDefs/{Entity}.json`. ensure the button is defined in the `menu` section.
2.  **Check Handler**: The button entry points to a handler (e.g., `custom:handlers/my-handler`). Check that file in `client/custom/src/handlers/`.
3.  **Check `action{Name}`**: The handler must have a method matching the button's action.

#### Step 2: Communication (The "Network")

1.  Open Browser Console (**F12**), go to **Network** tab.
2.  Click the button.
3.  **Red (404)**: The URL is wrong or the Route is missing (`routes.json`).
4.  **Red (500)**: Server Error. The request reached the server but crashed.

#### Step 3: Backend Processing (The "Logic")

If you got a 500 error, check `data/logs/espo-YYYY-MM-DD.log`. Common errors:

- **Class Not Found**: You forgot to run `php command.php rebuild` or named the file wrong.
- **Type Error**: Passing the wrong argument type (see below).
- **Access Denied (403)**: ACL check failed.

### ⚠️ Common Pitfalls

#### 1. `checkEntityEdit` Type Mismatch

**Error**: `Argument 1 passed to checkEntityEdit() must be instance of Entity, string given`.
**Wrong**: `$this->acl->checkEntityEdit('MyEntity', $id)`
**Correct**:

```php
$entity = $this->getEntityManager()->getEntity('MyEntity', $id);
if (!$entity) throw new NotFound();
$this->acl->checkEntityEdit($entity);
```

_Reason_: Access checks often need field values (e.g., "edit own"), so they need the full object, not just the name.

#### 2. Frontend `this.ajax`

When calling the backend from a frontend view/handler:

```js
// Correct
Ajax.postRequest('MyScope/' + id + '/myAction')
    .then(response => { ... })
    .catch(xhr => { ... });
```
