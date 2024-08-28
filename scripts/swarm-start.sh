#!/bin/bash

# Author: ganesh_bhagi

set -e

IMAGE_NAME="bitcoin-streamer"
API_SERVICE_NAME="bitcoin-streamer-service"
# AWS_CREDENTIALS_PATH="$(pwd)/aws_credentials"
ENV_PATH="$(pwd)/.env"

service_exists() {
    docker service ls | grep -q "$1"
}

validate_dir_path() {
    if [ ! -d "$1" ]; then
        echo "$1 directory not found. Please create and retry."
        exit 1
    fi
}

validate_file_path() {
    if [ ! -f "$1" ]; then
        echo "$1 file not found. Please create and retry."
        exit 1
    fi
}

# if validate_dir_path "$AWS_CREDENTIALS_PATH"; then
#     echo "AWS credentials path found"
# fi

if validate_file_path "$ENV_PATH"; then
    echo "ENV file found"
fi

if service_exists $API_SERVICE_NAME; then
    echo "Removing existing $API_SERVICE_NAME service..."
    docker service rm $API_SERVICE_NAME
fi

echo "Building new $IMAGE_NAME image..."
docker build -t $IMAGE_NAME -t $IMAGE_NAME:latest .

echo "Creating $API_SERVICE_NAME service"
docker service create \
    --name $API_SERVICE_NAME \
    --restart-condition on-failure \
    --restart-delay 10s \
    --limit-cpu 2 \
    --restart-max-attempts 1 \
    --env-file "$ENV_PATH" \
    -p 8903:8903 \
    --host "host.docker.internal:host-gateway" \
    $IMAGE_NAME

echo "$API_SERVICE_NAME service created successfully."
