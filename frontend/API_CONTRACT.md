# IHMS ERP — API CONTRACT

> This document defines **every backend dependency** the frontend has.
> Antigravity / NestJS MUST implement these endpoints with the exact
> request/response shapes for the frontend to work without modification.

## Base URL

```
NEXT_PUBLIC_API_URL=https://api.your-ihms.com
```

All requests resolve to `${NEXT_PUBLIC_API_URL}/api/...`.

## Real-time

```
NEXT_PUBLIC_WS_URL=wss://api.your-ihms.com/ws
```

WebSocket connection — auth token passed as `?token=<accessToken>` query param.

---

## Authentication

### POST /api/auth/login
- **Auth:** none
- **Role:** any
- **Request:**
```json
{ "email": "string", "password": "string" }
```
- **Response 200:**
```json
{
  "user": {
    "id": "string",
    "name": "string",
    "email": "string",
    "role": "ORGANIZATION_OWNER | STUDENT | ...",
    "organizationId": "string?",
    "hostelBranchId": "string?",
    "studentId": "string?",
    "avatarUrl": "string?"
  },
  "accessToken": "string",
  "refreshToken": "string?"
}
```
- **Errors:** 401 invalid credentials, 422 validation

### POST /api/auth/logout
- **Auth:** Bearer
- **Response 200:** empty

### GET /api/auth/me
- **Auth:** Bearer
- **Response 200:** `AuthUser` (same as `user` above)
- **Errors:** 401

### POST /api/auth/refresh
- **Auth:** none
- **Request:** `{ "refreshToken": "string" }`
- **Response 200:** `AuthResponse`

### POST /api/auth/change-password
- **Auth:** Bearer
- **Request:** `{ "currentPassword": "string", "newPassword": "string" }`
- **Errors:** 401, 422

---

## Branches

### GET /api/branches
- **Auth:** Bearer
- **Role:** ORGANIZATION_OWNER, PLATFORM_SUPER_ADMIN, REGIONAL_MANAGER
- **Response 200:** `[{ "id", "code", "name" }]`

---

## Dashboard

### GET /api/dashboard/owner
- **Auth:** Bearer
- **Role:** ORGANIZATION_OWNER, PLATFORM_SUPER_ADMIN, REGIONAL_MANAGER, BRANCH_MANAGER
- **Query:** `branchId?`
- **Response 200:** `OwnerDashboardData` (see lib/types.ts)
```json
{
  "totalHostels": 0,
  "totalStudents": 0,
  "totalBeds": 0,
  "occupiedBeds": 0,
  "availableBeds": 0,
  "occupancyPct": 0,
  "monthlyCollection": 0,
  "outstandingFees": 0,
  "monthlyExpenses": 0,
  "netProfitLoss": 0,
  "pendingComplaints": 0,
  "pendingApprovals": 0,
  "collectionTrend": [{ "month": "Jan", "collection": 0, "expenses": 0 }],
  "occupancyTrend": [{ "month": "Jan", "occupancy": 0 }],
  "recentActivity": [{ "id": "string", "description": "string", "timestamp": "ISO", "type": "string" }]
}
```

### GET /api/dashboard/student
- **Auth:** Bearer
- **Role:** STUDENT
- **Query:** `studentId?`
- **Response 200:** `StudentDashboardData`

---

## Hostels

### GET /api/hostels
- **Auth:** Bearer
- **Response 200:** `Hostel[]`

### POST /api/hostels
- **Role:** ORGANIZATION_OWNER, PLATFORM_SUPER_ADMIN
- **Request:** `Partial<Hostel>` → **Response 201:** `Hostel`

### GET /api/hostels/:id → **200:** `Hostel`

### PUT /api/hostels/:id → **200:** `Hostel`

### DELETE /api/hostels/:id → **204**

---

## Students

### GET /api/students
- **Auth:** Bearer
- **Role:** OWNER, BRANCH_MANAGER, WARDEN, RECEPTIONIST
- **Query:** `page, pageSize, search, sortBy, sortDir, branchId, status, portalAccess`
- **Response 200:** `Paginated<Student>`

### POST /api/students
- **Role:** OWNER, BRANCH_MANAGER
- **Request:** `CreateStudentInput` (see lib/api/students.api.ts)
- **Response 201:**
```json
{ "student": "Student", "customerCode": "HYD001-ST000001", "portalAccess": "DISABLED" }
```
- **Errors:** 409 duplicate, 422 validation

