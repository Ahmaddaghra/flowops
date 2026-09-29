# Phase 2 — Frontend Foundation & Design System Report

## Overview
Phase 2 establishes the web client for FlowOps. Built with React 19, TypeScript 5, Vite 6, Tailwind CSS 3, and React Router DOM 7, it provides a high-density, restrained B2B operations interface connecting seamlessly to the ASP.NET Core 10 backend.

---

## Technical Stack & Architecture

### Core Technologies
- **UI Framework:** React 19 (`react`, `react-dom`)
- **Language:** TypeScript 5 (Strict compiler options, explicit typing throughout)
- **Bundler & Tooling:** Vite 6 with `@vitejs/plugin-react`
- **Routing:** React Router DOM 7
- **Styling:** Tailwind CSS 3 with PostCSS and Autoprefixer
- **Icons:** Lucide React (`lucide-react`)
- **Class Merging:** `clsx` + `tailwind-merge`
- **Linting & Code Quality:** ESLint 9 (`@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`)
- **Formatting:** Prettier (`.prettierrc`)
- **CI / Automation:** GitHub Actions (`.github/workflows/frontend-ci.yml`)

---

## Directory Structure

```text
frontend/
├── .env.example                     # Optional API base URL (/api/v1 by default)
├── .prettierrc                      # Prettier code formatting rules
├── eslint.config.js                 # Flat ESLint configuration
├── index.html                       # HTML entry point with Inter font
├── package.json                     # NPM dependencies and scripts
├── postcss.config.js                # PostCSS configuration
├── tailwind.config.js               # B2B slate color palette and theme extensions
├── tsconfig.json                    # Base TypeScript project configuration
├── tsconfig.app.json                # Application TypeScript configuration with @/* path alias
├── tsconfig.node.json               # Vite config TypeScript rules
├── vite.config.ts                   # Vite bundler configuration and dev proxy
└── src/
    ├── app/                         # Application bootstrapping
    │   ├── App.tsx                  # Root router wrapper
    │   └── main.tsx                 # DOM root rendering
    ├── components/
    │   ├── layout/                  # Application layout components
    │   │   ├── AppLayout.tsx        # Shell layout with desktop sidebar & mobile dialog drawer
    │   │   ├── Header.tsx           # Route breadcrumb, mobile menu trigger, and API health status
    │   │   ├── MobileNav.tsx        # Responsive, keyboard-accessible navigation drawer
    │   │   └── Sidebar.tsx          # Fixed dark-slate desktop sidebar
    │   └── ui/                      # Reusable design system primitives
    │       ├── Badge.tsx            # Status and priority badges (5 variants)
    │       ├── Button.tsx           # Button with spinner, icons, and 5 variants
    │       ├── Card.tsx             # Card container, header, title, and content
    │       ├── EmptyState.tsx       # Informative zero-data placeholder
    │       ├── ErrorState.tsx       # Resilient error banner with retry trigger
    │       ├── Input.tsx            # Form input with validation error states
    │       ├── Modal.tsx            # Accessible modal dialog with backdrop & escape handling
    │       ├── PageHeader.tsx       # Standardized page title, badge, and actions
    │       ├── Select.tsx           # Form dropdown with typed options
    │       ├── Skeleton.tsx         # Content loading pulse placeholders
    │       └── Table.tsx            # High-density data table elements
    ├── features/
    │   └── work-items/              # Work Items feature module
    │       ├── components/
    │       │   ├── WorkItemCard.tsx           # Mobile-optimized card layout
    │       │   ├── WorkItemPriorityBadge.tsx  # Priority indicator (Low/Med/High/Crit)
    │       │   ├── WorkItemStatusBadge.tsx    # Status indicator (Todo/InProgress/Blocked/Done)
    │       │   └── WorkItemTable.tsx          # Desktop tabular work item list
    │       └── pages/
    │           ├── WorkItemDetailPage.tsx     # Read-only work item detail view
    │           └── WorkItemsPage.tsx          # Read-only work items list with live refresh
    ├── lib/
    │   ├── api/
    │   │   ├── client.ts            # Typed fetch wrapper with RFC 7807 parsing
    │   │   └── workItems.ts         # Work items API endpoints
    │   └── utils.ts                 # Classname combiner (cn) & date formatter
    ├── pages/
    │   ├── DashboardPage.tsx        # Phase 5 preview placeholder
    │   ├── NotFoundPage.tsx         # 404 error page
    │   └── SettingsPage.tsx         # Runtime status & environment inspection
    ├── routes/
    │   └── index.tsx                # Client-side route declarations
    ├── types/
    │   ├── api.ts                   # RFC 7807 ProblemDetails & ApiError class
    │   └── workItems.ts             # WorkItem, WorkItemStatus, and WorkItemPriority
    ├── index.css                    # Tailwind directives and base styling
    └── vite-env.d.ts                # Vite environment typings
```

