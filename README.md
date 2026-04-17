# CamDrive

A mobile-first PWA for documenting military vehicle inspections in the field. Teams photograph vehicles during enlistment and release, and managers approve the inspections — automatically organizing all photos into a structured Google Drive folder hierarchy.

---

## Features

- **Team workflow** — Field teams create inspections with photos, vehicle hours, location, and crew members. Photos are compressed client-side before upload.
- **Manager dashboard** — Approve or reject inspections with a reason. Approving triggers an automatic Google Drive upload and folder creation.
- **Google Drive integration** — Approved inspections are uploaded to a shared Drive folder using the naming convention `גיוס {plate}-{letter} {DD.MM.YY}` / `שחרור {plate}-{letter} {DD.MM.YY}`. Each plate gets independent letter counters for enlistments and releases (A, B, C … AA, AB …).
- **Rejection & resubmission** — Rejected inspections remain visible to the team with the rejection reason. The team can edit photos and resubmit without losing their original work.
- **Public share links** — Each inspection has a read-only share link accessible without login.
- **ZIP download** — Managers can download all photos for an inspection as a ZIP file (streamed from Google Drive for approved inspections).
- **Security codes** — Optional קודן/קוד מיגון (security code) field per inspection.
- **Soft delete** — Managers can delete inspections; deleted records are hidden from all views but retained in the database.
- **Stats** — Weekly/monthly inspection counts, currently enlisted vehicles, and per-member activity.
- **PWA** — Installable on iOS and Android, works standalone, RTL Hebrew UI throughout.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, Tailwind CSS v4 |
| Backend | Node.js, Express |
| Database | MongoDB Atlas (Mongoose) |
| Storage | Google Drive API v3 (OAuth2) |
| Auth | JWT (manager routes only) |
| File upload | Multer, client-side Canvas compression |

---

## Project Structure

```
├── client/                  # React PWA (Vite)
│   └── src/
│       ├── pages/
│       │   ├── team/        # Team-facing pages (new inspection, pending list, detail)
│       │   ├── admin/       # Manager pages (dashboard, inspection detail, vehicle history)
│       │   └── Share.jsx    # Public read-only share page
│       ├── components/      # PhotoGrid, PhotoUploader, StatusBadge, etc.
│       └── utils/           # API client, image compression, formatters
│
└── server/                  # Express API
    ├── models/              # Mongoose models (Inspection, Vehicle, Person)
    ├── routes/              # REST routes (inspections, people, vehicles, stats, auth)
    ├── services/            # driveService.js — all Google Drive logic
    ├── middleware/          # JWT auth
    └── scripts/             # getRefreshToken.js — one-time OAuth2 setup
```

---

## Setup

### Prerequisites

- Node.js 18+
- MongoDB Atlas cluster
- Google Cloud project with Drive API enabled and an OAuth2 client

### 1. Clone & install

```bash
git clone <repo-url>
cd camdrive

cd server && npm install
cd ../client && npm install
```

### 2. Configure environment

Create `server/.env`:

```env
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/camdrive
DRIVE_ROOT_FOLDER_ID=<google-drive-folder-id>
GOOGLE_CLIENT_ID=<oauth2-client-id>
GOOGLE_CLIENT_SECRET=<oauth2-client-secret>
GOOGLE_REFRESH_TOKEN=<refresh-token>
ADMIN_PASSWORD=<your-admin-password>
JWT_SECRET=<random-secret>
PORT=3001
```

To obtain a refresh token, run:

```bash
cd server && node scripts/getRefreshToken.js
```

### 3. Run

```bash
# Terminal 1 — API server
cd server && npm run dev

# Terminal 2 — React dev server
cd client && npm run dev
```

The app will be at `http://localhost:5173`. The API proxies to `http://localhost:3001`.

---

## API Overview

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/inspections` | — | Create inspection with photos |
| `GET` | `/api/inspections/pending` | JWT | List pending inspections |
| `GET` | `/api/inspections/my/:name` | — | Pending + rejected for a person |
| `GET` | `/api/inspections/:id` | — | Get inspection detail |
| `GET` | `/api/inspections/:id/photos/:filename` | — | Serve photo (local or Drive proxy) |
| `PUT` | `/api/inspections/:id/photos` | — | Add photos (pending/rejected only) |
| `DELETE` | `/api/inspections/:id/photos/:filename` | — | Remove photo |
| `POST` | `/api/inspections/:id/approve` | JWT | Approve → upload to Drive |
| `POST` | `/api/inspections/:id/reject` | JWT | Reject with reason |
| `PUT` | `/api/inspections/:id/resubmit` | — | Resubmit rejected inspection |
| `POST` | `/api/inspections/:id/delete` | JWT | Soft-delete inspection |
| `GET` | `/api/inspections/:id/download-zip` | — | Download all photos as ZIP |
| `GET` | `/api/inspections/share/:token` | — | Public share view |

---

## License

Private — all rights reserved.
