#!/bin/bash
cd /media/ibrahim/New\ Volume/Projects/Contech-IoT-Server
while true; do
  node server.js
  echo "Server exited, restarting in 5 seconds..."
  sleep 5
done
