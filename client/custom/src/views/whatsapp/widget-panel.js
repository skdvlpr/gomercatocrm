/**
 * WhatsApp Widget — Main Panel
 * Slide-out panel with Login/QR, Chat List, and Chat View screens
 */
define('custom:views/whatsapp/widget-panel', ['view'], function (View) {

    const SEND_SVG = '<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
    const WA_ICON_SVG = '<svg viewBox="0 0 24 24" style="width:64px;height:64px;fill:#3b4a54"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';

    return class WhatsAppWidgetPanel extends View {

        template = null;
        isOpen = false;
        currentScreen = 'login';
        currentChatId = null;
        currentChatName = '';
        connectionStatus = 'unknown';
        chats = [];
        messages = [];
        statusCheckInterval = null;
        chatRefreshInterval = null;
        _qrLibLoaded = false;

        setup() {
            this.listenTo(this, 'open', () => this.onOpen());
            this.listenTo(this, 'close', () => this.onClose());
        }

        afterRender() {
            this.buildPanel();
        }

        getPanel() {
            return document.getElementById('wa-panel');
        }

        buildPanel() {
            const el = this.$el ? this.$el[0] || this.$el : this.el;
            if (!el) return;

            el.innerHTML = [
                '<div class="whatsapp-widget-panel" id="wa-panel">',
                '  <div class="wa-panel-header">',
                '    <button class="wa-back-btn" id="wa-back-btn">\u2190</button>',
                '    <div style="flex:1">',
                '      <div class="wa-title" id="wa-panel-title">WhatsApp</div>',
                '      <div class="wa-status-text" id="wa-panel-status">Checking...</div>',
                '    </div>',
                '    <button class="wa-close-btn" id="wa-close-btn">\u2715</button>',
                '  </div>',
                '  <div class="wa-screen active" id="wa-screen-login">',
                '    <div class="wa-login-screen">',
                '      <div class="wa-login-title">Connect WhatsApp</div>',
                '      <div class="wa-login-desc">Click Connect to start a session, then scan the QR code with WhatsApp on your phone.</div>',
                '      <button class="wa-connect-btn" id="wa-connect-btn">Connect</button>',
                '      <div id="wa-qr-area" style="display:none">',
                '        <div class="wa-spinner" id="wa-qr-spinner"></div>',
                '        <div class="wa-qr-container" id="wa-qr-container" style="display:none">',
                '          <canvas id="wa-qr-canvas" width="240" height="240"></canvas>',
                '        </div>',
                '        <div class="wa-login-desc" style="margin-top:12px">Open WhatsApp \u2192 Settings \u2192 Linked Devices \u2192 Link a Device</div>',
                '      </div>',
                '    </div>',
                '  </div>',
                '  <div class="wa-screen" id="wa-screen-chatList">',
                '    <div class="wa-search-bar"><input type="text" id="wa-search-input" placeholder="Search chats\u2026"></div>',
                '    <div class="wa-panel-body"><ul class="wa-chat-list" id="wa-chat-list"></ul></div>',
                '  </div>',
                '  <div class="wa-screen" id="wa-screen-chat">',
                '    <div class="wa-messages-container" id="wa-messages-container"></div>',
                '    <div class="wa-send-box">',
                '      <input type="text" id="wa-message-input" placeholder="Type a message\u2026">',
                '      <button class="wa-send-btn" id="wa-send-btn">' + SEND_SVG + '</button>',
                '    </div>',
                '  </div>',
                '</div>'
            ].join('\n');

            this.bindDomEvents();
            this.checkStatus();
        }

        bindDomEvents() {
            var self = this;

            var closeBtn = document.getElementById('wa-close-btn');
            if (closeBtn) closeBtn.onclick = function () { self.trigger('close'); };

            var backBtn = document.getElementById('wa-back-btn');
            if (backBtn) backBtn.onclick = function () {
                if (self.currentScreen === 'chat') self.showScreen('chatList');
            };

            var connectBtn = document.getElementById('wa-connect-btn');
            if (connectBtn) connectBtn.onclick = function () { self.startSession(); };

            var sendBtn = document.getElementById('wa-send-btn');
            if (sendBtn) sendBtn.onclick = function () { self.sendMessage(); };

            var msgInput = document.getElementById('wa-message-input');
            if (msgInput) msgInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    self.sendMessage();
                }
            });

            var searchInput = document.getElementById('wa-search-input');
            if (searchInput) searchInput.addEventListener('input', function (e) {
                self.filterChats(e.target.value);
            });
        }

        onOpen() {
            this.isOpen = true;
            var panel = this.getPanel();
            if (panel) panel.classList.add('open');
            this.checkStatus();
            this.startStatusPolling();
        }

        onClose() {
            this.isOpen = false;
            var panel = this.getPanel();
            if (panel) panel.classList.remove('open');
            this.stopPolling();
        }

        startStatusPolling() {
            this.stopPolling();
            var self = this;
            this.statusCheckInterval = setInterval(function () {
                if (self.isOpen) self.checkStatus();
            }, 5000);
        }

        stopPolling() {
            if (this.statusCheckInterval) {
                clearInterval(this.statusCheckInterval);
                this.statusCheckInterval = null;
            }
            if (this.chatRefreshInterval) {
                clearInterval(this.chatRefreshInterval);
                this.chatRefreshInterval = null;
            }
        }

        async checkStatus() {
            try {
                var result = await Espo.Ajax.getRequest('WhatsApp/action/status');
                this.connectionStatus = result.status;
                this.updateStatusUI();

                if (result.isConnected) {
                    if (this.currentScreen === 'login') {
                        this.showScreen('chatList');
                        this.loadChats();
                    }
                    if (!this.chatRefreshInterval && this.currentScreen === 'chatList') {
                        var self = this;
                        this.chatRefreshInterval = setInterval(function () { self.loadChats(); }, 15000);
                    }
                } else {
                    if (this.currentScreen !== 'login') {
                        this.showScreen('login');
                    }
                }
            } catch (e) {
                // silent
            }
        }

        updateStatusUI() {
            var statusEl = document.getElementById('wa-panel-status');
            if (!statusEl) return;

            var connected = this.connectionStatus === 'authenticated';
            statusEl.textContent = connected ? '\u25cf Connected' : '\u25cb Disconnected';
            statusEl.className = 'wa-status-text' + (connected ? ' connected' : '');
            this.trigger('statusChange', this.connectionStatus);
        }

        showScreen(screenName) {
            this.currentScreen = screenName;
            var screens = document.querySelectorAll('#wa-panel .wa-screen');
            screens.forEach(function (s) { s.classList.remove('active'); });

            var target = document.getElementById('wa-screen-' + screenName);
            if (target) target.classList.add('active');

            var backBtn = document.getElementById('wa-back-btn');
            if (backBtn) backBtn.className = 'wa-back-btn' + (screenName === 'chat' ? ' visible' : '');

            var titleEl = document.getElementById('wa-panel-title');
            if (titleEl) {
                titleEl.textContent = screenName === 'chat' ? (this.currentChatName || 'Chat') : 'WhatsApp';
            }
        }

        async startSession() {
            var connectBtn = document.getElementById('wa-connect-btn');
            var qrArea = document.getElementById('wa-qr-area');
            var spinner = document.getElementById('wa-qr-spinner');
            var qrContainer = document.getElementById('wa-qr-container');

            if (connectBtn) {
                connectBtn.disabled = true;
                connectBtn.textContent = 'Connecting\u2026';
            }
            if (qrArea) qrArea.style.display = 'block';
            if (spinner) spinner.style.display = 'block';
            if (qrContainer) qrContainer.style.display = 'none';

            try {
                await Espo.Ajax.getRequest('WhatsApp/action/login');
                await new Promise(function (r) { setTimeout(r, 2000); });
                this.pollForQR();
            } catch (e) {
                if (connectBtn) {
                    connectBtn.disabled = false;
                    connectBtn.textContent = 'Retry';
                }
                Espo.Ui.error('Failed to connect. Check settings.');
            }
        }

        async pollForQR() {
            var self = this;
            var spinner = document.getElementById('wa-qr-spinner');
            var qrContainer = document.getElementById('wa-qr-container');
            var connectBtn = document.getElementById('wa-connect-btn');
            var attempts = 0;

            var poll = async function () {
                if (!self.isOpen || self.connectionStatus === 'authenticated') return;
                if (attempts >= 30) {
                    if (connectBtn) { connectBtn.disabled = false; connectBtn.textContent = 'Retry'; }
                    if (spinner) spinner.style.display = 'none';
                    return;
                }
                attempts++;

                try {
                    var result = await Espo.Ajax.getRequest('WhatsApp/action/qrCode');
                    if (result.qr) {
                        if (spinner) spinner.style.display = 'none';
                        if (qrContainer) qrContainer.style.display = 'block';
                        self.renderQR(result.qr);
                        if (connectBtn) connectBtn.style.display = 'none';
                        setTimeout(poll, 3000);
                    } else {
                        var status = await Espo.Ajax.getRequest('WhatsApp/action/status');
                        if (status.isConnected) {
                            self.connectionStatus = 'authenticated';
                            self.updateStatusUI();
                            self.showScreen('chatList');
                            self.loadChats();
                            return;
                        }
                        setTimeout(poll, 2000);
                    }
                } catch (e) {
                    setTimeout(poll, 3000);
                }
            };

            poll();
        }

        renderQR(qrString) {
            var canvas = document.getElementById('wa-qr-canvas');
            if (!canvas) return;

            if (typeof QRCode !== 'undefined' && QRCode.toCanvas) {
                QRCode.toCanvas(canvas, qrString, { width: 240, margin: 2, color: { dark: '#000', light: '#fff' } });
            } else if (!this._qrLibLoaded) {
                this._qrLibLoaded = true;
                var self = this;
                var script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js';
                script.onload = function () {
                    if (typeof QRCode !== 'undefined' && QRCode.toCanvas) {
                        QRCode.toCanvas(canvas, qrString, { width: 240, margin: 2, color: { dark: '#000', light: '#fff' } });
                    }
                };
                document.head.appendChild(script);
            }
        }

        async loadChats() {
            try {
                var result = await Espo.Ajax.getRequest('WhatsApp/action/getChats');
                this.chats = result.list || [];
                this.renderChatList(this.chats);
            } catch (e) {
                var listEl = document.getElementById('wa-chat-list');
                if (listEl) listEl.innerHTML = '<div class="wa-empty-state"><p>Failed to load chats</p></div>';
            }
        }

        renderChatList(chats) {
            var listEl = document.getElementById('wa-chat-list');
            if (!listEl) return;

            if (!chats || chats.length === 0) {
                listEl.innerHTML = '<div class="wa-empty-state">' + WA_ICON_SVG + '<p>No chats yet</p></div>';
                return;
            }

            var self = this;
            listEl.innerHTML = chats.map(function (chat) {
                var name = chat.name || (chat.contact && chat.contact.pushname) || (chat.id && chat.id._serialized) || 'Unknown';
                var lastMsg = (chat.lastMessage && chat.lastMessage.body) || '';
                var time = (chat.lastMessage && chat.lastMessage.timestamp) ? self.formatTime(chat.lastMessage.timestamp) : '';
                var unread = chat.unreadCount || 0;
                var chatId = (chat.id && chat.id._serialized) || chat.id || '';
                var initial = (name[0] || '?').toUpperCase();

                return [
                    '<li class="wa-chat-item" data-chat-id="' + self.esc(chatId) + '" data-chat-name="' + self.esc(name) + '">',
                    '  <div class="wa-chat-avatar"><span>' + self.esc(initial) + '</span></div>',
                    '  <div class="wa-chat-info">',
                    '    <div class="wa-chat-name">' + self.esc(name) + '</div>',
                    '    <div class="wa-chat-last-msg">' + self.esc(lastMsg) + '</div>',
                    '  </div>',
                    '  <div class="wa-chat-meta">',
                    '    <div class="wa-chat-time">' + self.esc(time) + '</div>',
                    unread > 0 ? '    <div class="wa-chat-unread">' + unread + '</div>' : '',
                    '  </div>',
                    '</li>'
                ].join('');
            }).join('');

            listEl.querySelectorAll('.wa-chat-item').forEach(function (item) {
                item.addEventListener('click', function () {
                    self.openChat(item.dataset.chatId, item.dataset.chatName);
                });
            });
        }

        filterChats(query) {
            if (!query) { this.renderChatList(this.chats); return; }
            var q = query.toLowerCase();
            var filtered = this.chats.filter(function (chat) {
                var name = (chat.name || (chat.contact && chat.contact.pushname) || '').toLowerCase();
                return name.indexOf(q) !== -1;
            });
            this.renderChatList(filtered);
        }

        async openChat(chatId, chatName) {
            this.currentChatId = chatId;
            this.currentChatName = chatName;
            this.showScreen('chat');

            var container = document.getElementById('wa-messages-container');
            if (container) container.innerHTML = '<div class="wa-loading"><div class="wa-spinner"></div></div>';

            try {
                var result = await Espo.Ajax.getRequest('WhatsApp/action/getChatMessages', { chatId: chatId, limit: 50 });
                this.messages = result.list || [];
                this.renderMessages(this.messages);
            } catch (e) {
                if (container) container.innerHTML = '<div class="wa-empty-state"><p>Failed to load messages</p></div>';
            }
        }

        renderMessages(messages) {
            var container = document.getElementById('wa-messages-container');
            if (!container) return;

            if (!messages || messages.length === 0) {
                container.innerHTML = '<div class="wa-empty-state"><p>No messages yet</p></div>';
                return;
            }

            var sorted = messages.slice().sort(function (a, b) { return (a.timestamp || 0) - (b.timestamp || 0); });
            var html = '';
            var lastDate = '';
            var self = this;

            sorted.forEach(function (msg) {
                var date = msg.timestamp ? new Date(msg.timestamp * 1000) : new Date();
                var dateStr = date.toLocaleDateString();

                if (dateStr !== lastDate) {
                    html += '<div class="wa-message-date-divider"><span>' + self.esc(dateStr) + '</span></div>';
                    lastDate = dateStr;
                }

                var isOut = msg.fromMe;
                var body = msg.body || '';
                var time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                html += [
                    '<div class="wa-message ' + (isOut ? 'outgoing' : 'incoming') + '">',
                    '  <div class="wa-message-text">' + self.esc(body) + '</div>',
                    '  <div class="wa-message-time">' + self.esc(time) + '</div>',
                    '</div>'
                ].join('');
            });

            container.innerHTML = html;
            container.scrollTop = container.scrollHeight;
        }

        async sendMessage() {
            var input = document.getElementById('wa-message-input');
            var text = input ? input.value.trim() : '';
            if (!text || !this.currentChatId) return;
            input.value = '';

            var container = document.getElementById('wa-messages-container');
            var now = new Date();
            var time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            var msgEl = document.createElement('div');
            msgEl.className = 'wa-message outgoing';
            msgEl.innerHTML = '<div class="wa-message-text">' + this.esc(text) + '</div><div class="wa-message-time">' + time + ' \u23f3</div>';
            if (container) {
                container.appendChild(msgEl);
                container.scrollTop = container.scrollHeight;
            }

            try {
                await Espo.Ajax.postRequest('WhatsApp/action/sendMessage', {
                    chatId: this.currentChatId,
                    message: text
                });
                msgEl.querySelector('.wa-message-time').textContent = time + ' \u2713';
            } catch (e) {
                msgEl.querySelector('.wa-message-time').textContent = time + ' \u2717';
                msgEl.style.opacity = '0.5';
                Espo.Ui.error('Failed to send message');
            }
        }

        formatTime(timestamp) {
            if (!timestamp) return '';
            var date = new Date(timestamp * 1000);
            var now = new Date();
            var diff = now - date;
            if (diff < 86400000) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            if (diff < 604800000) return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
            return date.toLocaleDateString();
        }

        esc(str) {
            if (!str) return '';
            var div = document.createElement('div');
            div.textContent = String(str);
            return div.innerHTML;
        }

        onRemove() {
            this.stopPolling();
        }
    }
});
