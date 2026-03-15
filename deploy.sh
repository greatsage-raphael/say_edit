#!/bin/bash

# 1. SET THESE VALUES
PROJECT_ID="gen-lang-client-0125303344"
REGION="us-central1"
SERVICE_NAME="glyph-client"

# 2. THE KEYS VITE NEEDS
# Use the backend URL from your previous successful deploy
BACKEND_URL="https://glyph-server-229364276486.us-central1.run.app"
GEMINI_KEY="AIzaSyBdTqSjLf95GK_99UQjzk2PnfrZxUk9ZgA" # Put your real key here

echo "Step 1: Building and Deploying Frontend..."

# We use --set-build-env-vars to pass keys into the Docker build process
gcloud run deploy $SERVICE_NAME \
  --source . \
  --region $REGION \
  --project $PROJECT_ID \
  --allow-unauthenticated \
  --set-build-env-vars "VITE_BACKEND_URL=$BACKEND_URL,VITE_GEMINI_API_KEY=$GEMINI_KEY"

echo "DONE!"