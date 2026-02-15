/**
 * WhatsApp Widget — All-in-one script
 * Floating button + slide-out panel with Login/QR, Chat List, Chat View, Contacts
 */
(function () {
    'use strict';

    /* ── State & Config ─────────────────────────────────────────── */
    var state = {
        initialized: false,
        panelBuilt: false,
        isOpen: false,
        screen: 'login', // login | chatList | chat | contacts
        status: 'unknown',
        chats: [],
        messages: [],
        contacts: [],
        chatId: null,
        chatName: '',
        statusInterval: null,
        chatInterval: null,
        qrLibLoaded: false,
        lastQrString: null
    };

    var config = {
        enabled: true,
        pollInterval: 3000
    };

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
        if (typeof Espo === 'undefined' || !Espo.Ajax) return Promise.reject('Espo not ready');
        if (method === 'GET') return Espo.Ajax.getRequest(url, data);
        return Espo.Ajax.postRequest(url, data);
    }

    /* ── UI Building ────────────────────────────────────────────── */
    function buildButton() {
        if ($('whatsapp-floating-btn')) return;
        var btn = document.createElement('button');
        btn.className = 'whatsapp-floating-btn';
        btn.id = 'whatsapp-floating-btn';
        btn.innerHTML = WA_SVG + '<span class="wa-status-dot disconnected" id="wa-status-dot"></span>';
        btn.style.display = 'none'; // Hidden until status check confirms enabled
        document.body.appendChild(btn);

        btn.addEventListener('click', function () {
            if (!state.panelBuilt) buildPanel();
            toggle();
        });
    }

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
            '    <div class="wa-header-actions" id="wa-header-actions"></div>',
            '    <button class="wa-logout-btn" id="wa-logout-btn" title="Logout" style="display:none">\u23FB</button>',
            '    <button class="wa-close-btn" id="wa-close-btn">\u2715</button>',
            '  </div>',
            '',
            '  <div class="wa-screen active" id="wa-screen-login">',
            '    <div class="wa-login-screen">',
            '      <div class="wa-login-title">Connect WhatsApp</div>',
            '      <div class="wa-login-desc">Click Connect to display QR code.</div>',
            '      <button class="wa-connect-btn" id="wa-connect-btn">Connect</button>',
            '      <div id="wa-qr-area" style="display:none">',
            '        <div class="wa-spinner" id="wa-qr-spinner"></div>',
            '        <div class="wa-qr-container" id="wa-qr-container" style="display:none">',
            '          <img id="wa-qr-img" style="width:240px;height:240px" alt="QR Code">',
            '        </div>',
            '        <div class="wa-login-desc" style="margin-top:12px">Open WhatsApp > Linked Devices > Link a Device</div>',
            '      </div>',
            '    </div>',
            '  </div>',
            '',
            '  <div class="wa-screen" id="wa-screen-chatList">',
            '    <div class="wa-search-bar"><input type="text" id="wa-search-input" placeholder="Search chats\u2026"></div>',
            '    <div class="wa-panel-body"><ul class="wa-chat-list" id="wa-chat-list"></ul></div>',
            '  </div>',
            '',
            '  <div class="wa-screen" id="wa-screen-contacts">',
            '    <div class="wa-panel-body"><ul class="wa-contacts-list" id="wa-contacts-list"></ul></div>',
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

        $('wa-close-btn').onclick = function () { close(); };
        $('wa-back-btn').onclick = function () { 
            if (state.screen === 'chat' || state.screen === 'contacts') showScreen('chatList'); 
        };
        $('wa-logout-btn').onclick = function () { logout(); };
        $('wa-connect-btn').onclick = function () { startSession(); };
        $('wa-send-btn').onclick = function () { sendMessage(); };
        $('wa-message-input').addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
        });
        $('wa-search-input').addEventListener('input', function (e) { filterChats(e.target.value); });
    }

    /* ── Navigation ──────────────────────────────────────────────── */
    function toggle() { state.isOpen ? close() : open(); }
    
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

    function showScreen(name) {
        state.lastScreen = state.screen;
        state.screen = name;

        // Hide all screens
        var screens = document.querySelectorAll('#wa-panel .wa-screen');
        for (var i = 0; i < screens.length; i++) screens[i].classList.remove('active');
        
        var active = $('wa-screen-' + name);
        if (active) active.classList.add('active');

        // Header Elements Management
        var backBtn = $('wa-back-btn');
        var newChatBtn = $('wa-btn-new-chat');
        var refreshQrBtn = $('wa-btn-refresh-qr');
        
        if (backBtn) {
            backBtn.style.display = (name === 'chat' || name === 'contacts') ? 'flex' : 'none';
        }
        
        if (newChatBtn) {
            // Only show New Chat button on Chat List screen
            newChatBtn.style.display = (name === 'chatList') ? 'flex' : 'none';
        }

        if (refreshQrBtn) {
            // Only show Refresh QR button on Login screen
            refreshQrBtn.style.display = (name === 'login') ? 'flex' : 'none';
        }

        // Title update
        var title = $('wa-panel-title');
        if (title) {
             $('wa-panel-title').textContent = (name === 'chat' ? (state.chatName || 'Chat') : (name === 'contacts' ? 'Select Contact' : 'WhatsApp'));
        }

        if (name !== 'chatList' && state.chatInterval) {
            clearInterval(state.chatInterval);
            state.chatInterval = null;
        }
    }

    /* ── Status & Polling ───────────────────────────────────────── */
    function checkStatus() {
        api('GET', 'WhatsApp/action/status').then(function (r) {
            state.status = r.status || 'disconnected';
            config.enabled = r.enabled !== false;

            var btn = $('whatsapp-floating-btn');
            if (btn) btn.style.display = config.enabled ? 'flex' : 'none';
            if (!config.enabled && state.isOpen) close();

            updateStatusUI();

            // Robust connection check
            var isConnected = r.isConnected || 
                              state.status === 'CONNECTED' || 
                              state.status === 'AUTHENTICATED';

            if (isConnected) {
                // FORCE switch if we are on the login screen or if the visual state is wrong
                var loginScreen = $('wa-screen-login');
                if (state.screen === 'login' || (loginScreen && loginScreen.classList.contains('active'))) {
                    console.log('WhatsApp Widget: Auto-switching to chatList (Forced)');
                    showScreen('chatList');
                    loadChats();
                } else if (!state.screen || state.screen === '') {
                     showScreen('chatList');
                     loadChats();
                }
                
                // Start chat polling if not already
                if (!state.chatInterval) {
                     state.chatInterval = setInterval(loadChats, config.pollInterval);
                }
            } else {
                // If disconnected and NOT on login, switch to login
                if (state.screen !== 'login') {
                     console.log('WhatsApp Widget: Disconnected, switching to login');
                     showScreen('login');
                }
                
                if (state.chatInterval) {
                    clearInterval(state.chatInterval);
                    state.chatInterval = null;
                }
            }
        }).catch(function (e) {
            console.error('WhatsApp Widget: Status check error', e);
        });
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
        
        var logoutBtn = $('wa-logout-btn');
        if (logoutBtn) logoutBtn.style.display = connected ? 'block' : 'none';
    }

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

    function logout() {
        if (!confirm('Disconnect WhatsApp?')) return;
        api('POST', 'WhatsApp/action/logout').then(function() {
            state.status = 'DISCONNECTED';
            showScreen('login');
            startSession();
        });
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
            setTimeout(function() { pollQR(0); }, 2000);
        }).catch(function () {
            if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
            if (typeof Espo !== 'undefined' && Espo.Ui) Espo.Ui.error('Failed to connect');
        });
    }

    function pollQR(attempts) {
        if (!state.isOpen || attempts > 60) return; // 2 mins timeout

        api('GET', 'WhatsApp/action/qrCode').then(function (r) {
            if (r.qrImage) {
                var img = $('wa-qr-img');
                if (img) img.src = r.qrImage;
                if ($('wa-qr-container')) $('wa-qr-container').style.display = 'block';
                if ($('wa-qr-spinner')) $('wa-qr-spinner').style.display = 'none';
                if ($('wa-connect-btn')) $('wa-connect-btn').style.display = 'none';
                
                // Keep polling status in background to detect scan success
                // api('GET', 'WhatsApp/action/status').then(...) handled by main poller or we can do it here
                setTimeout(function() { pollQR(attempts + 1); }, 3000); 
            } else {
                 // Maybe connected?
                 api('GET', 'WhatsApp/action/status').then(function(s) {
                     if (s.isConnected) {
                         state.status = s.status;
                         updateStatusUI();
                         showScreen('chatList');
                         loadChats();
                     } else {
                         setTimeout(function() { pollQR(attempts + 1); }, 2000);
                     }
                 });
            }
        }).catch(function() {
            setTimeout(function() { pollQR(attempts + 1); }, 3000);
        });
    }

    /* ── Data Loading ───────────────────────────────────────────── */
    function loadChats() {
        api('GET', 'WhatsApp/action/getChats').then(function (r) {
            state.chats = r.list || [];
            if (state.screen === 'chatList') renderChatList(state.chats);
        });
    }

    function loadContacts() {
        showScreen('contacts');
        var list = $('wa-contacts-list');
        if (list) list.innerHTML = '<div class="wa-loading"><div class="wa-spinner"></div></div>';
        api('GET', 'WhatsApp/action/getContacts').then(function(r) {
            state.contacts = r.list || [];
            renderContacts(state.contacts);
        });
    }

    function openChat(chatId, chatName) {
        state.chatId = chatId;
        state.chatName = chatName;
        showScreen('chat');

        var container = $('wa-messages-container');
        if (container) container.innerHTML = '<div class="wa-loading"><div class="wa-spinner"></div></div>';

        api('GET', 'WhatsApp/action/getChatMessages', { chatId: chatId, limit: 50 }).then(function (r) {
            state.messages = r.list || [];
            if (state.messages.length) {
                renderMessages(state.messages);
            } else {
                fallbackToLastMessage(chatId);
            }
        }).catch(function () {
            fallbackToLastMessage(chatId);
        });
    }

    function fallbackToLastMessage(chatId) {
        var container = $('wa-messages-container');
        if (!container) return;
        var chat = state.chats.find(function(c) { return (c.id._serialized || c.id) === chatId; });
        
        var msgs = [];
        if (chat && chat.lastMessage && chat.lastMessage.body) {
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
            var div = document.createElement('div');
            div.className = 'wa-system-message';
            div.textContent = 'History fetched from device. Older messages may be unavailable via API.';
            container.appendChild(div);
        } else {
            container.innerHTML = '<div class="wa-empty-state"><p>No messages yet</p></div>';
        }
    }

    function sendMessage() {
        var input = $('wa-message-input');
        var text = input ? input.value.trim() : '';
        if (!text || !state.chatId) return;
        input.value = '';

        var container = $('wa-messages-container');
        var now = new Date();
        var msgEl = document.createElement('div');
        msgEl.className = 'wa-message outgoing';
        msgEl.innerHTML = '<div class="wa-message-text">' + esc(text) + '</div>' +
            '<div class="wa-message-time">' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' \u23f3</div>';
        if (container) { container.appendChild(msgEl); container.scrollTop = container.scrollHeight; }

        api('POST', 'WhatsApp/action/sendMessage', { chatId: state.chatId, message: text }).then(function () {
             // Success
        });
    }

    /* ── Renderers ──────────────────────────────────────────────── */
    function renderChatList(chats) {
        var el = $('wa-chat-list');
        if (!el) return;
        if (!chats.length) { el.innerHTML = '<div class="wa-empty-state"><p>No chats</p></div>'; return; }

        var q = ($('wa-search-input') || {}).value || '';
        if (q) {
             q = q.toLowerCase();
             chats = chats.filter(function(c) {
                 var n = (c.name || c.contact.pushname || '').toLowerCase();
                 return n.indexOf(q) !== -1;
             });
        }

        el.innerHTML = chats.map(function (c) {
            var name = c.name || (c.contact && c.contact.pushname) || 'Unknown';
            var last = (c.lastMessage && c.lastMessage.body) || '';
            var time = (c.lastMessage && c.lastMessage.timestamp) ? formatTime(c.lastMessage.timestamp) : '';
            var cid = (c.id && c.id._serialized) || c.id || '';
            return '<li class="wa-chat-item" data-cid="' + esc(cid) + '" data-cname="' + esc(name) + '">' +
                '<div class="wa-chat-avatar"><span>' + esc(name[0]) + '</span></div>' +
                '<div class="wa-chat-info"><div class="wa-chat-name">' + esc(name) + '</div>' +
                '<div class="wa-chat-last-msg">' + esc(last) + '</div></div>' +
                '<div class="wa-chat-meta"><div class="wa-chat-time">' + esc(time) + '</div></div>' +
                '</li>';
        }).join('');

        var items = el.querySelectorAll('.wa-chat-item');
        for (var i = 0; i < items.length; i++) {
            items[i].onclick = function() { openChat(this.getAttribute('data-cid'), this.getAttribute('data-cname')); };
        }
    }

    function renderContacts(contacts) {
        var el = $('wa-contacts-list');
        if (!el) return;
        if (!contacts.length) { el.innerHTML = '<div class="wa-empty-state"><p>No contacts</p></div>'; return; }
        
        el.innerHTML = contacts.map(function(c) {
             var name = c.name || c.pushname || c.number;
             var id = (c.id && c.id._serialized) || c.id;
             return '<li class="wa-contact-item" data-id="' + esc(id) + '" data-name="' + esc(name) + '">' +
                    '<div class="wa-contact-avatar"><span>' + esc(name[0]) + '</span></div>' +
                    '<div class="wa-contact-info"><div class="wa-contact-name">' + esc(name) + '</div>' +
                    '<div class="wa-contact-number">' + esc(c.number) + '</div></div></li>';
        }).join('');
        
        var items = el.querySelectorAll('.wa-contact-item');
        for (var i = 0; i < items.length; i++) {
            items[i].onclick = function() { openChat(this.getAttribute('data-id'), this.getAttribute('data-name')); };
        }
    }

    function renderMessages(msgs) {
        var container = $('wa-messages-container');
        if (!container) return;
        var sorted = msgs.slice().sort(function (a, b) { return (a.timestamp || 0) - (b.timestamp || 0); });
        var html = '';
        sorted.forEach(function (m) {
            var d = m.timestamp ? new Date(m.timestamp * 1000) : new Date();
            var t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            html += '<div class="wa-message ' + (m.fromMe ? 'outgoing' : 'incoming') + '">' +
                '<div class="wa-message-text">' + esc(m.body || '') + '</div>' +
                '<div class="wa-message-time">' + esc(t) + '</div></div>';
        });
        container.innerHTML = html;
        container.scrollTop = container.scrollHeight;
    }

    /* ── Theme Detection ────────────────────────────────────────── */
    /* ── Theme Detection ────────────────────────────────────────── */
    function updateTheme() {
        var panel = $('wa-panel-root');
        if (!panel) return;
        
        // Check LocalStorage first
        var saved = localStorage.getItem('wa-theme-pref');
        if (saved) {
             if (saved === 'dark') panel.classList.add('wa-dark');
             else panel.classList.remove('wa-dark');
             return;
        }

        // Auto-detect
        var isDark = document.body.classList.contains('dark') || 
                     document.body.classList.contains('dark-theme') || 
                     document.documentElement.getAttribute('data-theme') === 'dark';
        
        if (isDark) {
            panel.classList.add('wa-dark');
            var moon = panel.querySelector('.wa-theme-icon-moon');
            var sun = panel.querySelector('.wa-theme-icon-sun');
            if (moon) moon.style.display = 'none';
            if (sun) sun.style.display = 'block';
        } else {
            panel.classList.remove('wa-dark');
            var moon = panel.querySelector('.wa-theme-icon-moon');
            var sun = panel.querySelector('.wa-theme-icon-sun');
            if (moon) moon.style.display = 'block';
            if (sun) sun.style.display = 'none';
        }
    }

    function toggleTheme() {
        var panel = $('wa-panel-root');
        var isDark = panel.classList.contains('wa-dark');
        if (isDark) {
            // Switch to Light
            panel.classList.remove('wa-dark');
            localStorage.setItem('wa-theme-pref', 'light');
            updateTheme(); // Trigger icon update
        } else {
            // Switch to Dark
            panel.classList.add('wa-dark');
            localStorage.setItem('wa-theme-pref', 'dark');
            updateTheme(); // Trigger icon update
        }
    }

    /* ── UI Building ────────────────────────────────────────────── */
    function buildButton() {
        if ($('whatsapp-floating-btn')) return;
        var btn = document.createElement('button');
        btn.className = 'whatsapp-floating-btn';
        btn.id = 'whatsapp-floating-btn';
        btn.innerHTML = WA_SVG + '<span class="wa-status-dot disconnected" id="wa-status-dot"></span>';
        btn.style.display = 'none'; 
        document.body.appendChild(btn);

        btn.addEventListener('click', function () {
            if (!state.panelBuilt) buildPanel();
            toggle();
        });
    }

    function buildPanel() {
        if (state.panelBuilt) return;
        state.panelBuilt = true;

        var root = document.createElement('div');
        root.id = 'wa-panel-root';
        // Inner Panel Content
        var panelHtml = [
            '<div class="whatsapp-widget-panel" id="wa-panel">',
            '  <div class="wa-panel-header">',
            '    <button class="wa-back-btn" id="wa-back-btn">\u2190</button>',
            '    <div class="wa-header-info" style="flex:1">',
            '      <div class="wa-title" id="wa-panel-title">WhatsApp</div>',
            '      <div class="wa-status-text" id="wa-panel-status">Checking\u2026</div>',
            '    </div>',
            '    <div class="wa-header-actions" id="wa-header-actions">',
            '       <button class="wa-icon-btn" id="wa-theme-btn" title="Toggle Theme">',
            '           <svg class="wa-theme-icon-sun" style="display:none" viewBox="0 0 24 24"><path fill="currentColor" d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.29 1.29c.39.39 1.02.39 1.41 0 .39-.39.39-1.02 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.29 1.29c.39.39 1.02.39 1.41 0 .39-.39.39-1.02 0-1.41l-1.29-1.29zm1.41-13.78c-.39-.39-1.02-.39-1.41 0l-1.29 1.29c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l1.29-1.29c.39-.39.39-1.02 0-1.41zM7.28 17.39c-.39-.39-1.02-.39-1.41 0l-1.29 1.29c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l1.29-1.29c.39-.39.39-1.02 0-1.41z"/></svg>',
            '           <svg class="wa-theme-icon-moon" viewBox="0 0 24 24"><path fill="currentColor" d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-3.03 0-5.5-2.47-5.5-5.5 0-1.82.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/></svg>',
            '       </button>',
            '       <button class="wa-icon-btn" id="wa-btn-new-chat" title="New Chat" style="display:none">', // Initially hidden, shown in chat list? No, header is global.
            '           <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>',
            '       </button>',
            '    </div>',
            '    <button class="wa-logout-btn" id="wa-logout-btn" title="Logout" style="display:none">\u23FB</button>',
            '    <button class="wa-close-btn" id="wa-close-btn">\u2715</button>',
            '  </div>',
            
            '  <div class="wa-screen active" id="wa-screen-login">',
            '     <div class="wa-login-container">',
            '       <div class="wa-login-text">',
            '         <div class="wa-login-title">Use WhatsApp on your computer</div>',
            '         <ol class="wa-login-steps">',
            '           <li>Open WhatsApp on your phone</li>',
            '           <li>Tap <strong>Menu</strong> or <strong>Settings</strong> and select <strong>Linked Devices</strong></li>',
            '           <li>Tap on <strong>Link a Device</strong></li>',
            '           <li>Point your phone to this screen to capture the code</li>',
            '         </ol>',
            '         <button class="wa-connect-btn" id="wa-connect-btn">Generate QR Code</button>',
            '       </div>',
            '       <div class="wa-qr-wrapper">',
            '          <div class="wa-spinner" id="wa-qr-spinner" style="display:none"></div>',
            '          <div class="wa-qr-container" id="wa-qr-container" style="display:none">',
            '             <img id="wa-qr-img" src="" alt="Scan me" style="display:block; width: 100%; height: auto;"/>',
            '          </div>',
            '          <button class="wa-icon-btn" id="wa-refresh-qr" style="display:none;margin-top:10px" title="Refresh QR">\u21BB Refresh QR</button>',
            '       </div>',
            '     </div>',
            '  </div>',

            '  <div class="wa-screen" id="wa-screen-chatList">',
            '     <div class="wa-search-bar">',
            '       <input type="text" id="wa-search-input" placeholder="Search chats \u2026">',
            '     </div>', 
            '     <div class="wa-panel-body" id="wa-chat-list"></div>',
            '  </div>',

            '  <div class="wa-screen" id="wa-screen-chat">',
            '     <div class="wa-messages-container" id="wa-messages-container"></div>',
            '     <div class="wa-send-box">',
            '        <input type="text" id="wa-message-input" placeholder="Type a message\u2026">',
            '        <button class="wa-send-btn" id="wa-send-btn">' + SEND_SVG + '</button>',
            '     </div>',
            '  </div>',
            
            '  <div class="wa-screen" id="wa-screen-contacts">',
            '      <div class="wa-search-bar">', // Added search for contacts too?
            '         <input type="text" id="wa-contact-search" placeholder="Search contacts \u2026">',
            '      </div>',
            '      <div class="wa-panel-body" id="wa-contacts-list"></div>',
            '  </div>',

            '</div>' // End .whatsapp-widget-panel
        ].join('');
        
        root.innerHTML = panelHtml;
        document.body.appendChild(root);
        
        // Inject Resizers
        var resizers = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
        resizers.forEach(function(dir) {
            var el = document.createElement('div');
            el.className = 'wa-resizer ' + dir;
            root.appendChild(el); // Append to ROOT
            
            // Resize Logic
            el.addEventListener('mousedown', function(e) {
                e.preventDefault(); e.stopPropagation();
                root.classList.add('wa-resizing'); // Add class to root to disable pointers
                
                var startX = e.clientX, startY = e.clientY;
                var rect = root.getBoundingClientRect();
                var startW = rect.width, startH = rect.height;
                var styles = window.getComputedStyle(root);
                var startRight = parseFloat(styles.right); // Root uses right
                var startBottom = parseFloat(styles.bottom); // Root uses bottom
                
                function onMove(e) {
                    var dx = e.clientX - startX;
                    var dy = e.clientY - startY;
                    
                    // Width logic (Dragging Left increases Width, Dragging Right increases Width but must adjust Right pos)
                    
                    if (dir.indexOf('w') !== -1) {
                        root.style.width = Math.max(300, startW - dx) + 'px';
                    }
                    if (dir.indexOf('e') !== -1) {
                         // Increasing width to the right means shifting right edge. 
                         var newW = Math.max(300, startW + dx);
                         root.style.width = newW + 'px';
                         root.style.right = (startRight - (newW - startW)) + 'px';
                    }
                    
                    if (dir.indexOf('n') !== -1) {
                        // Dragging Up (-dy) -> Increase Height
                        root.style.height = Math.max(400, startH - dy) + 'px';
                    }
                    if (dir.indexOf('s') !== -1) {
                        // Dragging Down (+dy) -> Increase Height, Decrease Bottom
                        var newH = Math.max(400, startH + dy);
                        root.style.height = newH + 'px';
                        root.style.bottom = (startBottom - (newH - startH)) + 'px';
                    }
                }
                function onUp() {
                    root.classList.remove('wa-resizing');
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                }
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
            });
        });

        // Event Listeners
        var closeBtn = $('wa-close-btn'); if(closeBtn) closeBtn.onclick = close;
        var connBtn = $('wa-connect-btn'); if(connBtn) connBtn.onclick = function() { startSession(); };
        var refBtn = $('wa-refresh-qr'); if(refBtn) refBtn.onclick = function() { startSession(); };
        var backBtn = $('wa-back-btn'); if(backBtn) backBtn.onclick = function() { showScreen(state.lastScreen || 'chatList'); };
        var sendBtn = $('wa-send-btn'); if(sendBtn) sendBtn.onclick = sendMessage;
        var msgInput = $('wa-message-input'); if(msgInput) msgInput.onkeypress = function(e) { if (e.key === 'Enter') sendMessage(); };
        var lootBtn = $('wa-logout-btn'); if(lootBtn) lootBtn.onclick = function() { api('POST', 'WhatsApp/action/logout').then(function() { 
             state.status = 'DISCONNECTED'; checkStatus(); 
        }); };
        var searchInp = $('wa-search-input'); if(searchInp) searchInp.onkeyup = function(e) { filterList('wa-chat-list', e.target.value); };
        
        // New Chat Button (in Header)
        var newChatBtn = $('wa-btn-new-chat'); 
        if(newChatBtn) newChatBtn.onclick = function() { showScreen('contacts'); loadContacts(); };
        
        // Contact Search
        var contSearch = $('wa-contact-search'); 
        if(contSearch) contSearch.onkeyup = function(e) { filterList('wa-contacts-list', e.target.value); };
        
        // Theme Toggle
        var themeBtn = $('wa-theme-btn'); if(themeBtn) themeBtn.onclick = toggleTheme;

        // Ensure updateTheme checks immediately after build
        setTimeout(updateTheme, 0);
    }

    /* ── Renderers ──────────────────────────────────────────────── */
    // ... existing renderer functions ...

    function toggle() {
        var root = $('wa-panel-root');
        if (state.isOpen) close(); else open();
    }

    function open() {
        state.isOpen = true;
        var root = $('wa-panel-root');
        if (root) root.classList.add('open');
        updateTheme();
        if (state.chats.length === 0 && (state.status === 'CONNECTED' || state.status === 'AUTHENTICATED')) {
             checkStatus(); 
        } else {
             checkStatus();
        }
    }

    function close() {
        state.isOpen = false;
        var root = $('wa-panel-root');
        if (root) root.classList.remove('open');
    }

    /* ── Init ───────────────────────────────────────────────────── */
    function init() {
        console.log('WhatsApp Widget: Init called');
        if (state.initialized) return;
        if (typeof Espo === 'undefined' || !Espo.Ajax || !document.body) {
            setTimeout(init, 500); return;
        }
        state.initialized = true;
        buildButton(); // Button is built, panel is built heavily lazy or on click
        
        // Check status
        api('GET', 'WhatsApp/action/status').then(function(r) {
             config.enabled = r.enabled !== false;
             var btn = $('whatsapp-floating-btn');
             if (btn) btn.style.display = config.enabled ? 'flex' : 'none';
             if (config.enabled) {
                 checkStatus();
                 setInterval(function() { if (!state.isOpen) checkStatus(); }, 30000);
             }
        }).catch(function() {});
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 1000); });
    } else {
        setTimeout(init, 1000);
    }
    window.addEventListener('hashchange', function() { if (!state.initialized) init(); else {
        if (config.enabled && !$('whatsapp-floating-btn')) buildButton();
        updateTheme();
    }});
    
})();

