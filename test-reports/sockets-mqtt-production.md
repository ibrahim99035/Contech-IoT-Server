# Production Socket.IO + MQTT Status-Switch Test Report

- Date: 2026-11-07T20:46:05.616Z
- API: http://127.0.0.1:15000 (SSH tunnel to production 127.0.0.1:5000)
- Broker: mqtt://127.0.0.1:11884 (SSH tunnel to production 127.0.0.1:1884)
- Test user: 6aef673de39d6ee8812f3036
- Test apartment: 6aef6740e39d6ee8812f3048
- Test room: 6aef6741e39d6ee8812f3059
- Test device: 6aef6741e39d6ee8812f307a (order 2)
- Total: 108 | Passed: 108 | Failed: 0

## Results


## Production preflight
✅ [prod: token identifies the E2E test user] status=200, id=6aef673de39d6ee8812f3036
✅ [prod: test device exists in the test room] id=6aef6741e39d6ee8812f307a, order=2, status=off
✅ [prod: test room exists and has no ESP connected] espConnected=false
✅ [prod: set known component number on test device] status=200
✅ [prod: set known room password on test room] status=200
✅ [prod: test room still reports no ESP after credential changes] espConnected=false
✅ [prod: MQTT observer connected to the production broker through the tunnel] mqtt://127.0.0.1:11884

## Production namespace connections
✅ [prod /ws/user: connects] connected
✅ [prod /ws/room-user: connects] connected
✅ [prod /ws/device: authenticates with the known serial] connected
✅ [prod /ws/room-esp: authenticates with the known serial] connected

## 1. Production /ws/user update-state
✅ [prod user update-state: REST status persisted] status=on
✅ [prod user update-state: /ws/user echo] {"deviceId":"6aef6741e39d6ee8812f307a","state":"on","updatedBy":"user","userId":"6aef673de39d6ee8812f3036","roomId":"6aef6741e39d6ee8812f3059","espConnected":false}
✅ [prod user update-state: /ws/device command] {"deviceId":"6aef6741e39d6ee8812f307a","state":"on","updatedBy":"user","userId":"6aef673de39d6ee8812f3036"}
✅ [prod user update-state: /ws/room-user echo] {"roomId":"6aef6741e39d6ee8812f3059","updates":[{"deviceId":"6aef6741e39d6ee8812f307a","state":"on"}],"updatedBy":"user","userId":"6aef673de39d6ee8812f3036"}
✅ [prod user update-state: MQTT device state published] {"state":"on","timestamp":"2026-11-07T20:42:08.642Z","updatedBy":"user","userId":"6aef673de39d6ee8812f3036","echoId":"79dd5d57-0dd7-498c-a36f-4c7e71a849c3"}
✅ [prod user update-state: MQTT ESP state-update published] {"deviceId":"6aef6741e39d6ee8812f307a","deviceOrder":2,"state":"on","compactState":"21","timestamp":"2026-11-07T20:42:08.645Z"}
✅ [prod user update-state: exactly one /ws/user state-updated] count=1
✅ [prod user update-state: exactly one MQTT ESP command] count=1

## 2. Production /ws/user update-state-mqtt
✅ [prod update-state-mqtt: ack] {"deviceId":"6aef6741e39d6ee8812f307a","state":"on"}
✅ [prod update-state-mqtt: MQTT published] {"state":"on","timestamp":"2026-11-07T20:42:11.932Z","updatedBy":"user","userId":"6aef673de39d6ee8812f3036"}
✅ [prod update-state-mqtt: REST status updated through self-echo] status=on
✅ [prod update-state-mqtt: /ws/user state-updated] {"deviceId":"6aef6741e39d6ee8812f307a","state":"on","updatedBy":"mqtt"}
✅ [prod update-state-mqtt: ESP state-update published] {"deviceId":"6aef6741e39d6ee8812f307a","deviceOrder":2,"state":"on","compactState":"21","timestamp":"2026-11-07T20:42:11.939Z"}
✅ [prod update-state-mqtt: exactly one ESP state-update] count=1

