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

## Auto-features

- ✅ Cron runs every minute (via ddev-cron addon)
- ✅ Cache clears on every `ddev start`/`restart`
