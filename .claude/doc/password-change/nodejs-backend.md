# Implementation Plan: Password Change Feature

## Overview

Add a `PATCH /api/v2/agents/change-password` endpoint (backend) and wire it to the existing password form in the Angular settings component (frontend). No new files need to be created. Three files require modification.

---

## Files to Modify

### 1. `src/controllers/agentController.js`

Add a new exported async function `changePassword` before the `module.exports` block.

**Location in file**: Insert between `getAgentStatistics` (line 330) and `module.exports` (line 332).

**Function signature and logic**:

```javascript
/**
 * PATCH /api/v2/agents/change-password
 */
async function changePassword(req, res) {
    try {
        const { currentPassword, newPassword } = req.body;

        // Validate both fields are present
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'currentPassword and newPassword are required' });
        }

        // Validate new password length
        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
        }

        // Fetch agent with password field explicitly (select: false in schema)
        const agent = await Agent.findById(req.agent._id).select('+password');
        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        // Verify current password
        const isValid = await authService.comparePassword(currentPassword, agent.password);
        if (!isValid) {
            return res.status(400).json({ error: 'Contraseña actual incorrecta' });
        }

        // Hash new password and persist
        const hashed = await authService.hashPassword(newPassword);
        await Agent.findByIdAndUpdate(req.agent._id, { password: hashed });

        return res.json({ msg: 'Contraseña actualizada correctamente' });
    } catch (error) {
        console.error('Change password error:', error);
        return res.status(500).json({ error: error.message });
    }
}
```

**Update `module.exports`**: Add `changePassword` to the existing exports object:

```javascript
module.exports = {
    login,
    refreshToken,
    logout,
    getProfile,
    updateProfile,
    updateStatus,
    getAllAgents,
    createAgent,
    getAgentById,
    updateAgent,
    deleteAgent,
    getAgentStatistics,
    changePassword   // <-- add this
};
```

**Key notes**:
- `Agent.findById(req.agent._id).select('+password')` is required because the `password` field has `select: false` in `src/models/Agent.js` line 16. The `authenticateToken` middleware sets `req.agent` from a query that does NOT include the password, so it must be re-fetched here.
- `authService.comparePassword` and `authService.hashPassword` already exist in `src/services/authService.js` and are already imported at the top of the controller (line 2). No new imports needed.
- Return value uses `msg` key (not `message` or `success`) to match the exact specification.
- No Socket.io event is needed here — a password change is a private operation with no real-time broadcast.

---

### 2. `src/routes/agentRoutes.js`

Add one route line inside the "AGENT PROFILE ROUTES (Authenticated)" section, alongside the existing `/profile` and `/status` routes.

**Import**: `changePassword` must be destructured from the controller import. The current import on line 3 is:
```javascript
const agentController = require('../controllers/agentController');
```
This uses dot notation (`agentController.changePassword`), so no import change is needed.

**Route line to add** (after line 20, the `router.patch('/status', ...)` line):

```javascript
router.patch('/change-password', authenticateToken, apiLimiter, agentController.changePassword);
```

**Critical ordering note**: This route (`/change-password`) is a static path segment that must be declared **before** any dynamic `:id` routes to prevent Express from misinterpreting "change-password" as a value for `:id`. Looking at the existing file, all `/profile`, `/status`, and management routes appear before `/:id`, so inserting within the profile section (lines 18-20) is safe.

**Result**: The profile routes block becomes:
```javascript
router.get('/profile', authenticateToken, apiLimiter, agentController.getProfile);
router.patch('/profile', authenticateToken, apiLimiter, agentController.updateProfile);
router.patch('/status', authenticateToken, apiLimiter, agentController.updateStatus);
router.patch('/change-password', authenticateToken, apiLimiter, agentController.changePassword);
```

---

### 3. `frontend/src/app/services/auth.ts`

Add a `changePassword` method to the `AuthService` class, following the same pattern as `toggleAutoAssign` and `updateAgentLanguage` (lines 141-158). This keeps HTTP concerns in the service layer rather than the component.

**Add after `updateAgentLanguage` method (after line 158)**:

```typescript
changePassword(currentPassword: string, newPassword: string): Observable<{ msg: string }> {
  return this.http.patch<{ msg: string }>(`${this.apiUrl}/change-password`, {
    currentPassword,
    newPassword
  });
}
```

**Notes**:
- `this.apiUrl` is already set to `'/api/v2/agents'` on line 37. No new base URL needed.
- `this.http` is already injected via `inject(HttpClient)` on line 35. No new injection needed.
- The return type `Observable<{ msg: string }>` matches the backend response shape.
- No `.pipe(tap(...))` side effect is needed since a password change does not alter the stored agent profile object.
- The HTTP interceptor already attaches the `Authorization: Bearer <token>` header to all requests automatically, so the `authenticateToken` middleware on the backend will receive it correctly.

---

### 4. `frontend/src/app/components/settings/settings.ts`

Replace the `updatePassword()` method body. The method already exists at line 276 with a partial implementation (it validates the mismatch and length already, then shows a "coming soon" toast).

**Current method (lines 276-296)**:
```typescript
updatePassword() {
    if (this.passwordForm.newPassword !== this.passwordForm.confirmPassword) {
      this.toastService.error(this.translate.instant('settings.passwordMismatch'));
      return;
    }

    if (this.passwordForm.newPassword.length < 6) {
      this.toastService.error('Password must be at least 6 characters');
      return;
    }

    // TODO: Implement password change API
    this.toastService.info('Password change feature coming soon!');

    // Reset form
    this.passwordForm = {
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    };
  }
```

