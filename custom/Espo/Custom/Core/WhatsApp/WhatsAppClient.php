<?php
namespace Espo\Custom\Core\WhatsApp;

use Espo\Core\Utils\Config;
use Espo\Core\Utils\Log;

class WhatsAppClient
{
    private string $sessionId = 'espocrm-session';
    private Config $config;
    private Log $log;

    public function __construct(Config $config, Log $log)
    {
        $this->config = $config;
        $this->log = $log;
    }

    private function getApiUrl(): string
    {
        return rtrim($this->config->get('whatsappApiUrl', 'http://whatsapp-api:3000'), '/');
    }

    private function getApiKey(): ?string
    {
        return $this->config->get('whatsappApiKey');
    }

    public function startSession(): array
    {
        return $this->makeRequest('GET', "/session/start/{$this->sessionId}");
    }

    public function getQRCode(): ?string
    {
        $response = $this->makeRequest('GET', "/session/qr/{$this->sessionId}");
        return $response['qr'] ?? null;
    }

    public function getQRCodeImage(): ?string
    {
        $url = $this->getApiUrl() . "/session/qr/{$this->sessionId}/image";
        $apiKey = $this->getApiKey();

        if (empty($apiKey)) {
            return null;
        }

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'X-API-KEY: ' . $apiKey,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        curl_close($ch);

        if ($httpCode === 200 && $response) {
            return 'data:' . ($contentType ?: 'image/png') . ';base64,' . base64_encode($response);
        }

        return null;
    }

    public function getSessionStatus(): string
    {
        $response = $this->makeRequest('GET', "/session/status/{$this->sessionId}");
        // wwebjs-api returns { "success": true, "state": "CONNECTED", "message": "session_connected" }
        return $response['state'] ?? $response['status'] ?? 'disconnected';
    }

    public function getChats(): array
    {
        $response = $this->makeRequest('GET', "/client/getChats/{$this->sessionId}");
        return $response['chats'] ?? $response['data'] ?? (is_array($response) && !isset($response['success']) ? $response : []);
    }

    public function getChatMessages(string $chatId, int $limit = 50): array
    {
        $response = $this->makeRequest('GET', "/client/getChatMessages/{$this->sessionId}?chatId={$chatId}&limit={$limit}");
        return $response['messages'] ?? $response['data'] ?? (is_array($response) && !isset($response['success']) ? $response : []);
    }

    public function getContacts(): array
    {
        $response = $this->makeRequest('GET', "/client/getContacts/{$this->sessionId}");
        return $response['contacts'] ?? $response['data'] ?? (is_array($response) && !isset($response['success']) ? $response : []);
    }

    public function sendMessage(string $chatId, string $message): bool
    {
        if (strpos($chatId, '@') === false) {
            $cleanPhone = preg_replace('/[^0-9]/', '', $chatId);
            if (empty($cleanPhone)) {
                $this->log->warning("WhatsAppClient: Empty phone/chatId provided.");
                return false;
            }
            $chatId = $cleanPhone . '@c.us';
        }

        $data = [
            'chatId' => $chatId,
            'contentType' => 'string',
            'content' => $message
        ];

        $response = $this->makeRequest('POST', "/client/sendMessage/{$this->sessionId}", $data);
        return $response['success'] ?? false;
    }

    public function terminateSession(): bool
    {
        $response = $this->makeRequest('GET', "/session/terminate/{$this->sessionId}");
        return $response['success'] ?? false;
    }

    private function makeRequest(string $method, string $endpoint, ?array $data = null): array
    {
        $url = $this->getApiUrl() . $endpoint;
        $apiKey = $this->getApiKey();

        if (empty($apiKey)) {
            $this->log->error('WhatsAppClient: API Key is not configured.');
            return ['success' => false, 'error' => 'API Key not configured'];
        }

        $ch = curl_init();

        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'X-API-KEY: ' . $apiKey,
            'Content-Type: application/json'
        ]);

        if ($method === 'POST' && $data) {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        }

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($curlError) {
            $this->log->error("WhatsAppClient cURL Error: " . $curlError);
            return ['success' => false, 'error' => $curlError];
        }

        if ($httpCode !== 200) {
            $this->log->error('WhatsAppClient API error', ['code' => $httpCode, 'response' => $response]);
            return ['success' => false, 'code' => $httpCode];
        }

        return json_decode($response, true) ?? [];
    }
}
