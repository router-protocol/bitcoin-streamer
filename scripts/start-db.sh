#!/bin/bash

# Author: Rahul

set -e

DB_IMAGE_NAME="mongo:6-jammy"
DB_SERVICE_NAME="bitcoin-streamer"
DB_VOLUME_PATH="$(pwd)/db-alpha"
ENV_PATH="$(pwd)/.env"

service_exists() {
    docker service ls | grep -q "$1"
}

validate_dir_path() {
    if [ ! -d "$1" ]; then
        echo "$1 directory not found. Creating directory..."
        mkdir -p "$1"
    fi
}

validate_file_path() {
    if [ ! -f "$1" ]; then
        echo "$1 file not found. Please create and retry."
        exit 1
    fi
}

validate_dir_path "$DB_VOLUME_PATH"  # Ensure directory exists or create it

if validate_file_path "$ENV_PATH"; then
    echo "ENV file found"
fi

if service_exists $DB_SERVICE_NAME; then
   echo "Removing existing $DB_SERVICE_NAME service..."
   docker service rm $DB_SERVICE_NAME
fi

echo "Creating $DB_SERVICE_NAME service"
if docker service create \
    --name $DB_SERVICE_NAME \
    --restart-condition on-failure \
    --restart-delay 10s \
    --limit-cpu 2 \
    --restart-max-attempts 1 \
    --env-file "$ENV_PATH" \
    -p 27015:27017 \
    --mount type=bind,source="$DB_VOLUME_PATH",target=/data/db \
    $DB_IMAGE_NAME; then
    echo "$DB_SERVICE_NAME service created successfully."
else
    echo "Failed to create $DB_SERVICE_NAME service."
fi