## 3. Production /ws/user update-room-devices-mqtt
✅ [prod update-room-devices-mqtt: ack] {"roomId":"6aef6741e39d6ee8812f3059","updatesCount":1}
✅ [prod update-room-devices-mqtt: MQTT room state published] {"updates":[{"deviceId":"6aef6741e39d6ee8812f307a","state":"on"}],"timestamp":"2026-11-07T20:42:13.894Z","updatedBy":"user","userId":"6aef673de39d6ee8812f3036"}
✅ [prod update-room-devices-mqtt: REST status updated through self-echo] status=on
✅ [prod update-room-devices-mqtt: /ws/room-user echo] {"roomId":"6aef6741e39d6ee8812f3059","updates":[{"deviceId":"6aef6741e39d6ee8812f307a","state":"on"}],"updatedBy":"mqtt"}
✅ [prod update-room-devices-mqtt: ESP bulk published] {"roomId":"6aef6741e39d6ee8812f3059","updates":[{"deviceId":"6aef6741e39d6ee8812f307a","deviceOrder":2,"state":"on","compactState":"21"}],"timestamp":"2026-11-07T20:42:13.913Z"}
✅ [prod update-room-devices-mqtt: exactly one ESP bulk] count=1

## 4. Production /ws/room-user update-room-devices
✅ [prod room-user update: results ack] {"results":[{"deviceId":"6aef6741e39d6ee8812f307a","success":true,"state":"on"}]}
✅ [prod room-user update: /ws/user echo] {"deviceId":"6aef6741e39d6ee8812f307a","state":"on","updatedBy":"user","userId":"6aef673de39d6ee8812f3036"}
✅ [prod room-user update: /ws/device command] {"state":"on","updatedBy":"user","userId":"6aef673de39d6ee8812f3036"}
✅ [prod room-user update: /ws/room-esp command] {"roomId":"6aef6741e39d6ee8812f3059","updates":[{"deviceId":"6aef6741e39d6ee8812f307a","state":"on"}]}
✅ [prod room-user update: MQTT room state published] {"updates":[{"deviceId":"6aef6741e39d6ee8812f307a","state":"on"}],"timestamp":"2026-11-07T20:42:16.411Z","updatedBy":"user","userId":"6aef673de39d6ee8812f3036","echoId":"cdcd0327-2f78-423f-8b1a-4117674f250b"}
✅ [prod room-user update: REST status persisted] status=on
✅ [prod room-user update: exactly one room-devices-updated] count=1

## 5. Production /ws/device report-state
✅ [prod device report-state: ack] {"state":"on"}
✅ [prod device report-state: /ws/user state-update] {"deviceId":"6aef6741e39d6ee8812f307a","state":"on","updatedBy":"device"}
✅ [prod device report-state: /ws/room-user event] {"roomId":"6aef6741e39d6ee8812f3059","updates":[{"deviceId":"6aef6741e39d6ee8812f307a","state":"on"}],"updatedBy":"device"}
✅ [prod device report-state: /ws/room-esp event] {"roomId":"6aef6741e39d6ee8812f3059","updates":[{"deviceId":"6aef6741e39d6ee8812f307a","state":"on"}]}
✅ [prod device report-state: MQTT device state published] {"state":"on","timestamp":"2026-11-07T20:42:19.274Z","updatedBy":"device","echoId":"edb1d95c-a3f5-4cb8-9783-cda0f986d92d"}
✅ [prod device report-state: MQTT ESP state-update published] {"deviceId":"6aef6741e39d6ee8812f307a","deviceOrder":2,"state":"on","compactState":"21","timestamp":"2026-11-07T20:42:19.277Z"}
✅ [prod device report-state: REST status persisted] status=on
✅ [prod device report-state: exactly one /ws/user event] count=1
✅ [prod device report-state: exactly one MQTT device state] count=1
✅ [prod device report-state: exactly one MQTT ESP state-update] count=1

## 6. Production /ws/room-esp update-room-devices
✅ [prod room-esp update: results ack] {"results":[{"deviceId":"6aef6741e39d6ee8812f307a","success":true,"state":"on"}]}
✅ [prod room-esp update: /ws/user state-updated] {"deviceId":"6aef6741e39d6ee8812f307a","state":"on","updatedBy":"esp"}
✅ [prod room-esp update: /ws/device command] {"state":"on","updatedBy":"esp"}
✅ [prod room-esp update: /ws/room-user event] {"roomId":"6aef6741e39d6ee8812f3059","updates":[{"deviceId":"6aef6741e39d6ee8812f307a","state":"on"}],"updatedBy":"esp"}
✅ [prod room-esp update: MQTT room state published] {"updates":[{"deviceId":"6aef6741e39d6ee8812f307a","state":"on"}],"timestamp":"2026-11-07T20:42:21.332Z","updatedBy":"esp","echoId":"8fd24734-1249-4ab7-9414-7d45c8da6cf2"}
✅ [prod room-esp update: MQTT ESP bulk published] {"roomId":"6aef6741e39d6ee8812f3059","updates":[{"deviceId":"6aef6741e39d6ee8812f307a","deviceOrder":2,"state":"on","compactState":"21"}],"timestamp":"2026-11-07T20:42:21.335Z"}
✅ [prod room-esp update: REST status persisted] status=on
✅ [prod room-esp update: exactly one /ws/room-user event] count=1
✅ [prod room-esp update: exactly one MQTT room state] count=1
✅ [prod room-esp update: exactly one MQTT ESP bulk] count=1

