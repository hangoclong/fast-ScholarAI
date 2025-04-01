# Literature Review Tool - Development Documentation

## Overview

The Literature Review Tool is a Next.js application designed to help researchers manage bibliographic data and conduct literature reviews. It provides a unified interface for searching academic databases (mock implementations for Scopus [cite: uploaded:src/app/api/bibtex/scopus/route.ts], IEEE [cite: uploaded:src/app/api/bibtex/ieee/route.ts], Springer [cite: uploaded:src/app/api/bibtex/springer/route.ts] provided), importing BibTeX files, and screening entries with optional AI assistance via the Gemini API [cite: uploaded:src/app/api/gemini/route.ts, uploaded:src/app/services/geminiService.ts].

## Architecture

### Technology Stack

-   **Framework**: Next.js with TypeScript
-   **UI Library**: Ant Design (antd)
-   **State Management**: React useState hooks / Context API (implied by providers)
-   **API Client**: Fetch API (used in `database.ts` [cite: uploaded:src/app/utils/database.ts] and `geminiService.ts` [cite: uploaded:src/app/services/geminiService.ts])
-   **BibTeX Parsing**: `bibtex-parse-js` [cite: uploaded:src/app/utils/bibtexParser.ts]
-   **Database**: SQLite (`literature-review.db`) [cite: uploaded:src/app/api/database/route.ts, uploaded:src/app/utils/initDb.ts]
-   **AI Integration**: Google Generative AI (Gemini) [cite: uploaded:src/app/api/gemini/route.ts, uploaded:src/app/services/geminiService.ts]

### Project Structure (Updated)

```
literature-review-tool/
├── literature-review.db        # SQLite Database file [cite: uploaded:src/app/utils/initDb.ts]
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── bibtex/         # Mock BibTeX API routes
│   │   │   │   ├── scopus/
│   │   │   │   │   └── route.ts      # Mock Scopus BibTeX API [cite: uploaded:src/app/api/bibtex/scopus/route.ts]
│   │   │   │   ├── ieee/
│   │   │   │   │   └── route.ts      # Mock IEEE BibTeX API [cite: uploaded:src/app/api/bibtex/ieee/route.ts]
│   │   │   │   └── springer/
│   │   │   │       └── route.ts      # Mock Springer BibTeX API [cite: uploaded:src/app/api/bibtex/springer/route.ts]
│   │   │   ├── database/
│   │   │   │   └── route.ts          # Backend API for database operations [cite: uploaded:src/app/api/database/route.ts]
│   │   │   └── gemini/
│   │   │       └── route.ts          # Backend API for Gemini AI interaction [cite: uploaded:src/app/api/gemini/route.ts]
│   │   ├── config/
│   │   │   └── api.ts              # External API configuration (mock bibtex) [cite: uploaded:src/app/config/api.ts]
│   │   ├── services/
│   │   │   └── geminiService.ts    # Client-side Gemini API interaction logic [cite: uploaded:src/app/services/geminiService.ts]
│   │   ├── utils/
│   │   │   ├── antd-compat.ts      # Ant Design compatibility layer [cite: uploaded:src/app/utils/antd-compat.ts]
│   │   │   ├── bibtexParser.ts     # BibTeX parsing utility [cite: uploaded:src/app/utils/bibtexParser.ts]
│   │   │   ├── database.ts         # Client-side database interaction functions [cite: uploaded:src/app/utils/database.ts]
│   │   │   └── initDb.ts           # Database initialization script [cite: uploaded:src/app/utils/initDb.ts]
│   │   ├── components/             # (Assumed location for UI components)
│   │   │   └── ...                 # (Search Form, File Upload, Results Table, Screening UI)
│   │   ├── globals.css             # Global styles [cite: uploaded:src/app/globals.css]
│   │   ├── layout.tsx              # App layout
│   │   ├── page.tsx                # Main application page
│   │   ├── providers.tsx           # Ant Design provider setup
│   │   └── types.ts                # TypeScript interfaces (BibEntry, ScreeningStatus etc.) [cite: uploaded:src/app/types.ts]
├── docs/
│   ├── development-docs.md         # This file
│   └── openAPI.json                # (Potentially outdated) API specification
└── public/                         # Static assets
```

## Database (SQLite)

The application uses a local SQLite database (`literature-review.db`) to store bibliographic entries and application settings [cite: uploaded:src/app/utils/initDb.ts, uploaded:src/app/api/database/route.ts].

