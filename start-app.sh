#!/bin/bash

# Build the client
echo "Building client..."
npx vite build client

# Start the server
echo "Starting server..."
node --require esbuild-register server/index.ts