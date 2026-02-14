/**
 * WhatsApp Widget — All-in-one script
 * Floating button + slide-out panel with Login/QR, Chat List, and Chat View
 * Loaded via EspoCRM app > client > scriptList
 */
(function () {
    'use strict';

    /* ── CSS Injection ──────────────────────────────────────────── */
    if (!document.querySelector('link[href*="whatsapp-widget.css"]')) {
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'client/custom/css/whatsapp-widget.css';
        document.head.appendChild(link);
    }

    /* ── SVGs ────────────────────────────────────────────────────── */
    var WA_SVG = '<svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';
    var SEND_SVG = '<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';

    /* ── State ───────────────────────────────────────────────────── */
    var state = {
        initialized: false,
        panelBuilt: false,
        isOpen: false,
        screen: 'login', // login | chatList | chat
        status: 'unknown',
        chats: [],
        messages: [],
        chatId: null,
        chatName: '',
        statusInterval: null,
        chatInterval: null,
        qrLibLoaded: false,
        lastQrString: null
    };

    /* ── Helpers ─────────────────────────────────────────────────── */
    function esc(str) {
        if (!str) return '';
        var d = document.createElement('div');
        d.textContent = String(str);
        return d.innerHTML;
    }

    function $(id) { return document.getElementById(id); }

    function formatTime(ts) {
        if (!ts) return '';
        var d = new Date(ts * 1000), now = new Date(), diff = now - d;
        if (diff < 86400000) return d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
        if (diff < 604800000) return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
        return d.toLocaleDateString();
    }

    function api(method, url, data) {
        if (method === 'GET') {
            return Espo.Ajax.getRequest(url, data);
        }
        return Espo.Ajax.postRequest(url, data);
    }

    /* ── Build Floating Button ──────────────────────────────────── */
    function buildButton() {
        if ($('whatsapp-floating-btn')) return;

        var btn = document.createElement('button');
        btn.className = 'whatsapp-floating-btn';
        btn.id = 'whatsapp-floating-btn';
        btn.innerHTML = WA_SVG + '<span class="wa-status-dot disconnected" id="wa-status-dot"></span>';
        document.body.appendChild(btn);

        btn.addEventListener('click', function () {
            if (!state.panelBuilt) buildPanel();
            toggle();
        });
    }

    /* ── Build Panel ────────────────────────────────────────────── */
    function buildPanel() {
        if (state.panelBuilt) return;
        state.panelBuilt = true;

        var div = document.createElement('div');
        div.id = 'wa-panel-root';
        div.innerHTML = [
            '<div class="whatsapp-widget-panel" id="wa-panel">',
            '  <div class="wa-panel-header">',
            '    <button class="wa-back-btn" id="wa-back-btn">\u2190</button>',
            '    <div style="flex:1">',
            '      <div class="wa-title" id="wa-panel-title">WhatsApp</div>',
            '      <div class="wa-status-text" id="wa-panel-status">Checking\u2026</div>',
            '    </div>',
            '    <button class="wa-close-btn" id="wa-close-btn">\u2715</button>',
            '  </div>',
            '',
            '  <div class="wa-screen active" id="wa-screen-login">',
            '    <div class="wa-login-screen">',
            '      <div class="wa-login-title">Connect WhatsApp</div>',
            '      <div class="wa-login-desc">Click Connect to start a session, then scan the QR code with WhatsApp on your phone.</div>',
            '      <button class="wa-connect-btn" id="wa-connect-btn">Connect</button>',
            '      <div id="wa-qr-area" style="display:none">',
            '        <div class="wa-spinner" id="wa-qr-spinner"></div>',
            '        <div class="wa-qr-container" id="wa-qr-container" style="display:none">',
            '          <img id="wa-qr-img" style="width:240px;height:240px" alt="QR Code">',
            '        </div>',
            '        <div class="wa-login-desc" style="margin-top:12px">Open WhatsApp \u2192 Settings \u2192 Linked Devices \u2192 Link a Device</div>',
            '      </div>',
            '    </div>',
            '  </div>',
            '',
            '  <div class="wa-screen" id="wa-screen-chatList">',
            '    <div class="wa-search-bar"><input type="text" id="wa-search-input" placeholder="Search chats\u2026"></div>',
            '    <div class="wa-panel-body"><ul class="wa-chat-list" id="wa-chat-list"></ul></div>',
            '  </div>',
            '',
            '  <div class="wa-screen" id="wa-screen-chat">',
            '    <div class="wa-messages-container" id="wa-messages-container"></div>',
            '    <div class="wa-send-box">',
            '      <input type="text" id="wa-message-input" placeholder="Type a message\u2026">',
            '      <button class="wa-send-btn" id="wa-send-btn">' + SEND_SVG + '</button>',
            '    </div>',
            '  </div>',
            '</div>'
        ].join('\n');
        document.body.appendChild(div);

        // Bind events
        $('wa-close-btn').onclick = function () { close(); };
        $('wa-back-btn').onclick = function () { if (state.screen === 'chat') showScreen('chatList'); };
        $('wa-connect-btn').onclick = function () { startSession(); };
        $('wa-send-btn').onclick = function () { sendMessage(); };
        $('wa-message-input').addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
        });
        $('wa-search-input').addEventListener('input', function (e) { filterChats(e.target.value); });
    }

    /* ── Open / Close / Toggle ──────────────────────────────────── */
    function open() {
        state.isOpen = true;
        var p = $('wa-panel');
        if (p) p.classList.add('open');
        checkStatus();
        startPolling();
    }

    function close() {
        state.isOpen = false;
        var p = $('wa-panel');
        if (p) p.classList.remove('open');
        stopPolling();
    }

    function toggle() {
        state.isOpen ? close() : open();
    }

    /* ── Polling ────────────────────────────────────────────────── */
    function startPolling() {
        stopPolling();
        state.statusInterval = setInterval(function () {
            if (state.isOpen) checkStatus();
        }, 5000);
    }

    function stopPolling() {
        if (state.statusInterval) { clearInterval(state.statusInterval); state.statusInterval = null; }
        if (state.chatInterval) { clearInterval(state.chatInterval); state.chatInterval = null; }
    }

    /* ── Status ─────────────────────────────────────────────────── */
    function checkStatus() {
        api('GET', 'WhatsApp/action/status').then(function (r) {
            state.status = r.status;
            updateStatusUI();

            if (r.isConnected) {
                if (state.screen === 'login') {
                    showScreen('chatList');
                    loadChats();
                }
                if (!state.chatInterval && state.screen === 'chatList') {
                    state.chatInterval = setInterval(loadChats, 15000);
                }
            } else {
                if (state.screen !== 'login') showScreen('login');
            }
        }).catch(function () {});
    }

    function updateStatusUI() {
        var el = $('wa-panel-status');
        var s = (state.status || '').toUpperCase();
        var connected = s === 'AUTHENTICATED' || s === 'CONNECTED';
        
        if (el) {
            el.textContent = connected ? '\u25cf Connected' : ('\u25cb ' + (state.status || 'Disconnected'));
            el.className = 'wa-status-text' + (connected ? ' connected' : '');
        }
        var dot = $('wa-status-dot');
        if (dot) dot.className = 'wa-status-dot ' + (connected ? 'connected' : 'disconnected');
    }

    /* ── Screens ────────────────────────────────────────────────── */
    function showScreen(name) {
        state.screen = name;
        var screens = document.querySelectorAll('#wa-panel .wa-screen');
        for (var i = 0; i < screens.length; i++) screens[i].classList.remove('active');
        var t = $('wa-screen-' + name);
        if (t) t.classList.add('active');

        var back = $('wa-back-btn');
        if (back) back.className = 'wa-back-btn' + (name === 'chat' ? ' visible' : '');

        var title = $('wa-panel-title');
        if (title) title.textContent = name === 'chat' ? (state.chatName || 'Chat') : 'WhatsApp';

        // Stop chat refresh when not on chat list
        if (name !== 'chatList' && state.chatInterval) {
            clearInterval(state.chatInterval);
            state.chatInterval = null;
        }
    }

    /* ── Session / QR ───────────────────────────────────────────── */
    function startSession() {
        var btn = $('wa-connect-btn');
        var area = $('wa-qr-area');
        var spinner = $('wa-qr-spinner');
        var qrc = $('wa-qr-container');

        if (btn) { btn.disabled = true; btn.textContent = 'Connecting\u2026'; }
        if (area) area.style.display = 'block';
        if (spinner) spinner.style.display = 'block';
        if (qrc) qrc.style.display = 'none';

        api('GET', 'WhatsApp/action/login').then(function () {
            setTimeout(pollQR, 2000);
        }).catch(function () {
            if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
            if (typeof Espo !== 'undefined' && Espo.Ui) Espo.Ui.error('Failed to connect');
        });
    }

    function pollQR(attempts) {
        attempts = attempts || 0;
        if (!state.isOpen || state.status === 'authenticated' || attempts > 30) {
            if (attempts > 30) {
                var btn = $('wa-connect-btn');
                if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
                var s = $('wa-qr-spinner'); if (s) s.style.display = 'none';
            }
            return;
        }

        api('GET', 'WhatsApp/action/qrCode').then(function (r) {
            if (r.qr) {
                var spinner = $('wa-qr-spinner');
                var qrc = $('wa-qr-container');
                var btn = $('wa-connect-btn');
                if (spinner) spinner.style.display = 'none';
                if (qrc) qrc.style.display = 'block';
                if (btn) btn.style.display = 'none';
                renderQR(r.qrImage || null, r.qr || null);
                setTimeout(function () { pollQR(attempts + 1); }, 3000);
            } else {
                // Maybe already connected
                api('GET', 'WhatsApp/action/status').then(function (s) {
                    if (s.isConnected) {
                        state.status = s.status;
                        updateStatusUI();
                        showScreen('chatList');
                        loadChats();
                    } else {
                        setTimeout(function () { pollQR(attempts + 1); }, 2000);
                    }
                });
            }
        }).catch(function () {
            setTimeout(function () { pollQR(attempts + 1); }, 3000);
        });
    }

    function renderQR(qrImageDataUri, qrStr) {
        var img = $('wa-qr-img');
        if (!img) return;

        if (qrImageDataUri) {
            // Use server-side rendered QR image (base64 data URI)
            img.src = qrImageDataUri;
        } else if (qrStr && qrStr !== state.lastQrString) {
            // Fallback: try to render as text-based data URI
            state.lastQrString = qrStr;
            img.alt = 'Scan this QR code';
            img.src = '';
        }
    }

    /* ── Chats ───────────────────────────────────────────────────── */
    function loadChats() {
        api('GET', 'WhatsApp/action/getChats').then(function (r) {
            state.chats = r.list || [];
            renderChatList(state.chats);
        }).catch(function () {
            var el = $('wa-chat-list');
            if (el) el.innerHTML = '<div class="wa-empty-state"><p>Failed to load chats</p></div>';
        });
    }

    function renderChatList(chats) {
        var el = $('wa-chat-list');
        if (!el) return;

        if (!chats || !chats.length) {
            el.innerHTML = '<div class="wa-empty-state"><p>No chats yet</p></div>';
            return;
        }

        el.innerHTML = chats.map(function (c) {
            var name = c.name || (c.contact && c.contact.pushname) || (c.id && c.id._serialized) || 'Unknown';
            var last = (c.lastMessage && c.lastMessage.body) || '';
            var time = (c.lastMessage && c.lastMessage.timestamp) ? formatTime(c.lastMessage.timestamp) : '';
            var ur = c.unreadCount || 0;
            var cid = (c.id && c.id._serialized) || c.id || '';
            var ini = (name[0] || '?').toUpperCase();

            return '<li class="wa-chat-item" data-cid="' + esc(cid) + '" data-cname="' + esc(name) + '">' +
                '<div class="wa-chat-avatar"><span>' + esc(ini) + '</span></div>' +
                '<div class="wa-chat-info"><div class="wa-chat-name">' + esc(name) + '</div>' +
                '<div class="wa-chat-last-msg">' + esc(last) + '</div></div>' +
                '<div class="wa-chat-meta"><div class="wa-chat-time">' + esc(time) + '</div>' +
                (ur > 0 ? '<div class="wa-chat-unread">' + ur + '</div>' : '') +
                '</div></li>';
        }).join('');

        var items = el.querySelectorAll('.wa-chat-item');
        for (var i = 0; i < items.length; i++) {
            (function (item) {
                item.addEventListener('click', function () {
                    openChat(item.getAttribute('data-cid'), item.getAttribute('data-cname'));
                });
            })(items[i]);
        }
    }

    function filterChats(q) {
        if (!q) { renderChatList(state.chats); return; }
        q = q.toLowerCase();
        renderChatList(state.chats.filter(function (c) {
            var n = (c.name || (c.contact && c.contact.pushname) || '').toLowerCase();
            return n.indexOf(q) !== -1;
        }));
    }

    /* ── Chat View ──────────────────────────────────────────────── */
    function openChat(chatId, chatName) {
        state.chatId = chatId;
        state.chatName = chatName;
        showScreen('chat');

        var container = $('wa-messages-container');
        if (container) container.innerHTML = '<div class="wa-loading"><div class="wa-spinner"></div></div>';

        api('GET', 'WhatsApp/action/getChatMessages', { chatId: chatId, limit: 50 }).then(function (r) {
            state.messages = r.list || [];
            if (!state.messages.length) {
                fallbackToLastMessage(chatId);
            } else {
                renderMessages(state.messages);
            }
        }).catch(function () {
            fallbackToLastMessage(chatId);
        });
    }

    function fallbackToLastMessage(chatId) {
        var container = $('wa-messages-container');
        if (!container) return;

        var chat = state.chats ? state.chats.find(function(c) { 
            return (c.id._serialized || c.id) === chatId; 
        }) : null;

        var msgs = [];
        if (chat && chat.lastMessage && chat.lastMessage.body) {
            // Normalize lastMessage to message structure
            var lm = chat.lastMessage;
            msgs.push({
                body: lm.body,
                timestamp: lm.timestamp,
                fromMe: lm.fromMe,
                id: lm.id._serialized || lm.id
            });
        }
        
        if (msgs.length) {
            renderMessages(msgs);
            // Append history warning
            var div = document.createElement('div');
            div.className = 'wa-system-message';
            div.textContent = 'Older messages are not available via this API connection.';
            container.appendChild(div);
        } else {
            container.innerHTML = '<div class="wa-empty-state"><p>No messages yet</p></div>';
        }
    }

    function renderMessages(msgs) {
        var container = $('wa-messages-container');
        if (!container) return;

        if (!msgs || !msgs.length) {
            container.innerHTML = '<div class="wa-empty-state"><p>No messages yet</p></div>';
            return;
        }

        var sorted = msgs.slice().sort(function (a, b) { return (a.timestamp || 0) - (b.timestamp || 0); });
        var html = '', lastDate = '';

        sorted.forEach(function (m) {
            var d = m.timestamp ? new Date(m.timestamp * 1000) : new Date();
            var ds = d.toLocaleDateString();
            if (ds !== lastDate) {
                html += '<div class="wa-message-date-divider"><span>' + esc(ds) + '</span></div>';
                lastDate = ds;
            }
            var t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            html += '<div class="wa-message ' + (m.fromMe ? 'outgoing' : 'incoming') + '">' +
                '<div class="wa-message-text">' + esc(m.body || '') + '</div>' +
                '<div class="wa-message-time">' + esc(t) + '</div></div>';
        });

        container.innerHTML = html;
        container.scrollTop = container.scrollHeight;
    }

    /* ── Send Message ───────────────────────────────────────────── */
    function sendMessage() {
        var input = $('wa-message-input');
        var text = input ? input.value.trim() : '';
        if (!text || !state.chatId) return;
        input.value = '';

        var container = $('wa-messages-container');
        var now = new Date();
        var time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        var msgEl = document.createElement('div');
        msgEl.className = 'wa-message outgoing';
        msgEl.innerHTML = '<div class="wa-message-text">' + esc(text) + '</div>' +
            '<div class="wa-message-time">' + time + ' \u23f3</div>';
        if (container) { container.appendChild(msgEl); container.scrollTop = container.scrollHeight; }

        api('POST', 'WhatsApp/action/sendMessage', { chatId: state.chatId, message: text }).then(function () {
            var te = msgEl.querySelector('.wa-message-time');
            if (te) te.textContent = time + ' \u2713';
        }).catch(function () {
            var te = msgEl.querySelector('.wa-message-time');
            if (te) te.textContent = time + ' \u2717';
            msgEl.style.opacity = '0.5';
            if (typeof Espo !== 'undefined' && Espo.Ui) Espo.Ui.error('Failed to send');
        });
    }

    /* ── Init ───────────────────────────────────────────────────── */
    function init() {
        if (state.initialized) return;
        if (typeof Espo === 'undefined' || !Espo.Ajax) {
            setTimeout(init, 500);
            return;
        }
        var hash = window.location.hash;
        if (!hash || hash === '#' || hash === '#login') {
            setTimeout(init, 2000);
            return;
        }
        state.initialized = true;
        buildButton();
    }

    // Escape key
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && state.isOpen) close();
    });

    // Start
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 1500); });
    } else {
        setTimeout(init, 1500);
    }

    window.addEventListener('hashchange', function () { if (!state.initialized) init(); });
})();
