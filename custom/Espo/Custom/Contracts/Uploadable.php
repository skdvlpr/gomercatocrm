<?php
namespace Espo\Custom\Contracts;

/**
 * Interface Uploadable
 * Implement this interface in all entities that need to upload files to an S3 compatible storage (MinIO)
 */
interface Uploadable
{
    public function getBucketName(): string;
    public function getObjectKey(): string;
    public function getAllowedMimeTypes(): array;
    public function getMaxFileSizeMb(): int;
}