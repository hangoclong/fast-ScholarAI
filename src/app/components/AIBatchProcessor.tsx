'use client';

import React, { useState, useCallback } from 'react'; // Added useCallback
import { Button, Modal, Progress, Typography, List, Tag, Space, message } from 'antd';
import { RobotOutlined, SettingOutlined } from '@ant-design/icons';
import { BibEntry, ScreeningStatus } from '../types';
import { getAIPrompt } from '../utils/database'; // Removed getAPIKey import here, service handles it
import { processWithGemini } from '../services/geminiService'; // Correct import
import AIPromptDialog from './AIPromptDialog';

const { Text, Paragraph } = Typography;

interface AIBatchProcessorProps {
  entries: BibEntry[];
  screeningType: 'title' | 'abstract';
  onScreeningAction: (id: string, status: ScreeningStatus, notes?: string) => void;
  onComplete: () => void;
}

const AIBatchProcessor: React.FC<AIBatchProcessorProps> = ({
  entries,
  screeningType,
  onScreeningAction,
  onComplete,
}) => {
  const [promptDialogVisible, setPromptDialogVisible] = useState<boolean>(false);
  const [processing, setProcessing] = useState<boolean>(false);
  const [processingModalVisible, setProcessingModalVisible] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [results, setResults] = useState<{id: string, status: ScreeningStatus, notes: string}[]>([]);
  const [apiAttemptStatus, setApiAttemptStatus] = useState<string>(''); // State for API key status
  const [messageApi, contextHolder] = message.useMessage();

  // Callback for geminiService to report key attempts
  const handleApiAttempt = useCallback((keyIndex: number, totalKeys: number) => {
    setApiAttemptStatus(`Attempting with Key ${keyIndex}/${totalKeys}...`);
  }, []);

  // Extract the relevant text from an entry based on the screening type
  const extractText = (entry: BibEntry): string => {
    return screeningType === 'title' 
      ? entry.title || '' 
      : (entry.abstract || entry.title || '');
  };

  // Parse the AI response to determine the screening status
  const parseAIResponse = (response: string): { status: ScreeningStatus, notes: string } => {
    console.log('Parsing AI response:', response);
    
    try {
      // First try to parse as JSON
      if (response.trim().startsWith('{')) {
        try {
          const jsonResponse = JSON.parse(response);
          console.log('Successfully parsed JSON response:', jsonResponse);
          
          // Check for structured format with decision field
          if (jsonResponse.decision) {
            const decision = jsonResponse.decision.toLowerCase();
            let status: ScreeningStatus = 'pending';
            
            if (decision.includes('include')) {
              status = 'included';
            } else if (decision.includes('exclude')) {
              status = 'excluded';
            } else if (decision.includes('maybe')) {
              status = 'maybe';
            }
            
            // Include reasoning in notes if available
            const notes = jsonResponse.reasoning || jsonResponse.explanation || response;
            console.log('Determined status from JSON:', { status, notes });
            return { status, notes };
          }
        } catch (e) {
          console.warn('Failed to parse as JSON, falling back to text analysis:', e);
        }
      }
      
      // Fall back to text analysis
      const upperResponse = response.toUpperCase();
      let status: ScreeningStatus = 'pending';
      
      if (upperResponse.includes('INCLUDE')) {
        status = 'included';
      } else if (upperResponse.includes('EXCLUDE')) {
        status = 'excluded';
      } else if (upperResponse.includes('MAYBE')) {
        status = 'maybe';
      }
      
      console.log('Determined status from text analysis:', { status, notes: response });
      return { status, notes: response };
    } catch (error) {
      console.error('Error parsing AI response:', error);
      return { status: 'pending', notes: `Error parsing response: ${response}` };
    }
  };

  // Start batch processing
  const startBatchProcessing = async () => {
    try {
      setProcessing(true);
      setProcessingModalVisible(true);
      setProgress(0);
      setResults([]);
      setApiAttemptStatus(''); // Reset status message

      // Get the prompt
      let prompt;
      try {
        prompt = await getAIPrompt(screeningType);
      } catch (error: any) {
        messageApi.error(`Failed to get AI prompt: ${error.message || 'Unknown error'}`);
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
        if (screeningType === 'title') {
          return entry.titleScreening !== 'included' && entry.titleScreening !== 'excluded';
        } else {
          return entry.abstractScreening !== 'included' && entry.abstractScreening !== 'excluded';
        }
      });
      
      if (pendingEntries.length === 0) {
        messageApi.info('No pending entries to process');
        setProcessingModalVisible(false);
        setProcessing(false);
        return;
      }
      
      // Prepare items for batch processing
      const items = pendingEntries.map(entry => ({
        id: entry.id,
        text: extractText(entry)
      }));

      // Process entries one by one
      const processedResults = [];
      let processedCount = 0;
      const totalEntriesToProcess = pendingEntries.length;

      for (const entry of pendingEntries) {
        processedCount++;
        setProgress(Math.floor((processedCount / totalEntriesToProcess) * 100));

        try {
          console.log(`Processing entry ${entry.ID}...`);
          setApiAttemptStatus('Preparing request...'); // Initial status before first key attempt
          const textToProcess = extractText(entry);
          
          // Pass the callback to processWithGemini
          const resultText = await processWithGemini(
            prompt, 
            textToProcess, 
            screeningType, 
            handleApiAttempt // Pass the callback here
          );
          
          const { status, notes } = parseAIResponse(resultText);

          processedResults.push({ id: entry.ID, status: status as ScreeningStatus, notes });

          // Update the entry status immediately
          await onScreeningAction(entry.ID, status as ScreeningStatus, notes);
          console.log(`Successfully processed and updated entry ${entry.ID}`);

          // Optional: Add a small delay between requests if needed
          // await new Promise(resolve => setTimeout(resolve, 200));

        } catch (error: any) {
          console.error(`Error processing entry ${entry.ID}:`, error);
          messageApi.error(`Error processing entry ${entry.ID}: ${error.message}`);
          // Add error result to display later
          processedResults.push({ id: entry.ID, status: 'pending' as ScreeningStatus, notes: `Error: ${error.message}` });
          // Optionally continue to the next entry or stop processing
          // continue;
        }
      }
      
      setResults(processedResults);
      messageApi.success(`Processed ${processedResults.length} entries`);
      onComplete();
    } catch (error: any) {
      messageApi.error(`Error during batch processing: ${error.message}`);
      console.error('Batch processing error:', error);
    } finally {
      setProcessing(false);
    }
  };

  // Get the status tag color
  const getStatusColor = (status: ScreeningStatus): string => {
    switch (status) {
      case 'included': return 'success';
      case 'excluded': return 'error';
      case 'maybe': return 'warning';
      default: return 'default';
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
        title="AI Batch Processing"
        open={processingModalVisible}
        onCancel={() => setProcessingModalVisible(false)}
        footer={[
          <Button 
            key="close" 
            onClick={() => setProcessingModalVisible(false)}
            disabled={processing}
          >
            Close
          </Button>
        ]}
        width={600}
      >
        {processing ? (
          <div>
            <Paragraph>Processing entries with AI...</Paragraph>
            <Progress percent={progress} status="active" />
            {apiAttemptStatus && <Paragraph style={{ marginTop: '8px', color: '#888' }}>{apiAttemptStatus}</Paragraph>} 
          </div>
        ) : results.length > 0 ? (
          <div>
            <Paragraph>Processing complete! Here are the results:</Paragraph>
            <List
              size="small"
              bordered
              dataSource={results}
              renderItem={item => (
                <List.Item>
                  <Space>
                    <Tag color={getStatusColor(item.status)}>
                      {item.status.toUpperCase()}
                    </Tag>
                    <Text ellipsis style={{ maxWidth: 400 }}>{item.notes}</Text>
                  </Space>
                </List.Item>
              )}
            />
          </div>
        ) : (
          <Paragraph>No results to display.</Paragraph>
        )}
      </Modal>
    </>
  );
};

export default AIBatchProcessor;
