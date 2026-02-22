<?php
namespace Espo\Modules\WhatsApp\Controllers;

use Espo\Core\Controllers\Base;
use Espo\Core\Api\Request;
use Espo\Core\Api\Response;
use Espo\Core\Exceptions\BadRequest;
use Espo\Custom\Core\WhatsApp\WhatsAppClient;
use Espo\Core\InjectableFactory;
use Espo\Modules\WhatsApp\Services\WebSocketService;

/**
 * WhatsApp Module Controller with WebSocket real-time support
 * 
 * All message operations broadcast updates via WebSocket for instant UI updates
 */
class WhatsApp extends Base
{
    private function getWhatsAppClient(): WhatsAppClient
    {
        /** @var InjectableFactory $factory */
        $factory = $this->getContainer()->get('injectableFactory');
        return $factory->create(WhatsAppClient::class);
    }

    private function getWebSocketService(): WebSocketService
    {
        /** @var InjectableFactory $factory */
        $factory = $this->getContainer()->get('injectableFactory');
        return $factory->create(WebSocketService::class);
    }

    /**
     * Send a message via WhatsApp
     * Broadcasts immediately via WebSocket to all subscribers
     */
    public function postActionSendMessage(Request $request, Response $response): array
    {
        $data = $request->getParsedBody();
        $chatId = $data->chatId ?? $data->phone ?? null;
        $message = $data->message ?? null;

        if (!$chatId || !$message) {
            throw new BadRequest('chatId and message are required');
        }

        try {
            $result = $this->getWhatsAppClient()->sendMessage($chatId, $message);
            
            if ($result['success'] ?? false) {
                $messageId = $result['message']['id']['_serialized'] ?? $result['message']['id'] ?? uniqid('msg_');
                
                // Broadcast via WebSocket immediately
                $wsService = $this->getWebSocketService();
                $wsService->broadcastMessage($chatId, [
                    'id' => $messageId,
                    'body' => $message,
                    'timestamp' => time(),
                    'fromMe' => true,
                    'ack' => 1,
                    'status' => 'Sent'
                ]);
                
                return [
                    'success' => true,
                    'messageId' => $messageId,
                    'message' => 'Message sent and broadcasted'
                ];
            }
            
            return [
                'success' => false,
                'error' => $result['error'] ?? 'Failed to send message'
            ];
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'error' => $e->getMessage()
            ];
        }
    }

    /**
     * Broadcast a message acknowledgment (delivery/read status)
     */
    public function postActionBroadcastAck(Request $request, Response $response): array
    {
        $data = $request->getParsedBody();
        $chatId = $data->chatId ?? null;
        $messageId = $data->messageId ?? null;
        $ack = $data->ack ?? 1;
        $status = $data->status ?? null;

        if (!$chatId || !$messageId) {
            throw new BadRequest('chatId and messageId are required');
        }

        try {
            $wsService = $this->getWebSocketService();
            $wsService->broadcastMessageAck($chatId, $messageId, $ack, $status);
            
            return [
                'success' => true,
                'message' => 'ACK broadcasted'
            ];
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'error' => $e->getMessage()
            ];
        }
    }

    /**
     * Broadcast typing indicator
     */
    public function postActionBroadcastTyping(Request $request, Response $response): array
    {
        $data = $request->getParsedBody();
        $chatId = $data->chatId ?? null;
        $isTyping = $data->isTyping ?? true;

        if (!$chatId) {
            throw new BadRequest('chatId is required');
        }

        try {
            $wsService = $this->getWebSocketService();
            $wsService->broadcastTyping($chatId, $isTyping);
            
            return [
                'success' => true,
                'message' => 'Typing status broadcasted'
            ];
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'error' => $e->getMessage()
            ];
        }
    }
}
