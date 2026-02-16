define('custom:controllers/whatsapp', ['controller'], function (Controller) {

    return class extends Controller {

        actionSetup(ids) {
            this.main('custom:views/whatsapp/setup-v2', {
                scope: 'Settings',
                id: 'Settings'
            });
        }
    }
});
