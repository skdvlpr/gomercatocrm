<?php
namespace Espo\Custom\Services;

use Aws\S3\S3Client;
use Espo\Custom\Contracts\Uploadable;

class MinioService
{
    private S3Client $client;

    public function __construct()
    {
        $this->client = new S3Client([
            'version' => 'latest',
            'region' => getenv('MINIO_REGION') ?: 'eu-central-1',
            'endpoint' => getenv('MINIO_ENDPOINT'),
            'use_path_style_endpoint' => true,
            'credentials' => [
                'key' => getenv('MINIO_ACCESS_KEY'),
                'secret' => getenv('MINIO_SECRET_KEY'),
            ],
        ]);
    }


    /**
     * Carica un file su MinIO, ritorna la object key.
     */
    public function upload(Uploadable $entity, string $localFilePath, string $filename): string
    {
        $key = $entity->getObjectKey() . '/' . $filename;

        $this->client->putObject([
            'Bucket' => $entity->getBucketName(),
            'Key' => $key,
            'SourceFile' => $localFilePath,
            'ContentType' => mime_content_type($localFilePath),
        ]);

        return $key;
    }

    /**
     * Ritorna URL presigned valido $expirySeconds secondi.
     */
    public function getPresignedUrl(string $bucket, string $key, int $expirySeconds = 3600): string
    {
        $cmd = $this->client->getCommand('GetObject', [
            'Bucket' => $bucket,
            'Key' => $key,
        ]);

        return (string) $this->client
            ->createPresignedRequest($cmd, "+{$expirySeconds} seconds")
            ->getUri();
    }

    /**
     * Elimina un oggetto da MinIO.
     */
    public function delete(string $bucket, string $key): bool
    {
        $this->client->deleteObject([
            'Bucket' => $bucket,
            'Key' => $key,
        ]);
        return true;
    }
}