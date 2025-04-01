'use client';

import React, { useState } from 'react';
import { Button, Modal, Progress, Typography, List, Tag, Space, message } from 'antd';
import { RobotOutlined, SettingOutlined } from '@ant-design/icons';
import { BibEntry, ScreeningStatus } from '../types';
import { getAIPrompt } from '../utils/database';
import { batchProcessWithGemini } from '../services/geminiService';
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
  const [messageApi, contextHolder] = message.useMessage();

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
      
      // Get the prompt
      let prompt;
      try {
        prompt = await getAIPrompt(screeningType);
      } catch (error: any) {
        messageApi.error(`Failed to get AI prompt: ${error.message}`);
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
      
      const pendingEntries = entries.filter(entry => 
        screeningType === 'title' ? entry.titleScreening === 'pending' : entry.abstractScreening === 'pending'
      );
      
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
      
      // Process the entries in batches
      let batchResults;
      try {
        batchResults = await batchProcessWithGemini(prompt, items, screeningType);
      } catch (error: any) {
        // Check if the error is related to missing API key
        if (error.message && error.message.includes('API key')) {
          messageApi.error('API key is missing. Please set it in the settings.');
        } else {
          messageApi.error(`Error during batch processing: ${error.message}`);
        }
        console.error('Batch processing error:', error);
        setProcessingModalVisible(false);
        setProcessing(false);
        return;
      }
      
      // Process the results
      const processedResults = [];
      let processedCount = 0;
      
      console.log('Processing batch results:', batchResults);
      
      for (const result of batchResults) {
        processedCount++;
        setProgress(Math.floor((processedCount / pendingEntries.length) * 100));
        
        console.log('Processing result:', result);
        
        if (result.error) {
          console.error(`Error processing entry ${result.id}:`, result.error);
          continue;
        }
        
        const { status, notes } = parseAIResponse(result.result);
        processedResults.push({ id: result.id, status, notes });
        
        // Update the entry status
        try {
          console.log(`Updating entry ${result.id} with status:`, { status, notes });
          await onScreeningAction(result.id, status, notes);
          console.log(`Successfully updated entry ${result.id}`);
        } catch (error: any) {
          console.error(`Error updating entry ${result.id}:`, error);
          console.error('Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
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
