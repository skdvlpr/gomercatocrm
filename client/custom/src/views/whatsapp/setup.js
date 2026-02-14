define('custom:views/whatsapp/setup', ['view', 'model'], function (View, Model) {

    return class extends View {
        
        template = 'custom:whatsapp/setup';

        events = {
            'click [data-action="save"]': 'actionSave',
            'click [data-action="cancel"]': 'actionCancel'
        };

        setup() {
            // Create Settings model
            this.model = new Model();
            this.model.name = 'Settings';
            // We won't use urlRoot for fetch/save directly to be safe

            // Explicitly create views for each field
            this.createField('whatsappApiUrl', 'url');
            this.createField('whatsappApiKey', 'varchar');
            this.createField('whatsappAutoMessageEnabled', 'bool');
            this.createField('whatsappLeadTemplate', 'text');

            this.wait(this.loadData());
        }

        createField(name, type) {
            this.createView(name, 'views/fields/' + type, {
                name: name,
                model: this.model,
                mode: 'edit',
                labelText: this.translate(name, 'fields', 'Settings')
            });
        }

        async loadData() {
            try {
                // Explicitly fetch settings
                const data = await Espo.Ajax.getRequest('Settings');
                this.model.set(data);
                
                // Trigger change to update views if they were already rendered empty
                // But view.render() will happen after setup(), so it should be fine.
            } catch (e) {
                console.error("Failed to load settings", e);
                Espo.Ui.error("Failed to load settings");
            }
        }

        async actionSave() {
            // Notify user that save started
            Espo.Ui.notify('Saving...');
            
            // Get data from model
            const data = this.model.attributes;
            
            // We only need to send the relevant fields
            const payload = {
                whatsappApiUrl: data.whatsappApiUrl,
                whatsappApiKey: data.whatsappApiKey,
                whatsappAutoMessageEnabled: data.whatsappAutoMessageEnabled,
                whatsappLeadTemplate: data.whatsappLeadTemplate
            };

            try {
                // Use Custom Controller Action
                await Espo.Ajax.postRequest('WhatsApp/action/saveSettings', payload);
                Espo.Ui.success(this.translate('Saved'));
            } catch (e) {
                console.error("Save failed", e);
                let msg = 'Error';
                if (e.response) {
                    if (e.response.status === 404) {
                        msg = '404 Not Found (Check Routes)';
                    } else if (e.response.status === 500) {
                        msg = '500 Server Error: ' + (e.response.statusText || 'Internal Error');
                        // Try to parse JSON error if available
                        if (e.response.responseJSON && e.response.responseJSON.message) {
                            msg += ' - ' + e.response.responseJSON.message;
                        } else if (e.response.responseText) {
                             // Log response text for debugging
                             console.error("Response Text:", e.response.responseText);
                        }
                    }
                }
                Espo.Ui.error(msg);
            }
        }

        actionCancel() {
            this.getRouter().navigate('#Admin', {trigger: true});
        }
    }
});
