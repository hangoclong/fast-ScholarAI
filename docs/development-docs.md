# Literature Review Tool - Development Documentation

## Overview

The Literature Review Tool is a Next.js application designed to help researchers manage bibliographic data for literature reviews. It provides a unified interface for searching academic databases (Scopus, IEEE, Springer) and importing BibTeX files from other sources.

## Architecture

### Technology Stack

- **Framework**: Next.js with TypeScript
- **UI Library**: Ant Design (antd)
- **State Management**: React useState hooks
- **API Client**: Axios
- **BibTeX Parsing**: bibtex-parse-js

### Project Structure

```
literature-review-tool/
├── src/
│   ├── app/
│   │   ├── abstract-screening/
│   │   │   └── page.tsx             # Abstract screening page
│   │   ├── api/
│   │   │   ├── bibtex/
│   │   │   │   ├── scopus/
│   │   │   │   │   └── route.ts     # Scopus BibTeX API endpoint
│   │   │   │   ├── ieee/
│   │   │   │   │   └── route.ts     # IEEE BibTeX API endpoint
│   │   │   │   └── springer/
│   │   │   │       └── route.ts     # Springer BibTeX API endpoint
│   │   │   ├── database/
│   │   │   │   └── route.ts         # Database API endpoint
│   │   │   └── gemini/
│   │   │       └── route.ts         # Gemini API endpoint
│   │   ├── components/
│   │   │   ├── AIBatchProcessor.tsx  # AI batch processor component
│   │   │   ├── AIPromptDialog.tsx   # AI prompt dialog component
│   │   │   ├── ExpandableRow.tsx    # Expandable row component
│   │   │   └── LiteratureTable.tsx  # Literature table component
│   │   ├── config/
│   │   │   └── api.ts               # API configuration settings
│   │   ├── included-literature/
│   │   │   └── page.tsx             # Included literature page
│   │   ├── search/
│   │   │   └── page.tsx             # Search page
│   │   ├── services/
│   │   │   └── geminiService.ts     # Gemini service
│   │   ├── title-screening/
│   │   │   └── page.tsx             # Title screening page
│   │   ├── utils/
│   │   │   ├── antd-compat.ts       # Ant Design compatibility utils
│   │   │   ├── bibtexParser.ts      # BibTeX parsing utility
│   │   │   └── database.ts          # Database utility
│   │   ├── favicon.ico              # Favicon
│   │   ├── globals.css              # Global styles
│   │   ├── layout.tsx               # App layout with Ant Design provider
│   │   ├── page.tsx                 # Main application page
│   │   ├── providers.tsx            # Ant Design provider setup
│   │   └── types.ts                 # TypeScript interfaces
├── docs/
│   ├── development-docs.md          # Development documentation
│   └── openAPI.json                 # API specification
└── public/                          # Static assets
```

## API Configuration

API settings are centralized in the `src/app/config/api.ts` file, which includes:

