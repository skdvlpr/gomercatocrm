<?php
namespace Espo\Custom\Hooks\Lead;

use Espo\Core\Hook\Hook\AfterSave;
use Espo\ORM\Entity;
use Espo\ORM\Repository\Option\SaveOptions;
use Espo\Custom\Core\WhatsApp\WhatsAppClient;
use Espo\Core\Utils\Config;
use Espo\Core\Utils\Log;
use Espo\Core\Container;
use Espo\Core\WebSocket\Submission as WebSocketSubmission;

class WhatsAppNotification implements AfterSave
{
    private WhatsAppClient $whatsappClient;
    private Config $config;
    private Log $log;
    private Container $container;

    public function __construct(
        WhatsAppClient $whatsappClient,
        Config $config,
        Log $log,
        Container $container
    ) {
        $this->whatsappClient = $whatsappClient;
        $this->config = $config;
        $this->log = $log;
        $this->container = $container;
    }

    public function afterSave(Entity $entity, SaveOptions $options): void
    {
        if (!$entity->isNew()) {
            return;
        }

        if (!$this->config->get('whatsappAutoMessageEnabled')) {
            return;
        }

        $phoneNumber = $entity->get('phoneNumber');
        if (!$phoneNumber) {
            $this->log->info('WhatsAppNotification: Lead has no phone number', ['leadId' => $entity->getId()]);
            return;
        }

        // Check if session is authenticated before trying to send
        // Note: checking status might add latency, optimize if needed
        $status = $this->whatsappClient->getSessionStatus();
        if ($status !== 'authenticated') {
            $this->log->warning('WhatsAppNotification: Session not authenticated, skipping auto-message.');
            return;
        }

        $message = $this->getMessageTemplate($entity);

        try {
            $sent = $this->whatsappClient->sendMessage($phoneNumber, $message);

            if ($sent) {
                $this->log->info('WhatsAppNotification: Message sent', [
                    'leadId' => $entity->getId(),
                    'phone' => $phoneNumber
                ]);

                // Publish via WebSocket
                try {
                    if ($this->container->has(WebSocketSubmission::class)) {
                        /** @var WebSocketSubmission $ws */
                        $ws = $this->container->get(WebSocketSubmission::class);
                        $ws->submit('WhatsApp', null, [
                            'action' => 'message',
                            'data' => [
                                'body' => $message,
                                'chatId' => $phoneNumber,
                                // 'messageId' => uniqid('auto_'),
                                'fromMe' => true,
                                'timestamp' => date('Y-m-d H:i:s'),
                                'status' => 'Sent'
                            ]
                        ]);
                    }
                } catch (\Throwable $e) {
                    $this->log->error('WhatsAppNotification WebSocket Error: ' . $e->getMessage());
                }
            } else {
                $this->log->warning('WhatsAppNotification: Failed to send message', [
                    'leadId' => $entity->getId()
                ]);
            }
        } catch (\Exception $e) {
            $this->log->error('WhatsAppNotification: Error sending message', [
                'error' => $e->getMessage(),
                'leadId' => $entity->getId()
            ]);
        }
    }

    private function getMessageTemplate(Entity $lead): string
    {
        $template = $this->config->get('whatsappLeadTemplate');

        if (empty($template)) {
            $template = 'Ciao {name}! Grazie per il tuo interesse. Ti contatteremo presto.';
        }

        $placeholders = [
            '{name}' => $lead->get('firstName') ?? $lead->get('name') ?? 'Cliente',
            '{company}' => $lead->get('accountName') ?? '',
            '{source}' => $lead->get('source') ?? ''
        ];

        return str_replace(array_keys($placeholders), array_values($placeholders), $template);
    }
}
