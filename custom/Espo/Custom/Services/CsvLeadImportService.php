<?php

namespace Espo\Custom\Services;

use Espo\ORM\EntityManager;
use Espo\ORM\Entity;
use Espo\Core\Utils\Log;
use Espo\Core\Record\ServiceContainer;
use Espo\Modules\Crm\Entities\Lead;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;
use RuntimeException;
use Throwable;

/**
 * Service for importing leads from CSV URLs.
 */
class CsvLeadImportService
{
    /**
     * Default mapping from common CSV column names to Lead fields.
     */
    private const DEFAULT_FIELD_MAPPING = [
        // Name fields
        'firstname' => 'firstName',
        'first_name' => 'firstName',
        'first name' => 'firstName',
        'lastname' => 'lastName',
        'last_name' => 'lastName',
        'last name' => 'lastName',
        'name' => 'name',
        'fullname' => 'name',
        'full_name' => 'name',
        'full name' => 'name',
        
        // Contact fields
        'email' => 'emailAddress',
        'emailaddress' => 'emailAddress',
        'email_address' => 'emailAddress',
        'e-mail' => 'emailAddress',
        'phone' => 'phoneNumber',
        'phonenumber' => 'phoneNumber',
        'phone_number' => 'phoneNumber',
        'telephone' => 'phoneNumber',
        'mobile' => 'phoneNumber',
        
        // Company fields
        'company' => 'accountName',
        'companyname' => 'accountName',
        'company_name' => 'accountName',
        'company name' => 'accountName',
        'accountname' => 'accountName',
        'account_name' => 'accountName',
        'account name' => 'accountName',
        'organization' => 'accountName',
        
        // Job fields
        'title' => 'title',
        'jobtitle' => 'title',
        'job_title' => 'title',
        'job title' => 'title',
        'position' => 'title',
        
        // Address fields
        'website' => 'website',
        'url' => 'website',
        'address' => 'addressStreet',
        'street' => 'addressStreet',
        'addressstreet' => 'addressStreet',
        'address_street' => 'addressStreet',
        'city' => 'addressCity',
        'addresscity' => 'addressCity',
        'address_city' => 'addressCity',
        'state' => 'addressState',
        'addressstate' => 'addressState',
        'address_state' => 'addressState',
        'country' => 'addressCountry',
        'addresscountry' => 'addressCountry',
        'address_country' => 'addressCountry',
        'postalcode' => 'addressPostalCode',
        'postal_code' => 'addressPostalCode',
        'postal code' => 'addressPostalCode',
        'zip' => 'addressPostalCode',
        'zipcode' => 'addressPostalCode',
        'zip_code' => 'addressPostalCode',
        
        // Other fields
        'description' => 'description',
        'notes' => 'description',
        'comment' => 'description',
        'comments' => 'description',
        'industry' => 'industry',
        'source' => 'source',
        'leadsource' => 'source',
        'lead_source' => 'source',
    ];

    public function __construct(
        private EntityManager $entityManager,
        private ServiceContainer $serviceContainer,
        private Log $log
    ) {}

