/**
 * API Configuration
 * This file contains all API-related configuration settings
 */

// Base API URL
export const API_BASE_URL = 'http://localhost:8000';

// API Key for authentication
export const API_KEY = 'test_key_1';

// Default parameters for API requests
export const DEFAULT_PARAMS = {
  scopus: {
    count: 25,
  },
  ieee: {
    max_records: 25,
    start_record: 1,
  },
  springer: {
    count: 25,
  },
};

// API Endpoints
export const ENDPOINTS = {
  scopus: '/bibtex/scopus',
  ieee: '/bibtex/ieee',
  springer: '/bibtex/springer',
};

// API Headers
export const API_HEADERS = {
  'X-API-Key': API_KEY,
};
