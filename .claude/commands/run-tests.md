# Run Comprehensive Test Suite

## Input
Test scope (optional): $ARGUMENTS
- `all` - Run all test types (default)
- `unit` - Run only unit tests
- `integration` - Run only integration tests
- `e2e` - Run only end-to-end tests
- `coverage` - Run tests with detailed coverage report
- `backend` - Run only backend tests
- `frontend` - Run only frontend tests

## Project Technology Stack

This is a **Node.js + Express + Angular** project:
- **Backend**: Node.js ≥22.0.0 + Express + MongoDB + Socket.io + OpenAI
- **Frontend**: Angular 21 + Tailwind CSS (in `frontend/` directory)

## Step 1: Backend Tests (Node.js/Express)

### Available Test Commands
```bash
# Test OpenAI thread optimization
npm run test:threads

# Run specific test files
node test-agent-notification.js
node test-analysis-languages.js
node test-assignment.js
node test-import-export.js
node test-summary-languages.js
```

### Backend Test Structure
```
/
├── test-*.js              # Root-level test scripts
├── src/
│   ├── services/          # Business logic (testable)
│   ├── controllers/       # Route handlers (integration tests)
│   ├── models/            # Mongoose schemas
│   └── middleware/        # Express middleware
```

### Running Backend Tests
```bash
# From project root
npm run test:threads

# Run individual test files
node test-agent-notification.js
node test-assignment.js
```

## Step 2: Frontend Tests (Angular)

### Available Test Commands
```bash
# Navigate to frontend directory
cd frontend

# Unit Tests (Jasmine/Karma)
npm test
ng test --watch=false --browsers=ChromeHeadless

# Coverage Report
ng test --code-coverage --watch=false --browsers=ChromeHeadless

# E2E Tests (if configured)
ng e2e

# Lint
ng lint
```

### Frontend Test Structure
```
frontend/src/
├── app/
│   ├── components/
│   │   └── **/*.spec.ts    # Component tests
│   ├── services/
│   │   └── **/*.spec.ts    # Service tests
│   └── pipes/
│       └── **/*.spec.ts    # Pipe tests
```

### Running Frontend Tests
```bash
cd frontend
ng test --watch=false --browsers=ChromeHeadless
```

## Step 3: Execute Tests Based on Scope

### Detection and Execution Logic
```bash
# Check we're in the right project
if [ -f "package.json" ] && grep -q "express" package.json; then
    echo "🎯 Detected Node.js/Express backend"
fi

if [ -d "frontend" ] && [ -f "frontend/angular.json" ]; then
    echo "🎯 Detected Angular frontend"
fi
```

### Scope Execution
- `all` or empty: Run both backend and frontend tests
- `backend`: Run only Node.js tests
- `frontend`: Run only Angular tests in `frontend/`
- `unit`: Run quick unit tests only
- `integration`: Run integration/API tests
- `e2e`: Run end-to-end tests

## Step 4: Coverage Validation

### Coverage Report Format
```
📊 TEST COVERAGE SUMMARY
========================

🎯 Node.js Backend:
├── Thread Tests:       ✅ passed
├── Assignment Tests:   ✅ passed
├── Notification Tests: ✅ passed
└── Duration:           X.Xs

🎯 Angular Frontend:  
├── Unit Tests:        XX passed
├── Component Tests:   XX passed
├── Coverage:          XX% (target: >80%)
└── Duration:          X.Xs

📈 OVERALL RESULT: ✅ PASS / ❌ FAIL
```

## Step 5: Test Result Analysis

### Success Criteria
- [ ] All tests passing
- [ ] Coverage >80% for frontend (when measured)
- [ ] No linting errors
- [ ] Build successful

### Failure Handling
```
❌ TEST FAILURES DETECTED

🔍 Failed Tests:
├── test-assignment.js: Error at line XX
├── frontend/src/app/services/chat.spec.ts: should emit messages
└── ...

🛠️ Next Steps:
1. Review error messages and stack traces
2. Fix failing test cases
3. Re-run: run-tests to verify fixes
```

## Step 6: Integration with Workflow

### Development Workflow
1. **Before PR**: Run `run-tests all` to validate before push
2. **Quick Check**: Run `run-tests unit` for fast feedback
3. **Backend Only**: Run `run-tests backend` after API changes
4. **Frontend Only**: Run `run-tests frontend` after UI changes

### Command Variants
- `run-tests` - Run all tests
- `run-tests backend` - Backend tests only
- `run-tests frontend` - Frontend tests only  
- `run-tests unit` - Quick unit tests
- `run-tests coverage` - Full coverage report

## Quality Standards
- **Speed**: Unit tests complete quickly
- **Coverage**: Target 80% for frontend
- **Reliability**: Tests must be deterministic
- **Maintainability**: Clear test naming

## Notes
- Frontend tests require `cd frontend` first
- Backend tests are JavaScript files in project root
- Some tests may require MongoDB connection
- Run `npm run dev` before integration tests if they need the server running