    /**
     * Process a single CsvLeadImport configuration.
     */
    public function processConfig(Entity $config): void
    {
        $csvUrl = $config->get('csvUrl');
        
        if (empty($csvUrl)) {
            throw new RuntimeException('CSV URL is empty');
        }

        $this->log->info('CsvLeadImportService: Starting import from URL: ' . $csvUrl);

        // Fetch CSV content
        $csvContent = $this->fetchCsv($csvUrl);
        
        $this->log->info('CsvLeadImportService: Fetched CSV content, length: ' . strlen($csvContent));
        
        // Parse CSV
        $rows = $this->parseCsv($csvContent);
        
        $this->log->info('CsvLeadImportService: Parsed ' . count($rows) . ' rows');
        
        if (empty($rows)) {
            $this->updateConfigStatus($config, 0, 'No rows found in CSV');
            return;
        }

        // Get headers if first row is header
        $headers = [];
        $dataStartIndex = 0;
        
        if ($config->get('firstRowIsHeader')) {
            $headers = array_map('trim', $rows[0]);
            $dataStartIndex = 1;
            $this->log->info('CsvLeadImportService: Headers: ' . implode(', ', $headers));
        }

        // Get field mapping
        $fieldMapping = $this->getFieldMapping($config, $headers);

        // Get last processed row (this is the index of last processed DATA row, 0-indexed relative to data rows)
        $lastProcessedRow = (int) $config->get('lastProcessedRow');
        
        // Calculate total data rows
        $totalDataRows = count($rows) - $dataStartIndex;
        
        $this->log->info('CsvLeadImportService: Total data rows: ' . $totalDataRows . ', Last processed: ' . $lastProcessedRow);
        
        // If we've already processed all rows, nothing to do
        if ($lastProcessedRow >= $totalDataRows) {
            $this->log->info('CsvLeadImportService: All rows already processed');
            $this->updateConfigStatus($config, 0, null);
            return;
        }

        // Process new rows
        $importedCount = 0;
        $skippedCount = 0;
        $errorCount = 0;
        $errors = [];

        for ($i = $lastProcessedRow; $i < $totalDataRows; $i++) {
            $rowIndex = $dataStartIndex + $i;
            $row = $rows[$rowIndex];
            
            try {
                $result = $this->processRow($row, $headers, $fieldMapping, $config);
                
                if ($result === true) {
                    $importedCount++;
                } else {
                    $skippedCount++;
                }
            } catch (Throwable $e) {
                $errorCount++;
                $errors[] = "Row " . ($i + 1) . ": " . $e->getMessage();
                $this->log->warning(
                    'CsvLeadImportService: Failed to process row ' . ($i + 1) . 
                    ': ' . $e->getMessage()
                );
            }
        }

        // Update config with new status
        $totalImported = (int) $config->get('leadsImportedCount') + $importedCount;
        $config->set('lastProcessedRow', $totalDataRows);
        $config->set('leadsImportedCount', $totalImported);
        
        $errorMessage = null;
        if (!empty($errors)) {
            $errorMessage = implode("; ", array_slice($errors, 0, 5)); // Limit to 5 errors
            if (count($errors) > 5) {
                $errorMessage .= " (and " . (count($errors) - 5) . " more errors)";
            }
        }
        
        $this->updateConfigStatus($config, $importedCount, $errorMessage);

        $this->log->info(
            'CsvLeadImportService: Finished processing config ' . $config->getId() . 
            '. Imported: ' . $importedCount . ', Skipped: ' . $skippedCount . ', Errors: ' . $errorCount
        );
    }

    /**
     * Fetch CSV content from URL.
     */
    private function fetchCsv(string $url): string
    {
        $client = new Client([
            'timeout' => 30,
            'connect_timeout' => 10,
            'verify' => false, // Allow self-signed certificates
        ]);

        try {
            $response = $client->get($url);
            return (string) $response->getBody();
        } catch (GuzzleException $e) {
            throw new RuntimeException('Failed to fetch CSV: ' . $e->getMessage());
        }
    }

    /**
     * Parse CSV content into array of rows.
     */
    private function parseCsv(string $content): array
    {
        $rows = [];
        
        // Handle different line endings
        $content = str_replace(["\r\n", "\r"], "\n", $content);
        $lines = explode("\n", $content);
        
        foreach ($lines as $line) {
            $line = trim($line);
            
            if (empty($line)) {
                continue;
            }
            
            // Parse CSV line (handles quoted fields)
            $row = str_getcsv($line);
            
            if (!empty($row)) {
                $rows[] = $row;
            }
        }
        
        return $rows;
    }

    /**
     * Get field mapping for this config.
     */
    private function getFieldMapping(Entity $config, array $headers): array
    {
        // Check for custom mapping
        $customMapping = $config->get('fieldMapping');
        
        if (!empty($customMapping) && is_array($customMapping)) {
            return $customMapping;
        }

        // Use default mapping if enabled
        if ($config->get('defaultFieldMapping')) {
            return self::DEFAULT_FIELD_MAPPING;
        }

        // No mapping - use headers as-is (if they match Lead fields)
        $mapping = [];
        foreach ($headers as $header) {
            $mapping[$header] = $header;
        }
        
        return $mapping;
    }

    /**
     * Process a single CSV row and create a Lead if needed.
     */
    private function processRow(
        array $row,
        array $headers,
        array $fieldMapping,
        Entity $config
    ): bool {
        // Map row data to Lead fields
        $leadData = $this->mapRowToLeadData($row, $headers, $fieldMapping);
        
        if (empty($leadData)) {
            return false;
        }

        // Apply config settings
        if ($config->get('assignedUserId')) {
            $leadData['assignedUserId'] = $config->get('assignedUserId');
        }
        
        if ($config->get('teamId')) {
            $leadData['teamsIds'] = [$config->get('teamId')];
        }
        
        if ($config->get('leadSource')) {
            $leadData['source'] = $config->get('leadSource');
        }

        // Check for duplicates
        if ($config->get('skipDuplicates')) {
            $duplicateCheckFields = $config->get('duplicateCheckFields') ?? ['emailAddress'];
            
            if ($this->isDuplicate($leadData, $duplicateCheckFields)) {
                return false;
            }
        }

        // Create Lead
        return $this->createLead($leadData);
    }

