<?php
namespace Espo\Custom\Controllers;

use Espo\Core\Controllers\Base;
use Espo\Core\Api\Request;
use Espo\Core\Api\Response;
use Espo\Core\Exceptions\BadRequest;
use Espo\Custom\Core\WhatsApp\WhatsAppClient;
use Espo\Core\InjectableFactory;
use Espo\Modules\WhatsApp\Services\WebSocketService;

class WhatsApp extends Base
{
    private function getWhatsAppClient(): WhatsAppClient
    {
        /** @var InjectableFactory $factory */
        $factory = $this->getContainer()->get('injectableFactory');
        return $factory->create(WhatsAppClient::class);
    }

    /**
     * Get WebSocketService for real-time event broadcasting
     */
    private function getWebSocketService(): WebSocketService
    {
        /** @var InjectableFactory $factory */
        $factory = $this->getContainer()->get('injectableFactory');
        return $factory->create(WebSocketService::class);
    }

    public function getActionLogin(Request $request, Response $response): array
    {
        $this->getWhatsAppClient()->startSession();
        $qrCode = $this->getWhatsAppClient()->getQRCode();

        return [
            'success' => true,
            'qrCode' => $qrCode
        ];
    }

    public function getActionQrCode(Request $request, Response $response): array
    {
        $qr = $this->getWhatsAppClient()->getQRCode();
        $qrImage = $this->getWhatsAppClient()->getQRCodeImage();

        return [
            'qr' => $qr,
            'qrImage' => $qrImage
        ];
    }

    public function getActionStatus(Request $request, Response $response): array
    {
        // Check if enabled (default to true if null)
        $enabled = $this->getConfig()->get('whatsappEnabled');
        if ($enabled === false) {
            return [
                'status' => 'disabled',
                'isConnected' => false,
                'enabled' => false
            ];
        }

        $status = $this->getWhatsAppClient()->getSessionStatus();
        $isConnected = in_array(strtoupper($status), ['CONNECTED', 'AUTHENTICATED']);

        return [
            'status' => $status,
            'isConnected' => $isConnected,
            'enabled' => true
        ];
    }

    public function getActionGetChats(Request $request, Response $response): array
    {
        $chats = $this->getWhatsAppClient()->getChats();

        return [
            'success' => true,
            'list' => $chats
        ];
    }

    public function getActionGetChatMessages(Request $request, Response $response): array
    {
        $chatId = $request->getQueryParam('chatId');
        if (!$chatId) {
            throw new BadRequest('chatId is required');
        }

        $limit = (int) ($request->getQueryParam('limit') ?? 50);
        $entityManager = $this->getContainer()->get('entityManager');

        // Step 1: Try fetching fresh messages from WAHA API and save new ones to DB
        try {
            $apiMessages = $this->getWhatsAppClient()->getChatMessages($chatId, $limit);
            if (!empty($apiMessages)) {
                foreach ($apiMessages as $apiMsg) {
                    $msgId = null;
                    if (isset($apiMsg['id']) && is_array($apiMsg['id'])) {
                        $msgId = $apiMsg['id']['_serialized'] ?? null;
                    } else {
                        $msgId = $apiMsg['id'] ?? $apiMsg['messageId'] ?? null;
                    }
                    if (!$msgId)
                        continue;

                    // Check if already in DB
                    $exists = $entityManager->getRepository('WhatsAppMessage')
                        ->where(['messageId' => $msgId])
                        ->findOne();
                    if ($exists)
                        continue;

                    // Save new message to DB
                    $msgEntity = $entityManager->getEntity('WhatsAppMessage');
                    $fromMe = $apiMsg['fromMe'] ?? false;
                    $body = $apiMsg['body'] ?? '';
                    $timestamp = $apiMsg['timestamp'] ?? time();

                    $msgEntity->set([
                        'body' => $body,
                        'chatId' => $chatId,
                        'fromMe' => $fromMe,
                        'timestamp' => date('Y-m-d H:i:s', is_numeric($timestamp) ? $timestamp : strtotime($timestamp)),
                        'status' => $fromMe ? 'Sent' : 'Received',
                        'messageId' => $msgId,
                    ]);
                    try {
                        $entityManager->saveEntity($msgEntity);
                    } catch (\PDOException $e) {
                        // Ignore duplicate entry errors
                        if ($e->getCode() != 23000 && strpos($e->getMessage(), '1062') === false) {
                            $GLOBALS['log']->warning('WhatsApp getChatMessages save error: ' . $e->getMessage());
                        }
                    }
                }
            }
        } catch (\Throwable $e) {
            $GLOBALS['log']->warning('WhatsApp getChatMessages API fetch failed: ' . $e->getMessage());
        }

        // Step 2: Always read final result from DB (now has API + webhook messages merged)
        $collection = $entityManager->getRepository('WhatsAppMessage')
            ->where(['chatId' => $chatId])
            ->order('timestamp', 'ASC')
            ->limit($limit)
            ->find();

        $result = [];
        foreach ($collection as $msg) {
            $fromMe = (bool) $msg->get('fromMe');
            $result[] = [
                'id' => $msg->get('messageId') ?: $msg->getId(),
                'messageId' => $msg->get('messageId') ?: $msg->getId(),
                'body' => $msg->get('body') ?? '',
                'chatId' => $msg->get('chatId') ?? $chatId,
                'fromMe' => $fromMe,
                'timestamp' => $msg->get('timestamp') ? strtotime($msg->get('timestamp')) : time(),
                'ack' => $fromMe ? 1 : 0,
                'status' => $msg->get('status') ?? 'Received',
            ];
        }

        return [
            'success' => true,
            'list' => $result
        ];
    }

