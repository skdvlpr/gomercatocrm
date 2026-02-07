<?php

namespace Espo\Custom\Classes\Jobs;

use Espo\Core\Job\JobDataLess;
use Espo\ORM\EntityManager;
use Espo\Core\Utils\Log;
use Espo\Custom\Services\CsvLeadImportService;
use Throwable;

/**
 * Scheduled job to import leads from CSV URLs.
 * Processes all active CsvLeadImport configurations.
 */
class ImportLeadsFromCsv implements JobDataLess
{
    public function __construct(
        private EntityManager $entityManager,
        private CsvLeadImportService $importService,
        private Log $log
    ) {}

    public function run(): void
    {
        $configs = $this->entityManager
            ->getRDBRepository('CsvLeadImport')
            ->where(['isActive' => true])
            ->find();

        foreach ($configs as $config) {
            try {
                $this->importService->processConfig($config);
            } catch (Throwable $e) {
                $this->log->error(
                    'ImportLeadsFromCsv: Failed to process config ' . 
                    $config->getId() . ': ' . $e->getMessage(),
                    ['exception' => $e]
                );

                // Save error to config
                $config->set('lastError', $e->getMessage());
                $config->set('lastRunAt', date('Y-m-d H:i:s'));
                $this->entityManager->saveEntity($config);
            }
        }
    }
}
