#!/bin/bash

# bash setup_secrets.sh --app-name bitcoin-streamer-two --project-name router-mainnet-api --region asia-south1 --kube-cluster mainnet-tools --kube-namespace bitcoin-streamer

set -e

# Function to prompt user for input with a default option to exit
function prompt_for_input() {
    local prompt_message="$1"
    local input_variable
    read -p "$prompt_message : " input_variable
    echo "$input_variable"
}

# Function to ask for Yes/No input
function prompt_for_yes_no() {
    local prompt_message="$1"
    while true; do
        read -p "$prompt_message (yes/no): " yn
        case $yn in
        [Yy]*)
            echo "yes"
            return
            ;;
        [Nn]*)
            echo "no"
            return
            ;;
        *) echo "Please answer yes or no." ;;
        esac
    done
}

function create_kube_secret() {
    local project_name="$1"
    local region="$2"
    local kube_cluster="$3"
    local kube_namespace="$4"
    local secret_name="$5"
    local secret_file="$6"

    gcloud config set project "$project_name"
    gcloud container clusters get-credentials "$kube_cluster" --region "$region" --project "$project_name"

    kubectl create secret generic "$secret_name" \
        --namespace "$kube_namespace" \
        --from-file="$secret_file" \
        --dry-run=client \
        -o yaml | kubectl apply -f -
}

function namespace_exists() {
    local namespace="$1"
    kubectl get namespace "$namespace" &>/dev/null
    return $?
}

# Function to create a Kubernetes namespace if it does not exist
function create_namespace_if_not_exists() {
    local namespace="$1"
    echo "check if namespace '$namespace' exists"
    if namespace_exists "$namespace"; then
        echo "Namespace '$namespace' already exists."
    else
        kubectl create namespace "$namespace"
        echo "Namespace '$namespace' created."
    fi
}

function show_help() {
    echo "Usage: $0 --app-name nitro-frames-server --project-name router-testnet-api --region asia-south1 \
    --kube-cluster router-testnet-cluster --kube-namespace nitro-events-indexer"
    echo "./infra/scripts/setup_secrets.sh --app-name nitro-frames-server --project-name router-testnet-api \
    --region asia-south1 --kube-cluster router-testnet-cluster --kube-namespace nitro-events-indexer"
    exit 0
}

SCRIPT_DIR=$(dirname "$0")

while [[ "$#" -gt 0 ]]; do
    case $1 in
    --app-name)
        APP_NAME="$2"
        shift
        ;;
    --project-name)
        PROJECT_NAME="$2"
        shift
        ;;
    --region)
        REGION="$2"
        shift
        ;;
    --kube-cluster)
        KUBE_CLUSTER="$2"
        shift
        ;;
    --kube-namespace)
        KUBE_NAMESPACE="$2"
        shift
        ;;
    --help) show_help ;;
    *)
        echo "Unknown parameter passed: $1"
        show_help
        ;;
    esac
    shift
done

if [ -z "$APP_NAME" ] || [ -z "$PROJECT_NAME" ] || [ -z "$REGION" ] || [ -z "$KUBE_CLUSTER" ] || [ -z "$KUBE_NAMESPACE" ]; then
    echo "Error: Missing required arguments."
    show_help
fi

gcloud config set project "$PROJECT_NAME"
gcloud container clusters get-credentials $KUBE_CLUSTER --region $REGION --project $PROJECT_NAME

create_namespace_if_not_exists "$KUBE_NAMESPACE"
echo "using kube namespace $KUBE_NAMESPACE"

while true; do
    # Prompt user for input
    SECRET_NAME=$(prompt_for_input "Enter the secret name ('$APP_NAME-' is prefixed to this)")
    SECRET_FILE=$(prompt_for_input "Enter the path to the secret file")
    CREATE_PUBSUB=$(prompt_for_yes_no "Do you want to create a Pub/Sub topic and subscription?")

    SECRET_NAME="$APP_NAME-$SECRET_NAME"
    # Display the entered information
    echo "Secret Name: $SECRET_NAME"
    echo "Secret File: $SECRET_FILE"

    # Call create_kube_secret function
    create_kube_secret "$PROJECT_NAME" "$REGION" "$KUBE_CLUSTER" "$KUBE_NAMESPACE" "$SECRET_NAME" "$SECRET_FILE"

    bash "$SCRIPT_DIR/update_gcp_secret_value.sh" "$APP_NAME" "$SECRET_NAME" "$SECRET_FILE" "$CREATE_PUBSUB"

    # Ask if the user wants to create another secret
    CREATE_ANOTHER=$(prompt_for_yes_no "Do you want to create another secret?")
    if [[ "$CREATE_ANOTHER" == "no" ]]; then
        echo "Exiting..."
        break
    fi
done
