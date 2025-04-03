'use client';

import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Button, message, Typography, Divider, Space } from 'antd';
import { getAIPrompt, saveAIPrompt, getAPIKey, saveAPIKey } from '../utils/database';

const { TextArea } = Input;
const { Title, Text } = Typography;

interface AIPromptDialogProps {
  screeningType: 'title' | 'abstract';
  visible: boolean;
  onClose: () => void;
  onSave: () => void;
}

const AIPromptDialog: React.FC<AIPromptDialogProps> = ({
  screeningType,
  visible,
  onClose,
  onSave,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState<boolean>(false);
  const [messageApi, contextHolder] = message.useMessage();

  // Load the current prompt when the dialog becomes visible
  useEffect(() => {
    if (visible) {
      loadPrompt();
    }
  }, [visible, screeningType]);

  // Load the current prompt from the database
  const loadPrompt = async () => {
    try {
      setLoading(true);
      
      // Get the current prompt
      let prompt = '';
      try {
        prompt = await getAIPrompt(screeningType);
      } catch (error) {
        // If there's an error getting the prompt, use the default
        console.log('Error loading prompt, will use default');
        // Set default based on screening type
        prompt = screeningType === 'title' ? 
          'Based on the title "{text}", determine if this paper should be included in a literature review. Consider the relevance to the research topic.\n\nProvide your response in JSON format with the following structure:\n{\n  "decision": "INCLUDE", "EXCLUDE", or "MAYBE",\n  "confidence": a number between 0 and 1,\n  "reasoning": "Your reasoning for this decision"\n}\n\nEnsure your response is valid JSON that can be parsed directly.' :
          'Based on the abstract "{text}", determine if this paper should be included in a literature review. Consider methodology, findings, and relevance to the research topic.\n\nProvide your response in JSON format with the following structure:\n{\n  "decision": "INCLUDE", "EXCLUDE", or "MAYBE",\n  "confidence": a number between 0 and 1,\n  "reasoning": "Your detailed analysis and reasoning for this decision"\n}\n\nEnsure your response is valid JSON that can be parsed directly.';
      }
      
      // Get the API keys (now returns an array)
      let apiKeys: string[] = [];
      try {
        apiKeys = await getAPIKey('gemini'); // Expecting getAPIKey to return string[]
      } catch (error) {
        // API keys might not exist yet, that's okay
        console.log('No API keys found, will prompt user to set them');
      }

      // Set the form values
      form.setFieldsValue({
        prompt,
        apiKeys: apiKeys.join('\n'), // Join array into newline-separated string for TextArea
      });
    } catch (error) {
      messageApi.error('Failed to load prompt settings');
      console.error('Error loading prompt:', error);
    } finally {
      setLoading(false);
    }
  };

  // Save the prompt to the database
  const handleSave = async () => {
    try {
      setLoading(true);
      
      // Validate the form
      const values = await form.validateFields();
      
      // Save the prompt
      await saveAIPrompt(screeningType, values.prompt);
      // Save the API keys if provided
      if (values.apiKeys) {
        // Split the string by newlines, trim whitespace, and filter out empty lines
        const keysArray = values.apiKeys
          .split('\n')
          .map((key: string) => key.trim())
          .filter((key: string) => key.length > 0);
          
        if (keysArray.length > 0) {
            await saveAPIKey('gemini', keysArray); // Expecting saveAPIKey to accept string[]
        } else {
            // Optionally handle the case where the user cleared all keys
            await saveAPIKey('gemini', []); // Save an empty array
            messageApi.info('API keys cleared.');
        }
      } else {
         await saveAPIKey('gemini', []); // Save an empty array if field is empty
         messageApi.info('API keys cleared.');
      }

      messageApi.success('Prompt and API key settings saved successfully');
      onSave();
      onClose();
    } catch (error) {
      messageApi.error('Failed to save prompt settings');
      console.error('Error saving prompt:', error);
    } finally {
      setLoading(false);
    }
  };

  // Reset to default prompt
  const resetToDefault = () => {
    const defaultPrompt = screeningType === 'title' ? 
      'Based on the title "{text}", determine if this paper should be included in a literature review. Consider the relevance to the research topic.\n\nProvide your response in JSON format with the following structure:\n{\n  "decision": "INCLUDE", "EXCLUDE", or "MAYBE",\n  "confidence": a number between 0 and 1,\n  "reasoning": "Your reasoning for this decision"\n}\n\nEnsure your response is valid JSON that can be parsed directly.' :
      'Based on the abstract "{text}", determine if this paper should be included in a literature review. Consider methodology, findings, and relevance to the research topic.\n\nProvide your response in JSON format with the following structure:\n{\n  "decision": "INCLUDE", "EXCLUDE", or "MAYBE",\n  "confidence": a number between 0 and 1,\n  "reasoning": "Your detailed analysis and reasoning for this decision"\n}\n\nEnsure your response is valid JSON that can be parsed directly.';
    
    form.setFieldsValue({
      prompt: defaultPrompt
    });
    
    messageApi.success('Prompt reset to default');
  };

  return (
    <>
      {contextHolder}
      <Modal
        title={`Edit AI Prompt for ${screeningType === 'title' ? 'Title' : 'Abstract'} Screening`}
        open={visible}
        onCancel={onClose}
        footer={null}
        width={700}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
        >
          <Title level={5}>Prompt Template</Title>
          <Text type="secondary">
            Use {'{text}'} as a placeholder for the {screeningType} text that will be processed.
          </Text>
          <Form.Item
            name="prompt"
            rules={[{ required: true, message: 'Please enter a prompt template' }]}
          >
            <TextArea 
              rows={6} 
              placeholder={`Enter your prompt template for ${screeningType} screening...`}
              style={{ marginTop: '8px' }}
            />
          </Form.Item>
          
          <Divider />
          
          <Title level={5}>Gemini API Key</Title>
          <Text type="secondary">
            Enter your Gemini API key to use for AI processing. You can get one from
            <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener noreferrer"> Google AI Studio</a>. Enter one key per line.
          </Text>
          <Form.Item
            name="apiKeys" // Changed name from apiKey to apiKeys
            rules={[
              { 
                required: true, 
                message: 'Please enter at least one Gemini API key' 
              },
              // Custom validator to ensure at least one non-empty line
              {
                validator: (_, value) => {
                  if (!value || value.split('\n').map((k: string) => k.trim()).filter((k: string) => k.length > 0).length === 0) {
                    return Promise.reject(new Error('Please enter at least one valid Gemini API key'));
                  }
                  return Promise.resolve();
                },
              }
            ]}
          >
            <TextArea // Changed from Input.Password to TextArea
              rows={4} // Adjust rows as needed
              placeholder="Enter your Gemini API keys, one per line"
              style={{ marginTop: '8px' }}
            />
          </Form.Item>

          <Form.Item>
            <Space style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button onClick={onClose}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={loading}>
                Save Settings
              </Button>
              <Button type="default" onClick={resetToDefault}>
                Reset to Default
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default AIPromptDialog;
