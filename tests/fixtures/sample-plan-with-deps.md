# Parallel Test Plan

**Goal:** Test fine-grained dependency analysis

---

## Chunk 1: Foundation

### Task 1: Auth types

**Files:**
- Create: `src/auth/types.ts`
- Test: `tests/auth/types.test.ts`

- [ ] **Step 1: Implement**

### Task 2: Database schema

**Files:**
- Create: `src/db/schema.ts`
- Test: `tests/db/schema.test.ts`

- [ ] **Step 1: Implement**

### Task 3: Config loader

**Files:**
- Create: `src/config/loader.ts`
- Test: `tests/config/loader.test.ts`

- [ ] **Step 1: Implement**

## Chunk 2: Features

### Task 4: Auth middleware

**Depends on:** Task 1
**Files:**
- Create: `src/auth/middleware.ts`
- Modify: `src/auth/types.ts`
- Test: `tests/auth/middleware.test.ts`

- [ ] **Step 1: Implement**

### Task 5: User service

**Depends on:** Task 1, Task 2
**Files:**
- Create: `src/services/user.ts`
- Test: `tests/services/user.test.ts`

- [ ] **Step 1: Implement**

### Task 6: API routes

**Files:**
- Create: `src/routes/api.ts`
- Modify: `src/db/schema.ts`
- Test: `tests/routes/api.test.ts`

- [ ] **Step 1: Implement**
