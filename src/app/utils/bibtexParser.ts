import { BibEntry } from '../types';
import * as BibtexParse from 'bibtex-parse-js';

/**
 * Parse BibTeX string into structured JavaScript objects
 * @param bibtexString Raw BibTeX string from API or file
 * @returns Array of parsed BibTeX entries
 */
export const parseBibtex = (bibtexString: string): BibEntry[] => {
  try {
    // Parse the BibTeX string into an array of entries
    const entries = BibtexParse.toJSON(bibtexString);
    
    // Map the entries to our BibEntry interface
    return entries.map((entry: any) => {
      // Extract the entry type and citation key
      const { entryType, citationKey, entryTags } = entry;
      
      // Create a structured BibEntry object
      return {
        ID: citationKey,
        ENTRYTYPE: entryType,
        ...entryTags
      };
    });
  } catch (error) {
    console.error('Error parsing BibTeX:', error);
    return [];
  }
};
