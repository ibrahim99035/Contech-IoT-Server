# Socket.IO + MQTT Status-Switch Test Report

- Date: 2026-11-07T20:36:28.516Z
- Broker: mqtt://127.0.0.1:1895
- Mongo: mongodb://127.0.0.1:27019/contech_socket_mqtt_test
- Total: 128 | Passed: 128 | Failed: 0

## Results

✅ [mqtt: server client connected to the test broker] mqtt://127.0.0.1:1895
✅ [mqtt: observer subscribed to #] mqtt://127.0.0.1:1895

## Handshake rejection
✅ [user ns: no token rejected] Authentication failed: No token provided
✅ [user ns: bad token rejected] Authentication failed: Invalid or expired token
✅ [device ns: bad componentNumber rejected] Authentication failed: Device not found
✅ [room-esp ns: bad componentNumber rejected] Authentication failed: Device not found
✅ [mqtt-bridge ns: missing room password rejected] Authentication failed: Room password required.
✅ [mqtt-bridge ns: wrong room password rejected] Authentication failed: Invalid room password.
✅ [mqtt-bridge ns: invalid device order rejected] Authentication failed: Invalid Device Order (must be 1-6).

## Valid namespace connections
✅ [user ns: valid token connects] connected
✅ [user ns: second valid user connects] connected
✅ [room-user ns: valid token connects] connected
✅ [device ns: valid componentNumber connects] connected
✅ [room-esp ns: valid componentNumber connects] connected

## Initial state
✅ [user ns: device ESP status starts false] espConnected=false
✅ [room-user ns: room ESP status starts false] espConnected=false

## 1. /ws/user update-state
✅ [user update-state: DB persisted] status=on
✅ [user update-state: /ws/user echo] {"deviceId":"6aef8bbe226c867c894e7a0c","state":"on","updatedBy":"user","userId":"6aef8bbe226c867c894e79f6","roomId":"6aef8bbe226c867c894e7a08","espConnected":false}
✅ [user update-state: /ws/device command] {"deviceId":"6aef8bbe226c867c894e7a0c","state":"on","updatedBy":"user","userId":"6aef8bbe226c867c894e79f6"}
✅ [user update-state: /ws/room-user echo arrives] {"roomId":"6aef8bbe226c867c894e7a08","updates":[{"deviceId":"6aef8bbe226c867c894e7a0c","state":"on"}],"updatedBy":"user","userId":"6aef8bbe226c867c894e79f6"}
✅ [user update-state: MQTT device state published] {"state":"on","timestamp":"2026-11-07T20:36:16.042Z","updatedBy":"user","userId":"6aef8bbe226c867c894e79f6","echoId":"7bd9114e-bbbc-420c-8fee-48cba74d4db3"}
✅ [user update-state: MQTT ESP state-update published] {"deviceId":"6aef8bbe226c867c894e7a0c","deviceOrder":1,"state":"on","compactState":"11","timestamp":"2026-11-07T20:36:16.054Z"}
✅ [user update-state: exactly one /ws/user state-updated (no self-echo duplicate)] count=1
✅ [user update-state: exactly one MQTT ESP state-update (no duplicate command)] count=1

## 2. /ws/user update-state-mqtt
✅ [update-state-mqtt: ack sent] {"deviceId":"6aef8bbe226c867c894e7a0c","state":"on"}
✅ [update-state-mqtt: MQTT device state published] {"state":"on","timestamp":"2026-11-07T20:36:17.307Z","updatedBy":"user","userId":"6aef8bbe226c867c894e79f6"}
✅ [update-state-mqtt: DB updated through self-echo] status=on
✅ [update-state-mqtt: /ws/user state-updated from mqtt] {"deviceId":"6aef8bbe226c867c894e7a0c","state":"on","updatedBy":"mqtt"}
✅ [update-state-mqtt: ESP state-update published] {"deviceId":"6aef8bbe226c867c894e7a0c","deviceOrder":1,"state":"on","compactState":"11","timestamp":"2026-11-07T20:36:17.326Z"}
✅ [update-state-mqtt: exactly one MQTT ESP state-update] count=1

## 3. /ws/user update-room-devices-mqtt
✅ [update-room-devices-mqtt: ack sent] {"roomId":"6aef8bbe226c867c894e7a08","updatesCount":2}
✅ [update-room-devices-mqtt: MQTT room state published] {"updates":[{"deviceId":"6aef8bbe226c867c894e7a0c","state":"on"},{"deviceId":"6aef8bbe226c867c894e7a0f","state":"on"}],"timestamp":"2026-11-07T20:36:18.164Z","updatedBy":"user","userId":"6aef8bbe226c867c894e79f6"}
✅ [update-room-devices-mqtt: DB updated through self-echo] on,on
✅ [update-room-devices-mqtt: /ws/room-user echo] {"roomId":"6aef8bbe226c867c894e7a08","updates":[{"deviceId":"6aef8bbe226c867c894e7a0c","state":"on"},{"deviceId":"6aef8bbe226c867c894e7a0f","state":"on"}],"updatedBy":"mqtt"}
✅ [update-room-devices-mqtt: MQTT ESP bulk published] {"roomId":"6aef8bbe226c867c894e7a08","updates":[{"deviceId":"6aef8bbe226c867c894e7a0c","deviceOrder":1,"state":"on","compactState":"11"},{"deviceId":"6aef8bbe226c867c894e7a0f","deviceOrder":2,"state":"on","compactState":"21"}],"timestamp":"2026-11-07T20:36:18.196Z"}
✅ [update-room-devices-mqtt: exactly one MQTT ESP bulk-update] count=1

## 4. /ws/room-user update-room-devices
✅ [room-user update: per-device results ack] {"results":[{"deviceId":"6aef8bbe226c867c894e7a0c","success":true,"state":"on"},{"deviceId":"6aef8bbe226c867c894e7a0f","success":true,"state":"on"}]}
✅ [room-user update: /ws/user echo] {"deviceId":"6aef8bbe226c867c894e7a0c","state":"on","updatedBy":"user","userId":"6aef8bbe226c867c894e79f6"}
✅ [room-user update: /ws/device command] {"state":"on","updatedBy":"user","userId":"6aef8bbe226c867c894e79f6"}
✅ [room-user update: /ws/room-esp command] {"roomId":"6aef8bbe226c867c894e7a08","updates":[{"deviceId":"6aef8bbe226c867c894e7a0c","state":"on"},{"deviceId":"6aef8bbe226c867c894e7a0f","state":"on"}]}
✅ [room-user update: MQTT room state published] {"updates":[{"deviceId":"6aef8bbe226c867c894e7a0c","state":"on"},{"deviceId":"6aef8bbe226c867c894e7a0f","state":"on"}],"timestamp":"2026-11-07T20:36:19.089Z","updatedBy":"user","userId":"6aef8bbe226c867c894e79f6","echoId":"8914bc1b-33d8-47b1-81ba-6c2e193ac101"}
✅ [room-user update: MQTT ESP bulk published] {"roomId":"6aef8bbe226c867c894e7a08","updates":[{"deviceId":"6aef8bbe226c867c894e7a0c","deviceOrder":1,"state":"on","compactState":"11"},{"deviceId":"6aef8bbe226c867c894e7a0f","deviceOrder":2,"state":"on","compactState":"21"}],"timestamp":"2026-11-07T20:36:19.101Z"}
✅ [room-user update: DB persisted] on,on
✅ [room-user update: exactly one room-devices-updated (no self-echo duplicate)] count=1
✅ [room-user update: exactly one MQTT ESP bulk (no duplicate command)] count=1

## 5. /ws/device report-state
✅ [device report-state: ack sent] {"state":"on"}
✅ [device report-state: /ws/user state-update] {"deviceId":"6aef8bbe226c867c894e7a0c","state":"on","updatedBy":"device"}
✅ [device report-state: /ws/room-user event] {"roomId":"6aef8bbe226c867c894e7a08","updates":[{"deviceId":"6aef8bbe226c867c894e7a0c","state":"on"}],"updatedBy":"device"}
✅ [device report-state: /ws/room-esp event] {"roomId":"6aef8bbe226c867c894e7a08","updates":[{"deviceId":"6aef8bbe226c867c894e7a0c","state":"on"}]}
✅ [device report-state: MQTT device state published] {"state":"on","timestamp":"2026-11-07T20:36:20.142Z","updatedBy":"device","echoId":"dfda4ada-f563-453b-9a45-84ca4bb7085a"}
✅ [device report-state: MQTT ESP state-update published] {"deviceId":"6aef8bbe226c867c894e7a0c","deviceOrder":1,"state":"on","compactState":"11","timestamp":"2026-11-07T20:36:20.152Z"}
✅ [device report-state: DB persisted] status=on
✅ [device report-state: exactly one /ws/user event (no self-echo duplicate)] count=1
✅ [device report-state: exactly one MQTT device state] count=1
✅ [device report-state: exactly one MQTT ESP state-update] count=1

## 6. /ws/room-esp update-room-devices
✅ [room-esp update: per-device results ack] {"results":[{"deviceId":"6aef8bbe226c867c894e7a0c","success":true,"state":"on"},{"deviceId":"6aef8bbe226c867c894e7a0f","success":true,"state":"on"}]}
✅ [room-esp update: /ws/user state-updated] {"deviceId":"6aef8bbe226c867c894e7a0c","state":"on","updatedBy":"esp"}
✅ [room-esp update: /ws/device command] {"state":"on","updatedBy":"esp"}
✅ [room-esp update: /ws/room-user event] {"roomId":"6aef8bbe226c867c894e7a08","updates":[{"deviceId":"6aef8bbe226c867c894e7a0c","state":"on"},{"deviceId":"6aef8bbe226c867c894e7a0f","state":"on"}],"updatedBy":"esp"}
✅ [room-esp update: MQTT room state published] {"updates":[{"deviceId":"6aef8bbe226c867c894e7a0c","state":"on"},{"deviceId":"6aef8bbe226c867c894e7a0f","state":"on"}],"timestamp":"2026-11-07T20:36:21.107Z","updatedBy":"esp","echoId":"703b844b-0d8f-40b1-9103-1cf248b9066d"}
✅ [room-esp update: MQTT ESP bulk published] {"roomId":"6aef8bbe226c867c894e7a08","updates":[{"deviceId":"6aef8bbe226c867c894e7a0c","deviceOrder":1,"state":"on","compactState":"11"},{"deviceId":"6aef8bbe226c867c894e7a0f","deviceOrder":2,"state":"on","compactState":"21"}],"timestamp":"2026-11-07T20:36:21.120Z"}
✅ [room-esp update: DB persisted] on,on
✅ [room-esp update: exactly one /ws/room-user event (no self-echo duplicate)] count=1
✅ [room-esp update: exactly one MQTT room state] count=1
✅ [room-esp update: exactly one MQTT ESP bulk] count=1

## 7. /ws/mqtt-bridge
✅ [mqtt-bridge ns: valid credentials connect] connected
✅ [mqtt-bridge ns: greeting received] {"deviceId":"6aef8bbe226c867c894e7a0c","deviceName":"MQTT Light 1","deviceOrder":1,"roomId":"6aef8bbe226c867c894e7a08","roomName":"MQTT Room 1"}
✅ [mqtt-bridge connect: /ws/room-user esp status true] {"roomId":"6aef8bbe226c867c894e7a08","espConnected":true,"timestamp":"2026-11-07T20:36:22.300Z"}
✅ [mqtt-bridge connect: MQTT status online published] {"status":"online","timestamp":"2026-11-07T20:36:22.286Z"}
✅ [mqtt-bridge connect: Room.esp_component_connected persisted] esp=true
✅ [mqtt-bridge connect: Device.isOnline persisted true] isOnline=true
✅ [mqtt-bridge connect: /ws/user sees espConnected=true] espConnected=true
✅ [mqtt-bridge report-state: ack sent] {"success":true}
✅ [mqtt-bridge report-state: MQTT device state published] {"state":"on","timestamp":"2026-11-07T20:36:22.350Z","updatedBy":"device","deviceId":"6aef8bbe226c867c894e7a0c","room":"6aef8bbe226c867c894e7a08"}
✅ [mqtt-bridge report-state: DB updated through self-echo] status=on
✅ [mqtt-bridge report-state: /ws/user state-updated] {"deviceId":"6aef8bbe226c867c894e7a0c","state":"on","updatedBy":"mqtt"}
✅ [mqtt-bridge report-state: ESP state-update published] {"deviceId":"6aef8bbe226c867c894e7a0c","deviceOrder":1,"state":"on","compactState":"11","timestamp":"2026-11-07T20:36:22.367Z"}
✅ [mqtt-bridge report-state: exactly one ESP state-update] count=1
✅ [mqtt-bridge report-room-state: ack sent] {"success":true}
✅ [mqtt-bridge report-room-state: MQTT room state published] {"updates":[{"deviceId":"6aef8bbe226c867c894e7a0c","state":"off"},{"deviceId":"6aef8bbe226c867c894e7a0f","state":"on"}],"timestamp":"2026-11-07T20:36:23.182Z","updatedBy":"esp-room-report","deviceId":"6aef8bbe226c867c894e7a0c"}
✅ [mqtt-bridge report-room-state: DB updated through self-echo] off,on
✅ [mqtt-bridge report-room-state: ESP bulk published] {"roomId":"6aef8bbe226c867c894e7a08","updates":[{"deviceId":"6aef8bbe226c867c894e7a0c","deviceOrder":1,"state":"off","compactState":"10"},{"deviceId":"6aef8bbe226c867c894e7a0f","deviceOrder":2,"state":"on","compactState":"21"}],"timestamp":"2026-11-07T20:36:23.223Z"}
✅ [mqtt-bridge report-room-state: exactly one ESP bulk] count=1
✅ [mqtt-bridge disconnect: /ws/room-user esp status false] {"roomId":"6aef8bbe226c867c894e7a08","espConnected":false,"timestamp":"2026-11-07T20:36:24.100Z"}
✅ [mqtt-bridge disconnect: Room.esp_component_connected false] esp=false
✅ [mqtt-bridge disconnect: MQTT status offline published] {"status":"offline","timestamp":"2026-11-07T20:36:24.103Z"}
✅ [mqtt-bridge disconnect: Device.isOnline persisted false] isOnline=false
✅ [mqtt-bridge disconnect: retained status offline] retain=true, raw={"status":"offline","timestamp":"2026-11-07T20:36:24.103Z"}

## 8. Inbound MQTT device state, status, and room state
✅ [mqtt inbound device state: DB persisted] status=on
✅ [mqtt inbound device state: /ws/user state-updated] {"deviceId":"6aef8bbe226c867c894e7a0c","state":"on","updatedBy":"mqtt"}
✅ [mqtt inbound device state: /ws/room-user event] {"roomId":"6aef8bbe226c867c894e7a08","updates":[{"deviceId":"6aef8bbe226c867c894e7a0c","state":"on"}],"updatedBy":"mqtt"}
✅ [mqtt inbound device state: ESP state-update published] {"deviceId":"6aef8bbe226c867c894e7a0c","deviceOrder":1,"state":"on","compactState":"11","timestamp":"2026-11-07T20:36:24.207Z"}
✅ [mqtt inbound device status: online event] {"deviceId":"6aef8bbe226c867c894e7a0c","isOnline":true,"updatedBy":"mqtt"}
✅ [mqtt inbound device status: isOnline persisted true] isOnline=true
✅ [mqtt inbound device status: offline event] {"deviceId":"6aef8bbe226c867c894e7a0c","isOnline":false,"updatedBy":"mqtt"}
✅ [mqtt inbound device status: isOnline persisted false] isOnline=false
✅ [mqtt inbound room state: DB persisted] on,on
✅ [mqtt inbound room state: /ws/user state-updated] {"deviceId":"6aef8bbe226c867c894e7a0c","state":"on","updatedBy":"mqtt"}
✅ [mqtt inbound room state: /ws/room-user event] {"roomId":"6aef8bbe226c867c894e7a08","updates":[{"deviceId":"6aef8bbe226c867c894e7a0c","state":"on"},{"deviceId":"6aef8bbe226c867c894e7a0f","state":"on"}],"updatedBy":"mqtt"}
✅ [mqtt inbound room state: ESP bulk published] {"roomId":"6aef8bbe226c867c894e7a08","updates":[{"deviceId":"6aef8bbe226c867c894e7a0c","deviceOrder":1,"state":"on","compactState":"11"},{"deviceId":"6aef8bbe226c867c894e7a0f","deviceOrder":2,"state":"on","compactState":"21"}],"timestamp":"2026-11-07T20:36:24.383Z"}

## 9. Retained state
✅ [retained state: new subscriber receives the last state] state=on, retain=true

## 10. MQTT ESP auth, compact-state, disconnect
✅ [mqtt esp auth: success response] {"success":true,"roomId":"6aef8bbe226c867c894e7a08","roomName":"MQTT Room 1","availableDevices":[{"order":1,"deviceId":"6aef8bbe226c867c894e7a0c","deviceName":"MQTT Light 1","curre
✅ [mqtt esp auth: available devices listed] count=2
✅ [mqtt esp auth: /ws/room-user esp status true] {"roomId":"6aef8bbe226c867c894e7a08","espConnected":true,"timestamp":"2026-11-07T20:36:25.055Z"}
✅ [mqtt esp auth: Room.esp_component_connected true] esp=true
✅ [mqtt esp auth: wrong password rejected] {"success":false,"error":"Invalid room password"}
✅ [mqtt esp compact-state: success response] {"success":true,"deviceOrder":2,"newState":"on","deviceName":"MQTT Fan 2","deviceId":"6aef8bbe226c867c894e7a0f"}
✅ [mqtt esp compact-state: DB persisted] status=on
✅ [mqtt esp compact-state: /ws/user state-updated] {"deviceId":"6aef8bbe226c867c894e7a0f","state":"on","updatedBy":"esp-compact","roomId":"6aef8bbe226c867c894e7a08","espConnected":true}
✅ [mqtt esp compact-state: /ws/room-user event] {"roomId":"6aef8bbe226c867c894e7a08","updates":[{"deviceId":"6aef8bbe226c867c894e7a0f","state":"on"}],"updatedBy":"esp-compact"}
✅ [mqtt esp disconnect: /ws/room-user esp status false] {"roomId":"6aef8bbe226c867c894e7a08","espConnected":false,"timestamp":"2026-11-07T20:36:25.428Z"}
✅ [mqtt esp disconnect: Room.esp_component_connected false] esp=false
✅ [mqtt esp disconnect: mapping removed] removed

## 11. Cross-room isolation
✅ [cross-room: no /ws/user event for the other room] count=0
✅ [cross-room: no /ws/room-user event for the other room] count=0
✅ [cross-room: no MQTT room-state publish for the other room] count=0
✅ [cross-room: other device status unchanged] status=off

## 12. Rapid toggles
✅ [rapid toggles: final DB state is correct] status=off
✅ [rapid toggles: server remains responsive] status=on
✅ [rapid toggles: exactly one /ws/user state-updated per write] count=6
✅ [rapid toggles: exactly one ESP state-update per write] count=6

## 13. Scheduler status_change
✅ [scheduler status_change: DB persisted] status=on
✅ [scheduler status_change: MQTT device state published] {"state":"on","timestamp":"2026-11-07T20:36:27.575Z","updatedBy":"task","taskTriggered":true}
✅ [scheduler status_change: /ws/user state-updated] {"deviceId":"6aef8bbe226c867c894e7a0c","state":"on","updatedBy":"mqtt"}
✅ [scheduler status_change: /ws/room-user event] {"roomId":"6aef8bbe226c867c894e7a08","updates":[{"deviceId":"6aef8bbe226c867c894e7a0c","state":"on"}],"updatedBy":"mqtt"}
✅ [scheduler status_change: ESP state-update published] {"deviceId":"6aef8bbe226c867c894e7a0c","deviceOrder":1,"state":"on","compactState":"11","timestamp":"2026-11-07T20:36:27.599Z"}
✅ [scheduler status_change: exactly one /ws/user state-updated] count=1
✅ [scheduler status_change: exactly one ESP state-update] count=1