**Replace with**:
```typescript
updatePassword() {
    // Validate all three fields are present
    if (!this.passwordForm.currentPassword || !this.passwordForm.newPassword || !this.passwordForm.confirmPassword) {
      this.toastService.error('Todos los campos de contraseña son obligatorios');
      return;
    }

    // Validate confirmation match
    if (this.passwordForm.newPassword !== this.passwordForm.confirmPassword) {
      this.toastService.error(this.translate.instant('settings.passwordMismatch'));
      return;
    }

    // Validate new password length (mirrors backend validation)
    if (this.passwordForm.newPassword.length < 6) {
      this.toastService.error('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    this.authService.changePassword(this.passwordForm.currentPassword, this.passwordForm.newPassword).subscribe({
      next: (response) => {
        this.toastService.success(response.msg || 'Contraseña actualizada correctamente');
        // Clear the form on success
        this.passwordForm = {
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        };
      },
      error: (err) => {
        const message = err.error?.error || 'Error al actualizar la contraseña';
        this.toastService.error(message);
      }
    });
  }
```

**Notes on the component change**:
- `this.authService` is already injected in the constructor at line 98. No new injection needed.
- `this.toastService` is already injected at line 99.
- Error message extraction uses `err.error?.error` because Express returns `{ error: 'message' }` shape, as seen across all controllers.
- The "current password" empty check is added because the original code only validated `newPassword` and `confirmPassword` length/match, not whether `currentPassword` was filled.
- No `isUpdatingPassword` loading flag is introduced to keep the change minimal. If a loading state is needed later, add `isUpdatingPassword = false` as a class property and toggle it around the subscribe call — this follows the same pattern as `isSavingCRM` and `isSavingAssistant`.

---

### 5. `frontend/src/app/components/settings/settings.html`

The password form HTML at lines 307-353 already has:
- Three password inputs with `[(ngModel)]` bindings to `passwordForm.currentPassword`, `passwordForm.newPassword`, and `passwordForm.confirmPassword`
- A `<button type="button" (click)="updatePassword()">` that calls the method

No changes are required to the template. The existing bindings and event handler are correct. The form submit is already wired to `updatePassword()` and feedback is delivered via `toastService` (which displays notifications globally).

---

## API Endpoint Specification

```
PATCH /api/v2/agents/change-password
Authorization: Bearer <accessToken>
Content-Type: application/json

Request body:
{
  "currentPassword": "string (required)",
  "newPassword": "string (required, min 6 chars)"
}

Success (200):
{
  "msg": "Contraseña actualizada correctamente"
}

Error (400) - missing fields:
{ "error": "currentPassword and newPassword are required" }

Error (400) - wrong current password:
{ "error": "Contraseña actual incorrecta" }

Error (400) - too short:
{ "error": "La nueva contraseña debe tener al menos 6 caracteres" }

Error (401) - no/invalid token (from authenticateToken middleware):
{ "error": "Access token required" }

Error (500) - unexpected:
{ "error": "<error.message>" }
```

---

## No New Environment Variables Required

This feature uses only existing infrastructure: `Agent` model, `authService.comparePassword`, `authService.hashPassword`, `authenticateToken` middleware, and `apiLimiter` rate limiter.

---

## No Socket.io Events

Password changes are private and synchronous from the client's perspective. No real-time broadcast is appropriate.

---

## No Database Schema Changes

The `password` field already exists on the `Agent` schema with `select: false`. `Agent.findByIdAndUpdate` with a plain `{ password: hashed }` payload correctly writes the bcrypt hash. The field is not part of any compound index, so no migration or index rebuild is needed.

---

## Error Handling Approach

- Input validation at controller level before any async work (fast-fail pattern used throughout the codebase)
- `comparePassword` failure returns HTTP 400 (not 401) to distinguish from token auth failures; this is consistent with domain validation errors in the rest of the controllers
- Unexpected errors are caught by the try/catch, logged with `console.error`, and returned as HTTP 500 — same pattern as every other controller in the project
- Frontend extracts `err.error?.error` using optional chaining to safely handle cases where the error response body may not be the expected shape (e.g., network errors)

---

## Testing Considerations

- Test with correct current password and a new password >= 6 chars: expect 200 with `msg`
- Test with wrong current password: expect 400 with `"Contraseña actual incorrecta"`
- Test with new password < 6 chars: expect 400
- Test with missing body fields: expect 400
- Test with no Authorization header: expect 401 from `authenticateToken` middleware (not from the controller)
- Test that the old password no longer works for login after a successful change
- Test that `password` field is NOT returned in any other agent endpoints (confirm `select: false` is unaffected by `findByIdAndUpdate`)

---

## Integration Points with Existing Services

| Component | Usage |
|-----------|-------|
| `src/services/authService.js` | `comparePassword(plain, hash)` and `hashPassword(plain)` — already imported in controller |
| `src/models/Agent.js` | `Agent.findById(...).select('+password')` and `Agent.findByIdAndUpdate(...)` |
| `src/middleware/authMiddleware.js` | `authenticateToken` sets `req.agent` — controller reads `req.agent._id` |
| `src/middleware/rateLimitMiddleware.js` | `apiLimiter` applied in route definition |
| `frontend/src/app/services/auth.ts` | New `changePassword()` method added, reuses existing `this.http` and `this.apiUrl` |
| `frontend/src/app/services/toast.ts` | `toastService.success()` and `toastService.error()` for user feedback |
