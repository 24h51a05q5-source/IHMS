# IHMS ERP — Integrated Hostel Management System

Production-grade frontend for a multi-tenant hostel management ERP.
Built for clean integration with a NestJS + MongoDB Atlas backend via Antigravity.

## Tech Stack

- Next.js 13 (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- Recharts for analytics
- Lucide React icons
- Sonner for toasts

## Quick Start

The dev server runs automatically. To preview with mock auth, set:

```
NEXT_PUBLIC_USE_MOCK_AUTH=true
```

Demo accounts (mock mode only):

| Role | Email | Password |
|---|---|---|
| Owner | owner@ihms.dev | owner123 |
| Student | student@ihms.dev | student123 |
| Admin | admin@ihms.dev | admin123 |
| Mess Manager | mess@ihms.dev | mess123 |

## Folder Structure

```
app/
  (app)/                    # Protected dashboard area
    dashboard/              # Owner dashboard
    students/               # Student management + portal access
    mess/                   # Mess menu builder (owner)
    complaints/             # Owner complaints
    notifications/          # Notifications center
    settings/               # Settings
    hostels|rooms|fees|...  # Module placeholders
    student/                # Student portal
      fees|attendance|leave|mess|complaints|notifications|profile|payments
  login/                    # Login page
  layout.tsx                # Root layout + AuthProvider
components/
  dashboard/                # StatCard, DataTable, PageHeader, states, etc.
  ui/                       # shadcn/ui primitives
lib/
  api/                      # Centralized API service layer (one file per domain)
  auth/                     # AuthProvider, useAuth, ProtectedRoute, RoleGuard, nav config
  realtime/                 # WebSocket service + event registry
  mocks/                    # Mock auth (isolated, removable)
  types.ts                  # Shared domain types / API contract shapes
  utils.ts                  # cn() helper
```

## Backend Integration

See `API_CONTRACT.md` for the complete endpoint specification.

To connect the real backend:
1. Set `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL`
2. Unset `NEXT_PUBLIC_USE_MOCK_AUTH`
3. Delete `src/mocks/` (optional — it's isolated and never used in production mode)
