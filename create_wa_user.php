<?php
include 'bootstrap.php';

$app = new \Espo\Core\Application();
$container = $app->getContainer();
$entityManager = $container->get('entityManager');

$username = 'whatsapp-bot';
$apiKey = 'espocrm-secret-key';

echo "Checking for user '$username'...\n";
$user = $entityManager->getRepository('User')->where(['userName' => $username])->findOne();

if (!$user) {
    echo "Creating user '$username'...\n";
    $user = $entityManager->getEntity('User');
    $user->set('userName', $username);
    $user->set('type', 'api');
    $user->set('isActive', true);
    // Set a dummy password or allow without for API type? API type users usually don't login via UI.
    // EspoCRM requires password for some user types, but API user relies on Key.
    $entityManager->saveEntity($user);
    echo "User created. ID: " . $user->id . "\n";
} else {
    echo "User exists. ID: " . $user->id . "\n";
}

echo "Checking for API Key...\n";
$key = $entityManager->getRepository('ApiKey')->where(['apiKey' => $apiKey])->findOne();

if (!$key) {
    echo "Creating API Key...\n";
    $key = $entityManager->getEntity('ApiKey');
    $key->set('apiKey', $apiKey);
    $key->set('userId', $user->id);
    $key->set('isActive', true);
    $entityManager->saveEntity($key);
    echo "API Key created.\n";
} else {
    echo "API Key exists.\n";
    if ($key->get('userId') !== $user->id) {
        echo "Updating API Key user link...\n";
        $key->set('userId', $user->id);
        $entityManager->saveEntity($key);
    }
}

echo "Done.\n";
