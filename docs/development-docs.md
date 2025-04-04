# Literature Review Tool - Development Documentation

## Overview

The Literature Review Tool is a Next.js application designed to streamline the literature review process for researchers. It facilitates importing bibliographic data (via BibTeX files or external APIs), screening titles and abstracts (optionally assisted by AI), reviewing potential duplicates, and managing the included literature set.

## Architecture

### Technology Stack

- **Framework**: Next.js with TypeScript
- **UI Library**: Ant Design (antd)
- **State Management**: React Hooks (`useState`, `useEffect`, `useCallback`)
- **Database**: SQLite (`literature-review.db`)
- **Database Client (Backend)**: `sqlite`, `sqlite3`
- **API Communication (Frontend)**: Fetch API
- **BibTeX Parsing**: `bibtex-parse-js` (via custom wrapper `src/app/utils/bibtexParser.ts`)
- **AI Integration**: Google Gemini (via `src/app/services/geminiService.ts` and `/api/gemini` route)

### Project Structure

```
literature-review-tool/
├── docs/
│   ├── development-docs.md          # This file
│   ├── batFile-StartServer.md       # Instructions for starting external API server (if used)
│   └── openAPI.json                 # OpenAPI spec for external BibTeX APIs (if applicable)
├── public/                          # Static assets (icons, etc.)
├── scripts/
│   └── init-database.js             # Script to initialize/update the SQLite database schema
├── src/
│   ├── app/
│   │   ├── api/                     # Next.js API Routes (Backend)
│   │   │   ├── bibtex/              # Routes for external BibTeX APIs
│   │   │   │   ├── ieee/route.ts
│   │   │   │   ├── scopus/route.ts
│   │   │   │   └── springer/route.ts
│   │   │   ├── database/            # Internal API for database operations
│   │   │   │   └── route.ts
│   │   │   └── gemini/              # Internal API for interacting with Gemini
│   │   │       └── route.ts
│   │   ├── components/              # Reusable React components
│   │   │   ├── AIBatchProcessor.tsx # Component for batch AI processing
│   │   │   ├── AIPromptDialog.tsx   # Dialog for managing AI prompts
│   │   │   ├── ExpandableRow.tsx    # Component for expandable table rows
│   │   │   ├── LiteratureTable.tsx  # Main table for displaying literature
│   │   │   └── Navigation.tsx       # Application navigation
│   │   ├── config/
│   │   │   └── api.ts               # Configuration for *external* BibTeX APIs
│   │   ├── services/
│   │   │   └── geminiService.ts     # Client-side service for Gemini interaction
│   │   ├── utils/                   # Utility functions
│   │   │   ├── antd-compat.ts       # Ant Design compatibility helpers
│   │   │   ├── bibtex-parse-js.d.ts # Type definitions for bibtex-parse-js
│   │   │   ├── bibtexParser.ts      # Wrapper for BibTeX parsing logic
│   │   │   ├── database.ts          # Client-side functions for DB API interaction
│   │   │   ├── deduplication.ts     # Logic for identifying potential duplicates
│   │   │   └── initDb.ts            # (Potentially redundant) DB initialization helper
│   │   ├── abstract-screening/
│   │   │   └── page.tsx             # UI for Abstract Screening stage
│   │   ├── deduplication-review/
│   │   │   └── page.tsx             # UI for Deduplication Review stage
│   │   ├── included-literature/
│   │   │   └── page.tsx             # UI for viewing included literature
│   │   ├── search/
│   │   │   └── page.tsx             # UI for searching/importing literature
│   │   ├── title-screening/
│   │   │   └── page.tsx             # UI for Title Screening stage
│   │   ├── favicon.ico
│   │   ├── globals.css
│   │   ├── layout.tsx               # Root layout
│   │   ├── page.tsx                 # Main application entry page (often redirects or dashboard)
│   │   ├── providers.tsx            # Context providers (e.g., Ant Design)
│   │   └── types.ts                 # Core TypeScript types (BibEntry, ScreeningStatus, etc.)
│   └── ... (other configuration files like .gitignore, package.json, etc.)
├── literature-review.db             # SQLite database file (created on init)
└── ... (other root files like next.config.ts, tsconfig.json)
```

## Database (`literature-review.db`)

The application uses an SQLite database to store all literature data and settings.

### Schema

