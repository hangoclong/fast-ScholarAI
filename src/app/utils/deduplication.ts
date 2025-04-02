import { BibEntry } from '../types';
import { compareTwoStrings } from 'string-similarity';
import { v4 as uuidv4 } from 'uuid'; // For generating unique group IDs

// Define a threshold for title similarity (adjust as needed)
const TITLE_SIMILARITY_THRESHOLD = 0.95;

/**
 * Identifies potential duplicate entries based on DOI and title similarity.
 * Marks entries with duplicate flags and assigns a group ID.
 * Prioritizes the entry with the richest abstract as the primary duplicate.
 * 
 * @param entries - An array of BibEntry objects.
 * @returns The array of BibEntry objects with deduplication fields potentially updated.
 */
export function findPotentialDuplicates(entries: BibEntry[]): BibEntry[] {
  const processedEntries = new Set<string>(); // Keep track of entries already assigned to a group
  const potentialDuplicates: BibEntry[] = []; // Store entries identified as duplicates

  for (let i = 0; i < entries.length; i++) {
    // Skip if already part of a duplicate group found earlier
    if (processedEntries.has(entries[i].ID)) {
      continue;
    }

    const currentGroup: BibEntry[] = [entries[i]]; // Start a new potential group
    let currentGroupId: string | null = null;

    for (let j = i + 1; j < entries.length; j++) {
      // Skip if already processed
      if (processedEntries.has(entries[j].ID)) {
        continue;
      }

      let isPotentialDuplicate = false;

      // Criterion 1: Exact DOI match (if both DOIs exist and are non-empty)
      if (entries[i].doi && entries[j].doi && entries[i].doi === entries[j].doi) {
        isPotentialDuplicate = true;
      } 
      // Criterion 2: High title similarity (if titles exist)
      // else if (entries[i].title && entries[j].title) {
      //   const similarity = compareTwoStrings(entries[i].title!.toLowerCase(), entries[j].title!.toLowerCase());
      //   if (similarity >= TITLE_SIMILARITY_THRESHOLD) {
      //     isPotentialDuplicate = true;
      //   }
      // }

      if (isPotentialDuplicate) {
        // Assign a group ID if this is the first duplicate found for entry i
        if (!currentGroupId) {
          currentGroupId = uuidv4(); // Generate a unique ID for the group
          entries[i].duplicate_group_id = currentGroupId; // Assign to entry i
          entries[i].is_duplicate = 1;
          processedEntries.add(entries[i].ID); // Mark entry i as processed
        }
        
        // Add entry j to the group and mark it, ensuring currentGroupId is not null
        if (currentGroupId) { 
          entries[j].duplicate_group_id = currentGroupId; // Assign to entry j
          entries[j].is_duplicate = 1;
          currentGroup.push(entries[j]);
          processedEntries.add(entries[j].ID); // Mark entry j as processed
        } else {
           // This case should logically not happen if isPotentialDuplicate is true, 
           // but adding for robustness or potential logic changes.
           console.error("Error: currentGroupId is null despite finding a potential duplicate.");
        }
      }
    }

    // If duplicates were found for entry i (group has more than one member)
    if (currentGroup.length > 1 && currentGroupId) {
        potentialDuplicates.push(...currentGroup); // Add all members of the group

        // Determine the primary entry within the group based on abstract
        let primaryEntry = currentGroup[0];
        let maxAbstractLength = primaryEntry.abstract?.length || 0;

        for (let k = 1; k < currentGroup.length; k++) {
            const currentAbstractLength = currentGroup[k].abstract?.length || 0;
            if (currentAbstractLength > maxAbstractLength) {
                maxAbstractLength = currentAbstractLength;
                primaryEntry = currentGroup[k];
            }
        }

        // Mark the chosen primary entry
        primaryEntry.is_primary_duplicate = 1;
        // Ensure others in the group are marked as not primary (redundant if default is 0, but safe)
        currentGroup.forEach(entry => {
            if (entry.ID !== primaryEntry.ID) {
                entry.is_primary_duplicate = 0;
            }
        });
    }
  }

  // Note: This function modifies the entries array directly for simplicity here.
  // Depending on usage, you might want to return a new array or just the updates.
  // For now, we assume modification in place is acceptable for the API integration.
  return entries; 
}

/**
 * Updates the database with the identified duplicate information.
 * This function would typically be called after findPotentialDuplicates.
 * 
 * @param db - The database connection instance.
 * @param updatedEntries - Entries potentially marked with duplicate info.
 */
// Example of how you might integrate this (implementation detail for the API route)
/*
async function updateDatabaseWithDuplicates(db: Database, updatedEntries: BibEntry[]) {
  const duplicatesToUpdate = updatedEntries.filter(e => e.is_duplicate === 1);
  if (duplicatesToUpdate.length === 0) return;

  try {
    await db.run('BEGIN TRANSACTION');
    const stmt = await db.prepare(`
      UPDATE entries 
      SET 
        duplicate_group_id = ?, 
        is_duplicate = ?, 
        is_primary_duplicate = ?,
        deduplication_status = 'pending' -- Set status to pending for review
      WHERE id = ?
    `);

    for (const entry of duplicatesToUpdate) {
      await stmt.run(
        entry.duplicate_group_id,
        entry.is_duplicate,
        entry.is_primary_duplicate,
        entry.ID
      );
    }

    await stmt.finalize();
    await db.run('COMMIT');
    console.log(`Marked ${duplicatesToUpdate.length} entries for deduplication review.`);

  } catch (error) {
    await db.run('ROLLBACK');
    console.error('Error updating database with duplicate information:', error);
    throw error; // Re-throw to be handled by the caller
  }
}
*/