    /**
     * Map CSV row data to Lead field data.
     */
    private function mapRowToLeadData(array $row, array $headers, array $fieldMapping): array
    {
        $leadData = [];
        
        foreach ($row as $index => $value) {
            $value = trim($value);
            
            if (empty($value)) {
                continue;
            }

            // Get column name (from headers or by index)
            $columnName = isset($headers[$index]) ? $headers[$index] : "column_$index";
            $columnNameLower = strtolower(trim($columnName));
            
            // Find the Lead field for this column
            $leadField = null;
            
            // Check exact match first
            if (isset($fieldMapping[$columnName])) {
                $leadField = $fieldMapping[$columnName];
            } elseif (isset($fieldMapping[$columnNameLower])) {
                $leadField = $fieldMapping[$columnNameLower];
            } else {
                // Check lowercase mapping
                foreach ($fieldMapping as $mapKey => $mapValue) {
                    if (strtolower($mapKey) === $columnNameLower) {
                        $leadField = $mapValue;
                        break;
                    }
                }
            }
            
            if ($leadField) {
                $leadData[$leadField] = $value;
            }
        }

        // Handle special case: if we have 'name' but not firstName/lastName, try to split
        if (isset($leadData['name']) && !isset($leadData['firstName']) && !isset($leadData['lastName'])) {
            $nameParts = explode(' ', $leadData['name'], 2);
            $leadData['firstName'] = $nameParts[0];
            $leadData['lastName'] = $nameParts[1] ?? '';
            unset($leadData['name']);
        }

        return $leadData;
    }

    /**
     * Check if a lead with matching data already exists.
     */
    private function isDuplicate(array $leadData, array $checkFields): bool
    {
        $where = [];
        
        foreach ($checkFields as $field) {
            if (isset($leadData[$field]) && !empty($leadData[$field])) {
                $where[$field] = $leadData[$field];
            }
        }
        
        if (empty($where)) {
            return false;
        }

        $existingLead = $this->entityManager
            ->getRDBRepository('Lead')
            ->where($where)
            ->findOne();

        return $existingLead !== null;
    }

    /**
     * Create a new Lead entity.
     */
    private function createLead(array $data): bool
    {
        try {
            $lead = $this->entityManager->getNewEntity('Lead');
            
            foreach ($data as $field => $value) {
                $lead->set($field, $value);
            }
            
            // Set default status if not provided
            if (!$lead->get('status')) {
                $lead->set('status', 'New');
            }
            
            $this->entityManager->saveEntity($lead);
            
            return true;
        } catch (Throwable $e) {
            $this->log->error(
                'CsvLeadImportService: Failed to create lead: ' . $e->getMessage(),
                ['data' => $data]
            );
            return false;
        }
    }

    /**
     * Update config status after processing.
     */
    private function updateConfigStatus(Entity $config, int $importedCount, ?string $error): void
    {
        $config->set('lastRunAt', date('Y-m-d H:i:s'));
        $config->set('lastError', $error);
        
        $this->entityManager->saveEntity($config);
    }

    /**
     * Run import for a specific config (for manual trigger).
     */
    public function runManualImport(string $configId): array
    {
        $config = $this->entityManager->getEntityById('CsvLeadImport', $configId);
        
        if (!$config) {
            throw new RuntimeException('Config not found');
        }

        $previousCount = (int) $config->get('leadsImportedCount');
        
        $this->processConfig($config);
        
        $config = $this->entityManager->getEntityById('CsvLeadImport', $configId);
        $newCount = (int) $config->get('leadsImportedCount');
        
        return [
            'success' => true,
            'imported' => $newCount - $previousCount,
            'total' => $newCount,
        ];
    }

    /**
     * Reset the processed row counter for a config.
     */
    public function resetCounter(string $configId): void
    {
        $config = $this->entityManager->getEntityById('CsvLeadImport', $configId);
        
        if (!$config) {
            throw new RuntimeException('Config not found');
        }

        $config->set('lastProcessedRow', 0);
        $config->set('leadsImportedCount', 0);
        $config->set('lastError', null);
        
        $this->entityManager->saveEntity($config);
    }
}
