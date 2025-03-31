// BibTeX entry types and interfaces

export interface BibEntry {
  ID: string;
  ENTRYTYPE: string;
  title?: string;
  author?: string;
  year?: string;
  journal?: string;
  booktitle?: string;
  publisher?: string;
  abstract?: string;
  doi?: string;
  url?: string;
  keywords?: string;
  pages?: string;
  volume?: string;
  number?: string; // Issue number
  source?: string; // Source database or file
  source_database?: string; // Specific database source (e.g., Scopus, Web of Science)
  title_screening_status?: ScreeningStatus;
  abstract_screening_status?: ScreeningStatus;
  notes?: string;
  [key: string]: any; // For any other BibTeX fields
}

export interface SearchParams {
  query: string;
  keywords?: string;
  count?: number;
}

export type ScreeningStatus = 'pending' | 'in_progress' | 'included' | 'excluded' | 'maybe';

export interface ScreeningAction {
  id: string;
  status: ScreeningStatus;
  notes?: string;
}
