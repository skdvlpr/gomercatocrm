<?php
include 'bootstrap.php';

$app = new \Espo\Core\Application();
$container = $app->getContainer();
$configWriter = $container->get('configWriter');

echo "Enabling WhatsApp widget...\n";
$configWriter->set('whatsappEnabled', true);
$configWriter->save();
echo "Done.\n";
