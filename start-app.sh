#!/bin/bash
# Start the server in the background
./start-server.sh &
SERVER_PID=$!

# Add a trap to kill the server process when this script exits
trap "kill $SERVER_PID" EXIT

# Wait for server to start
echo "Starting server..."
sleep 2

# Keep the script running
echo "Server running with PID $SERVER_PID"
echo "Press Ctrl+C to stop the server"
wait $SERVER_PID