### GET /api/students/:id → **200:** `StudentDetail`

### PUT /api/students/:id → **200:** `Student`

### DELETE /api/students/:id → **204**

### PATCH /api/students/:id/portal-access
- **Request:** `{ "status": "ENABLED | DISABLED | PENDING" }`
- **Response 200:** `{ "student": "Student", "portalAccess": "string" }`

### POST /api/students/:id/documents (multipart)
- **Request:** `file: File, type: string`
- **Response 201:** `StudentDocument`

### GET /api/students/:id/documents → **200:** `StudentDocument[]`

### DELETE /api/students/:id/documents/:docId → **204**

---

## Rooms

### GET /api/rooms?hostelId&page&pageSize
- **Response 200:** `Paginated<Room>`

### POST /api/rooms → **201:** `Room`
### GET /api/rooms/:id → **200:** `Room`
### PUT /api/rooms/:id → **200:** `Room`
### DELETE /api/rooms/:id → **204**

---

## Beds

### GET /api/beds?roomId&status
- **Response 200:** `Paginated<Bed>`

### POST /api/beds → **201:** `Bed`
### GET /api/beds/:id → **200:** `Bed`
### PUT /api/beds/:id → **200:** `Bed`
### DELETE /api/beds/:id → **204**
### PATCH /api/beds/:id/assign `{ studentId }` → **200:** `Bed`
### PATCH /api/beds/:id/vacate → **200:** `Bed`

---

## Fees

### GET /api/fees?studentId&status
- **Response 200:** `Paginated<Fee>`

### GET /api/fees/student/:studentId → **200:** `Fee`

### POST /api/fees → **201:** `Fee`
### PUT /api/fees/:id → **200:** `Fee`
### DELETE /api/fees/:id → **204**

---

## Payments

### GET /api/payments?studentId&status
- **Response 200:** `Paginated<Payment>`

### GET /api/payments/student/:studentId → **200:** `Payment[]`

### POST /api/payments/create
- **Role:** STUDENT, OWNER, ACCOUNTANT
- **Request:** `{ "studentId", "feeId?", "amount", "method?" }`
- **Response 201:** `PaymentInitResponse`
```json
{
  "paymentId": "string",
  "gateway": "razorpay | stripe | null",
  "gatewayOrder": "object | null",
  "status": "PENDING | SUCCESS",
  "receipt": "PaymentReceipt | null"
}
```
> If `gateway` is non-null, the client calls the gateway SDK with
> `gatewayOrder`, then calls `/confirm`. If `status === SUCCESS`,
> no gateway step is needed.

### POST /api/payments/:id/confirm
- **Request:** `{ "gatewayPayload": "object" }`
- **Response 200:** `{ "payment": "Payment", "receipt": "PaymentReceipt" }`

### GET /api/payments/:id/receipt → **200:** `PaymentReceipt`
### GET /api/payments/:id/receipt.pdf → **200:** `application/pdf`

---

## Mess

### GET /api/mess/menu/:branchId
- **Response 200:** `MessMenu`
- **Errors:** 404 if no menu

### POST /api/mess/menu
- **Request:** `SaveMessMenuInput` (status DRAFT or PUBLISHED)
- **Response 201:** `MessMenu`

### PUT /api/mess/menu/:id → **200:** `MessMenu`
### DELETE /api/mess/menu/:id → **204`

---

## Attendance

### GET /api/attendance?studentId&date&status
- **Response 200:** `Paginated<AttendanceRecord>`

### GET /api/attendance/student/:studentId
- **Response 200:** `Paginated<AttendanceRecord>`

### POST /api/attendance → **201:** `AttendanceRecord`

---

## Leave

### GET /api/leave?studentId&status
- **Response 200:** `Paginated<LeaveRequest>`

### GET /api/leave/student/:studentId → **200:** `LeaveRequest[]`

### POST /api/leave → **201:** `LeaveRequest`
### PATCH /api/leave/:id/status `{ status, remarks? }` → **200:** `LeaveRequest`
### PATCH /api/leave/:id/cancel → **200:** `LeaveRequest`

---

## Complaints

### GET /api/complaints?studentId&status&priority
- **Response 200:** `Paginated<Complaint>`

### GET /api/complaints/student/:studentId → **200:** `Complaint[]`

