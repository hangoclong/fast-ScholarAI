'use client';

import React, { useState, useCallback } from 'react';
import { Button, Modal, Progress, Typography, List, Tag, Space, message, Tooltip } from 'antd'; // Added Tooltip
import { RobotOutlined, SettingOutlined, InfoCircleOutlined } from '@ant-design/icons'; // Added InfoCircleOutlined
import { BibEntry, ScreeningStatus } from '../types';
import { getAIPrompt, updateScreeningStatusBatch } from '../utils/database'; // Import batch update function
// Import the new service function and the updated BatchResultItem type
import { processBatchPromptWithGemini, BatchResultItem } from '../services/geminiService';
import AIPromptDialog from './AIPromptDialog';

const { Text, Paragraph } = Typography; // Removed Link as it's not used

interface AIBatchProcessorProps {
  entries: BibEntry[];
  screeningType: 'title' | 'abstract';
  selectedModel?: string; // Add selectedModel prop
  onScreeningAction: (id: string, status: ScreeningStatus, notes?: string, confidence?: number) => void; // Added confidence
  onComplete: () => void;
}

// Use BatchResultItem directly for the results state, as it now includes all needed fields
// interface DisplayResult { ... } // Removed DisplayResult

const AIBatchProcessor: React.FC<AIBatchProcessorProps> = ({
  entries,
  screeningType,
  selectedModel, // Destructure selectedModel
  onScreeningAction,
  onComplete,
}) => {
  const [promptDialogVisible, setPromptDialogVisible] = useState<boolean>(false);
  const [processing, setProcessing] = useState<boolean>(false);
  const [processingModalVisible, setProcessingModalVisible] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  // Use BatchResultItem for results state, as it matches the service response
  const [results, setResults] = useState<BatchResultItem[]>([]); 
  const [apiAttemptStatus, setApiAttemptStatus] = useState<string>(''); // State for API key status
  const [messageApi, contextHolder] = message.useMessage();
  const BATCH_SIZE = 50; // Define batch size

  // Callback for geminiService to report key attempts
  const handleApiAttempt = useCallback((keyIndex: number, totalKeys: number) => {
    setApiAttemptStatus(`Attempting with Key ${keyIndex}/${totalKeys}...`);
  }, []);

  // Extract the relevant text from an entry based on the screening type
  const extractText = (entry: BibEntry): string => {
    return screeningType === 'title'
      ? entry.title || ''
      : (entry.abstract || entry.title || ''); // Use abstract, fallback to title if abstract is empty
  };

  // Helper to determine status from decision string
  const getStatusFromDecision = (decision: string): ScreeningStatus => {
    const lowerDecision = decision?.toLowerCase() || '';
    if (lowerDecision.includes('include')) return 'included';
    if (lowerDecision.includes('exclude')) return 'excluded';
    if (lowerDecision.includes('maybe')) return 'maybe';
    return 'pending'; // Default if decision is unclear
  };

  // Start batch processing
  const startBatchProcessing = async () => {
    try {
      setProcessing(true);
      setProcessingModalVisible(true);
      setProgress(0);
      setResults([]); // Clear previous results
      setApiAttemptStatus(''); // Reset status message

      // Get the prompt
      // Get the base prompt (instructions without the entry list)
      let basePrompt: string | null;
      try {
        basePrompt = await getAIPrompt(screeningType);
        if (!basePrompt) {
          // Use a default prompt if none is saved - IMPORTANT: Ensure this default asks for the JSON array.
          // For now, we'll throw an error if no prompt is configured.
          throw new Error(`AI prompt for ${screeningType} screening is not configured. Please set it in the 'Edit AI Prompt' dialog.`);
        }
        console.log(`Using ${screeningType} screening base prompt.`);
      } catch (error: any) {
        messageApi.error(`Failed to get AI prompt: ${error.message || 'Unknown error'}. Please configure it first.`);
        setProcessingModalVisible(false);
        setProcessing(false);
        return;
      }

      // Filter entries that are still pending
      if (!entries || entries.length === 0) {
        messageApi.info('No entries available for processing');
        setProcessingModalVisible(false);
        setProcessing(false);
        return;
      }

      const pendingEntries = entries.filter(entry => {
        // Correctly access the status properties based on the BibEntry type
        const currentStatus = screeningType === 'title' 
          ? entry.title_screening_status 
          : entry.abstract_screening_status;
        // Process entries that are 'pending' or 'maybe' (allow re-processing 'maybe')
        return currentStatus === 'pending' || currentStatus === 'maybe';
      });

      if (pendingEntries.length === 0) {
        messageApi.info('No pending or maybe entries to process');
        setProcessingModalVisible(false);
        setProcessing(false);
        return;
      }

      // Corrected: Declare variables only once
      const totalEntriesToProcess = pendingEntries.length;
      let processedCount = 0;
      const allBatchApiResults: BatchResultItem[] = []; // Store results from API calls

      // Process entries in batches
      for (let i = 0; i < totalEntriesToProcess; i += BATCH_SIZE) {
        const batchEntries = pendingEntries.slice(i, i + BATCH_SIZE);
        
        // Format the current batch into the required string format
        const entryListString = batchEntries
          .map(entry => `id: ${entry.ID}; ${screeningType}: ${extractText(entry)}`)
          .join('\n');

        // Construct the full prompt for this batch
        // IMPORTANT: Ensure basePrompt includes instructions for the JSON array output format.
        const fullPrompt = `${basePrompt}\n\nList of entries:\n\n${entryListString}`;

        if (batchEntries.length === 0) continue;

        const currentBatchNumber = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(totalEntriesToProcess / BATCH_SIZE);
        console.log(`Processing batch ${currentBatchNumber}/${totalBatches} (Size: ${batchEntries.length})`);
        setApiAttemptStatus(`Processing batch ${currentBatchNumber}/${totalBatches}...`);

        try {
          // Call the new single-prompt batch processing service function
          const batchResults: BatchResultItem[] = await processBatchPromptWithGemini(
            fullPrompt,
            handleApiAttempt, // Pass the callback
            selectedModel // Pass the selected model name
          );

          // Add results from this API call to the overall results
          allBatchApiResults.push(...batchResults);

          // Update progress based on the number of entries *attempted* in this batch
          // (even if some results have errors, they were part of the attempt)
          processedCount += batchEntries.length;
          setProgress(Math.floor((processedCount / totalEntriesToProcess) * 100));

        } catch (batchError: any) {
          console.error(`Error processing batch ${currentBatchNumber}:`, batchError);
          messageApi.error(`Batch ${currentBatchNumber} Error: ${batchError.message || 'Unknown error'}`);
          // Mark all items *intended* for this batch as errored in the results display
          batchEntries.forEach(entry => {
            // Avoid adding duplicate errors if an item somehow already got an error result
            if (!allBatchApiResults.some(r => r.id === entry.ID)) {
                 allBatchApiResults.push({ 
                     id: entry.ID, 
                     decision: 'MAYBE', // Default status on error
                     confidence: 0, 
                     reasoning: `Batch Error: ${batchError.message}`, 
                     error: batchError.message 
                 });
            }
          });
           // Update progress to reflect attempted items
           processedCount += batchEntries.length; 
           // Ensure progress doesn't exceed 100 if error occurs on last batch
           setProgress(Math.min(Math.floor((processedCount / totalEntriesToProcess) * 100), 100)); 
          // Decide whether to continue to the next batch or stop
          // continue; // Or break; depending on desired behavior
        }
      } // End of batch loop

      // Now process all collected results to prepare for batch database update
      const updatesForDb = allBatchApiResults
        .filter(result => !result.error) // Filter out items that had processing errors
        .map(result => ({
          id: result.id,
          screeningType: screeningType, // Pass the current screening type
          status: getStatusFromDecision(result.decision),
          notes: result.reasoning,
          confidence: result.confidence,
        }));

      // Perform batch database update if there are valid updates
      if (updatesForDb.length > 0) {
        console.log(`Attempting batch database update for ${updatesForDb.length} entries...`);
        try {
          const dbUpdateResult = await updateScreeningStatusBatch(updatesForDb);
          console.log('Batch DB update result:', dbUpdateResult);
          messageApi.success(`Processing complete. DB Updates - Success: ${dbUpdateResult.successCount}, Errors: ${dbUpdateResult.errorCount}`);

          // Add errors from DB update back to the results for display
          if (dbUpdateResult.errors && dbUpdateResult.errors.length > 0) {
             allBatchApiResults.forEach(displayResult => {
               const dbError = dbUpdateResult.errors.find(e => e.id === displayResult.id);
               if (dbError) {
                 displayResult.error = `DB Update Failed: ${dbError.message}`;
               }
             });
          }

        } catch (dbBatchError: any) {
          console.error('Failed to execute batch database update:', dbBatchError);
          messageApi.error(`Batch DB Update Failed: ${dbBatchError.message}`);
          // Mark all attempted updates as errored in the display
           allBatchApiResults.forEach(displayResult => {
             if (!displayResult.error) { // Avoid overwriting existing processing errors
                displayResult.error = `Batch DB Update Failed: ${dbBatchError.message}`;
             }
           });
        }
      } else {
         messageApi.info('Processing complete. No valid results to update in the database.');
      }

      setResults(allBatchApiResults); // Update results state with potentially added DB errors
      onComplete(); // Notify parent component that processing is finished

    } catch (error: any) {
      // Catch errors outside the batch loop (e.g., getting prompt)
      messageApi.error(`Critical error during batch processing setup: ${error.message}`);
      console.error('Batch processing setup error:', error);
      setProcessingModalVisible(false); // Close modal on critical setup error
    } finally {
      setProcessing(false); // Ensure processing state is reset
      setApiAttemptStatus(''); // Clear API attempt status
    }
  };

  // Get the status tag color
  const getStatusColor = (status: ScreeningStatus): string => {
    switch (status) {
      case 'included': return 'success';
      case 'excluded': return 'error';
      case 'maybe': return 'warning';
      default: return 'default'; // pending
    }
  };

  return (
    <>
      {contextHolder}

      {/* AI Batch Processing Button and Settings Button */}
      <Space>
        <Button
          type="primary"
          icon={<RobotOutlined />}
          onClick={startBatchProcessing}
          loading={processing}
          disabled={processing}
          className="hover:shadow-md transition-all duration-300"
        >
          AI Batch Processing
        </Button>

        <Button
          icon={<SettingOutlined />}
          onClick={() => setPromptDialogVisible(true)}
          className="hover:shadow-md transition-all duration-300"
        >
          Edit AI Prompt
        </Button>
      </Space>

      {/* AI Prompt Dialog */}
      <AIPromptDialog
        screeningType={screeningType}
        visible={promptDialogVisible}
        onClose={() => setPromptDialogVisible(false)}
        onSave={() => messageApi.success('Prompt settings saved successfully')}
      />

      {/* Processing Modal */}
      <Modal
        title="AI Batch Processing Results"
        open={processingModalVisible}
        onCancel={() => !processing && setProcessingModalVisible(false)} // Prevent closing while processing
        footer={[
          <Button 
            key="close" 
            onClick={() => setProcessingModalVisible(false)}
            disabled={processing} // Disable close button while processing
          >
            Close
          </Button>
        ]}
        width={800} // Increased width for better display
        maskClosable={!processing} // Prevent closing by clicking outside while processing
      >
        {processing ? (
          <div>
            <Paragraph>Processing entries with AI (Batch Size: {BATCH_SIZE})...</Paragraph>
            <Progress percent={progress} status="active" />
            {apiAttemptStatus && <Paragraph style={{ marginTop: '8px', color: '#888' }}>{apiAttemptStatus}</Paragraph>}
          </div>
        ) : results.length > 0 ? (
          <div>
            {/* Use the results state which now holds BatchResultItem[] */}
            <Paragraph>Processing complete! Attempted {results.length} entries.</Paragraph>
            <List
              size="small"
              bordered
              dataSource={results} // Use the results state directly
              renderItem={item => (
                <List.Item key={item.id}>
                  <List.Item.Meta
                     title={<Text strong>{item.id}</Text>}
                     description={
                       <Space direction="vertical" style={{ width: '100%' }}>
                         {/* Determine status based on decision */}
                         <Tag color={getStatusColor(getStatusFromDecision(item.decision))}>
                           {item.decision.toUpperCase()} {item.confidence !== undefined ? `(${(item.confidence * 100).toFixed(0)}%)` : ''}
                         </Tag>
                         {/* Display reasoning as notes */}
                         <Text type={item.error ? 'danger' : undefined} ellipsis={{ tooltip: item.reasoning }}>
                            {item.reasoning}
                         </Text>
                       </Space>
                     }
                  />
                   {/* Show error icon if item.error exists */}
                   {item.error && (
                      <Tooltip title={item.error}>
                        <InfoCircleOutlined style={{ color: 'red', marginLeft: 8 }} />
                      </Tooltip>
                    )}
                </List.Item>
              )}
              style={{ maxHeight: '400px', overflowY: 'auto' }} // Make list scrollable
            />
          </div>
        ) : (
          <Paragraph>Processing finished, but no results were generated (check console for errors or ensure entries were pending).</Paragraph>
        )}
      </Modal>
    </>
  );
};

export default AIBatchProcessor;