## 7. Production /ws/mqtt-bridge
✅ [prod mqtt-bridge: valid credentials connect] connected
✅ [prod mqtt-bridge: greeting] {"deviceId":"6aef6741e39d6ee8812f307a","deviceName":"E2E Light Renamed 1794074623761","deviceOrder":2,"roomId":"6aef6741e39d6ee8812f3059","roomName":"E2E Living Room Renamed 1794074623761"}
✅ [prod mqtt-bridge: /ws/room-user esp true] {"roomId":"6aef6741e39d6ee8812f3059","espConnected":true,"timestamp":"2026-11-07T20:42:31.684Z"}
✅ [prod mqtt-bridge: MQTT status online] {"status":"online","timestamp":"2026-11-07T20:42:31.673Z"}
✅ [prod mqtt-bridge: REST room espConnected true] esp=true
✅ [prod mqtt-bridge: REST device isOnline true] isOnline=true
✅ [prod mqtt-bridge report-state: ack] {"success":true}
✅ [prod mqtt-bridge report-state: MQTT published] {"state":"on","timestamp":"2026-11-07T20:42:33.364Z","updatedBy":"device","deviceId":"6aef6741e39d6ee8812f307a","room":"6aef6741e39d6ee8812f3059"}
✅ [prod mqtt-bridge report-state: REST status updated] status=on
✅ [prod mqtt-bridge report-state: /ws/user state-updated] {"deviceId":"6aef6741e39d6ee8812f307a","state":"on","updatedBy":"mqtt"}
✅ [prod mqtt-bridge report-state: ESP state-update published] {"deviceId":"6aef6741e39d6ee8812f307a","deviceOrder":2,"state":"on","compactState":"21","timestamp":"2026-11-07T20:42:33.373Z"}
✅ [prod mqtt-bridge report-state: exactly one ESP state-update] count=1
✅ [prod mqtt-bridge report-room-state: ack] {"success":true}
✅ [prod mqtt-bridge report-room-state: MQTT published] {"updates":[{"deviceId":"6aef6741e39d6ee8812f307a","state":"off"}],"timestamp":"2026-11-07T20:42:34.877Z","updatedBy":"esp-room-report","deviceId":"6aef6741e39d6ee8812f307a"}
✅ [prod mqtt-bridge report-room-state: REST status updated] status=off
✅ [prod mqtt-bridge report-room-state: ESP bulk published] {"roomId":"6aef6741e39d6ee8812f3059","updates":[{"deviceId":"6aef6741e39d6ee8812f307a","deviceOrder":2,"state":"off","compactState":"20"}],"timestamp":"2026-11-07T20:42:34.884Z"}
✅ [prod mqtt-bridge report-room-state: exactly one ESP bulk] count=1
✅ [prod mqtt-bridge disconnect: /ws/room-user esp false] {"roomId":"6aef6741e39d6ee8812f3059","espConnected":false,"timestamp":"2026-11-07T20:42:37.100Z"}
✅ [prod mqtt-bridge disconnect: REST room espConnected false] esp=false
✅ [prod mqtt-bridge disconnect: MQTT status offline published] {"status":"offline","timestamp":"2026-11-07T20:42:37.100Z"}
✅ [prod mqtt-bridge disconnect: REST device isOnline false] isOnline=false
✅ [prod mqtt-bridge disconnect: retained status offline] retain=true, raw={"status":"offline","timestamp":"2026-11-07T20:42:37.100Z"}

