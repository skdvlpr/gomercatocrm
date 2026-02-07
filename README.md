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
- ✅ **CSV Lead Import**: Auto-imports leads from public Google Sheets CSV URLs (configured in Admin)
- ✅ Cache clears on every `ddev start`/`restart`
