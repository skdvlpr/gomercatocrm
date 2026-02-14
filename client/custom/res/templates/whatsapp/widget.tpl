<div class="whatsapp-widget">
    {{#unless isConnected}}
        <div class="whatsapp-login">
            <div class="login-header">
                <i class="fab fa-whatsapp"></i>
                <h3>WhatsApp Web</h3>
            </div>
            
            {{#unless qrCode}}
                <button class="btn btn-success btn-lg" data-action="login" {{#if isLoading}}disabled{{/if}}>
                    {{#if isLoading}}
                        <span class="spinner-border spinner-border-sm"></span>
                        Loading...
                    {{else}}
                        <i class="fas fa-qrcode"></i> Login via QR Code
                    {{/if}}
                </button>
                <p class="help-text">Scan the QR code with WhatsApp on your phone</p>
            {{/unless}}
            
            {{#if qrCode}}
                <div class="qr-container">
                    <img src="{{qrCode}}" alt="QR Code" />
                    <p class="qr-instructions">
                        <strong>How to login:</strong><br>
                        1. Open WhatsApp on your phone<br>
                        2. Menu → Linked devices<br>
                        3. Scan this code
                    </p>
                    <div class="spinner-border text-success" role="status">
                        <span class="sr-only">Waiting for scan...</span>
                    </div>
                </div>
            {{/if}}
        </div>
    {{else}}
        <div class="whatsapp-chat">
            <div class="chat-header">
                <div class="header-left">
                    <i class="fab fa-whatsapp"></i>
                    <span class="header-title">WhatsApp Web</span>
                    <span class="status-badge">Connected</span>
                </div>
                <button class="btn btn-sm btn-danger" data-action="logout" title="Disconnect">
                    <i class="fas fa-sign-out-alt"></i>
                </button>
            </div>
            
            <div class="chat-messages" data-name="messages-container">
                {{#if messages.length}}
                    {{#each messages}}
                        <div class="message {{#if fromMe}}sent{{else}}received{{/if}}">
                            <div class="message-bubble">
                                <p class="message-text">{{body}}</p>
                                <span class="timestamp">{{timestamp}}</span>
                            </div>
                        </div>
                    {{/each}}
                {{else}}
                    <div class="empty-state">
                        <i class="fas fa-comments"></i>
                        <p>No messages yet</p>
                    </div>
                {{/if}}
            </div>
            
            <div class="chat-input">
                <input 
                    type="text" 
                    class="form-control" 
                    data-name="message-input"
                    placeholder="Type a message..."
                    {{#unless model.phoneNumber}}disabled{{/unless}}
                />
                <button 
                    class="btn btn-primary" 
                    data-action="send"
                    {{#unless model.phoneNumber}}disabled{{/unless}}
                >
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>
            
            {{#unless model.phoneNumber}}
                <div class="alert alert-warning mt-2">
                    <i class="fas fa-exclamation-triangle"></i>
                    No phone number for this Lead
                </div>
            {{/unless}}
        </div>
    {{/unless}}
</div>
