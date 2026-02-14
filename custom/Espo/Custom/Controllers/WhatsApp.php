<?php
namespace Espo\Custom\Controllers;

use Espo\Core\Controllers\Base;
use Espo\Core\Api\Request;
use Espo\Core\Api\Response;
use Espo\Core\Exceptions\BadRequest;
use Espo\Custom\Core\WhatsApp\WhatsAppClient;
use Espo\Core\InjectableFactory;

class WhatsApp extends Base
{
    private function getWhatsAppClient(): WhatsAppClient
    {
        /** @var InjectableFactory $factory */
        $factory = $this->getContainer()->get('injectableFactory');
        return $factory->create(WhatsAppClient::class);
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
        $status = $this->getWhatsAppClient()->getSessionStatus();

        // wwebjs-api returns states like: CONNECTED, DISCONNECTED, QR_RECEIVED, etc.
        $isConnected = in_array(strtoupper($status), ['CONNECTED', 'AUTHENTICATED']);

        return [
            'status' => $status,
            'isConnected' => $isConnected
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
        $limit = (int) ($request->getQueryParam('limit') ?? 50);

        if (!$chatId) {
            throw new BadRequest('chatId is required');
        }

        $messages = $this->getWhatsAppClient()->getChatMessages($chatId, $limit);

        return [
            'success' => true,
            'list' => $messages
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

    public function postActionLogout(Request $request, Response $response): array
    {
        $result = $this->getWhatsAppClient()->terminateSession();

        return [
            'success' => $result
        ];
    }

    public function postActionSendMessage(Request $request, Response $response): array
    {
        $data = $request->getParsedBody();
        $phone = $data->phone ?? $data->chatId ?? null;
        $message = $data->message ?? null;

        if (!$phone || !$message) {
            throw new BadRequest('Phone/chatId and message required');
        }

        // If chatId contains @c.us, extract the number part
        if (str_contains($phone, '@')) {
            $phone = explode('@', $phone)[0];
        }

        $sent = $this->getWhatsAppClient()->sendMessage($phone, $message);

        return [
            'success' => $sent
        ];
    }

    public function postActionSaveSettings(Request $request, Response $response): array
    {
        $data = $request->getParsedBody();

        if (isset($data->whatsappApiUrl)) {
            @$this->config->set('whatsappApiUrl', $data->whatsappApiUrl);
        }
        if (isset($data->whatsappApiKey)) {
            @$this->config->set('whatsappApiKey', $data->whatsappApiKey);
        }
        if (isset($data->whatsappAutoMessageEnabled)) {
            @$this->config->set('whatsappAutoMessageEnabled', $data->whatsappAutoMessageEnabled);
        }
        if (isset($data->whatsappLeadTemplate)) {
            @$this->config->set('whatsappLeadTemplate', $data->whatsappLeadTemplate);
        }

        @$this->config->save();

        return [
            'success' => true
        ];
    }

    public function postActionWebhook(Request $request, Response $response): array
    {
        // Placeholder for incoming message webhooks from wwebjs-api
        $data = $request->getParsedBody();
        $GLOBALS['log']->info('WhatsApp webhook received', (array) $data);

        return ['success' => true];
    }
}
