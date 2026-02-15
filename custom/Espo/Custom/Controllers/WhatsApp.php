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

        // Fetch from local DB
        $entityManager = $this->getContainer()->get('entityManager');
        $messages = $entityManager->getRepository('WhatsAppMessage')
            ->where(['chatId' => $chatId])
            ->order('timestamp', 'DESC')
            ->limit(0, 100)
            ->find();

        $list = [];
        foreach ($messages as $msg) {
            $list[] = [
                'id' => $msg->get('messageId'),
                'body' => $msg->get('body'),
                'fromMe' => $msg->get('fromMe'),
                'timestamp' => $msg->get('timestamp') ? strtotime($msg->get('timestamp')) : time(),
                'status' => $msg->get('status')
            ];
        }

        return [
            'success' => true,
            'list' => $list
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
        return ['success' => $result];
    }

    public function postActionSendMessage(Request $request, Response $response): array
    {
        $data = $request->getParsedBody();
        $phone = $data->phone ?? $data->chatId ?? null;
        $message = $data->message ?? null;

        if (!$phone || !$message) {
            throw new BadRequest('Phone/chatId and message required');
        }

        // 1. Send via API
        $sent = $this->getWhatsAppClient()->sendMessage($phone, $message);

        // 2. Save to DB
        if ($sent) {
            $entityManager = $this->getContainer()->get('entityManager');
            $msgEntity = $entityManager->getEntity('WhatsAppMessage');
            $msgEntity->set([
                'body' => $message,
                'chatId' => $phone,
                'fromMe' => true,
                'timestamp' => date('Y-m-d H:i:s'),
                'status' => 'Sent',
                'messageId' => uniqid('sent_')
            ]);
            $entityManager->saveEntity($msgEntity);
        }

        return [
            'success' => $sent
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
            $from = $payload->from ?? '';
            $to = $payload->to ?? '';
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
            $entityManager->saveEntity($msgEntity);
        }

        return ['success' => true];
    }
}