## 8. Production inbound MQTT state, status, and room state
✅ [prod MQTT inbound state: REST status persisted] status=on
✅ [prod MQTT inbound state: /ws/user state-updated] {"deviceId":"6aef6741e39d6ee8812f307a","state":"on","updatedBy":"mqtt"}
✅ [prod MQTT inbound state: /ws/room-user event] {"roomId":"6aef6741e39d6ee8812f3059","updates":[{"deviceId":"6aef6741e39d6ee8812f307a","state":"on"}],"updatedBy":"mqtt"}
✅ [prod MQTT inbound state: MQTT ESP state-update published] {"deviceId":"6aef6741e39d6ee8812f307a","deviceOrder":2,"state":"on","compactState":"21","timestamp":"2026-11-07T20:42:38.894Z"}
✅ [prod MQTT inbound status: online event] {"deviceId":"6aef6741e39d6ee8812f307a","isOnline":true,"updatedBy":"mqtt"}
✅ [prod MQTT inbound status: isOnline persisted true] isOnline=true
✅ [prod MQTT inbound status: offline event] {"deviceId":"6aef6741e39d6ee8812f307a","isOnline":false,"updatedBy":"mqtt"}
✅ [prod MQTT inbound status: isOnline persisted false] isOnline=false
✅ [prod MQTT inbound room state: REST status persisted] status=on
✅ [prod MQTT inbound room state: /ws/user state-updated] {"deviceId":"6aef6741e39d6ee8812f307a","state":"on","updatedBy":"mqtt"}
✅ [prod MQTT inbound room state: /ws/room-user event] {"roomId":"6aef6741e39d6ee8812f3059","updates":[{"deviceId":"6aef6741e39d6ee8812f307a","state":"on"}],"updatedBy":"mqtt"}
✅ [prod MQTT inbound room state: MQTT ESP bulk published] {"roomId":"6aef6741e39d6ee8812f3059","updates":[{"deviceId":"6aef6741e39d6ee8812f307a","deviceOrder":2,"state":"on","compactState":"21"}],"timestamp":"2026-11-07T20:42:41.616Z"}

## 9. Production retained state
✅ [prod retained state: new subscriber receives the last state] state=on, retain=true

## 10. Production MQTT ESP auth, compact-state, disconnect
✅ [prod MQTT ESP auth: success response] {"success":true,"roomId":"6aef6741e39d6ee8812f3059","roomName":"E2E Living Room Renamed 1794074623761","availableDevices":[{"order":2,"deviceId":"6aef6741e39d6ee8812f307a","deviceN
✅ [prod MQTT ESP auth: available devices listed] count=1
✅ [prod MQTT ESP auth: /ws/room-user esp true] {"roomId":"6aef6741e39d6ee8812f3059","espConnected":true,"timestamp":"2026-11-07T20:42:43.398Z"}
✅ [prod MQTT ESP auth: REST room espConnected true] esp=true
✅ [prod MQTT ESP compact-state: success response] {"success":true,"deviceOrder":2,"newState":"on","deviceName":"E2E Light Renamed 1794074623761","deviceId":"6aef6741e39d6ee8812f307a"}
✅ [prod MQTT ESP compact-state: REST status persisted] status=on
✅ [prod MQTT ESP compact-state: /ws/user state-updated] {"deviceId":"6aef6741e39d6ee8812f307a","state":"on","updatedBy":"esp-compact","roomId":"6aef6741e39d6ee8812f3059","espConnected":true}
✅ [prod MQTT ESP compact-state: /ws/room-user event] {"roomId":"6aef6741e39d6ee8812f3059","updates":[{"deviceId":"6aef6741e39d6ee8812f307a","state":"on"}],"updatedBy":"esp-compact"}
✅ [prod MQTT ESP disconnect: /ws/room-user esp false] {"roomId":"6aef6741e39d6ee8812f3059","espConnected":false,"timestamp":"2026-11-07T20:42:45.650Z"}
✅ [prod MQTT ESP disconnect: REST room espConnected false] esp=false

## 11. Production rapid toggles and restore
✅ [prod rapid toggles: final status off] status=off
✅ [prod rapid toggles: server remains responsive] status=off
✅ [prod rapid toggles: exactly one /ws/user state-updated per write] count=4
✅ [prod rapid toggles: exactly one ESP state-update per write] count=4
✅ [prod restore: original device status restored] status=off
ℹ️ [note] Production test device 6aef6741e39d6ee8812f307a now has retained status:offline and state:off. The component number and room password were changed for testing and left in place for inspection.

## Final state verification

- Device `6aef6741e39d6ee8812f307a`: `status=off`, `isOnline=false`.
- Room `6aef6741e39d6ee8812f3059`: `espConnected=false`.
- Retained state: `home-automation/6aef6741e39d6ee8812f307a/state` is `off` (retain=true); `.../status` is `offline` (retain=true).
- Final known device serial for follow-up testing is in `/tmp/opencode/prod-device-serial-final`; `/ws/device` authentication with it was re-verified after the run.
- The production SSH tunnel and temporary API/MQTT credentials were removed after the run.
