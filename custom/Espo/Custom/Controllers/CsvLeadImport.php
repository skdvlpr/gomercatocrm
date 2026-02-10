<?php

namespace Espo\Custom\Controllers;

use Espo\Core\Api\Request;
use Espo\Core\Api\Response;
use Espo\Core\Controllers\Record;
use Espo\Core\Exceptions\BadRequest;
use Espo\Core\Exceptions\Forbidden;
use Espo\Core\Exceptions\NotFound;
use Espo\Custom\Services\CsvLeadImportService;

class CsvLeadImport extends Record
{
    /**
     * POST CsvLeadImport/{id}/runImport
     * Manually trigger import for a specific config.
     */
    public function postActionRunImport(Request $request, Response $response): array
    {
        try {
            $id = $request->getRouteParam('id');

            if (!$id) {
                throw new BadRequest('ID is required');
            }

            $entityManager = $this->getEntityManager();
            $entity = $entityManager->getEntity('CsvLeadImport', $id);

            if (!$entity) {
                throw new NotFound();
            }

            if (!$this->acl->checkEntityEdit($entity)) {
                throw new Forbidden();
            }

            /** @var CsvLeadImportService $service */
            $service = $this->injectableFactory->create(CsvLeadImportService::class);

            return $service->runManualImport($id);
        }
        catch (\Throwable $e) {
            throw new BadRequest('Error running import: ' . $e->getMessage());
        }
    }

    /**
     * POST CsvLeadImport/{id}/resetCounter
     * Reset the processed row counter.
     */
    public function postActionResetCounter(Request $request, Response $response): bool
    {
        try {
            $id = $request->getRouteParam('id');

            if (!$id) {
                throw new BadRequest('ID is required');
            }

            $entityManager = $this->getEntityManager();
            $entity = $entityManager->getEntity('CsvLeadImport', $id);

            if (!$entity) {
                throw new NotFound();
            }

            if (!$this->acl->checkEntityEdit($entity)) {
                throw new Forbidden();
            }

            /** @var CsvLeadImportService $service */
            $service = $this->injectableFactory->create(CsvLeadImportService::class);

            $service->resetCounter($id);

            return true;
        }
        catch (\Throwable $e) {
            throw new BadRequest('Error resetting counter: ' . $e->getMessage());
        }
    }
}