### Schema

1.  **`entries` Table**: Stores bibliographic data and screening progress [cite: uploaded:src/app/api/database/route.ts, uploaded:src/app/utils/initDb.ts].
    * `id` (TEXT, PK): Unique identifier (usually BibTeX citation key) [cite: uploaded:src/app/api/database/route.ts, uploaded:src/app/utils/initDb.ts].
    * `entry_type` (TEXT): e.g., 'article', 'inproceedings' [cite: uploaded:src/app/api/database/route.ts, uploaded:src/app/utils/initDb.ts].
    * `title`, `author`, `year`, `journal`, `booktitle`, `publisher`, `abstract`, `doi`, `url`, `keywords`, `pages`, `volume`, `issue` (TEXT): Standard BibTeX fields [cite: uploaded:src/app/api/database/route.ts, uploaded:src/app/utils/initDb.ts].
    * `source` (TEXT): Origin of the entry (e.g., 'Scopus API', 'Uploaded File') [cite: uploaded:src/app/api/database/route.ts, uploaded:src/app/utils/initDb.ts].
    * `title_screening_status` (TEXT): 'pending', 'in_progress', 'included', 'excluded', 'maybe'. Default: 'pending' [cite: uploaded:src/app/api/database/route.ts, uploaded:src/app/utils/initDb.ts, uploaded:src/app/types.ts].
    * `abstract_screening_status` (TEXT): 'pending', 'in_progress', 'included', 'excluded', 'maybe'. Default: 'pending' [cite: uploaded:src/app/api/database/route.ts, uploaded:src/app/utils/initDb.ts, uploaded:src/app/types.ts].
    * `title_screening_notes` (TEXT): Notes added during title screening [cite: uploaded:src/app/api/database/route.ts, uploaded:src/app/utils/initDb.ts].
    * `abstract_screening_notes` (TEXT): Notes added during abstract screening [cite: uploaded:src/app/api/database/route.ts, uploaded:src/app/utils/initDb.ts].
    * `notes` (TEXT): General notes for the entry [cite: uploaded:src/app/api/database/route.ts, uploaded:src/app/utils/initDb.ts].
    * `created_at` (TEXT): Timestamp of creation [cite: uploaded:src/app/api/database/route.ts, uploaded:src/app/utils/initDb.ts].
    * `json_data` (TEXT): Stores any other non-standard BibTeX fields as a JSON string [cite: uploaded:src/app/api/database/route.ts, uploaded:src/app/utils/initDb.ts].
2.  **`settings` Table**: Stores configuration like AI prompts and API keys [cite: uploaded:src/app/api/database/route.ts, uploaded:src/app/utils/initDb.ts].
    * `key` (TEXT, PK): Setting identifier (e.g., `ai_prompt_title`, `api_key_gemini`) [cite: uploaded:src/app/api/database/route.ts, uploaded:src/app/utils/initDb.ts].
    * `value` (TEXT): The setting value [cite: uploaded:src/app/api/database/route.ts, uploaded:src/app/utils/initDb.ts].
    * `created_at`, `updated_at` (TEXT): Timestamps [cite: uploaded:src/app/api/database/route.ts, uploaded:src/app/utils/initDb.ts].

### Database Interaction

-   **Backend**: `src/app/api/database/route.ts` handles API requests for database operations (CRUD, stats, settings) [cite: uploaded:src/app/api/database/route.ts].
-   **Client-side**: `src/app/utils/database.ts` provides functions to interact with the backend database API [cite: uploaded:src/app/utils/database.ts].
-   **Initialization**: `src/app/utils/initDb.ts` can be run to create the database and tables if they don't exist [cite: uploaded:src/app/utils/initDb.ts].

## API Configuration (External Mock APIs)

Configuration for the *mock* external BibTeX APIs is in `src/app/config/api.ts` [cite: uploaded:src/app/config/api.ts].

