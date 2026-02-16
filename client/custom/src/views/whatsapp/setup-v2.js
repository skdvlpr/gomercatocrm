define('custom:views/whatsapp/setup-v2', ['view', 'model'], function (View, Model) {

    return class extends View {
        
        // template = 'custom:whatsapp/setup-v2';
        templateContent = `
<div class="header-page">
    <h3>WhatsApp Integration Settings</h3>
</div>

<div class="record">
    <div class="panel panel-default">
        <div class="panel-heading">
            <h4 class="panel-title">Connection Settings</h4>
        </div>
        <div class="panel-body">
            <div class="row">
                <div class="col-md-12">
                     <div class="form-group">
                        <label class="control-label" data-name="whatsappEnabled">Enable WhatsApp Integration</label>
                        <div class="field" data-name="whatsappEnabled">
                            {{{whatsappEnabled}}}
                        </div>
                    </div>
                </div>
            </div>
            <div class="row">
                <div class="col-md-6">
                    <div class="form-group">
                        <label class="control-label" data-name="whatsappApiUrl">WhatsApp API URL</label>
                        <div class="field" data-name="whatsappApiUrl">
                            {{{whatsappApiUrl}}}
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="form-group">
                        <label class="control-label" data-name="whatsappApiKey">WhatsApp API Key</label>
                        <div class="field" data-name="whatsappApiKey">
                            {{{whatsappApiKey}}}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="panel panel-default">
        <div class="panel-heading">
            <h4 class="panel-title">Automation</h4>
        </div>
        <div class="panel-body">
            <div class="row">
                <div class="col-md-12">
                     <div class="form-group">
                        <label class="control-label" data-name="whatsappAutoMessageEnabled">Enable Automated Welcome Message</label>
                        <div class="field" data-name="whatsappAutoMessageEnabled">
                            {{{whatsappAutoMessageEnabled}}}
                        </div>
                    </div>
                </div>
            </div>
            <div class="row">
                <div class="col-md-12">
                    <div class="form-group">
                        <label class="control-label" data-name="whatsappLeadTemplate">Message Template</label>
                        <div class="field" data-name="whatsappLeadTemplate">
                            {{{whatsappLeadTemplate}}}
                        </div>
                        <p class="help-block small">Available placeholders: {name}, {company}, {source}</p>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="button-container">
        <button type="button" class="btn btn-primary action" data-action="save">Save</button>
        <button type="button" class="btn btn-default action" data-action="cancel">Cancel</button>
    </div>
</div>
`;

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
            this.createField('whatsappEnabled', 'bool');
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
                whatsappEnabled: data.whatsappEnabled,
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