- **API_BASE_URL**: The base URL for the API server (default: http://localhost:8000)
- **API_KEY**: Authentication key for API requests. This is a placeholder value. You need to obtain a Gemini API key and set it in the application.

To use the Gemini service, you need to obtain a Gemini API key from Google AI Studio (https://makersuite.google.com/). Once you have the API key, you can save it in the application by navigating to the settings page and entering the key in the Gemini API Key field. The application will store the key in the database.

- **DEFAULT_PARAMS**: Default parameters for each API endpoint
- **ENDPOINTS**: Path definitions for each API endpoint
- **API_HEADERS**: API headers, including the `X-API-Key` header for authentication

## API Integration

The application integrates with three BibTeX API endpoints:

### 1. Scopus BibTeX API

- **Endpoint**: `/bibtex/scopus`
- **Method**: GET
- **Parameters**:
  - `query` (required): Search query string
  - `keywords` (optional): Comma-separated keywords
  - `count` (optional): Number of results (default: 25)
- **Headers**:
  - `X-API-Key` (required): API authentication key
- **Response**: BibTeXResponse object with `total_results` and `bibtex` fields

### 2. IEEE BibTeX API

- **Endpoint**: `/bibtex/ieee`
- **Method**: GET
- **Parameters**:
  - `query` (required): Search query string
  - `keywords` (optional): Comma-separated keywords
  - `max_records` (optional): Number of results (default: 25)
  - `start_record` (optional): Start index for pagination (default: 1)
- **Headers**:
  - `X-API-Key` (required): API authentication key
- **Response**: BibTeXResponse object with `total_results` and `bibtex` fields

### 3. Springer BibTeX API

- **Endpoint**: `/bibtex/springer`
- **Method**: GET
- **Parameters**:
  - `query` (required): Search query string
  - `keywords` (optional): Comma-separated keywords
  - `count` (optional): Number of results (default: 25)
- **Headers**:
  - `X-API-Key` (required): API authentication key
- **Response**: BibTeXResponse object with `total_results` and `bibtex` fields

## Gemini Service

The application uses the Gemini service to assist with title and abstract screening. The Gemini service is integrated using the `src/app/services/geminiService.ts` file.

The `processWithGemini` function processes text with the Gemini API for single items. The `batchProcessWithGemini` function processes multiple items with the Gemini API in batch.

Both functions retrieve the Gemini API key using `getAPIKey` from `../utils/database`. They make API requests to the `/api/gemini` Next.js API route.

The API responses are parsed to extract the decision, confidence, and reasoning from the Gemini API.

The AI prompts used by the Gemini service can be customized in the settings page. The prompts are stored in the database and associated with the `title` and `abstract` screening types.

## BibTeX Parsing

The application uses the `bibtex-parse-js` library to parse BibTeX strings into structured JavaScript objects. The parsing logic is encapsulated in the `parseBibtex` function in `src/app/utils/bibtexParser.ts`.

## UI Components

The main UI is built with Ant Design components:

1. **Layout**: The application uses Ant Design's `Layout` component with `Header` and `Content` sections.

2. **Search Form**: A form with input fields for the search query and keywords, along with buttons for each academic database.

3. **File Upload**: An upload component that accepts `.bib` files and processes them client-side.

4. **Results Table**: A table displaying the parsed BibTeX entries with sortable columns.

## Development Setup

1. **Installation**:
   ```bash
   npm install
   ```

2. **Configuration**:
   - Update the API settings in `src/app/config/api.ts` if needed
   - Default API server is set to `http://localhost:8000`
   - Default API key is set to `test_key_1`

- To initialize the database, run the following command in the terminal:
  ```bash
  npm run init-database
  ```
  This will create the `literature-review.db` file in the project root.

- To set the Gemini API key, navigate to the settings page in the application and enter the key in the Gemini API Key field. The application will store the key in the database.

3. **Running the Development Server**:
   ```bash
   npm run dev
   ```

4. **Building for Production**:
   ```bash
   npm run build
   ```

## Future Enhancements

1. **Authentication**: Add user authentication for personalized experiences.
2. **Saved Searches**: Allow users to save their search queries.
3. **Export Options**: Add options to export the table data in different formats (CSV, JSON).
4. **Advanced Filtering**: Implement more advanced filtering options for the results table.
5. **Citation Management**: Add features for managing citations and generating reference lists.

## To-Do Tasks

### Table Enhancements

1. **Define columns to show in the table**
   - Review and finalize which BibTeX fields should be displayed as columns
   - Consider adding additional columns based on user feedback
   - Determine optimal column widths and display formats
   - Add sorting capabilities for all columns

2. **Extend table functionality with expandable rows**
   - Implement expandable rows to show detailed information for each entry
   - Display the abstract in the expanded section (show "N/A" if not available)
   - Include all relevant bibliographic information in the expanded view:
     - DOI
     - URL
     - Keywords
     - Pages
     - Volume/Issue
     - Publisher details
     - Conference/Journal information
   - Add formatting options for the expanded content
   - Consider adding actions in the expanded view (e.g., copy citation, export)
