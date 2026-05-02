JAK Academy v4 Enhanced

Run with VS Code Live Server.
Files: index.html, login.html, style.css, app.js
If you have logo.png, put it beside index.html and login.html.

What was added safely on top of v4:
- Interactive exam solving: selected answer highlighting, Next/Previous, Review Later visual indicator, timer auto-submit, unanswered warning, detailed result screen.
- Advanced Study Planner: colored subjects, task status, today tasks, progress tracking, subject filter, colored calendar view, print support.
- Student Dashboard: today tasks and study progress widgets.
- Super Admin Dashboard: CliQ payment settings, Premium plan prices, payment active/inactive, Premium request review.
- Premium page: shows current CliQ/payment info and lets users submit Premium requests.
- Login page: added Reset Password button.

Supabase tables currently expected for core exams:
- exams
- questions
- exam_results

Payment/Premium settings currently use localStorage as a safe v4 enhancement.
Later we can move them to Supabase tables with RLS for production:
- payment_settings
- premium_requests
- profiles/subscriptions

No existing core feature was intentionally removed.
