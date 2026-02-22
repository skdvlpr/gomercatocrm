/**
 * WhatsApp Widget — All-in-one script with WebSocket real-time support
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
        lastQrString: null,
        subscribed: false,
        wsTopicUri: null,
        wsRetryCount: 0
    };

    var config = {
        enabled: true,
        pollInterval: 3000,
        statusCheckInterval: 5000
    };

    /* ── CSS Injection ──────────────────────────────────────────── */
    if (!document.querySelector('link[href*="whatsapp-widget.css"]')) {
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'client/custom/css/whatsapp-widget.css?v=' + new Date().getTime();
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

    function _$(id) { return document.getElementById(id); }

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

    /* ── Helpers for Contacts & Avatars ─────────────────────────── */
    function extractPhoneNumber(contactId) {
        if (typeof contactId === 'string') {
            return contactId.replace('@c.us', '').replace('@s.whatsapp.net', '').replace('@g.us', '').replace('@us', '');
        }
        if (contactId && contactId._serialized) {
            return contactId._serialized.replace('@c.us', '').replace('@s.whatsapp.net', '').replace('@g.us', '').replace('@us', '');
        }
        if (contactId && contactId.user) {
            return contactId.user;
        }
        return '';
    }

    function deduplicateContacts(contacts) {
        var seen = {};
        var unique = [];
        
        contacts.forEach(function(contact) {
            var id = (contact.id && contact.id._serialized) || contact.id;
            if (!id || typeof id !== 'string') return;
            
            if (id.indexOf('@lid') !== -1 || id === 'status@broadcast') return;

            var phone = extractPhoneNumber(id);
            var isGroup = id.indexOf('@g.us') !== -1;
            
            if (isGroup) {
                if (!seen[id]) {
                    seen[id] = contact;
                    unique.push(contact);
                }
                return;
            }

            if (!seen[phone]) {
                seen[phone] = contact;
                unique.push(contact);
            } else {
                var existing = seen[phone];
                var existingHasName = !!(existing.name || existing.pushname);
                var newHasName = !!(contact.name || contact.pushname);
                
                if (!existingHasName && newHasName) {
                    var idx = unique.indexOf(existing);
                    if (idx !== -1) {
                        unique[idx] = contact;
                        seen[phone] = contact;
                    }
                }
            }
        });
        
        return unique;
    }

    function getInitials(name) {
        if (!name) return '?';
        var parts = name.trim().split(/\s+/);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    }

    function stringToColor(str) {
        var colors = [
            '#1abc9c', '#2ecc71', '#3498db', '#9b59b6', '#34495e',
            '#16a085', '#27ae60', '#2980b9', '#8e44ad', '#2c3e50',
            '#f1c40f', '#e67e22', '#e74c3c', '#95a5a6', '#f39c12'
        ];
        
        var hash = 0;
        for (var i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        return colors[Math.abs(hash) % colors.length];
    }

    var avatarObserver = null;
    function initAvatarObserver() {
        if (!window.IntersectionObserver || avatarObserver) return;
        avatarObserver = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    var el = entry.target;
                    var id = el.getAttribute('data-wa-avatar-id');
                    if (id && (!state.avatarCache || state.avatarCache[id] === undefined)) {
                        loadAvatar(id);
                    }
                    avatarObserver.unobserve(el);
                    el.classList.remove('wa-lazy-avatar');
                }
            });
        }, { root: null, rootMargin: '150px' });
        
        var mo = new MutationObserver(function(mutations) {
            mutations.forEach(function(m) {
                m.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) {
                        if (node.classList.contains('wa-lazy-avatar')) avatarObserver.observe(node);
                        var lazies = node.querySelectorAll('.wa-lazy-avatar');
                        for (var i=0; i<lazies.length; i++) avatarObserver.observe(lazies[i]);
                    }
                });
            });
        });
        mo.observe(document.body, { childList: true, subtree: true });
    }

    function getAvatarHtml(contact, size) {
        size = size || 40;
        var id = (contact.id && contact.id._serialized) ? contact.id._serialized : (contact.id || '');
        var name = contact.name || contact.pushname || extractPhoneNumber(id);
        var initials = getInitials(name);
        var color = stringToColor(name);
        var picUrl = null;
        
        if (state.avatarCache && state.avatarCache[id]) {
             picUrl = state.avatarCache[id];
        }
        
        var lazyClass = (!picUrl && id) ? ' wa-lazy-avatar' : '';
        
        if (picUrl) {
            return '<div class="wa-avatar" data-wa-avatar-id="' + esc(id) + '" style="width:' + size + 'px;height:' + size + 'px;">' +
                '<img class="wa-avatar-img" src="' + esc(picUrl) + '" alt="' + esc(name) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" ' +
                'onerror="this.style.display=\'none\'; if(this.nextElementSibling) this.nextElementSibling.style.display=\'flex\';">' +
                '<div class="wa-avatar-initials" style="display:none;background:' + color + ';width:100%;height:100%;line-height:' + size + 'px;font-size:' + (size/2) + 'px;">' + initials + '</div>' + 
            '</div>';
        }
        
        return '<div class="wa-avatar' + lazyClass + '" data-wa-avatar-id="' + esc(id) + '" style="width:' + size + 'px;height:' + size + 'px;">' +
            '<div class="wa-avatar-initials" style="background:' + color + ';width:' + size + 'px;height:' + size + 'px;line-height:' + size + 'px;font-size:' + (size/2) + 'px;">' +
                initials +
            '</div>' +
        '</div>';
    }

    function loadAvatar(id) {
        if (!state.avatarCache) state.avatarCache = {};
        if (state.avatarCache[id] !== undefined) return;
        
        state.avatarCache[id] = null;
        
        api('GET', 'WhatsApp/action/getProfilePic', { id: id }).then(function(r) {
            if (r && r.url) {
                state.avatarCache[id] = r.url;
                
                var els = document.querySelectorAll('[data-wa-avatar-id="' + CSS.escape(id) + '"]');
                for (var i = 0; i < els.length; i++) {
                    var el = els[i];
                    var initDiv = el.querySelector('.wa-avatar-initials');
                    if (initDiv) {
                        var oldImg = el.querySelector('img');
                        if (oldImg) oldImg.remove();
                        
                        var img = document.createElement('img');
                        img.style.width = '100%';
                        img.style.height = '100%';
                        img.style.objectFit = 'cover';
                        img.style.borderRadius = '50%';
                        img.style.display = 'none';
                        
                        img.onload = function() {
                            this.style.display = 'block';
                            if (this.nextElementSibling) {
                                this.nextElementSibling.style.display = 'none';
                            }
                        };
                        
                        img.onerror = function() {
                            this.style.display = 'none';
                            if (this.nextElementSibling) {
                                this.nextElementSibling.style.display = 'flex';
                            }
                        };
                        
                        img.src = r.url;
                        el.insertBefore(img, initDiv);
                    }
                }
            }
        }).catch(function() {});
    }

    function normalizeTimestamp(ts) {
        if (!ts) return Date.now();
        if (typeof ts === 'string' && (ts.indexOf('-') !== -1 || ts.indexOf(':') !== -1)) {
            var d = new Date(ts.replace(' ', 'T'));
            return isNaN(d.getTime()) ? Date.now() : d.getTime();
        }
        var num = parseFloat(ts);
        if (isNaN(num)) return Date.now();
        if (num < 100000000000) return num * 1000;
        return num;
    }

    /* ── UI Building ────────────────────────────────────────────── */

    /* ── Navigation ──────────────────────────────────────────────── */
    function toggle() { state.isOpen ? close() : open(); }
    
    function open() {
        state.isOpen = true;
        var p = _$('wa-panel-root');
        if (p) {
            p.classList.add('open');
            p.style.opacity = '1'; 
            p.style.pointerEvents = 'auto';
            if (!p.style.transform || p.style.transform === 'translateY(20px)') {
                p.style.transform = 'translateY(0)';
            }
        } else {
            console.error('WA: Panel root not found!');
        }
        updateTheme();
        checkStatus();
        startPolling();
    }

    function close() {
        state.isOpen = false;
        var p = _$('wa-panel-root');
        if (p) {
            p.classList.remove('open');
            p.style.opacity = '';
            p.style.pointerEvents = '';
        }
        stopPolling();
    }

    function showScreen(name) {
        state.lastScreen = state.screen;
        state.screen = name;

        var screens = document.querySelectorAll('#wa-panel .wa-screen');
        for (var i = 0; i < screens.length; i++) screens[i].classList.remove('active');
        
        var active = _$('wa-screen-' + name);
        if (active) active.classList.add('active');

        var backBtn = _$('wa-back-btn');
        var newChatBtn = _$('wa-btn-new-chat');
        var refreshQrBtn = _$('wa-btn-refresh-qr');
        
        if (backBtn) {
            backBtn.style.display = (name === 'chat' || name === 'contacts') ? 'flex' : 'none';
        }
        
        if (newChatBtn) {
            newChatBtn.style.display = (name === 'chatList') ? 'flex' : 'none';
        }

        if (refreshQrBtn) {
            refreshQrBtn.style.display = (name === 'login') ? 'flex' : 'none';
        }

        var title = _$('wa-panel-title');
        if (title) {
             _$('wa-panel-title').textContent = (name === 'chat' ? (state.chatName || 'Chat') : (name === 'contacts' ? 'Select Contact' : 'WhatsApp'));
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

            var btn = _$('whatsapp-floating-btn');
            if (btn) btn.style.display = config.enabled ? 'flex' : 'none';
            if (!config.enabled && state.isOpen) close();

            updateStatusUI();

            var isConnected = r.isConnected || 
                              state.status === 'CONNECTED' || 
                              state.status === 'AUTHENTICATED';

            if (isConnected) {
                var loginScreen = _$('wa-screen-login');
                if (state.screen === 'login' || (loginScreen && loginScreen.classList.contains('active'))) {
                    showScreen('chatList');
                    loadChats();
                } else if (!state.screen || state.screen === '') {
                     showScreen('chatList');
                     loadChats();
                }
                
                if (!state.subscribed) {
                     subscribeToRealTime();
                }
            } else {
                if (state.screen !== 'login') {
                     showScreen('login');
                }
                
                if (state.chatInterval) {
                    clearInterval(state.chatInterval);
                    state.chatInterval = null;
                }
            }
        }).catch(function (e) {
            console.error('WhatsApp Widget: Status check error', e);
            state.status = 'disconnected';
            config.enabled = true; // Still show widget even if API check fails

            var btn = _$('whatsapp-floating-btn');
            if (btn) btn.style.display = 'flex';
            
            updateStatusUI();
            
            if (state.screen !== 'login') {
                 showScreen('login');
            }
            if (state.chatInterval) {
                clearInterval(state.chatInterval);
                state.chatInterval = null;
            }
        });
    }

    function updateStatusUI() {
        var el = _$('wa-panel-status');
        var s = (state.status || '').toUpperCase();
        var connected = s === 'AUTHENTICATED' || s === 'CONNECTED';
        
        if (el) {
            el.textContent = connected ? '\u25cf Connected' : ('\u25cb ' + (state.status || 'Disconnected'));
            el.className = 'wa-status-text' + (connected ? ' connected' : '');
        }
        var dot = _$('wa-status-dot');
        if (dot) dot.className = 'wa-status-dot ' + (connected ? 'connected' : 'disconnected');
        
        var logoutBtn = _$('wa-logout-btn');
        if (logoutBtn) logoutBtn.style.display = connected ? 'block' : 'none';
    }

    function startPolling() {
        stopPolling();
        state.statusInterval = setInterval(function () {
            if (state.isOpen) checkStatus();
        }, config.statusCheckInterval);
    }

    function stopPolling() {
        if (state.statusInterval) { clearInterval(state.statusInterval); state.statusInterval = null; }
        if (state.chatInterval) { clearInterval(state.chatInterval); state.chatInterval = null; }
    }

    /* ── WebSocket Real-Time Subscription ───────────────────────── */
    function subscribeToRealTime() {
        if (state.subscribed) return;

        console.log('WA Widget: Connecting to WAMP server');
        if (typeof ab !== 'undefined') {
            try {
                var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                var port = window.location.port ? ':' + window.location.port : '';
                if (window.location.port === '' || window.location.port === '80' || window.location.port === '443') {
                    port = ':8443'; // Default ddev wss port for EspoCRM
                }
                var authToken = '';
                var match = document.cookie.match(new RegExp('(^| )auth-token=([^;]+)'));
                if (match) authToken = match[2];
                else {
                    var lsAuth = localStorage.getItem('espo-user-auth');
                    if (lsAuth) {
                        try {
                            var decoded = JSON.parse(atob(lsAuth));
                            authToken = decoded.token;
                        } catch(e) {}
                    }
                }
                var userId = 'system';
                try {
                    var espoUserStr = localStorage.getItem('espo-user');
                    if (espoUserStr) {
                        var espoUser = JSON.parse(espoUserStr);
                        if (espoUser.lastUserId) {
                            userId = espoUser.lastUserId;
                        }
                    }
                } catch(e) {}

                var url = protocol + '//' + window.location.hostname + port + '?authToken=' + encodeURIComponent(authToken) + '&userId=' + encodeURIComponent(userId);
                state.wampConnection = new ab.Session(url,
                    // onOpen
                    function() {
                        console.log('WA Widget: ✓ WAMP connection established');
                        state.subscribed = true;

                        // Start polling alongside WebSocket as a backup
                        startMessagePolling();

                        // Subscribe to WhatsApp topic
                        state.wampConnection.subscribe('WhatsApp', function(topic, event) {
                            var data = event;
                            if (typeof data === 'string') {
                                try { data = JSON.parse(data); } catch(e) { return; }
                            }
                            
                            console.log('WA WebSocket received on ' + topic + ':', data);
                            
                            // If we have a chat open, check if this is for the current chat
                            if (state.screen === 'chat' && state.chatId && data.chatId === state.chatId) {
                                if (data.action === 'message') {
                                    onRealTimeMessage(data.data, 'message');
                                } else if (data.action === 'message_ack') {
                                    onRealTimeMessage(data.data, 'message_ack');
                                }
                            } else {
                                // Update chat list if a new message comes in
                                if (state.isOpen) {
                                    loadChats();
                                }
                            }
                        });
                        state.wsRetryCount = 0;
                    },
                    // onClose
                    function(code, reason) {
                        console.warn('WA Widget: WAMP connection closed', reason);
                        state.subscribed = false;
                        if (!state.wsRetryCount) state.wsRetryCount = 0;
                        if (state.wsRetryCount < 5) {
                            state.wsRetryCount++;
                            setTimeout(subscribeToRealTime, 5000);
                        }
                    },
                    { 'skipSubprotocolCheck': true }
                );
                return;
            } catch(e) {
                console.warn('WA Widget: WAMP subscribe failed, retrying...', e);
            }
        }

        // Fallback: poll if WebSocket not available
        console.warn('WA Widget: WebSocket not available, falling back to polling');
        startMessagePolling();
    }

    function startMessagePolling() {
        if (state.messagePollingActive) return;
        state.messagePollingActive = true;
        console.log('WA Widget: Starting message polling (fallback)');

        state.messagePollInterval = setInterval(function() {
            if (!state.isOpen) return;

            if (state.screen === 'chat' && state.chatId) {
                api('GET', 'WhatsApp/action/getChatMessages', {
                    chatId: state.chatId,
                    limit: 50
                }).then(function(r) {
                    var apiMsgs = r.list || [];
                    if (apiMsgs.length === 0) return;

                    var changed = false;
                    apiMsgs.forEach(function(msg) {
                        var id = (msg.id && msg.id._serialized) || msg.id || msg.messageId;
                        if (!id) return;
                        var found = false;
                        for (var i = 0; i < state.messages.length; i++) {
                            var existId = (state.messages[i].id && state.messages[i].id._serialized) || state.messages[i].id || state.messages[i].messageId || state.messages[i].tempId;
                            if (existId === id) {
                                found = true;
                                if (msg.ack !== undefined && state.messages[i].ack !== msg.ack) {
                                    state.messages[i].ack = msg.ack;
                                    changed = true;
                                }
                                if (state.messages[i]._optimistic) {
                                    state.messages[i] = msg;
                                    changed = true;
                                }
                                break;
                            }
                            if (state.messages[i]._optimistic && state.messages[i].body === msg.body && state.messages[i].fromMe && msg.fromMe) {
                                state.messages[i] = msg;
                                found = true;
                                changed = true;
                                break;
                            }
                        }
                        if (!found) {
                            state.messages.push(msg);
                            changed = true;
                        }
                    });

                    if (changed) {
                        renderMessages(state.messages);
                    }
                }).catch(function() {});
            }

            if (state.screen === 'chatList') {
                loadChats();
            }
        }, config.pollInterval);
    }

    function stopMessagePolling() {
        if (state.messagePollInterval) {
            clearInterval(state.messagePollInterval);
            state.messagePollInterval = null;
        }
        state.messagePollingActive = false;
    }

    function onRealTimeMessage(msg, action) {
        if (!msg) return;
        action = action || 'message';

        if (state.screen === 'chat' && state.chatId === msg.chatId) {
            var id = (msg.id && msg.id._serialized) || msg.id || msg.messageId;
            var isDuplicate = false;

            if (action === 'message_ack') {
                for (var i = 0; i < state.messages.length; i++) {
                    var existing = state.messages[i];
                    var existingId = (existing.id && existing.id._serialized) || existing.id || existing.messageId || existing.tempId;
                    if (existingId === id) {
                        state.messages[i].ack = msg.ack;
                        if (msg.status) state.messages[i].status = msg.status;
                        break;
                    }
                }
                renderMessages(state.messages);
            } else {
                for (var i = 0; i < state.messages.length; i++) {
                    var existing = state.messages[i];
                    var existingId = (existing.id && existing.id._serialized) || existing.id || existing.messageId || existing.tempId;

                    if (existingId === id) {
                        isDuplicate = true;
                        state.messages[i] = msg;
                        break;
                    }

                    if (existing._optimistic && existing.body === msg.body && existing.fromMe && msg.fromMe) {
                        state.messages[i] = msg;
                        isDuplicate = true;
                        break;
                    }
                }

                if (!isDuplicate) {
                    state.messages.push(msg);
                }
                
                renderMessages(state.messages);
            }
        }

        if (state.isOpen) {
            var chatFound = false;
            for (var j = 0; j < state.chats.length; j++) {
                var cId = state.chats[j].id._serialized || state.chats[j].id;
                if (cId === msg.chatId) {
                    chatFound = true;
                    if (action === 'message') {
                        state.chats[j].lastMessage = msg;
                    } else if (action === 'message_ack' && state.chats[j].lastMessage) {
                        var lmId = state.chats[j].lastMessage.id && state.chats[j].lastMessage.id._serialized || state.chats[j].lastMessage.id;
                        var msgId = msg.id && msg.id._serialized || msg.id;
                        if (lmId === msgId) {
                            state.chats[j].lastMessage.ack = msg.ack;
                            if (msg.status) state.chats[j].lastMessage.status = msg.status;
                        }
                    }
                    break;
                }
            }

            if (!chatFound && action === 'message') {
                loadChats();
            } else if (state.screen === 'chatList') {
                renderChatList(state.chats);
            }
        }
    }

    function logout() {
        if (!confirm('Sei sicuro di voler disconnettere WhatsApp?\n\nDovrai scansionare nuovamente il QR code per riconnetterti.')) return;
        
        api('POST', 'WhatsApp/action/logout').then(function() {
            state.status = 'DISCONNECTED';
            state.subscribed = false;
            showScreen('login');
            startSession();
            
             state.chats = [];
             state.messages = [];
             state.contacts = [];
             state.chatId = null;

        }).catch(function(e) {
             console.error('Logout error:', e);
        });
    }

    /* ── Session / QR ───────────────────────────────────────────── */
    function startSession() {
        if (state.sessionStarting) return;
        state.sessionStarting = true;

        if (state.qrPollTimeout) { clearTimeout(state.qrPollTimeout); state.qrPollTimeout = null; }

        var btn = _$('wa-connect-btn');
        var area = _$('wa-qr-area');
        var spinner = _$('wa-qr-spinner');
        var qrc = _$('wa-qr-container');

        if (btn) { btn.disabled = true; btn.textContent = 'Connecting\u2026'; }
        if (spinner) spinner.style.display = 'block';
        if (qrc) qrc.style.display = 'none';

        api('GET', 'WhatsApp/action/login').then(function () {
            state.qrPollTimeout = setTimeout(function() { pollQR(0); }, 2000);
        }).catch(function () {
             state.sessionStarting = false;
            if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
            if (typeof Espo !== 'undefined' && Espo.Ui) Espo.Ui.error('Failed to connect');
        });
    }

    function pollQR(attempts) {
        if (!state.isOpen || attempts > 60) {
            state.sessionStarting = false;
            var btn = _$('wa-connect-btn');
            if (btn) { btn.disabled = false; btn.textContent = 'Regenerate QR'; }
            return; 
        }

        api('GET', 'WhatsApp/action/qrCode').then(function (r) {
            if (r.qrImage) {
                var img = _$('wa-qr-img');
                if (img) img.src = r.qrImage;
                if (_$('wa-qr-container')) _$('wa-qr-container').style.display = 'flex';
                if (_$('wa-qr-spinner')) _$('wa-qr-spinner').style.display = 'none';
                if (_$('wa-connect-btn')) _$('wa-connect-btn').style.display = 'none';
                
                state.qrPollTimeout = setTimeout(function() { pollQR(attempts + 1); }, 3000); 
            } else {
                 api('GET', 'WhatsApp/action/status').then(function(s) {
                     var isConnected = s.isConnected || 
                                       s.status === 'CONNECTED' || 
                                       s.status === 'AUTHENTICATED';

                     if (isConnected) {
                         state.sessionStarting = false;
                         state.status = s.status;
                         updateStatusUI();
                         showScreen('chatList');
                         loadChats();
                     } else {
                         state.qrPollTimeout = setTimeout(function() { pollQR(attempts + 1); }, 2000);
                     }
                 });
            }
        }).catch(function() {
            state.qrPollTimeout = setTimeout(function() { pollQR(attempts + 1); }, 3000);
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
        var list = _$('wa-contacts-list');
        if (list) list.innerHTML = '<div class="wa-loading"><div class="wa-spinner"></div></div>';
        api('GET', 'WhatsApp/action/getContacts').then(function(r) {
            state.contacts = deduplicateContacts(r.list || []);
            renderContacts(state.contacts);
        });
    }

    function openChat(chatId, chatName) {
        state.chatId = chatId;
        state.chatName = chatName;
        state.messages = [];
        showScreen('chat');

        var container = _$('wa-messages-container');
        if (container) container.innerHTML = '<div class="wa-loading"><div class="wa-spinner"></div></div>';

        api('GET', 'WhatsApp/action/getChatMessages', { 
            chatId: chatId, 
            limit: 100 
        }).then(function (r) {
            var apiMessages = r.list || [];
            
            mergeMessages(apiMessages, chatId).then(function(merged) {
                state.messages = merged;
                if (state.messages.length) {
                    renderMessages(state.messages);
                } else {
                    fallbackToLastMessage(chatId);
                }
            });
        }).catch(function () {
            fallbackToLastMessage(chatId);
        });
    }

    function mergeMessages(apiMessages, chatId) {
        return api('GET', 'WhatsAppMessage', {
            where: [{
                type: 'equals',
                attribute: 'chatId',
                value: chatId
            }],
            orderBy: 'timestamp',
            order: 'desc',
            maxSize: 100
        }).then(function(dbResult) {
            var dbMessages = dbResult.list || [];
            var merged = {};
            
            apiMessages.forEach(function(msg) {
                var id = (msg.id && msg.id._serialized) || msg.id || msg.messageId;
                if (!id) return;
                merged[id] = msg;
            });
            
            dbMessages.forEach(function(msg) {
                var id = msg.messageId;
                if (!id) return;
                if (!merged[id]) {
                     if (msg.status && !msg.ack) {
                         var st = msg.status.toLowerCase();
                         if (st === 'read' || st === 'played') msg.ack = 3;
                         else if (st === 'delivered') msg.ack = 2;
                         else if (st === 'sent' || st === 'received') msg.ack = 1;
                     }
                     merged[id] = msg;
                } else {
                    if (merged[id].ack === undefined && msg.status) {
                        var st = msg.status.toLowerCase();
                        if (st === 'read' || st === 'played') merged[id].ack = 3;
                        else if (st === 'delivered') merged[id].ack = 2;
                        else if (st === 'sent' || st === 'received') merged[id].ack = 1;
                    }
                }
            });
            
            var result = Object.values(merged);
            result.sort(function(a, b) {
                return normalizeTimestamp(a.timestamp) - normalizeTimestamp(b.timestamp);
            });
            
            return result;
        }).catch(function() {
            return apiMessages;
        });
    }

    function fallbackToLastMessage(chatId) {
        var container = _$('wa-messages-container');
        if (!container) return;
        
        api('GET', 'WhatsAppMessage', {
            where: [{
                type: 'equals',
                attribute: 'chatId',
                value: chatId
            }],
            orderBy: 'timestamp',
            order: 'desc',
            maxSize: 50
        }).then(function(r) {
            if (r.list && r.list.length > 0) {
                state.messages = r.list.reverse();
                renderMessages(state.messages);
                showSystemMessage('Loaded ' + r.list.length + ' messages from local storage.');
                return;
            }
            fallbackToLastMessageFromList(chatId, container);
        }).catch(function() {
            fallbackToLastMessageFromList(chatId, container);
        });
    }

    function fallbackToLastMessageFromList(chatId, container) {
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
            showSystemMessage('History fetched from device. Older messages may be unavailable via API.');
        } else {
            container.innerHTML = '<div class="wa-empty-state"><p>No messages yet</p></div>';
        }
    }
    
    function showSystemMessage(text) {
        var container = _$('wa-messages-container');
        if (!container) return;
        var div = document.createElement('div');
        div.className = 'wa-system-message';
        div.textContent = text;
        container.appendChild(div);
    }

    function sendMessage() {
        var input = _$('wa-message-input');
        var text = input ? input.value.trim() : '';
        if (!text || !state.chatId) return;
        input.value = '';

        var now = new Date();
        var tempId = 'temp-' + Date.now();
        var optimisticMsg = {
            id: tempId,
            tempId: tempId,
            body: text,
            timestamp: Math.floor(now.getTime() / 1000),
            fromMe: true,
            _optimistic: true
        };

        state.messages.push(optimisticMsg);
        renderMessages(state.messages);

        api('POST', 'WhatsApp/action/sendMessage', { chatId: state.chatId, message: text }).then(function (r) {
             if (r && r.messageId) {
                 for (var i = 0; i < state.messages.length; i++) {
                     if (state.messages[i].tempId === tempId) {
                         state.messages[i].id = r.messageId;
                         state.messages[i]._optimistic = false;
                         if (!state.messages[i].ack && state.messages[i].ack !== 0) {
                             state.messages[i].ack = 1; 
                             state.messages[i].status = 'Sent';
                         }
                         renderMessages(state.messages);
                         break;
                     }
                 }
             }
        }).catch(function(e) {
            for (var i = 0; i < state.messages.length; i++) {
                if (state.messages[i].tempId === tempId) {
                    state.messages[i].body += ' \u26A0\uFE0F (Error)';
                    state.messages[i].ack = -1;
                    state.messages[i]._optimistic = false;
                    renderMessages(state.messages);
                    break;
                }
            }
        });
    }

    /* ── Renderers ──────────────────────────────────────────────── */
    function renderChatList(chats) {
        var el = _$('wa-chat-list');
        if (!el) return;
        if (!chats.length) { el.innerHTML = '<div class="wa-empty-state"><p>No chats</p></div>'; return; }

        var q = (_$('wa-search-input') || {}).value || '';
        if (q) {
             q = q.toLowerCase();
             chats = chats.filter(function(c) {
                 var n = (c.name || (c.contact && c.contact.pushname) || '');
                 if (typeof n !== 'string') n = String(n);
                 return n.toLowerCase().indexOf(q) !== -1;
             });
        }
        
        chats.sort(function(a, b) {
            var tA = (a.lastMessage && a.lastMessage.timestamp) ? normalizeTimestamp(a.lastMessage.timestamp) : 0;
            var tB = (b.lastMessage && b.lastMessage.timestamp) ? normalizeTimestamp(b.lastMessage.timestamp) : 0;
            return tB - tA;
        });

        el.innerHTML = chats.map(function (c) {
            var chatId = c.id._serialized || c.id;
            var name = c.name || extractPhoneNumber(chatId);
            var last = (c.lastMessage && c.lastMessage.body) || '';
            var time = (c.lastMessage && c.lastMessage.timestamp) ? formatTime(c.lastMessage.timestamp) : '';
            
            return '<li class="wa-chat-item" data-cid="' + esc(chatId) + '" data-cname="' + esc(name) + '">' +
                getAvatarHtml(c, 42) + 
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
        var el = _$('wa-contacts-list');
        if (!el) return;
        
        var q = (_$('wa-contact-search') || {}).value || '';
        if (q) {
             q = q.toLowerCase();
             contacts = contacts.filter(function(c) {
                 var n = (c.name || c.pushname || c.number || '');
                 if (typeof n !== 'string') n = String(n);
                 return n.toLowerCase().indexOf(q) !== -1;
             });
        }

        _$('wa-contacts-list').innerHTML = '';
        
        if (!contacts || contacts.length === 0) {
            _$('wa-contacts-list').innerHTML = '<div class="wa-empty-state">No contacts found.</div>';
            return;
        }
        
        el.innerHTML = contacts.map(function(c) {
             var name = c.name || c.pushname || c.number;
             var id = (c.id && c.id._serialized) || c.id;
             var isGroup = id && id.indexOf('@g.us') !== -1;
             var number = c.number || extractPhoneNumber(id);
             
             var numberHtml = isGroup ? '' : '<div class="wa-contact-number">' + esc(number) + '</div>';
             
             return '<li class="wa-contact-item" data-id="' + esc(id) + '" data-name="' + esc(name) + '">' +
                    getAvatarHtml(c, 42) +
                    '<div class="wa-contact-info"><div class="wa-contact-name">' + esc(name) + '</div>' +
                    numberHtml + '</div></li>';
        }).join('');
        
        var items = el.querySelectorAll('.wa-contact-item');
        for (var i = 0; i < items.length; i++) {
            items[i].onclick = function() { openChat(this.getAttribute('data-id'), this.getAttribute('data-name')); };
        }
    }

    function buildEmojiPicker() {
        var emojis = [
            '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
            '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
            '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩',
            '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💔', '❣️', '💕',
            '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉',
            '🔥', '💧', '💫', '⭐', '🌟', '✨', '⚡', '☄️', '💥', '💢'
        ];
        
        var html = '<div class="wa-emoji-grid">';
        emojis.forEach(function(emoji) {
            html += '<button class="wa-emoji-item" data-emoji="' + emoji + '">' + emoji + '</button>';
        });
        html += '</div>';
        return html;
    }

    function renderMessages(msgs) {
        var container = _$('wa-messages-container');
        if (!container) return;
        var sorted = msgs.slice().sort(function (a, b) { 
            return normalizeTimestamp(a.timestamp) - normalizeTimestamp(b.timestamp);
        });
        var html = '';
        sorted.forEach(function (m) {
            var ms = normalizeTimestamp(m.timestamp);
            var d = new Date(ms);
            var t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            var icon = '';
            
            if (m.fromMe) {
                if (m._optimistic) {
                    icon = ' \u23f3';
                } else {
                    var ack = m.ack;
                    var st = m.status ? m.status.toLowerCase() : '';
                    
                    if (ack === undefined || ack === null) {
                        if (st === 'read' || st === 'played') ack = 3;
                        else if (st === 'delivered') ack = 2;
                        else if (st === 'sent' || st === 'received') ack = 1;
                    }
                    
                    if (ack >= 3 || st === 'read' || st === 'played') {
                        icon = ' <span style="color:#53bdeb; letter-spacing:-2px;">\u2713\u2713</span>'; 
                    } else if (ack >= 2 || st === 'delivered') {
                        icon = ' <span style="letter-spacing:-2px; opacity:0.6;">\u2713\u2713</span>';
                    } else if (ack >= 1 || st === 'sent') {
                        icon = ' <span style="opacity:0.6;">\u2713</span>';
                    } else if (ack === 0) {
                        icon = ' <span style="opacity:0.6;">\u2713</span>';
                    } else {
                        icon = ' <span style="opacity:0.6;">\u2713</span>';
                    }
                }
            }

            html += '<div class="wa-message ' + (m.fromMe ? 'outgoing' : 'incoming') + '">' +
                '<div class="wa-message-text">' + esc(m.body || '') + '</div>' +
                '<div class="wa-message-time">' + esc(t) + icon + '</div></div>';
        });
        container.innerHTML = html;
        container.scrollTop = container.scrollHeight;
    }

    /* ── Theme Detection ────────────────────────────────────────── */
    function updateTheme() {
        var panel = _$('wa-panel-root');
        if (!panel) return;
        
        var saved = localStorage.getItem('wa-theme-pref');
        if (saved) {
             if (saved === 'dark') panel.classList.add('wa-dark');
             else panel.classList.remove('wa-dark');
             return;
        }

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
        var panel = _$('wa-panel-root');
        var isDark = panel.classList.contains('wa-dark');
        if (isDark) {
            panel.classList.remove('wa-dark');
            localStorage.setItem('wa-theme-pref', 'light');
            updateTheme();
        } else {
            panel.classList.add('wa-dark');
            localStorage.setItem('wa-theme-pref', 'dark');
            updateTheme();
        }
    }

    /* ── UI Building ────────────────────────────────────────────── */
    function buildButton() {
        if (_$('whatsapp-floating-btn')) return;
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

    function makeDraggable() {
        var panel = _$('wa-panel-root');
        var header = panel.querySelector('.wa-panel-header');
        if (!panel || !header) return;

        var isDragging = false;
        var currentX, currentY, initialX, initialY;
        var xOffset = 0, yOffset = 0;
        var panelWidth, panelHeight, originalLeft, originalTop;
        
        header.style.cursor = 'move';
        
        header.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);

        function dragStart(e) {
            if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
            e.preventDefault();
            
            if (!xOffset) xOffset = 0;
            if (!yOffset) yOffset = 0;
            
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;

            var rect = panel.getBoundingClientRect();
            panelWidth = rect.width;
            panelHeight = rect.height;
            originalLeft = rect.left - xOffset;
            originalTop = rect.top - yOffset;

            isDragging = true;
            panel.classList.add('wa-dragging');
            document.body.style.userSelect = 'none';
        }

        function drag(e) {
            if (!isDragging) return;
            e.preventDefault();
            
            var rawX = e.clientX - initialX;
            var rawY = e.clientY - initialY;
            
            var SNAP_THRESHOLD = 20;
            var viewportWidth = window.innerWidth;
            var viewportHeight = window.innerHeight;
            
            var proposedLeft = originalLeft + rawX;
            var proposedTop = originalTop + rawY;
            var proposedRight = proposedLeft + panelWidth;
            var proposedBottom = proposedTop + panelHeight;
            
            var finalX = rawX;
            var finalY = rawY;
            
            if (Math.abs(proposedLeft) < SNAP_THRESHOLD) {
                finalX = -originalLeft;
            } 
            else if (Math.abs(viewportWidth - proposedRight) < SNAP_THRESHOLD) {
                finalX = viewportWidth - panelWidth - originalLeft;
            }
            
            if (Math.abs(proposedTop) < SNAP_THRESHOLD) {
                finalY = -originalTop;
            }
            else if (Math.abs(viewportHeight - proposedBottom) < SNAP_THRESHOLD) {
                finalY = viewportHeight - panelHeight - originalTop;
            }

            currentX = finalX;
            currentY = finalY;

            xOffset = currentX;
            yOffset = currentY;

            setTranslate(currentX, currentY, panel);
        }

        function dragEnd(e) {
            if (!isDragging) return;
            initialX = currentX;
            initialY = currentY;
            isDragging = false;
            
            panel.classList.remove('wa-dragging');
            document.body.style.userSelect = '';
        }
        
        function setTranslate(xPos, yPos, el) {
            el.style.transform = "translate3d(" + xPos + "px, " + yPos + "px, 0)";
        }
    }

    function buildPanel() {
        if (state.panelBuilt) return;
        state.panelBuilt = true;

        var root = document.createElement('div');
        root.id = 'wa-panel-root';
        var panelHtml = [
            '<div class="whatsapp-widget-panel" id="wa-panel">',
            '  <div class="wa-panel-header" style="z-index:10001;position:relative;">',
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
            '       <button class="wa-icon-btn" id="wa-btn-new-chat" title="New Chat" style="display:none">',
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
            '          <button class="wa-icon-btn" id="wa-btn-refresh-qr" style="display:none;margin-top:10px" title="Refresh QR">\u21BB Refresh QR</button>',
            '       </div>',
            '     </div>',
            '  </div>',
            '  <div class="wa-screen" id="wa-screen-chatList">',
            '     <div class="wa-search-bar">',
            '       <input type="text" id="wa-search-input" autocomplete="off" placeholder="Search chats \u2026">',
            '     </div>', 
            '     <div class="wa-panel-body" id="wa-chat-list"></div>',
            '  </div>',
            '  <div class="wa-screen" id="wa-screen-chat">',
            '     <div class="wa-messages-container" id="wa-messages-container"></div>',
            '     <div class="wa-send-box">',
            '        <button id="wa-emoji-btn" class="wa-emoji-btn" title="Emoji"><i class="far fa-smile"></i></button>',
            '        <input type="text" id="wa-message-input" autocomplete="off" placeholder="Type a message\u2026">',
            '        <button class="wa-send-btn" id="wa-send-btn">' + SEND_SVG + '</button>',
            '     </div>',
            '     <div id="wa-emoji-picker" class="wa-emoji-picker" style="display:none;">' + buildEmojiPicker() + '</div>',
            '  </div>',
            '  <div class="wa-screen" id="wa-screen-contacts">',
            '      <div class="wa-search-bar">',
            '         <input type="text" id="wa-contact-search" autocomplete="off" placeholder="Search contacts \u2026">',
            '      </div>',
            '      <div class="wa-panel-body" id="wa-contacts-list"></div>',
            '  </div>',
            '</div>'
        ].join('');

        root.innerHTML = panelHtml;
        document.body.appendChild(root);
        initAvatarObserver();
        
        // --- Inject Resizers ---
        var resizers = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
        resizers.forEach(function(dir) {
            var el = document.createElement('div');
            el.className = 'wa-resizer ' + dir;
            root.appendChild(el); 
            
            el.addEventListener('mousedown', function(e) {
                e.preventDefault(); e.stopPropagation();
                root.classList.add('wa-resizing'); 
                
                var startX = e.clientX, startY = e.clientY;
                var rect = root.getBoundingClientRect();
                var startW = rect.width, startH = rect.height;
                var styles = window.getComputedStyle(root);
                var startRight = parseFloat(styles.right); 
                var startBottom = parseFloat(styles.bottom); 
                
                function onMove(e) {
                    var dx = e.clientX - startX;
                    var dy = e.clientY - startY;
                    
                    if (dir.indexOf('w') !== -1) {
                        root.style.width = Math.max(300, startW - dx) + 'px';
                    }
                    if (dir.indexOf('e') !== -1) {
                         var newW = Math.max(300, startW + dx);
                         root.style.width = newW + 'px';
                         if (!isNaN(startRight)) root.style.right = (startRight - (newW - startW)) + 'px';
                    }
                    
                    if (dir.indexOf('n') !== -1) {
                        root.style.height = Math.max(400, startH - dy) + 'px';
                    }
                    if (dir.indexOf('s') !== -1) {
                        var newH = Math.max(400, startH + dy);
                        root.style.height = newH + 'px';
                        if (!isNaN(startBottom)) root.style.bottom = (startBottom - (newH - startH)) + 'px';
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
        // --- End Inject Resizers ---

        makeDraggable();

        var closeBtn = _$('wa-close-btn');
        if (closeBtn) closeBtn.onclick = function() { close(); };

        var backBtn = _$('wa-back-btn');
        if (backBtn) backBtn.onclick = function() { showScreen('chatList'); };

        var newChatBtn = _$('wa-btn-new-chat');
        if (newChatBtn) newChatBtn.onclick = function() { loadContacts(); };

        var searchInput = _$('wa-search-input');
        if (searchInput) searchInput.oninput = function() { renderChatList(state.chats); };

        var contactSearch = _$('wa-contact-search');
        if (contactSearch) contactSearch.oninput = function() { renderContacts(state.contacts); };

        var sendBtn = _$('wa-send-btn');
        if (sendBtn) sendBtn.onclick = sendMessage;

        var msgInput = _$('wa-message-input');
        if (msgInput) msgInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') sendMessage();
        });

        var connectBtn = _$('wa-connect-btn');
        if (connectBtn) connectBtn.onclick = startSession;

        var logoutBtn = _$('wa-logout-btn');
        if (logoutBtn) logoutBtn.onclick = logout;

        var themeBtn = _$('wa-theme-btn');
        if (themeBtn) themeBtn.onclick = toggleTheme;
    }

    /* ── Initialization ────────────────────────────────────────── */
    function init() {
        if (state.initialized) return;
        
        // EspoCRM loads its core JS asynchronously. We must wait until Ajax and the base path are ready.
        if (typeof Espo === 'undefined' || !Espo.Ajax || !document.body) {
            setTimeout(init, 500); 
            return;
        }
        state.initialized = true;

        buildButton();
        checkStatus();
        startPolling();

        console.log('WhatsApp Widget initialized');
    }

    // Auto-init when document ready or on demand
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 1000); });
    } else {
        setTimeout(init, 1000);
    }

    // Export for manual control
    window.WhatsAppWidget = {
        open: open,
        close: close,
        toggle: toggle,
        openChat: openChat
    };
})();
