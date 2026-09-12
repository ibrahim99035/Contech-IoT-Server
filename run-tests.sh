#!/bin/bash
# Run idempotent API tests for Contech IoT Server
# Usage: ./run-tests.sh [--cleanup]

echo "========================================"
echo "Contech IoT Server - API Test Runner"
echo "========================================"
echo ""

# Check if server is running
if ! curl -s http://localhost:5000/health > /dev/null 2>&1; then
    echo "❌ Server is not running on port 5000"
    echo "Start it with: cd /media/ibrahim/New\\ Volume/Projects/Contech-IoT-Server && node server.js &"
    exit 1
fi

echo "✅ Server is running"
echo ""

# Run the test script
node test-idempotent.js "$@"

echo ""
echo "========================================"
echo "Test execution complete"
echo "========================================"
