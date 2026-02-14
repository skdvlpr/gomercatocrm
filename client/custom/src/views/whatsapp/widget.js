define('custom:views/whatsapp/widget', ['view'], (View) => {
    return class extends View {
        template = 'custom:whatsapp/widget';

        data() {
            return {
                isConnected: this.isConnected,
                qrCode: this.qrCode,
                messages: this.messages,
                isLoading: this.isLoading
            };
        }

        setup() {
            this.isConnected = false;
            this.qrCode = null;
            this.messages = [];
            this.isLoading = false;

            // Check connection status on startup
            this.checkConnectionStatus();

            // Polling for updates (every 5 seconds)
            this.statusInterval = setInterval(() => {
                this.checkConnectionStatus();
            }, 5000);
        }

        checkConnectionStatus() {
            Espo.Ajax.getRequest('WhatsApp/action/status')
                .then(response => {
                    if (response.isConnected !== this.isConnected) {
                        this.isConnected = response.isConnected;
                        this.reRender();
                    }
                });
        }

        actionLogin() {
            this.isLoading = true;
            this.reRender();

            Espo.Ajax.getRequest('WhatsApp/action/login')
                .then(response => {
                    this.qrCode = response.qrCode;
                    this.isLoading = false;
                    this.reRender();

                    // Check authentication every 2 seconds
                    if (this.qrCheckInterval) clearInterval(this.qrCheckInterval);
                    this.qrCheckInterval = setInterval(() => {
                        this.checkConnectionStatus();
                        if (this.isConnected) {
                            clearInterval(this.qrCheckInterval);
                            this.qrCode = null;
                            this.reRender();
                            Espo.Ui.success(this.translate('Connected', 'labels', 'WhatsApp'));
                        }
                    }, 2000);
                })
                .catch(() => {
                    this.isLoading = false;
                    this.reRender();
                    Espo.Ui.error(this.translate('Connection Failed', 'labels', 'WhatsApp'));
                });
        }

        actionLogout() {
            this.confirm(this.translate('Confirm Logout', 'messages', 'WhatsApp'), () => {
                Espo.Ajax.postRequest('WhatsApp/action/logout')
                    .then(() => {
                        this.isConnected = false;
                        this.reRender();
                        Espo.Ui.success(this.translate('Disconnected', 'labels', 'WhatsApp'));
                    });
            });
        }

        actionSend() {
            const message = this.$el.find('[data-name="message-input"]').val();
            const phone = this.model.get('phoneNumber');

            if (!message || !phone) {
                return;
            }

            Espo.Ajax.postRequest('WhatsApp/action/sendMessage', {
                phone: phone,
                message: message
            }).then(() => {
                this.$el.find('[data-name="message-input"]').val('');
                Espo.Ui.success(this.translate('Message Sent', 'labels', 'WhatsApp'));
                
                // Add message to list (optimistic UI update)
                this.messages.push({
                    body: message,
                    fromMe: true,
                    timestamp: new Date().toLocaleTimeString()
                });
                this.reRender();
            }).catch(error => {
                console.error(error);
                Espo.Ui.error(this.translate('Error sending message', 'labels', 'WhatsApp'));
            });
        }

        onRemove() {
            if (this.statusInterval) {
                clearInterval(this.statusInterval);
            }
            if (this.qrCheckInterval) {
                clearInterval(this.qrCheckInterval);
            }
        }
    };
});
