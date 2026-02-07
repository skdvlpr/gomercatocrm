define('custom:handlers/csv-lead-import', ['ajax'], function (Ajax) {

    return class {
        constructor(view) {
            this.view = view;
        }

        actionRunImportNow() {
            const model = this.view.model;
            const id = model.id;

            Espo.Ui.confirm(
                this.view.translate('Are you sure you want to run the import now?', 'messages', 'CsvLeadImport'),
                {
                    confirmText: this.view.translate('Run Import Now', 'labels', 'CsvLeadImport'),
                    cancelText: this.view.translate('Cancel', 'labels'),
                },
                () => {
                    Espo.Ui.notify(this.view.translate('Please wait...', 'messages'));

                    Ajax.postRequest('CsvLeadImport/' + id + '/runImport')
                        .then(response => {
                            const imported = response && response.imported !== undefined ? response.imported : 0;
                            const total = response && response.total !== undefined ? response.total : 0;
                            
                            Espo.Ui.success(
                                this.view.translate('Import completed', 'messages', 'CsvLeadImport') + 
                                ': ' + imported + ' ' + 
                                this.view.translate('leads imported', 'messages', 'CsvLeadImport') +
                                ' (' + this.view.translate('total', 'messages', 'CsvLeadImport') + ': ' + total + ')'
                            );

                            model.fetch();
                        })
                        .catch(xhr => {
                            let message = this.view.translate('Error', 'labels');

                            if (xhr.responseJSON && xhr.responseJSON.message) {
                                message = xhr.responseJSON.message;
                            } else if (xhr.responseText) {
                                try {
                                    const parsed = JSON.parse(xhr.responseText);
                                    if (parsed.message) {
                                        message = parsed.message;
                                    }
                                } catch (e) {
                                    // ignore parse error
                                }
                            }

                            Espo.Ui.error(message);
                            model.fetch();
                        });
                }
            );
        }

        actionResetCounter() {
            const model = this.view.model;
            const id = model.id;

            Espo.Ui.confirm(
                this.view.translate('Are you sure you want to reset the counter?', 'messages', 'CsvLeadImport'),
                {
                    confirmText: this.view.translate('Reset Counter', 'labels', 'CsvLeadImport'),
                    cancelText: this.view.translate('Cancel', 'labels'),
                    confirmStyle: 'danger',
                },
                () => {
                    Espo.Ui.notify(this.view.translate('Please wait...', 'messages'));

                    Ajax.postRequest('CsvLeadImport/' + id + '/resetCounter')
                        .then(() => {
                            Espo.Ui.success(this.view.translate('Counter has been reset', 'messages', 'CsvLeadImport'));

                            model.fetch();
                        })
                        .catch(xhr => {
                            let message = this.view.translate('Error', 'labels');

                            if (xhr.responseJSON && xhr.responseJSON.message) {
                                message = xhr.responseJSON.message;
                            }

                            Espo.Ui.error(message);
                        });
                }
            );
        }
    };
});