### POST /api/complaints → **201:** `Complaint`
### PATCH /api/complaints/:id/status `{ status, remarks? }` → **200:** `Complaint`
### DELETE /api/complaints/:id → **204**

---

## Visitors

### GET /api/visitors?studentId&status
- **Response 200:** `Paginated<Visitor>`

### POST /api/visitors/check-in → **201:** `Visitor`
### PATCH /api/visitors/:id/check-out → **200:** `Visitor`

---

## Notifications

### GET /api/notifications?page&pageSize
- **Response 200:** `Paginated<Notification>`

### PATCH /api/notifications/:id/read → **200:** `Notification`
### POST /api/notifications/read-all → **200**

### GET /api/announcements → **200:** `Paginated<Announcement>`

---

## Reports

### GET /api/reports/occupancy?branchId&from&to
- **Response 200:** `[{ "date": "ISO", "occupancy": 0 }]`

### GET /api/reports/collection?branchId&from&to
- **Response 200:** `[{ "month": "Jan", "collection": 0, "expenses": 0 }]`

---

## Real-time Events (WebSocket)

The backend MUST emit these event names:

| Event | Payload | Trigger |
|---|---|---|
| `payment.created` | `Payment` | Payment initiated |
| `payment.success` | `Payment` | Payment confirmed |
| `fee.updated` | `Fee` | Fee record changed |
| `bed.updated` | `Bed` | Bed status/assignment changed |
| `student.updated` | `Student` | Student record changed |
| `complaint.created` | `Complaint` | New complaint |
| `complaint.updated` | `Complaint` | Complaint status changed |
| `leave.updated` | `LeaveRequest` | Leave status changed |
| `visitor.updated` | `Visitor` | Visitor check-in/out |
| `notification.created` | `Notification` | New notification |
| `messMenu.updated` | `MessMenu` | Menu published/updated |

---

## Standard Error Response

```json
{
  "statusCode": 400,
  "message": "Human-readable message",
  "code": "VALIDATION_ERROR",
  "details": {}
}
```

| Status | Frontend behavior |
|---|---|
| 400 | Toast: validation message |
| 401 | Clear tokens, redirect to /login |
| 403 | Toast: "You do not have permission to perform this action." |
| 404 | Empty/error state with message |
| 409 | Toast: conflict message |
| 422 | Toast: validation message |
| 500 | Toast: "Something went wrong on our end." |

---

## Role Permission Matrix

| Module | PLATFORM_SUPER_ADMIN | ORGANIZATION_OWNER | REGIONAL_MANAGER | BRANCH_MANAGER | WARDEN | RECEPTIONIST | ACCOUNTANT | MESS_MANAGER | INVENTORY_MANAGER | SECURITY_GUARD | MAINTENANCE_STAFF | STUDENT | PARENT |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Hostels | ✅ | ✅ | ✅ | — | — | — | — | — | — | — | — | — | — |
| Students | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — | — | — | own | own |
| Rooms & Beds | ✅ | ✅ | — | ✅ | ✅ | — | — | — | — | — | — | — | — |
| Fees | ✅ | ✅ | — | ✅ | — | — | ✅ | — | — | — | — | own | own |
| Finance | ✅ | ✅ | — | — | — | — | ✅ | — | — | — | — | — | — |
| Mess | ✅ | ✅ | — | — | — | — | — | ✅ | — | — | — | view | view |
| Inventory | ✅ | ✅ | — | — | — | — | — | — | ✅ | — | — | — | — |
| Attendance | ✅ | ✅ | — | ✅ | ✅ | — | — | — | — | — | — | own | own |
| Visitors | ✅ | ✅ | — | ✅ | — | ✅ | — | — | — | ✅ | — | — | — |
| Complaints | ✅ | ✅ | — | ✅ | ✅ | — | — | — | — | — | ✅ | own | — |
| Reports | ✅ | ✅ | — | — | — | — | ✅ | — | — | — | — | — | — |

---

## Integration Points for Antigravity

1. **Environment:** set `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL`
2. **Auth:** delete `src/mocks/*` and set `NEXT_PUBLIC_USE_MOCK_AUTH` to unset/false
3. **API client:** `src/lib/api/client.ts` — single fetch wrapper, token handling
4. **Real-time:** `src/lib/realtime/socket.ts` — WebSocket bootstrap
5. **Payment gateway:** `src/app/(app)/student/fees/page.tsx` — inject gateway SDK call
6. **QR verification:** components exist; backend must verify scanned QR payloads
