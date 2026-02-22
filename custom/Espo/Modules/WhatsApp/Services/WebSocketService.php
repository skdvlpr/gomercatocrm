<?php

namespace Espo\Modules\WhatsApp\Services;

use Espo\Core\WebSocket\Sender;

/**
 * Service for broadcasting WhatsApp messages via WebSocket
 */
class WebSocketService
{
    private $sender;

    public function __construct(Sender $sender)
    {
        $this->sender = $sender;
    }

    /**
     * Broadcast a new message to all subscribers of a specific chat
     *
     * @param string $chatId The WhatsApp chat ID
     * @param array $messageData Message object with id, body, timestamp, fromMe, ack, status
     * @return void
     */
    public function broadcastMessage($chatId, $messageData)
    {
        $topic = 'whatsapp.message.' . $chatId;

        $payload = [
            'action' => 'message',
            'data' => $messageData,
            'chatId' => $chatId,
            'timestamp' => time()
        ];

        $this->sender->send($topic, $payload);
    }

    /**
     * Broadcast message acknowledgment (delivery/read status)
     *
     * @param string $chatId The WhatsApp chat ID
     * @param string $messageId The message ID
     * @param int $ack Acknowledgment level (0=pending, 1=sent, 2=delivered, 3=read)
     * @param string|null $status Optional status string (Sent, Delivered, Read, etc)
     * @return void
     */
    public function broadcastMessageAck($chatId, $messageId, $ack, $status = null)
    {
        $topic = 'whatsapp.message.' . $chatId;

        $payload = [
            'action' => 'message_ack',
            'data' => [
                'id' => $messageId,
                'ack' => $ack,
                'status' => $status,
                'timestamp' => time()
            ],
            'chatId' => $chatId
        ];

        $this->sender->send($topic, $payload);
    }

    /**
     * Broadcast typing indicator
     *
     * @param string $chatId The WhatsApp chat ID
     * @param bool $isTyping Whether user is typing
     * @return void
     */
    public function broadcastTyping($chatId, $isTyping = true)
    {
        $topic = 'whatsapp.message.' . $chatId;

        $payload = [
            'action' => 'typing',
            'data' => [
                'isTyping' => $isTyping,
                'timestamp' => time()
            ],
            'chatId' => $chatId
        ];

        $this->sender->send($topic, $payload);
    }
}