    public function getActionGetContacts(Request $request, Response $response): array
    {
        $contacts = $this->getWhatsAppClient()->getContacts();

        return [
            'success' => true,
            'list' => $contacts
        ];
    }

    public function getActionGetProfilePic(Request $request, Response $response): array
    {
        $id = $request->getQueryParam('id');
        if (!$id) {
            return ['url' => null];
        }

        // Check local cache first to avoid hammering the API/CDN
        $filename = 'wa-avatar-' . md5($id) . '.jpg';
        $path = 'client/custom/whatsapp-avatars/' . $filename;
        $fullPath = rtrim($this->getContainer()->get('config')->get('siteUrl'), '/') . '/' . $path;

        if (file_exists($path)) {
            // Cache valid for 7 days
            if (time() - filemtime($path) < 604800) {
                return ['url' => $fullPath . '?v=' . filemtime($path)];
            }
        }

        // 1. Get temporary CDN URL from WhatsApp Client
        $url = $this->getWhatsAppClient()->getProfilePicUrl($id);

        if ($url) {
            // 2. Download the image locally to bypass CORS and expiration
            $ch = curl_init($url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 10);
            // Some CDNs require user agent
            curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            $imageData = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($httpCode === 200 && $imageData) {
                if (!is_dir(dirname($path))) {
                    mkdir(dirname($path), 0755, true);
                }
                file_put_contents($path, $imageData);
                return ['url' => $fullPath . '?v=' . time()];
            }
        }

        return ['url' => null];
    }

    public function postActionLogout(Request $request, Response $response): array
    {
        $result = $this->getWhatsAppClient()->terminateSession();
        return ['success' => $result];
    }

    /**
     * Send a message via WhatsApp and broadcast via WebSocket
     * 
     * POST /WhatsApp/action/sendMessage
     * Parameters:
     *   - chatId (string): Chat/phone ID
     *   - message (string): Message text
     */
    public function postActionSendMessage(Request $request, Response $response): array
    {
        $data = $request->getParsedBody();
        $phone = $data->phone ?? $data->chatId ?? null;
        $message = $data->message ?? null;

        if (!$phone || !$message) {
            throw new BadRequest('Phone/chatId and message required');
        }

        // 1. Send via API
        $result = $this->getWhatsAppClient()->sendMessage($phone, $message);
        $sent = $result['success'] ?? false;

        $messageId = null;
        if (isset($result['message']) && isset($result['message']['id'])) {
            // Handle different wwebjs ID structures
            $msgIdObj = $result['message']['id'];
            $messageId = is_array($msgIdObj) ? ($msgIdObj['_serialized'] ?? null) : $msgIdObj;
        } else if (isset($result['data']) && isset($result['data']['id'])) {
            $msgIdObj = $result['data']['id'];
            $messageId = is_array($msgIdObj) ? ($msgIdObj['_serialized'] ?? null) : $msgIdObj;
        }

        // 2. Save to DB
        if ($sent) {
            $entityManager = $this->getContainer()->get('entityManager');
            $realId = $messageId ?: uniqid('sent_');

            // Protect against race condition with webhook
            $exists = $entityManager->getRepository('WhatsAppMessage')->where(['messageId' => $realId])->findOne();

            if (!$exists) {
                try {
                    $msgEntity = $entityManager->getEntity('WhatsAppMessage');
                    $msgEntity->set([
                        'body' => $message,
                        'chatId' => $phone,
                        'fromMe' => true,
                        'timestamp' => date('Y-m-d H:i:s'),
                        'status' => 'Sent',
                        'messageId' => $realId
                    ]);
                    $entityManager->saveEntity($msgEntity);

                    // 3. 🔥 Broadcast via WebSocket in real-time
                    try {
                        $wsService = $this->getWebSocketService();
                        $wsService->broadcastMessage($phone, [
                            'id' => $realId,
                            'body' => $message,
                            'chatId' => $phone,
                            'fromMe' => true,
                            'timestamp' => time(),
                            'ack' => 1,  // Sent
                            'status' => 'Sent'
                        ]);

                        $GLOBALS['log']->info('WhatsApp message broadcasted via WebSocket: ' . $realId);
                    } catch (\Throwable $e) {
                        // Ignore WebSocket errors to prevent blocking message sending
                        $GLOBALS['log']->error('WhatsApp WebSocket broadcast error: ' . $e->getMessage());
                    }
                } catch (\PDOException $e) {
                    if ($e->getCode() != 23000 && strpos($e->getMessage(), '1062') === false) {
                        throw $e;
                    }
                    // If it is 23000 / 1062, it means webhook already saved it, so we can safely ignore
                }
            }

            return [
                'success' => true,
                'messageId' => $realId
            ];
        }

        return [
            'success' => false,
            'error' => $result['error'] ?? 'Unknown error'
        ];
    }

