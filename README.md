# DinePlan — Linked Experiments 2, 3 & 4

## Folder Architecture
- `experiment-2/` (Port **3002**): Source of truth. Owns `submissions.json` (10 sample dining reservations) and `exp3-feed.json`, with data entry, editing, CAD floorplan blueprint, and complete bottom table.
- `experiment-3/` (Port **3003**): Delta & Schema Alteration Console. Linked to `../experiment-2/submissions.json`, displaying **only** edited, altered, or deleted persons with Edit, Delete, and Schema Alter controls.
- `experiment-4/` (Port **3004**): Built with **Express.js**. Includes the exact same interface and features as Experiment 3, **plus** live tracking of **how many times each customer is updating** their reservation (`GET /api/update-counts`, Customer Update Count Leaderboard, and an `Update Count` badge column in the table).

## Step-by-Step How to Run
1. Extract `dineplan-project.zip`.
2. **Terminal 1 (Experiment 2):**
   ```bash
   cd dineplan-project/experiment-2
   npm start
   ```
   Open **http://localhost:3002**
3. **Terminal 2 (Experiment 3):**
   ```bash
   cd dineplan-project/experiment-3
   npm start
   ```
   Open **http://localhost:3003**
4. **Terminal 3 (Experiment 4 - Express.js):**
   ```bash
   cd dineplan-project/experiment-4
   npm install
   npm start
   ```
   Open **http://localhost:3004**