- **`entries` table**: Stores individual bibliographic entries. Key columns include:
    - `id` (TEXT PRIMARY KEY): Unique identifier (BibTeX key, potentially suffixed if duplicate).
    - Standard BibTeX fields (`entry_type`, `title`, `author`, `year`, `journal`, `abstract`, `doi`, etc.).
    - `source` (TEXT): Origin of the entry (e.g., 'Scopus API', 'manual_upload.bib').
    - `title_screening_status` (TEXT): 'pending', 'included', 'excluded', 'maybe'.
    - `abstract_screening_status` (TEXT): 'pending', 'included', 'excluded', 'maybe'.
    - `deduplication_status` (TEXT): 'pending', 'included', 'excluded'. Status after deduplication review. 'included' means kept, 'excluded' means marked as duplicate.
    - `is_duplicate` (INTEGER): 0 or 1, flag set by the deduplication algorithm.
    - `duplicate_group_id` (TEXT): Identifier linking potential duplicates found by the algorithm.
    - `is_primary_duplicate` (INTEGER): 0 or 1, flag potentially used by the algorithm to suggest a primary entry (currently not heavily used in UI).
    - `title_screening_notes` (TEXT): User notes or AI reasoning for title screening decisions.
    - `abstract_screening_notes` (TEXT): User notes or AI reasoning for abstract screening decisions.
    - `json_data` (TEXT): Stores any non-standard BibTeX fields as a JSON string.
- **`settings` table**: Stores application settings. Key-value pairs include:
    - `ai_prompt_title`: Custom prompt for title screening AI.
    - `ai_prompt_abstract`: Custom prompt for abstract screening AI.
    - `api_key_gemini`: User's Google Gemini API key.

### Initialization

- The database file (`literature-review.db`) is created in the project root.
- **Recommended Method:** Run the initialization script:
  ```bash
  npm run init-database
  ```
  This script creates the file and ensures all tables and columns exist, adding missing columns if necessary (useful for updates).
- **Automatic:** The backend API (`/api/database`) will also attempt to initialize the database if the file or tables are missing when an API call is made.

### Interaction

- **Backend:** The `/api/database/route.ts` file handles all direct database interactions using `sqlite` and `sqlite3`. It provides API endpoints for CRUD operations and specific actions like running deduplication.
- **Frontend:** The `src/app/utils/database.ts` file provides async functions that frontend components use to call the backend API via `fetch`. It abstracts the API calls for fetching entries, updating statuses, managing settings, etc.

## Core Features

### 1. Data Import

- **External APIs:** Search Scopus, IEEE, Springer via dedicated API routes (`/api/bibtex/*`). Requires configuration in `src/app/config/api.ts` and potentially a running external API server (see `docs/batFile-StartServer.md`).
- **File Upload:** Upload `.bib` files directly in the Search page. Parsing is handled by `src/app/utils/bibtexParser.ts`.

### 2. Deduplication

- **Algorithm:** The `src/app/utils/deduplication.ts` file contains the `findPotentialDuplicates` function, which identifies potential duplicates based on DOI and title similarity.
- **Process Trigger:** Users can manually trigger the check via the "Run Deduplication Check" button on the Deduplication Review page. This calls the `/api/database?action=run-deduplication` endpoint, which executes `runDeduplicationProcess` on the backend.
- **Review:** The Deduplication Review page (`/deduplication-review`) fetches entries marked for review (`deduplication_status = 'pending'`) using `/api/database?action=deduplication-review`. Entries are grouped by `duplicate_group_id`.
- **Decision:** Users select entries to "Keep" (sets `deduplication_status` to 'included'). Unchecked entries in a saved group are implicitly marked as duplicates (`deduplication_status` set to 'excluded'). Saving calls `/api/database?action=update-deduplication`.
- **Impact:** Entries marked with `deduplication_status = 'excluded'` are filtered out from subsequent screening stages and the final included list.

### 3. Screening Stages

- **Title Screening:** (`/title-screening`) Displays entries not excluded by deduplication. Users assign 'included', 'excluded', or 'maybe' status. Updates status via `/api/database?action=update-screening`.
- **Abstract Screening:** (`/abstract-screening`) Displays entries marked 'included' during title screening. Users assign 'included', 'excluded', or 'maybe' status. Updates status via `/api/database?action=update-screening`.
- **AI Assistance (Optional):**
    - Uses Google Gemini via the `/api/gemini` backend route (POST method).
    - Requires a Gemini API key, saved via the "Edit AI Prompt" dialog (`/api/database?action=saveApiKey`).
    - Uses customizable prompts (base instructions) specific to each screening type ('title' or 'abstract'), saved via the "Edit AI Prompt" dialog (`/api/database?action=savePrompt`, storing keys `ai_prompt_title` and `ai_prompt_abstract`).
    - **Batch Processing (`AIBatchProcessor.tsx`):**
        - Fetches the appropriate prompt (`ai_prompt_title` or `ai_prompt_abstract`) from the database based on the current screening stage. **Crucially, the accuracy of the AI's task depends on the correct prompt being saved for the specific screening type.** If abstract screening seems to use title-screening logic, verify the content of the `ai_prompt_abstract` setting using the "Edit AI Prompt" dialog in the Abstract Screening UI.
        - Filters selected entries for 'pending' or 'maybe' status.
        - Iteratively processes entries in batches (default size 50).
        - For each batch:
            - Constructs a single prompt containing the base instructions and a formatted list of entry IDs and titles/abstracts.
            - Calls the frontend service `processBatchPromptWithGemini` (`src/app/services/geminiService.ts`).
            - This service calls the backend `/api/gemini` (POST) with the combined prompt.
            - The backend sends the prompt to Gemini and expects a single JSON array response containing results for the batch.
        - After all API calls complete, collects all results.
        - Calls the backend `/api/database?action=update-screening-batch` *once* with an array of all successful updates (ID, status, notes, confidence) to update the database efficiently. The `notes` field in this payload corresponds to the AI's `reasoning` and is saved into the appropriate `title_screening_notes` or `abstract_screening_notes` column.
    - **Database Schema:** The `entries` table includes `title_screening_confidence` and `abstract_screening_confidence` (REAL type) columns to store AI confidence scores. Schema migrations in `/api/database/route.ts` attempt to add these columns if they don't exist.

