#!/bin/bash

# Usage: ./update_gcp_secret_value.sh <app-name> <secret-name> <secret-file>
# The script checks if the secret exists, and either creates it or adds a new version.

if [ "$#" -ne 4 ]; then
    echo "Usage: $0 <app-name> <secret-name> <secret-file> <create-pubsub>"
    exit 1
fi

APP_NAME="$1"
SECRET_NAME=$2
SECRET_FILE=$3
CREATE_PUBSUB=$4

if [ ! -f "$SECRET_FILE" ]; then
    echo "Error: File '$SECRET_FILE' not found."
    exit 1
fi

# Check if the secret already exists
if gcloud secrets describe "$SECRET_NAME" --quiet 2>/dev/null; then
    echo "Secret '$SECRET_NAME' already exists. Adding a new version..."
else
    SCRIPT_DIR=$(dirname "$0")
    echo "Secret '$SECRET_NAME' does not exist. Creating new secret..."
    # Create the secret with automatic replication policy
    bash "$SCRIPT_DIR/create_gcp_secret_with_pubsub.sh" "$APP_NAME" "$SECRET_NAME" "$CREATE_PUBSUB"
    echo "Secret created successfully."
fi

# Add a new version of the secret
gcloud secrets versions add "$SECRET_NAME" --data-file="$SECRET_FILE" --quiet
echo "New version added successfully."
