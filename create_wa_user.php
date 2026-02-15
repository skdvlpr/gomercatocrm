<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

include 'bootstrap.php';

try {
    $app = new \Espo\Core\Application();
    $container = $app->getContainer();
    $entityManager = $container->get('entityManager');

    // 2. Create User
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
        $entityManager->saveEntity($user);
        echo "User created. ID: " . $user->id . "\n";
    } else {
        echo "User exists. ID: " . $user->id . "\n";
    }

    // 3. Create Key
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

} catch (\Throwable $e) {
    echo "Error: " . $e->getMessage() . "\n" . $e->getTraceAsString() . "\n";
    exit(1);
}
