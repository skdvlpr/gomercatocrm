<?php
return [
    'database' => [
        'host' => 'db',
        'port' => '',
        'charset' => NULL,
        'dbname' => 'db',
        'user' => 'db',
        'password' => 'db',
        'platform' => 'Mysql'
    ],
    'smtpPassword' => NULL,
    'logger' => [
        'path' => 'data/logs/espo.log',
        'level' => 'WARNING',
        'rotation' => true,
        'maxFileNumber' => 30,
        'printTrace' => false,
        'databaseHandler' => false,
        'sql' => false,
        'sqlFailed' => false
    ],
    'restrictedMode' => false,
    'siteUrl' => 'https://gmcrm.ddev.site',
    'cleanupAppLog' => true,
    'cleanupAppLogPeriod' => '30 days',
    'webSocketMessager' => 'ZeroMQ',
    'clientSecurityHeadersDisabled' => false,
    'clientCspDisabled' => false,
    'clientCspScriptSourceList' => [
        0 => 'https://maps.googleapis.com'
    ],
    'adminUpgradeDisabled' => false,
    'isInstalled' => true,
    'microtimeInternal' => 1772201518.108263,
    'cryptKey' => 'b95f33a7a4efc698b8991bdeb116796b',
    'hashSecretKey' => 'c47ecdab09c175b4e2445a837b05ad14',
    'defaultPermissions' => [
        'user' => 1000,
        'group' => 1000
    ],
    'actualDatabaseType' => 'mariadb',
    'actualDatabaseVersion' => '11.8.6',
    'instanceId' => 'b37e663d-b416-49b7-ab08-5673afec5ccf'
];
