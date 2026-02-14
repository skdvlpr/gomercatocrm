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
