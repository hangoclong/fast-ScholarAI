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
      
      // Get the API key
      let apiKey = '';
      try {
        apiKey = await getAPIKey('gemini');
      } catch (error) {
        // API key might not exist yet, that's okay
        console.log('No API key found, will prompt user to set one');
      }
      
      // Set the form values
      form.setFieldsValue({
        prompt,
        apiKey,
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
      
      // Save the API key if provided
      if (values.apiKey) {
        await saveAPIKey('gemini', values.apiKey);
      }
      
      messageApi.success('Prompt settings saved successfully');
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
            <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener noreferrer"> Google AI Studio</a>.
          </Text>
          <Form.Item
            name="apiKey"
            rules={[{ required: true, message: 'Please enter your Gemini API key' }]}
          >
            <Input.Password 
              placeholder="Enter your Gemini API key"
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
