# Synergeo - Inventory & Logistics Management System

Production-ready enterprise inventory, show logistics, gear tracking, Pelican case management, and barcode/QR scanning platform.

## Getting Started

### 1. Prerequisites
- Node.js (version 18 or higher recommended)
- npm or yarn / bun

### 2. Installation
Install the project dependencies:
```bash
npm install
```

### 3. Development Server
Start the Vite local development server:
```bash
npm run dev
```
Open your browser at `http://localhost:3000` (or the port indicated in terminal).

### 4. Build for Production
```bash
npm run build
```

---

## Architecture & Features
- **Frontend**: React 18, TypeScript, Tailwind CSS v4, Lucide React icons, Framer Motion, Recharts.
- **Backend / Database**: Google Firebase (Cloud Firestore & Authentication).
- **Offline / Local Fallback**: Built-in mock & local caching so the system remains operable offline or without active Firebase connection.
- **Authentication**:
  - Security Login Passkeys for assigned management & field operators.
  - Google Single Sign-On (Firebase Auth).
- **Core Modules**:
  - Real-time Dashboard & KPI analytics
  - Complete Equipment & Inventory Ledger
  - Event & Show Logistics Production Schedule
  - Interactive QR & Barcode Scanner / Generator
  - Gear Location & Custody Live Tracker
  - Pelican Case / Flight Packout Builder
  - System Security, Whitelist & Data Export
