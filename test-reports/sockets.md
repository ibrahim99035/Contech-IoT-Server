# Socket.IO Test Report

- Date: 2026-09-29T04:23:29.263Z
- Total: 53 | Passed: 53 | Failed: 0

## Results

- ✅ [device: model preserves a caller-supplied componentNumber] stored MODEL-PRESERVE-ME
- ✅ [device: model auto-generates a componentNumber when omitted] stored 7b5f13d95092…
- ✅ [device: renaming does not re-roll componentNumber] 7b5f13d95092… -> 7b5f13d95092…
- ✅ [device: API create accepts a plaintext componentNumber] -> 201 {"success":true,"message":"Device created successfully","data":{"device":{"_id":"6abb3d3b357fb3579e9ab17d","na
- ✅ [device: ESP can authenticate with the serial given at create time] connected

- ## Handshake rejection
- ✅ [user ns: no token rejected] Authentication failed: No token provided
- ✅ [user ns: bad token rejected] Authentication failed: Invalid or expired token
- ✅ [user ns: unknown-user token rejected] Authentication failed: User not found
- ✅ [room-user ns: no token rejected] Authentication failed: No token provided
- ✅ [device ns: no componentNumber rejected] Authentication failed: No component number provided
- ✅ [device ns: unknown component rejected] Authentication failed: Device not found
- ✅ [room-esp ns: unknown component rejected] Authentication failed: Device not found
- ✅ [mqtt ns: order out of range rejected] Authentication failed: Invalid Device Order (must be 1-6).
- ✅ [mqtt ns: wrong room password rejected] Authentication failed: Invalid room password.
- ✅ [mqtt ns: missing room password rejected] Authentication failed: Room password required.

- ## /ws/user
- ✅ [user ns: valid token connects] connected
- ✅ [user ns: get-device-info -> device-info] -> device-info {"device":{"id":"6abb3d3b357fb3579e9ab16b","name":"Sock Device","type":"Light","status":"o
- ✅ [user ns: get-device-info w/o id -> error] -> error {"message":"Device ID is required"}
- ✅ [user ns: get-device-esp-status w/o id -> error] -> error {"message":"Device ID is required"}
- ✅ [user ns: get-device-esp-status -> response] -> device-esp-status-response {"deviceId":"6abb3d3b357fb3579e9ab16b","roomId":"6abb3d3b357fb3579e9ab169","roomName":"Soc
- ✅ [user ns: esp-status unknown device -> error] -> error {"message":"Device not found"}
- ✅ [user ns: update-state accepted (no error)] no error within 1.2s

- ## /ws/room-user
- ✅ [room-user ns: valid token connects] connected
- ✅ [room-user ns: fetch-user-rooms -> user-rooms] -> user-rooms {"rooms":[{"room":{"id":"6abb3d3b357fb3579e9ab169","name":"Sock Room","apartment":"6abb3d3
- ✅ [room-user ns: fetch-room -> room-details] -> room-details {"room":{"id":"6abb3d3b357fb3579e9ab169","name":"Sock Room","apartment":"6abb3d3b357fb3579
- ✅ [room-user ns: get-esp-status w/o roomId -> error] -> error {"message":"Room ID is required"}
- ✅ [room-user ns: get-esp-status unknown room -> error] -> error {"message":"Room not found"}
- ✅ [room-user ns: non-member blocked from room] -> error {"message":"Access denied to this room"}
- ✅ [room-user ns: non-member connects then is refused room access] connected; error expected on room read

- ## /ws/device
- ✅ [device ns: valid componentNumber connects] connected
- ✅ [device ns: report-state -> state-reported] -> state-reported {"state":"on"}
- ✅ [device ns: report-state w/o state -> error] -> error {"message":"State value is required"}
- ✅ [device ns: report-state persisted] status=on

- ## /ws/room-esp
- ✅ [room-esp ns: valid componentNumber connects] connected
- ✅ [room-esp ns: fetch-room-devices -> room-devices] -> room-devices {"roomId":"6abb3d3b357fb3579e9ab169","devices":[{"id":"6abb3d3b357fb3579e9ab16b","status":
- ✅ [room-esp ns: update fan-out reaches /ws/room-user] -> room-devices-updated {"roomId":"6abb3d3b357fb3579e9ab169","updates":[{"deviceId":"6abb3d3b357fb3579e9ab16e","st
- ✅ [room-esp ns: update-room-devices -> room-update-results] -> room-update-results {"results":[{"deviceId":"6abb3d3b357fb3579e9ab16e","success":true,"state":"on"}]}
- ✅ [room-esp ns: device state actually persisted] status=on
- ✅ [room-esp ns: update-room-devices w/o updates -> error] -> error {"message":"Invalid updates format"}

- ## /ws/mqtt-bridge
- ✅ [mqtt ns: valid room+order+password connects] connected
- ✅ [mqtt ns: server greets with mqtt-bridge-connected] {"deviceId":"6abb3d3b357fb3579e9ab16b","deviceName":"Sock Device","deviceOrder":1,"roomId"
- ✅ [mqtt ns: report-state -> state-reported] -> state-reported {"success":true}
- ✅ [mqtt ns: report-state w/o state -> error] -> error {"message":"State value is required"}
- ✅ [mqtt ns: report-room-state malformed -> error] -> error {"message":"Invalid room state update format"}
- ✅ [mqtt ns: report-room-state foreign room -> error] -> error {"message":"Reported room ID does not match authenticated room."}

- ## end-to-end MQTT delivery
- ✅ [mqtt: test client can connect to the broker] mqtt://127.0.0.1:1895
- ✅ [mqtt: device state published on the broker reaches /ws/user as state-updated] -> state-updated {"deviceId":"6abb3d3b357fb3579e9ab16b","state":"on","updatedBy":"mqtt"}
- ✅ [mqtt: published state is persisted on the device] status=on
- ✅ [mqtt: message for an unknown device is ignored without crashing] router survived
- ✅ [mqtt: device status published on the broker reaches /ws/user as device-status] -> device-status {"deviceId":"6abb3d3b357fb3579e9ab16b","isOnline":true,"updatedBy":"mqtt"}
- ✅ [mqtt: embedded Aedes broker reports itself started]
- ✅ [mqtt: embedded broker completes a real MQTT handshake]
- ✅ [mqtt: embedded broker shuts down cleanly]