    public function postActionSaveSettings(Request $request, Response $response): array
    {
        $data = $request->getParsedBody();

        if (isset($data->whatsappApiUrl)) {
            @$this->getConfig()->set('whatsappApiUrl', $data->whatsappApiUrl);
        }
        if (isset($data->whatsappApiKey)) {
            @$this->getConfig()->set('whatsappApiKey', $data->whatsappApiKey);
        }
        if (isset($data->whatsappAutoMessageEnabled)) {
            @$this->getConfig()->set('whatsappAutoMessageEnabled', $data->whatsappAutoMessageEnabled);
        }
        if (isset($data->whatsappLeadTemplate)) {
            @$this->getConfig()->set('whatsappLeadTemplate', $data->whatsappLeadTemplate);
        }
        if (isset($data->whatsappEnabled)) {
            @$this->getConfig()->set('whatsappEnabled', $data->whatsappEnabled);
        }

        @$this->getConfig()->save();

        return ['success' => true];
    }

    /**
     * Webhook handler for incoming messages from WhatsApp
     * Also broadcasts incoming messages via WebSocket
     */
    public function postActionWebhook(Request $request, Response $response): array
    {
        $data = $request->getParsedBody();
        $GLOBALS['log']->info('WhatsApp webhook received', (array) $data);

        $payload = null;
        if (isset($data->data) && isset($data->data->body)) {
            $payload = $data->data;
        } else if (isset($data->data) && isset($data->data->message) && isset($data->data->message->body)) {
            $payload = $data->data->message;
        }

        if ($payload) {
            $body = $payload->body ?? '';
            $from = is_object($payload->from ?? null) ? ($payload->from->_serialized ?? '') : ($payload->from ?? '');
            $to = is_object($payload->to ?? null) ? ($payload->to->_serialized ?? '') : ($payload->to ?? '');
            $timestamp = $payload->timestamp ?? time();

            if ($body === 'status@broadcast')
                return ['success' => true];

            $entityManager = $this->getContainer()->get('entityManager');
            $msgId = $payload->id->_serialized ?? $payload->id ?? null;

            if ($msgId) {
                $exists = $entityManager->getRepository('WhatsAppMessage')->where(['messageId' => $msgId])->findOne();
                if ($exists)
                    return ['success' => true];
            }

            $fromMe = $payload->fromMe ?? false;
            $chatId = $fromMe ? $to : $from;

            $msgEntity = $entityManager->getEntity('WhatsAppMessage');
            $msgEntity->set([
                'body' => $body,
                'chatId' => $chatId,
                'fromMe' => $fromMe,
                'timestamp' => date('Y-m-d H:i:s', $timestamp),
                'status' => 'Received',
                'messageId' => $msgId ?: uniqid('recv_')
            ]);
            try {
                $entityManager->saveEntity($msgEntity);
            } catch (\PDOException $e) {
                if ($e->getCode() != 23000 && strpos($e->getMessage(), '1062') === false) {
                    throw $e;
                }
                // Duplicate entry from race condition: already saved, continue to broadcast!
            }

            // 🔥 Broadcast via WebSocket
            try {
                $wsService = $this->getWebSocketService();
                $wsService->broadcastMessage($chatId, [
                    'id' => $msgId ?: $msgEntity->getId(),
                    'body' => $body,
                    'chatId' => $chatId,
                    'fromMe' => $fromMe,
                    'timestamp' => $timestamp,
                    'ack' => $fromMe ? 1 : 0,
                    'status' => $fromMe ? 'Sent' : 'Received'
                ]);

                $GLOBALS['log']->info('WhatsApp incoming message broadcasted via WebSocket: ' . ($msgId ?: $msgEntity->getId()));
            } catch (\Throwable $e) {
                $GLOBALS['log']->error('WhatsApp WebSocket broadcast error: ' . $e->getMessage());
            }
        }

        return ['success' => true];
    }
}
