# Literature Review Tool

A modern web application for academic literature reviews that allows researchers to search multiple academic databases (Scopus, IEEE, Springer) and import BibTeX files for unified reference management.

## Features

- **Multi-Database Search**: Search Scopus, IEEE, and Springer databases directly from the application
- **BibTeX Import**: Upload and parse BibTeX files from other sources
- **Unified Display**: View all references in a consistent, sortable table format
- **Modern UI**: Built with Next.js and Ant Design for a responsive, user-friendly interface

## Getting Started

### Prerequisites

- Node.js 18.x or later
- npm 9.x or later

### Installation

1. Clone the repository
   ```bash
   git clone https://github.com/yourusername/literature-review-tool.git
   cd literature-review-tool
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Configure API settings (optional)
   - The default API server is set to `http://localhost:8000`
   - The default API key is set to `test_key_1`
   - You can modify these settings in `src/app/config/api.ts`

4. Run the development server
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) with your browser to see the application

## Usage

### Searching Academic Databases

1. Enter your search query in the "Search Query" field
2. Optionally add keywords in the "Keywords" field
3. Click one of the database search buttons (Scopus, IEEE, or Springer)
4. View the results in the table below

### Importing BibTeX Files

1. Click the "Select BibTeX File" button
2. Choose a .bib file from your computer
3. The references will be parsed and displayed in the table

## API Documentation

The application connects to a backend API server running at `http://localhost:8000` by default. All API requests require an API key for authentication, which is sent in the `X-API-Key` header.

### Scopus API

```
GET /bibtex/scopus
```

Parameters:
- `query` (required): Search query string
- `keywords` (optional): Comma-separated keywords
- `count` (optional): Number of results (default: 25)

### IEEE API

```
GET /bibtex/ieee
```

Parameters:
- `query` (required): Search query string
- `keywords` (optional): Comma-separated keywords
- `max_records` (optional): Number of results (default: 25)
- `start_record` (optional): Start index for pagination (default: 1)

### Springer API

```
GET /bibtex/springer
```

Parameters:
- `query` (required): Search query string
- `keywords` (optional): Comma-separated keywords
- `count` (optional): Number of results (default: 25)

For more detailed API documentation, see the [OpenAPI specification](./docs/openAPI.json).

## Development

For detailed development documentation, see the [Development Documentation](./docs/development-docs.md).

## Building for Production

```bash
npm run build
```

Then, you can start the production server:

```bash
npm start
```

## Technologies Used

- **Framework**: [Next.js](https://nextjs.org) with TypeScript
- **UI Library**: [Ant Design](https://ant.design)
- **API Client**: [Axios](https://axios-http.com)
- **BibTeX Parsing**: [bibtex-parse-js](https://github.com/ORCID/bibtex-parse-js)

## License

This project is licensed under the MIT License - see the LICENSE file for details.