---

## Key Design & Implementation Decisions

### 1. High-Density, Restrained Visual Style
- **Aesthetic:** Clean, professional B2B operations software (deep slate navigation `#0f172a`, subtle slate borders `#e2e8f0`, neutral background `#f8fafc`, and crisp typography).
- Avoided consumer SaaS flashiness, oversized marketing hero banners, or excessive border radii.
- Designed strictly for operational workflows, scannability, and high information density.

### 2. Typed API Client & RFC 7807 ProblemDetails Integration
- `src/lib/api/client.ts` implements a typed wrapper around native `fetch`.
- The frontend defaults to `VITE_API_BASE_URL=/api/v1`. The value can be omitted; `frontend/.env.example` sets it explicitly.
- During local development, Vite proxies `/api/*` to the ASP.NET Core backend at `http://localhost:5055`, so the browser uses the same origin and the backend does not need a Phase 2 CORS policy.
- Deployment environments can set `VITE_API_BASE_URL` to the API base appropriate for their topology; production CORS policy can be defined when that topology is known.
- When an API call fails (HTTP 4xx/5xx), the client parses the response body into an RFC 7807 `ProblemDetails` object, extracting `detail`, `title`, and structured validation `errors`.
- Errors are raised as an `ApiError` class extending `Error`, enabling type-safe runtime checks (`err instanceof ApiError`).

### 3. State Handling
- **Loading:** Subtle pulse skeletons matching the exact dimensions of the target table and detail cards.
- **Empty State:** A useful read-only message explains that work item creation is introduced in Phase 3.
- **Error State:** Clear error messages displaying the backend ProblemDetails explanation with an immediate "Try Again" retry button.
- **Success & Refresh:** Live background refresh without jarring layout shifts.

### 4. Responsiveness
- **Desktop (>= 1024px):** Fixed left navigation bar, comprehensive tabular view with columns for ID, Title, Status, Priority, Assignee, and Creation Date.
- **Mobile (< 1024px):** Slide-out drawer navigation triggered from top header; Work Items render as responsive cards designed for touch targets.

### 5. Backend Integration
- The Phase 2 frontend makes read-only requests only: `GET /api/v1/health`, `GET /api/v1/work-items`, and `GET /api/v1/work-items/{id}`.
- Local browser requests use the Vite development proxy. Phase 2 makes no backend application or CORS configuration changes.
- Work item creation, editing, status transitions, and assignment changes belong to Phase 3, along with search, filtering, sorting, pagination, and activity/history.

### 6. Application Shell
- The header displays the current route breadcrumb, a mobile navigation trigger, and live API health status.
- The header does not currently include search or a user avatar.
- Dashboard remains a Phase 5 placeholder; Settings shows API connectivity and frontend configuration details.

---

## Verification & Acceptance Gates

| Gate | Status | Details |
|---|---|---|
| Clean Layered Structure | PASSED | Modular features, layout, and UI primitive separation |
| TypeScript Strictness | PASSED | Strict mode enabled, 0 compiler errors or `any` escapes |
| Build Pipeline | PASSED | `tsc -b && vite build` completes with 0 warnings or errors |
| Linting & Quality | PASSED | `eslint .` passes with 0 warnings or errors |
| Code Formatting | PASSED | Prettier formatting enforced across all files |
| Continuous Integration | PASSED | `.github/workflows/frontend-ci.yml` configured |
| RFC 7807 Integration | PASSED | Typed error parsing for validation and missing resources |
| Backend Boundary | PASSED | Phase 2 frontend uses GET list/detail/health; no backend application configuration changes |
