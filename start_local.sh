#!/bin/bash
# Start Contech IoT Server with production services via SSH tunnel
# Ensure SSH tunnels are running: ./setup_tunnels.sh

cd /media/ibrahim/New\ Volume/Projects/Contech-IoT-Server

echo "============================================"
echo "Starting Contech IoT Server"
echo "============================================"
echo ""
echo "Connecting to production services via SSH tunnel:"
echo "  • MongoDB:  127.0.0.1:27017"
echo "  • Redis:    127.0.0.1:6380"
echo "  • MQTT:     127.0.0.1:1884"
echo ""

# Kill any existing server
pkill -f "node server.js" 2>/dev/null || true
sleep 1

# Start server in background with proper environment
export PORT=5000
export NODE_ENV=development

nohup node server.js > /tmp/contech-server.log 2>&1 &
SERVER_PID=$!

echo $SERVER_PID > /tmp/contech-server.pid
echo "Server PID: $SERVER_PID"
echo ""
echo "Waiting for server to start..."

# Poll for server readiness
for i in {1..40}; do
    if curl -s http://localhost:5000/health > /dev/null 2>&1; then
        echo ""
        echo "✅ Server is RUNNING on http://localhost:5000"
        echo ""
        echo "Health Check Response:"
        curl -s http://localhost:5000/health | python3 -m json.tool 2>/dev/null || curl -s http://localhost:5000/health
        echo ""
        echo "Server Logs (last 15 lines):"
        echo "--------------------------------"
        tail -15 /tmp/contech-server.log
        echo "--------------------------------"
        echo ""
        echo "📍 Quick Access:"
        echo "   • API Docs:     http://localhost:5000/api-docs"
        echo "   • AdminJS:      http://localhost:5000/admin"
        echo "   • Health:       http://localhost:5000/health"
        echo ""
        echo "🔑 Admin Credentials:"
        echo "   • Email:  admin@contech.local"
        echo "   • Password: Admin@123456"
        echo ""
        echo "📋 To test API:"
        echo "   • Import api-collection-part1-auth.json into Bruno/Yaak"
        echo "   • Login with admin credentials"
        echo "   • Copy token to use in other requests"
        echo ""
        echo "📝 To view logs: tail -f /tmp/contech-server.log"
        echo "⏹️  To stop:    kill $(cat /tmp/contech-server.pid)"
        exit 0
    fi
    sleep 1
done

echo ""
echo "⚠️ Server may still be starting..."
echo "Check logs: tail -f /tmp/contech-server.log"
exit 1
