'use client';

import { useState } from 'react';
import { Layout, Form, Input, Button, Upload, Spin, Alert, Typography, Divider, Space, message } from 'antd';
import { UploadOutlined, SearchOutlined, DatabaseOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import axios from 'axios';
import { BibEntry } from '../types';
import { parseBibtex } from '../utils/bibtexParser';
import { API_BASE_URL, API_KEY, DEFAULT_PARAMS, ENDPOINTS, API_HEADERS } from '../config/api';
import Navigation from '../components/Navigation';
import LiteratureTable from '../components/LiteratureTable';
import { initDatabase, saveEntries, clearDatabase } from '../utils/database';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

export default function SearchPage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<BibEntry[]>([]);
  const [messageApi, contextHolder] = message.useMessage();

  // Handle API search
  const handleSearch = async (source: 'scopus' | 'ieee' | 'springer') => {
    try {
      setLoading(true);
      setError(null);
      
      const values = await form.validateFields();
      const { query, keywords } = values;
      
      // Construct the API endpoint based on the source
      const endpoint = `${API_BASE_URL}${ENDPOINTS[source]}`;
      
      // Set up the parameters based on the API specification
      let params: Record<string, any> = { query };
      
      if (keywords) {
        params.keywords = keywords;
      }
      
      // Add source-specific parameters
      if (source === 'ieee') {
        params.max_records = DEFAULT_PARAMS.ieee.max_records;
        params.start_record = DEFAULT_PARAMS.ieee.start_record;
      } else {
        params.count = DEFAULT_PARAMS[source].count;
      }
      
      // Make the API request with headers for authentication
      const response = await axios.get(endpoint, { 
        params,
        headers: API_HEADERS
      });
      
      // The API returns a BibTeXResponse object with a bibtex string
      const bibtexString = response.data.bibtex;
      
      // Parse the BibTeX string
      const parsedEntries = parseBibtex(bibtexString);
      setEntries(parsedEntries);
      
      // Show success message
      messageApi.success(`Found ${parsedEntries.length} entries from ${source}`);
    } catch (err: any) {
      console.error('Error during API search:', err);
      setError(err.message || 'An error occurred during the search');
      messageApi.error('Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle file upload
  const handleFileUpload: UploadProps['customRequest'] = async (options) => {
    const { file, onSuccess, onError } = options;
    
    try {
      setLoading(true);
      setError(null);
      
      // Read the file content
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const bibtexString = e.target?.result as string;
          const parsedEntries = parseBibtex(bibtexString);
          setEntries(parsedEntries);
          onSuccess && onSuccess('ok');
          messageApi.success(`Imported ${parsedEntries.length} entries from file`);
        } catch (err: any) {
          setError('Failed to parse BibTeX file');
          onError && onError(new Error('Failed to parse BibTeX file'));
          messageApi.error('Failed to parse BibTeX file');
        } finally {
          setLoading(false);
        }
      };
      
      reader.onerror = () => {
        setError('Failed to read file');
        onError && onError(new Error('Failed to read file'));
        messageApi.error('Failed to read file');
        setLoading(false);
      };
      
      reader.readAsText(file as Blob);
    } catch (err: any) {
      setError(err.message || 'An error occurred during file upload');
      onError && onError(new Error(err.message));
      messageApi.error('File upload failed');
      setLoading(false);
    }
  };

  // Save entries to database
  const handleSaveToDatabase = async (source: string) => {
    try {
      setLoading(true);
      
      if (entries.length === 0) {
        messageApi.warning('No entries to save');
        return;
      }
      
      // Initialize database if needed
      await initDatabase();
      
      // Save entries to database
      await saveEntries(entries, source);
      
      messageApi.success(`Saved ${entries.length} entries to database`);
    } catch (error: any) {
      console.error('Error saving to database:', error);
      messageApi.error('Failed to save entries to database');
    } finally {
      setLoading(false);
    }
  };

  // Clear database
  const handleClearDatabase = async () => {
    try {
      setLoading(true);
      
      // Clear database
      await clearDatabase();
      
      messageApi.success('Database cleared successfully');
    } catch (error: any) {
      console.error('Error clearing database:', error);
      messageApi.error('Failed to clear database');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout className="min-h-screen">
      {contextHolder}
      <Header className="flex items-center bg-white">
        <Title level={3} className="m-0">Literature Review Tool</Title>
      </Header>
      
      <div className="bg-white">
        <Navigation />
      </div>
      
      <Content className="p-6">
        <div className="bg-white p-6 rounded-md shadow-sm">
          {/* API Search Section */}
          <Title level={4}>Search Academic Databases</Title>
          <Form form={form} layout="vertical">
            <Form.Item
              name="query"
              label="Search Query"
              rules={[{ required: true, message: 'Please enter a search query' }]}
            >
              <Input placeholder="Enter search query" />
            </Form.Item>
            <Form.Item name="keywords" label="Keywords (optional)">
              <Input placeholder="Enter keywords separated by commas" />
            </Form.Item>
            <Form.Item>
              <Space wrap>
                <Button 
                  type="primary" 
                  icon={<SearchOutlined />} 
                  onClick={() => handleSearch('scopus')}
                  loading={loading}
                >
                  Search Scopus
                </Button>
                <Button 
                  type="primary" 
                  icon={<SearchOutlined />} 
                  onClick={() => handleSearch('ieee')}
                  loading={loading}
                >
                  Search IEEE
                </Button>
                <Button 
                  type="primary" 
                  icon={<SearchOutlined />} 
                  onClick={() => handleSearch('springer')}
                  loading={loading}
                >
                  Search Springer
                </Button>
              </Space>
            </Form.Item>
          </Form>

          <Divider />

          {/* BibTeX File Import Section */}
          <Title level={4}>Import BibTeX File</Title>
          <Upload
            accept=".bib"
            customRequest={handleFileUpload}
            showUploadList={false}
            maxCount={1}
          >
            <Button icon={<UploadOutlined />} loading={loading}>
              Select BibTeX File
            </Button>
            <Text className="ml-2">Upload a .bib file to import references</Text>
          </Upload>

          <Divider />

          {/* Database Actions */}
          <Title level={4}>Database Actions</Title>
          <Space>
            <Button 
              type="primary" 
              icon={<DatabaseOutlined />} 
              onClick={() => handleSaveToDatabase('search')}
              loading={loading}
              disabled={entries.length === 0}
            >
              Save Results to Database
            </Button>
            <Button 
              danger 
              icon={<DatabaseOutlined />} 
              onClick={handleClearDatabase}
              loading={loading}
            >
              Clear Database
            </Button>
          </Space>

          <Divider />

          {/* Results Section */}
          <Title level={4}>Results {entries.length > 0 && `(${entries.length})`}</Title>
          {error && <Alert message={error} type="error" className="mb-4" />}
          {loading && entries.length === 0 ? (
            <div className="flex justify-center items-center py-8">
              <Spin size="large" />
            </div>
          ) : (
            <LiteratureTable entries={entries} loading={loading} />
          )}
        </div>
      </Content>
    </Layout>
  );
}
