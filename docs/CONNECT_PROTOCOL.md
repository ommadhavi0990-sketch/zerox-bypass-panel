# ZEROX connect protocol

Endpoint: `POST <site>/api/public/connect` (form, urlencoded or JSON). Fields: `game`, `user_key`, `serial`.
Also accepted for compatibility with other login.h versions: `key` / `userkey` / `license` for the key and
`uuid` / `device` / `device_id` / `hwid` for the serial. Sellers only paste the connect link into login.h.

## Classic mode (no nonce) — works with every existing login.h
Success: `{"status":true,"data":{"token":"md5(game-key-serial-secret)","sig":"hmac…","rng":…,"EXP":…, …}}`
Failure: `{"status":false,"reason":"USER OR GAME NOT REGISTERED|EXPIRED KEY|MAX DEVICE REACHED|TOO MANY ATTEMPTS|…","message":…}`

## ENC v2 (opt-in) — add a fresh random `nonce` (16–64 chars of A-Z a-z 0-9 _ -) to every request
Success: `{"status":true,"enc":1,"iv":"<b64>","ct":"<b64>","sig":"<hex>"}` — nothing readable outside `ct`.
- `sig  = HMAC-SHA256(secret_word, iv + "|" + ct + "|" + serial + "|" + nonce)` (hex). Check it first.
- `key  = SHA-256(secret_word + "|" + user_key + "|" + serial + "|" + nonce)` (32 bytes)
- `ct   = AES-256-GCM(key, iv (12 bytes), aad = nonce)`, 16-byte tag appended; plaintext = the classic `data` object as JSON.
Why it helps: a recorded reply cannot be replayed (new nonce = new key), a reply for another phone/key does not
verify, and a fake local server cannot answer without the secret word.

## Honest limits
A panel can only protect what happens on the server. If someone patches the app itself so it skips the check, no
server reply can stop that. Real protection = ENC v2 in the app + the app refusing to run unless the reply
decrypts + keeping the secret word out of plain text in the binary + a different secret word per app build.
