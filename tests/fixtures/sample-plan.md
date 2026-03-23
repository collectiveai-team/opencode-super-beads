# Auth System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an authentication system with JWT tokens

**Architecture:** Express middleware with JWT validation and role-based access control

**Tech Stack:** TypeScript, Express, jsonwebtoken

---

## Chunk 1: Core Auth

### Task 1: JWT Token Service

**Files:**
- Create: `src/auth/token.ts`
- Test: `tests/auth/token.test.ts`

- [ ] **Step 1: Write the failing test**

- [ ] **Step 2: Implement token service**

- [ ] **Step 3: Commit**

### Task 2: Auth Middleware

**Files:**
- Create: `src/auth/middleware.ts`
- Modify: `src/app.ts:15-20`
- Test: `tests/auth/middleware.test.ts`

- [ ] **Step 1: Write the failing test**

- [ ] **Step 2: Implement middleware**

- [ ] **Step 3: Commit**

## Chunk 2: Role-Based Access

### Task 3: Role Definitions

**Files:**
- Create: `src/auth/roles.ts`
- Test: `tests/auth/roles.test.ts`

- [ ] **Step 1: Write the failing test**

- [ ] **Step 2: Implement roles**

- [ ] **Step 3: Commit**

### Task 4: Permission Guard

**Files:**
- Create: `src/auth/guard.ts`
- Modify: `src/auth/middleware.ts:30-45`
- Test: `tests/auth/guard.test.ts`

- [ ] **Step 1: Write the failing test**

- [ ] **Step 2: Implement guard**

- [ ] **Step 3: Commit**
