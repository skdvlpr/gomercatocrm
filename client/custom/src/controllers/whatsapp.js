define('custom:controllers/whatsapp', ['controller'], function (Controller) {

    return class extends Controller {

        actionSetup(ids) {
            this.main('custom:views/whatsapp/setup', {
                scope: 'Settings',
                id: 'Settings' // Virtual ID for settings
            });
        }
    }
});
