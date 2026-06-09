# ScolaTech

ScolaTech — plateforme de gestion scolaire pour les établissements sénégalais. A multi-tenant school management SaaS for Senegal built with Next.js, TypeScript, Tailwind CSS, and Supabase. Production: https://scolatech.app

## Getting Started

First, install dependencies:

```bash
npm install
```

Then, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Environment Variables

Create a `.env.local` file with the following variables:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

## Database Setup

Run the SQL migrations in `supabase/migrations/` to set up the database schema and RLS policies.

## Features

- Multi-tenant architecture with school isolation
- User roles: super_admin, school_admin, teacher, finance_officer, parent, student
- Responsive mobile-first UI
- PWA support
- Secure authentication with Supabase SSR