-   **API_BASE_URL**: Base URL for the *mock* API server (default: http://localhost:8000) [cite: uploaded:src/app/config/api.ts].
-   **API_KEY**: Mock authentication key [cite: uploaded:src/app/config/api.ts].
-   **DEFAULT_PARAMS**: Default parameters for mock API endpoints [cite: uploaded:src/app/config/api.ts].
-   **ENDPOINTS**: Path definitions for mock API endpoints [cite: uploaded:src/app/config/api.ts].
-   **API_HEADERS**: Headers for mock API requests [cite: uploaded:src/app/config/api.ts].

## API Integration

### 1. Internal Database API (`/api/database`) [cite: uploaded:src/app/api/database/route.ts]

-   **Purpose**: Manages interaction with the SQLite database [cite: uploaded:src/app/api/database/route.ts].
-   **Methods**: GET, POST [cite: uploaded:src/app/api/database/route.ts].
-   **`action` Parameter (GET)**: `init`, `stats`, `all`, `title-screening`, `abstract-screening`, `included`, `getPrompt`, `getApiKey` [cite: uploaded:src/app/api/database/route.ts].
-   **`action` Parameter (POST)**: `save` (entries), `update-screening`, `update-abstract`, `clear`, `savePrompt`, `saveApiKey` [cite: uploaded:src/app/api/database/route.ts].
-   **Authentication**: None implemented [cite: uploaded:src/app/api/database/route.ts].
-   **Request/Response**: Varies based on the action. Typically JSON [cite: uploaded:src/app/api/database/route.ts].

### 2. Internal Gemini API (`/api/gemini`) [cite: uploaded:src/app/api/gemini/route.ts]

-   **Purpose**: Interacts with the Google Generative AI (Gemini) service for AI-assisted screening [cite: uploaded:src/app/api/gemini/route.ts].
-   **Methods**: POST (single processing), PUT (batch processing) [cite: uploaded:src/app/api/gemini/route.ts].
-   **Authentication**: Requires passing the Gemini API Key in the request body (obtained from the database via `getAPIKey`) [cite: uploaded:src/app/api/gemini/route.ts, uploaded:src/app/utils/database.ts].
-   **Request Body (POST)**: `{ prompt: string, text: string, screeningType?: 'title' | 'abstract', apiKey: string }` [cite: uploaded:src/app/api/gemini/route.ts].
-   **Request Body (PUT)**: `{ prompt: string, items: { id: string, text: string }[], screeningType?: 'title' | 'abstract', apiKey: string }` [cite: uploaded:src/app/api/gemini/route.ts].
-   **Response**: JSON object containing the raw response and potentially a parsed structure `{ raw: string, parsed?: { decision: string, confidence: number, reasoning: string }, error?: string }` [cite: uploaded:src/app/api/gemini/route.ts].

### 3. Mock External BibTeX APIs (`/api/bibtex/*`)

-   **Endpoints**: `/api/bibtex/scopus` [cite: uploaded:src/app/api/bibtex/scopus/route.ts], `/api/bibtex/ieee` [cite: uploaded:src/app/api/bibtex/ieee/route.ts], `/api/bibtex/springer` [cite: uploaded:src/app/api/bibtex/springer/route.ts]
-   **Method**: GET [cite: uploaded:src/app/api/bibtex/scopus/route.ts, uploaded:src/app/api/bibtex/ieee/route.ts, uploaded:src/app/api/bibtex/springer/route.ts]
-   **Purpose**: Provide *mock* responses simulating external academic database APIs [cite: uploaded:src/app/api/bibtex/scopus/route.ts, uploaded:src/app/api/bibtex/ieee/route.ts, uploaded:src/app/api/bibtex/springer/route.ts].
-   **Parameters**: `query`, `keywords`, `count`/`max_records`, `start_record` (IEEE) [cite: uploaded:src/app/api/bibtex/scopus/route.ts, uploaded:src/app/api/bibtex/ieee/route.ts, uploaded:src/app/api/bibtex/springer/route.ts].
-   **Response**: Mock `BibTeXResponse` object with `total_results` and `bibtex` string [cite: uploaded:src/app/api/bibtex/scopus/route.ts, uploaded:src/app/api/bibtex/ieee/route.ts, uploaded:src/app/api/bibtex/springer/route.ts].

## BibTeX Parsing

The `bibtex-parse-js` library parses BibTeX strings via the `parseBibtex` function in `src/app/utils/bibtexParser.ts` [cite: uploaded:src/app/utils/bibtexParser.ts]. The output is mapped to the `BibEntry` interface defined in `src/app/types.ts` [cite: uploaded:src/app/utils/bibtexParser.ts, uploaded:src/app/types.ts].

## UI Components (Conceptual)

The main UI is built with Ant Design components:

1.  **Layout**: Ant Design `Layout` with `Header` and `Content`.
2.  **Search Form**: Inputs for query/keywords, buttons for mock database search.
3.  **File Upload**: Accepts `.bib` files.
4.  **Results/Screening Table**: Displays `BibEntry` data. Likely includes:
    * Sortable columns for key fields (Title, Author, Year, Source).
    * Expandable rows showing detailed info (Abstract, DOI, URL, Keywords, Volume/Issue, Publisher, etc.) [cite: uploaded:src/app/types.ts].
    * Columns/controls for viewing/updating `title_screening_status` and `abstract_screening_status` [cite: uploaded:src/app/types.ts].
    * Buttons/actions for AI-assisted screening (using Gemini) [cite: uploaded:src/app/services/geminiService.ts].
5.  **Settings Panel**: Inputs for saving Gemini API Key and custom AI prompts [cite: uploaded:src/app/utils/database.ts].

## Development Setup

1.  **Installation**:
    ```bash
    npm install
    ```
2.  **Database Initialization (First time or if `literature-review.db` is missing)** [cite: uploaded:src/app/utils/initDb.ts]:
    ```bash
    node src/app/utils/initDb.ts
    ```
    * Or, the database might initialize automatically on the first API call to `/api/database` depending on error handling [cite: uploaded:src/app/api/database/route.ts].
3.  **Configuration**:
    * Optionally update mock API settings in `src/app/config/api.ts` [cite: uploaded:src/app/config/api.ts].
    * Set Gemini API Key via the application's UI (Settings Panel) which saves it to the database [cite: uploaded:src/app/utils/database.ts].
4.  **Running the Development Server**:
    ```bash
    npm run dev
    ```
5.  **Building for Production**:
    ```bash
    npm run build
    ```

## Future Enhancements

1.  **Real API Integration**: Replace mock BibTeX APIs with actual integrations.
2.  **Authentication**: Add user accounts for personalized databases and settings.
3.  **Saved Searches**: Allow users to save search queries.
4.  **Export Options**: Add CSV, JSON, or formatted BibTeX export for selected/included entries.
5.  **Advanced Filtering/Searching**: Implement more complex filtering on the results table.
6.  **Duplicate Detection**: Add functionality to identify and merge duplicate entries.
7.  **UI Polish**: Refine UI/UX for screening workflows.
8.  **Error Handling**: Improve robustness and user feedback for API/database errors.

## To-Do Tasks (Based on Initial Request & Code)

### Table Enhancements

1.  **Define columns to show in the table:**
    * *Status:* Likely implemented. Key fields: Title, Author, Year, Source, Title Status, Abstract Status [cite: uploaded:src/app/types.ts].
    * *Sorting:* Ensure all relevant columns are sortable.
2.  **Extend table functionality with expandable rows:**
    * *Status:* Likely implemented or partially implemented based on `BibEntry` fields [cite: uploaded:src/app/types.ts].
    * *Content:* Display Abstract (show "N/A" if missing), DOI, URL, Keywords, Pages, Volume/Issue, Publisher, Conference/Journal information in the expanded section [cite: uploaded:src/app/types.ts].
    * *Actions:* Consider adding "Copy Citation" or "View Details" actions.

### New Tasks (Identified from Code)

1.  **Gemini Integration UI:**
    * Implement UI elements (buttons, status indicators) for initiating single and batch AI screening [cite: uploaded:src/app/services/geminiService.ts].
    * Display Gemini results (decision, confidence, reasoning) clearly [cite: uploaded:src/app/api/gemini/route.ts].
    * Allow users to configure/edit AI prompts in settings [cite: uploaded:src/app/utils/database.ts].
    * Implement UI for saving the Gemini API Key [cite: uploaded:src/app/utils/database.ts].
2.  **Screening Workflow UI:**
    * Develop intuitive UI controls for setting `title_screening_status` and `abstract_screening_status` (e.g., buttons, dropdowns) [cite: uploaded:src/app/types.ts].
    * Provide text areas for adding screening notes (`title_screening_notes`, `abstract_screening_notes`) [cite: uploaded:src/app/types.ts, uploaded:src/app/utils/database.ts].
    * Ensure smooth data flow between UI actions and database updates via API calls [cite: uploaded:src/app/utils/database.ts, uploaded:src/app/api/database/route.ts].
3.  **Database Management UI:**
    * Provide options to view database statistics (total entries, screening progress) [cite: uploaded:src/app/utils/database.ts].
    * Implement a "Clear Database" button with appropriate warnings [cite: uploaded:src/app/utils/database.ts, uploaded:src/app/api/database/route.ts].
