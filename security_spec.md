# Security Specification - MotoFix Recorrentes

## Data Invariants
1. **User Authorization**: No data can be read or written unless the user's profile in the `users` collection has `isActive == true`.
2. **Multi-Tenancy Isolation**: A user can only access documents where `userId == request.auth.uid`. There is no "global" access except for hardcoded admins.
3. **Admin Privilege**: Hardcoded admins can bypass standard checks to manage users and view data for support, but they must be verified via Google Auth.
4. **Self-Service Restriction**: Users cannot authorize themselves. During profile creation, `isActive` must be `false` unless the email is in the admin whitelist.
5. **Resource Integrity**: Maintenance records must always link to a valid client owned by the same user.
6. **Immutability**: The `userId` field of any document must be immutable once created.

## The "Dirty Dozen" Payloads (Attack Vectors)

1. **Self-Authorization Attack (users)**:
   - Action: `CREATE /users/attacker_uid`
   - Payload: `{ "uid": "attacker_uid", "email": "attacker@gmail.com", "role": "user", "isActive": true, ... }`
   - Expected Result: **PERMISSION_DENIED** (isActive must be false).

2. **Role Escalation Attack (users)**:
   - Action: `CREATE /users/attacker_uid`
   - Payload: `{ "uid": "attacker_uid", "email": "attacker@gmail.com", "role": "admin", "isActive": false, ... }`
   - Expected Result: **PERMISSION_DENIED** (cannot grant self admin role).

3. **Inactive Access Attack (clients)**:
   - Action: `LIST /clients` (where user exists in doc but is `isActive: false`)
   - Expected Result: **PERMISSION_DENIED** (isActive gate).

4. **Cross-Tenant Read Attack (clients)**:
   - Action: `GET /clients/victim_client_id`
   - Expected Result: **PERMISSION_DENIED** (userId mismatch).

5. **Cross-Tenant Write Attack (maintenances)**:
   - Action: `CREATE /maintenances/new_id`
   - Payload: `{ "clientId": "victim_client_id", "userId": "victim_uid", ... }`
   - Expected Result: **PERMISSION_DENIED** (userId mismatch or target client not owned).

6. **Shadow Update Attack (clients)**:
   - Action: `UPDATE /clients/my_client_id`
   - Payload: `{ "name": "New Name", "role": "hacker" }`
   - Expected Result: **PERMISSION_DENIED** (unknown field 'role').

7. **Identity Spoofing (Ownership Takeover)**:
   - Action: `UPDATE /clients/my_client_id`
   - Payload: `{ "userId": "other_uid", ... }`
   - Expected Result: **PERMISSION_DENIED** (userId is immutable).

8. **Orphaned Record Attack (maintenances)**:
   - Action: `CREATE /maintenances/new_id`
   - Payload: `{ "clientId": "non_existent_client", "userId": "my_uid", ... }`
   - Expected Result: **PERMISSION_DENIED** (clientId must exist).

9. **Resource Exhaustion (ID Poisoning)**:
   - Action: `GET /clients/very_long_id_exceeding_128_chars_...`
   - Expected Result: **PERMISSION_DENIED** (isValidId gate).

10. **Query Scraping Attack**:
    - Action: `LIST /clients` (authenticated but no filters)
    - Expected Result: **PERMISSION_DENIED** (Rules must enforce `resource.data.userId == request.auth.uid`).

11. **PII Leak Exposure**:
    - Action: `GET /users/victim_uid` (authenticated but not owner/admin)
    - Expected Result: **PERMISSION_DENIED**.

12. **Terminal State Bypass**:
    - Action: `UPDATE /clients/my_client_id`
    - Payload: (Changing a completed status back to OK without authorization)
    - Expected Result: **PERMISSION_DENIED** (if status logic enforced).

## Test Runner (firestore.rules.test.ts)
*Note: This environment doesn't support running a full JS test suite against a local emulator, but the rules will be audited against these logic leaks manually before deployment.*
