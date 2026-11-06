# Electrical Load Calculator & Breaker Sizing System

A comprehensive multi-tier electrical maximum demand calculation and automatic breaker/cable sizing application built with **React**, **TypeScript**, and **Tailwind CSS**.

---

## ⚡ Features

- **Multi-Tier Distribution Hierarchy**:
  - Main Switch Board (MSB)
  - Sub-Distribution Boards (Sub-DB / SSB)
  - Final Distribution Boards (DB)
- **Automated Electrical Sizing**:
  - Breaker sizing (MCB, MCCB, ACB)
  - Feeder and sub-main cable sizing with current-carrying capacity ratings
  - Busbar sizing calculations
  - Power factor correction & capacitor bank sizing
  - Generator & Transformer rating recommendations
- **Phase Balancing & Diversity**:
  - Automatic & manual phase balancing (R, Y, B phases)
  - Standardized diversity factors based on load types (Lighting, Power, HVAC, Motors, etc.)
- **Single Line Diagram (SLD)**:
  - Interactive tree-based visual hierarchy of the distribution network
- **Project Export & Import**:
  - Export & import full projects in JSON or CSV
  - Print-ready PDF report generation and technical load schedules

---

## 🚀 Quick Start

### 1. Prerequisites
Ensure you have **Node.js** (v18 or higher recommended) and **npm** installed.

### 2. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/<YOUR_USERNAME>/<YOUR_REPOSITORY_NAME>.git
cd <YOUR_REPOSITORY_NAME>
npm install
```

### 3. Running Locally
Start the development server:
```bash
npm run dev
```
Open your browser and navigate to `http://localhost:3000` (or the port indicated in your terminal).

### 4. Build for Production
To generate an optimized production bundle:
```bash
npm run build
```
The output files will be located in the `dist/` directory.

To preview the production build locally:
```bash
npm run preview
```

---

## 📂 Project Structure

```text
├── public/                 # Static assets, templates, and reference files
├── src/
│   ├── components/         # React UI components (DB, Sub-DB, MSB, SLD, Modals)
│   ├── data/               # Reference templates & presets
│   ├── types/              # TypeScript definitions for electrical schemas
│   ├── utils/              # Engineering calculation engines, CSV/PDF/Excel handlers
│   ├── App.tsx             # Root application orchestrator
│   ├── main.tsx            # Application entry point
│   └── index.css           # Global Tailwind CSS styles
├── package.json            # Project dependencies and npm scripts
├── tsconfig.json           # TypeScript configuration
└── vite.config.ts          # Vite bundler configuration
```

---

## 🛠️ Tech Stack
- **Framework**: React 19 + TypeScript
- **Styling**: Tailwind CSS
- **Icons & Animations**: Lucide React, Motion
- **Reports & Export**: jsPDF, jsPDF-AutoTable, SheetJS (xlsx)
- **Bundler**: Vite
