# REST Gap Suite

- Date: 2026-09-29T04:17:19.757Z
- Total: 73 | Passed: 73 | Failed: 0

## Results


- ## auth
- ✅ [auth/me] -> 200 {"success":true,"data":{"_id":"6abb3bc7ca7b50589bd2edcf","id":"6abb3bc7ca7b50589bd2edcf","name":"Gap Cust","email":"gapcust@test.c
- ✅ [auth/me no token] -> 401 {"success":false,"message":"No token provided","code":"NO_TOKEN"}
- ✅ [auth/check-google-link] -> 200 {"success":true,"message":"Google authentication status retrieved","data":{"hasGoogleAuth":false,"googleId":"not linked","emailAct
- ✅ [auth/check-google-link no token] -> 401 {"success":false,"message":"No token provided","code":"NO_TOKEN"}
- ✅ [auth/unlink-google (not linked)] -> 400 {"success":false,"message":"Google account is not linked to this user"}
- ✅ [auth/unlink-google no token] -> 401 {"success":false,"message":"No token provided","code":"NO_TOKEN"}
- ✅ [auth/google-login without credential] -> 400 {"success":false,"message":"ID token is required"}
- ✅ [auth/google/callback without code] -> 400 "Invalid callback request"
- ✅ [auth/register empty body -> 400 (not 500)] -> 400 {"success":false,"message":"Validation error","code":"VALIDATION_ERROR","errors":["\"name\" is required","\"email\" is required","
- ✅ [auth/register bad email -> 400] -> 400 {"success":false,"message":"Validation error","code":"VALIDATION_ERROR","errors":["\"name\" length must be at least 2 characters l
- ✅ [auth/register unknown role -> 400] -> 400 {"success":false,"message":"Validation error","code":"VALIDATION_ERROR","errors":["\"name\" length must be at least 2 characters l
- ✅ [auth/register missing password -> 400] -> 400 {"success":false,"message":"Validation error","code":"VALIDATION_ERROR","errors":["\"name\" length must be at least 2 characters l
- ✅ [auth/register did NOT persist an invalid email] not persisted

- ## subscription
- ✅ [subscription/features/:id] -> 200 {"success":true,"message":"Feature retrieved successfully","data":{"_id":"6abb3bc7ca7b50589bd2edb0","name":"Basic Support","descri
- ✅ [subscription/features/:id malformed -> 400] -> 400 {"success":false,"message":"Invalid _id: not-an-id","code":"INVALID_ID"}
- ✅ [subscription/features/:id unknown -> 404] -> 404 {"success":false,"message":"Feature not found","code":"NOT_FOUND"}
- ✅ [subscription/coupons admin] -> 200 {"success":true,"message":"Coupons retrieved successfully","data":[]}
- ✅ [subscription/coupons non-admin -> 403] -> 403 {"success":false,"message":"Access forbidden: Insufficient permissions","code":"FORBIDDEN"}
- ✅ [subscription/coupons no token -> 401] -> 401 {"success":false,"message":"No token provided","code":"NO_TOKEN"}
- ✅ [subscription/payments create (documented schema)] -> 201 {"success":true,"message":"Payment recorded successfully","data":{"user":"6abb3bc7ca7b50589bd2edcf","amount":19.99,"currency":"USD
- ✅ [subscription/payments ignores body userId (no cross-user credit)] -> 201 {"success":true,"message":"Payment recorded successfully","data":{"user":"6abb3bc7ca7b50589bd2edcf","amount":1,"currency":"USD","p
- ✅ [subscription/payments did not credit another user's subscription] no cross-user credit
- ✅ [subscription/payments create bad body -> 400] -> 400 {"success":false,"message":"Validation error","code":"VALIDATION_ERROR","errors":["\"subscriptionPlanId\" is required","\"amount\"
- ✅ [subscription/payments no token -> 401] -> 401 {"success":false,"message":"No token provided","code":"NO_TOKEN"}

- ## apartments / rooms
- ✅ [apartments/create with name only (UI contract)] -> 201 {"success":true,"data":{"name":"Maple Heights","creator":"6abb3bc7ca7b50589bd2edcf","members":["6abb3bc7ca7b50589bd2edcf"],"rooms"
- ✅ [apartments/create binds creator to the token] creator=6abb3bc7ca7b50589bd2edcf caller=6abb3bc7ca7b50589bd2edcf
- ✅ [apartments/create adds the caller to members] members=1
- ✅ [apartments/create back-links the apartment to the caller] user.apartments updated
- ✅ [apartments/create ignoring a spoofed creator] -> 201 {"success":true,"data":{"name":"Spoof Attempt","creator":"6abb3bc7ca7b50589bd2edcf","members":["6abb3bc7ca7b50589bd2edcf"],"rooms"
- ✅ [apartments/create ignores a spoofed creator (IDOR guard)] creator=6abb3bc7ca7b50589bd2edcf spoofed=6abb3bc7ca7b50589bd2edcd
- ✅ [apartments/create did not link the apartment to the spoofed user] no link to admin
- ✅ [rooms/create first room] -> 201 {"success":true,"data":{"room":{"_id":"6abb3bc9ca7b50589bd2ee15","name":"Room One","type":"living_room","creator":{"_id":"6abb3bc7
- ✅ [rooms/create second room (used to 500 on duplicate esp_id)] -> 201 {"success":true,"data":{"room":{"_id":"6abb3bc9ca7b50589bd2ee21","name":"Room Two","type":"bedroom","creator":{"_id":"6abb3bc7ca7b
- ✅ [rooms/create third room (used to 500)] -> 201 {"success":true,"data":{"room":{"_id":"6abb3bc9ca7b50589bd2ee2d","name":"Room Three","type":"kitchen","creator":{"_id":"6abb3bc7ca
- ✅ [rooms: every created room got a distinct esp_id] 3 rooms, esp_ids=esp_191675be6b1f65d8682fd476,esp_769b7c7b9fbe7b79701acebf,esp_6253cd08b1c3459c9101c117
- ✅ [rooms: esp_id is assigned at insert time (never null)] esp_191675be6b1f65d8682fd476,esp_769b7c7b9fbe7b79701acebf,esp_6253cd08b1c3459c9101c117
- ✅ [room types: server enum accepts every option the client offers] 11 types aligned
- ✅ [room types: Mongoose enum and Joi validator agree] model-only=[] validator-only=[]
- ✅ [apartments/:id/exit creator -> 400] -> 400 {"success":false,"message":"Apartment creator cannot exit their own apartment. Consider deleting the apartment instead.","data":nu
- ✅ [apartments/:id/exit member -> 200] -> 200 {"success":true,"message":"You have successfully left the apartment and been removed from all associated rooms and devices","data"
- ✅ [apartments/:id/exit non-member -> 403] -> 403 {"success":false,"message":"You are not a member of this apartment","data":null}
- ✅ [rooms/exit-room/:id member -> 200] -> 200 {"success":true,"message":"You have successfully left the room and been removed from all associated devices","data":{"roomId":"6ab
- ✅ [rooms/exit-room/:id creator -> 400] -> 400 {"success":false,"message":"Room creator cannot exit their own room. Consider deleting the room instead.","data":null}
- ✅ [rooms/exit-room/:id unknown -> 404] -> 404 {"success":false,"message":"Room not found","data":null}
- ✅ [apartments/remover-member] -> 404 {"message":"Member not found in this apartment"}
- ✅ [room create with type=living_room] -> 201 {"success":true,"data":{"room":{"_id":"6abb3bcaca7b50589bd2ee56","name":"Typed living_room","type":"living_room","creator":{"_id":
- ✅ [room create with type=bedroom] -> 201 {"success":true,"data":{"room":{"_id":"6abb3bcaca7b50589bd2ee62","name":"Typed bedroom","type":"bedroom","creator":{"_id":"6abb3bc
- ✅ [room create with type=kitchen] -> 201 {"success":true,"data":{"room":{"_id":"6abb3bcbca7b50589bd2ee6e","name":"Typed kitchen","type":"kitchen","creator":{"_id":"6abb3bc
- ✅ [room create with type=bathroom] -> 201 {"success":true,"data":{"room":{"_id":"6abb3bcbca7b50589bd2ee7a","name":"Typed bathroom","type":"bathroom","creator":{"_id":"6abb3
- ✅ [room create with type=dining_room] -> 201 {"success":true,"data":{"room":{"_id":"6abb3bcbca7b50589bd2ee86","name":"Typed dining_room","type":"dining_room","creator":{"_id":
- ✅ [room create with type=office] -> 201 {"success":true,"data":{"room":{"_id":"6abb3bcbca7b50589bd2ee92","name":"Typed office","type":"office","creator":{"_id":"6abb3bc7c
- ✅ [room create with type=garage] -> 201 {"success":true,"data":{"room":{"_id":"6abb3bccca7b50589bd2ee9e","name":"Typed garage","type":"garage","creator":{"_id":"6abb3bc7c
- ✅ [room create with type=balcony] -> 201 {"success":true,"data":{"room":{"_id":"6abb3bccca7b50589bd2eeaa","name":"Typed balcony","type":"balcony","creator":{"_id":"6abb3bc
- ✅ [room create with type=basement] -> 201 {"success":true,"data":{"room":{"_id":"6abb3bccca7b50589bd2eeb7","name":"Typed basement","type":"basement","creator":{"_id":"6abb3
- ✅ [room create with type=attic] -> 201 {"success":true,"data":{"room":{"_id":"6abb3bccca7b50589bd2eec3","name":"Typed attic","type":"attic","creator":{"_id":"6abb3bc7ca7
- ✅ [room create with type=other] -> 201 {"success":true,"data":{"room":{"_id":"6abb3bcdca7b50589bd2eecf","name":"Typed other","type":"other","creator":{"_id":"6abb3bc7ca7
- ✅ [room types: every type is accepted end-to-end by create] 11/11 created
- ✅ [rooms: an apartment can hold 8 rooms] 8 rooms
- ✅ [room create beyond the 8-room cap is refused] -> 403 {"success":false,"message":"Room limit reached (8 per apartment)","current":8,"limit":8}
- ✅ [rooms: the 8-room apartment cap is enforced] status=403

- ## images
- ✅ [images/remove non-admin -> 403] -> 403 {"success":false,"message":"Access forbidden: Insufficient permissions","code":"FORBIDDEN"}
- ✅ [images/remove admin unknown -> 404] -> 404 {"success":false,"message":"Image not found"}
- ✅ [images/remove no token -> 401] -> 401 {"success":false,"message":"No token provided","code":"NO_TOKEN"}
- ✅ [images/update non-admin -> 403] -> 403 {"success":false,"message":"Access forbidden: Insufficient permissions","code":"FORBIDDEN"}
- ✅ [images/update admin unknown -> 404] -> 404 {"success":false,"message":"Image not found"}
- ✅ [images/update no token -> 401] -> 401 {"success":false,"message":"No token provided","code":"NO_TOKEN"}

- ## admin
- ✅ [admin limits delete by planName] -> 200 {"success":true,"message":"Limits deactivated successfully"}
- ✅ [admin users delete-account] -> 200 {"success":true,"message":"User deleted successfully","deletedUser":{"id":"6abb3bc8ca7b50589bd2edd1","name":"Gap Victim","email":"
- ✅ [admin users delete-account actually removed the user] user removed
- ✅ [admin users delete-account non-admin -> 403] -> 403 {"success":false,"message":"Access forbidden: Insufficient permissions","code":"FORBIDDEN"}

- ## docs
- ✅ [api-docs/json] -> 200 {"openapi":"3.0.0","info":{"title":"Contech IoT Smart Home API","version":"1.0.0","description":"Production REST API for Contech I
- ✅ [api-docs/json serves the OpenAPI spec, not the Swagger UI HTML] openapi=3.0.0, paths=88
- ✅ [api-docs/ serves the Swagger UI] -> 200 "\n<!-- HTML for static distribution bundle build -->\n<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n
