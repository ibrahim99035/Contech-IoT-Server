#!/bin/bash
# Setup SSH tunnels to production services
# Run this before starting the local server

echo "========================================"
echo "Setting up SSH tunnels to production"
echo "========================================"
echo ""

# Check if SSH key exists
if [ ! -f ~/.ssh/id_rsa ] && [ ! -f ~/.ssh/id_ed25519 ]; then
    echo "⚠️ No SSH key found. You may need to enter password for each tunnel."
fi

# Kill existing tunnels
echo "Cleaning up existing tunnels..."
pkill -f "ssh.*-L 27017" 2>/dev/null || true
pkill -f "ssh.*-L 6380" 2>/dev/null || true  
pkill -f "ssh.*-L 1884" 2>/dev/null || true
sleep 1

# Create tunnels
echo "Creating SSH tunnels to 88.222.220.235..."
echo ""

# MongoDB tunnel
echo "🔄 MongoDB tunnel (localhost:27017 -> production:27017)..."
ssh -o StrictHostKeyChecking=no -L 27017:127.0.0.1:27017 -N -f root@88.222.220.235 2>&1 && \
    echo "   ✅ MongoDB tunnel established" || \
    echo "   ❌ MongoDB tunnel failed (may need password)"

sleep 1

# Redis tunnel
echo "🔄 Redis tunnel (localhost:6380 -> production:6380)..."
ssh -o StrictHostKeyChecking=no -L 6380:127.0.0.1:6380 -N -f root@88.222.220.235 2>&1 && \
    echo "   ✅ Redis tunnel established" || \
    echo "   ❌ Redis tunnel failed"

sleep 1

# MQTT tunnel
echo "🔄 MQTT tunnel (localhost:1884 -> production:1884)..."
ssh -o StrictHostKeyChecking=no -L 1884:127.0.0.1:1884 -N -f root@88.222.220.235 2>&1 && \
    echo "   ✅ MQTT tunnel established" || \
    echo "   ❌ MQTT tunnel failed"

echo ""
echo "========================================"
echo "Verifying tunnels..."
echo "========================================"
echo ""

# Verify tunnels
sleep 2

check_port() {
    local port=$1
    local name=$2
    if nc -z -w 2 localhost $port 2>/dev/null; then
        echo "✅ $name: Port $port is accessible"
        return 0
    else
        echo "❌ $name: Port $port is NOT accessible"
        return 1
    fi
}

check_port 27017 "MongoDB"
check_port 6380 "Redis"
check_port 1884 "MQTT"

echo ""
echo "Tunnels setup complete!"
echo "You can now run: ./start_local.sh"
echo ""
