# Vantage API

B2B finance & ledger backend for the Vantage mobile app — **NestJS + Prisma + Supabase (Postgres)**.
JWT auth, every record scoped to a company, and the same billing/payroll math as the app.

## Stack
- **NestJS 10** (REST, `/api` prefix, Swagger at `/docs`)
- **Prisma 5** ORM → **Supabase Postgres**
- **JWT** auth (`passport-jwt`) with `bcryptjs` password hashing
- `class-validator` request validation (global `ValidationPipe`)

## Setup

1. **Install**
   ```bash
   npm install
   ```

2. **Connect Supabase** — copy `.env.example` → `.env` and paste your connection strings
   (Supabase Dashboard → Project Settings → Database → Connection string):
   - `DATABASE_URL` → **pooled** (port 6543, `?pgbouncer=true`) for the running app
   - `DIRECT_URL` → **direct** (port 5432) for migrations
   - set a strong `JWT_SECRET`

3. **Create the schema** in Supabase:
   ```bash
   npm run prisma:generate
   npm run prisma:push       # or: npm run prisma:migrate  (named migrations)
   ```

4. **Seed demo data** (optional):
   ```bash
   npm run seed              # creates Northwind Holdings · login alex@northwind.io / vantage
   ```

5. **Run**
   ```bash
   npm run start:dev         # http://localhost:4000/api  ·  docs at /docs
   ```

## Auth flow
`POST /api/auth/register` creates the **company + owner** and returns `{ token, user, company }`.
`POST /api/auth/login` returns the same. Send `Authorization: Bearer <token>` on every other route —
the JWT carries `companyId`, so all data is automatically scoped to the caller's company.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create company + owner, return JWT |
| POST | `/api/auth/login` | Log in, return JWT |
| GET | `/api/auth/me` | Current user + company |
| GET / PATCH | `/api/companies/me` | Read / update company profile |
| GET | `/api/customers` | Khata list + `youllGet` / `youllGive` totals |
| POST | `/api/customers` | Add customer (+ optional opening balance) |
| GET | `/api/customers/:id` | Customer + ledger entries + running balance |
| POST | `/api/customers/:id/entries` | Record **You Gave / You Got** |
| GET / POST | `/api/expenses` | List / add expenses (with breakdown) |
| GET / POST | `/api/partners` | List / add partners |
| GET / POST | `/api/employees` | Roster + live payroll summary / add |
| PATCH | `/api/employees/:id/increment` | Raise a salary |
| DELETE | `/api/employees/:id` | Remove an employee |
| POST | `/api/employees/payroll/run` | Disburse all pending salaries |
| GET / PATCH | `/api/billing/me` | Live billing breakdown / change plan·seats·cycle |
| GET | `/api/dashboard/me` | Aggregated KPIs, cash, payroll, activity |

## Billing
Per-seat USD pricing, **no free tier**, **$10 minimum**: Starter $10 · Growth $24 · Scale $49 per seat/mo,
with a 20% annual discount. `src/billing/billing.constants.ts` is the single source of truth (mirrors the app).

## Connecting the app
Point the React Native app at `http://<host>:4000/api`, store the JWT from register/login,
and swap the in-memory `StoreProvider` calls for `fetch` to these endpoints. Response shapes already
match the app's models (customers carry `balance`/`entries`, payroll carries the summary, etc.).