### 4. Included Literature

- The `/included-literature` page displays all entries that have passed screening (status 'included' in either title or abstract screening) and were not marked as duplicates (`deduplication_status != 'excluded'`). Fetched via `/api/database?action=included-literature`.

## API Configuration

- **External BibTeX APIs:** Configured in `src/app/config/api.ts`. Requires setting `API_BASE_URL` (if using a separate server for these APIs) and potentially updating `API_KEY` and `ENDPOINTS`.
- **Internal Database API:** Located at `/api/database`. No separate configuration file; logic is self-contained in `src/app/api/database/route.ts`.
- **Gemini Service:**
    - API Key: Obtained from Google AI Studio and saved via the application's Settings page (stored in the database `settings` table).
    - Prompts: Default prompts are provided, but can be customized via the Settings page (stored in the database `settings` table).
    - Backend Route: `/api/gemini/route.ts` handles communication with the Google Gemini API using the stored key.

## Development Setup

1.  **Prerequisites**: Node.js, npm
2.  **Installation**:
    ```bash
    npm install
    ```
3.  **Database Initialization**:
    ```bash
    npm run init-database
    ```
    This creates `literature-review.db` and sets up the schema.
4.  **Configuration (Optional but Recommended)**:
    - **Gemini API Key**: Obtain a key from Google AI Studio. Run the application (`npm run dev`), navigate to the (currently non-existent, needs implementation) Settings page, and save the key.
    - **External BibTeX APIs**: If using the external API search functionality, configure `src/app/config/api.ts` and ensure the corresponding API server is running.
5.  **Running the Development Server**:
    ```bash
    npm run dev
    ```
    Access the application at `http://localhost:3000` (or the configured port).
6.  **Building for Production**:
    ```bash
    npm run build
    npm start
    ```

## Key Components & Utilities

- **`LiteratureTable.tsx`**: Central component for displaying entries in various stages. Uses Ant Design Table with features like sorting, filtering, and expandable rows (`ExpandableRow.tsx`). Pagination state (`currentPage`, `pageSize`, `totalCount`) is now controlled by the parent component via props to ensure state persistence across data refreshes.
- **`database.ts` (utils)**: Frontend functions for all database interactions via the API. Functions like `getTitleScreeningEntries` and `getDeduplicationReviewEntries` now support pagination parameters (`page`, `pageSize`) and return `{ entries: BibEntry[], totalCount: number }` or similar structure.
- **`route.ts` (api/database)**: Backend logic for handling database requests. GET endpoints for fetching entry lists (e.g., `action=title-screening`, `action=deduplication-review`) now accept `page` and `pageSize` query parameters and return paginated results along with the total count. Includes the `convertRowToBibEntry` helper function which maps database columns (including `title_screening_notes` and `abstract_screening_notes`) to the `BibEntry` object used by the frontend.
- **`deduplication.ts` (utils)**: Contains the core logic for identifying duplicate entries.
- **`geminiService.ts` (services)**: Handles client-side logic for interacting with the Gemini API via the `/api/gemini` route, primarily through `processBatchPromptWithGemini`.

## Future Enhancements / To-Do

*(Review and update based on current status)*

1.  **Settings Management**: While API keys and prompts can be managed via the `AIPromptDialog`, a dedicated Settings page could consolidate these and other future configurations.
2.  **Authentication**: Add user accounts for personalized settings and data isolation.
3.  **Export Options**: Add functionality to export included literature (or other subsets) in various formats (BibTeX, CSV, RIS).
4.  **Advanced Filtering/Search**: Implement more robust filtering within tables (e.g., by keyword, source, status).
5.  **UI/UX Refinements**: Improve loading states, error handling, and overall user experience.
6.  **Testing**: Add unit and integration tests.
