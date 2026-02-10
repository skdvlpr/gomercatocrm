# GoMercato CRM

EspoCRM customized for GoMercato.

## Quick Start

1. **Install DDEV**: https://ddev.com/get-started/
2. **Clone and start**:
   ```bash
   git clone <repo-url>
   cd gomercatocrm
   ddev start
   ```
3. **Open**: https://gomercatocrm.ddev.site
4. **Database connection** (for install wizard):
   - Host: `db`
   - Database: `db`
   - User: `db`
   - Password: `db`
5. **After Installation**: Run `ddev restart` to setup automatic jobs.

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

Always handle the `.catch()` to show a user-friendly error message.
