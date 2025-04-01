'use client';

import { useState, useEffect } from 'react';
import { Layout, Form, Input, Button, Upload, Spin, Alert, Typography, Divider, Space, message, Table } from 'antd';
import { UploadOutlined, SearchOutlined, DatabaseOutlined, GithubOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import axios from 'axios';
import { API_BASE_URL, ENDPOINTS, DEFAULT_PARAMS, API_HEADERS } from '../config/api';
import { parseBibtex } from '../utils/bibtexParser';
import { initDatabase, saveEntries, clearDatabase } from '../utils/database';
import { BibEntry } from '../types';
import Navigation from '../components/Navigation';

const { Header, Content, Footer } = Layout;
const { Title, Text } = Typography;

export default function SearchPage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<BibEntry[]>([]);
  const [messageApi, contextHolder] = message.useMessage();

  // Log entries whenever they change
  useEffect(() => {
    console.log('SearchPage - entries state updated:', entries);
    console.log('SearchPage - entries length:', entries.length);
    console.log('SearchPage - entries is array:', Array.isArray(entries));
  }, [entries]);

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
      
      console.log(`Making API request to ${endpoint} with params:`, params);
      
      // Make the API request with headers for authentication
      const response = await axios.get(endpoint, { 
        params,
        headers: API_HEADERS
      });
      
      // Check if response data is valid
      if (!response.data) {
        throw new Error('Invalid API response: No data received');
      }
      
      console.log('API response received:', response.status, response.statusText);
      
      // The API returns a BibTeXResponse object with a bibtex string
      // Check if bibtex property exists in the response
      const bibtexString = response.data.bibtex;
      
      if (!bibtexString) {
        console.error('API response does not contain bibtex data:', response.data);
        throw new Error('Invalid API response format: No BibTeX data found');
      }
      
      console.log('Raw BibTeX string received, length:', bibtexString.length);
      console.log('BibTeX sample:', bibtexString.substring(0, 200) + '...');
      
      // Parse the BibTeX string
      const parsedEntries = parseBibtex(bibtexString);
      
      console.log('Parsed entries count:', parsedEntries.length);
      if (parsedEntries.length > 0) {
        console.log('First parsed entry:', JSON.stringify(parsedEntries[0], null, 2));
      }
      
      if (!parsedEntries || parsedEntries.length === 0) {
        messageApi.info('No entries found. Try a different search query.');
        setEntries([]);
        return;
      }
      
      // Ensure all entries have the required fields
      const formattedEntries = parsedEntries.map((entry, index) => ({
        ...entry,
        ID: entry.ID || `entry-${index}-${Date.now()}`,
        title: entry.title || 'No Title',
        author: entry.author || 'Unknown Author',
        year: entry.year || '',
        journal: entry.journal || entry.booktitle || entry.publisher || ''
      }));
      
      console.log('Formatted entries count:', formattedEntries.length);
      if (formattedEntries.length > 0) {
        console.log('First formatted entry:', JSON.stringify(formattedEntries[0], null, 2));
      }
      
      // Set entries state with the formatted entries
      setEntries(formattedEntries);
      console.log('Entries state updated with formatted entries');
      
      // Show success message
      messageApi.success(`Found ${formattedEntries.length} entries from ${source}`);
      
      // Log success for debugging
      console.log(`Successfully parsed ${formattedEntries.length} entries from ${source}`);
    } catch (err: any) {
      console.error('Error during API search:', err);
      setError(err.message || 'An error occurred during the search');
      messageApi.error('Search failed. Please try again.');
      // Set entries to empty array on error
      setEntries([]);
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
      
      // Refresh entries
      setEntries([]);
      
      messageApi.success('Database cleared successfully');
    } catch (error: any) {
      console.error('Error clearing database:', error);
      messageApi.error(`Failed to clear database: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout className="min-h-screen">
      {contextHolder}
      <Header className="flex items-center justify-between" style={{ background: '#e6f7ff', padding: '0 24px' }}>
        <div className="flex items-center">
          <Title level={3} className="m-0" style={{ color: '#1890ff' }}>Literature Review Tool</Title>
        </div>
      </Header>
      
      <div style={{ background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <Navigation />
      </div>
      
      <Content className="p-6" style={{ background: '#f5f5f5' }}>
        <div className="bg-white p-6 rounded-lg shadow-md">
          {/* API Search Section */}
          <Title level={4} style={{ color: '#1890ff' }}>Search Academic Databases</Title>
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
                  className="hover:shadow-md transition-all duration-300"
                >
                  Search Scopus
                </Button>
                <Button 
                  type="primary" 
                  icon={<SearchOutlined />} 
                  onClick={() => handleSearch('ieee')}
                  loading={loading}
                  className="hover:shadow-md transition-all duration-300"
                >
                  Search IEEE
                </Button>
                <Button 
                  type="primary" 
                  icon={<SearchOutlined />} 
                  onClick={() => handleSearch('springer')}
                  loading={loading}
                  className="hover:shadow-md transition-all duration-300"
                >
                  Search Springer
                </Button>
              </Space>
            </Form.Item>
          </Form>

          <Divider style={{ borderColor: '#e6f7ff' }} />

          {/* BibTeX File Import Section */}
          <Title level={4} style={{ color: '#1890ff' }}>Import BibTeX File</Title>
          <Upload
            accept=".bib"
            customRequest={handleFileUpload}
            showUploadList={false}
            maxCount={1}
          >
            <Button icon={<UploadOutlined />} loading={loading} className="hover:shadow-md transition-all duration-300">
              Select BibTeX File
            </Button>
            <Text className="ml-2">Upload a .bib file to import references</Text>
          </Upload>

          <Divider style={{ borderColor: '#e6f7ff' }} />

          {/* Database Actions */}
          <Title level={4} style={{ color: '#1890ff' }}>Database Actions</Title>
          <Space>
            <Button 
              type="primary" 
              icon={<DatabaseOutlined />} 
              onClick={() => handleSaveToDatabase('search')}
              loading={loading}
              disabled={entries.length === 0}
              className="hover:shadow-md transition-all duration-300"
            >
              Save Results to Database
            </Button>
            <Button 
              danger 
              icon={<DatabaseOutlined />} 
              onClick={handleClearDatabase}
              loading={loading}
              className="hover:shadow-md transition-all duration-300"
            >
              Clear Database
            </Button>
          </Space>

          <Divider style={{ borderColor: '#e6f7ff' }} />

          {/* Results Section */}
          <Title level={4} style={{ color: '#1890ff' }}>Results {entries.length > 0 && `(${entries.length})`}</Title>
          {error && <Alert message={error} type="error" className="mb-4" />}
          {loading && entries.length === 0 ? (
            <div className="flex justify-center items-center py-8">
              <Spin size="large" />
            </div>
          ) : (
            <div data-component-name="SearchPage">
              <div className="mb-4">
                {entries.length > 0 ? (
                  <Text type="secondary">Displaying {entries.length} entries</Text>
                ) : (
                  <Text type="secondary">No entries to display. Try searching or importing a file.</Text>
                )}
              </div>
              
              {/* Direct Table Implementation */}
              <Table
                dataSource={entries.map((entry, index) => ({
                  ...entry,
                  key: entry.ID || `entry-${index}`,
                  title: entry.title || 'No Title',
                  author: entry.author || 'Unknown Author',
                  year: entry.year || '',
                  journal: entry.journal || entry.booktitle || entry.publisher || ''
                }))}
                columns={[
                  {
                    title: 'Year',
                    dataIndex: 'year',
                    key: 'year',
                    width: 80,
                    render: (year) => year || 'N/A',
                  },
                  {
                    title: 'Title',
                    dataIndex: 'title',
                    key: 'title',
                    render: (title) => (
                      <div style={{ wordWrap: 'break-word', wordBreak: 'break-word', maxHeight: '3em', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {title || 'No Title'}
                      </div>
                    ),
                  },
                  {
                    title: 'Author(s)',
                    dataIndex: 'author',
                    key: 'author',
                    width: 200,
                    render: (author) => (
                      <div style={{ wordWrap: 'break-word', wordBreak: 'break-word', maxHeight: '3em', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {author || 'Unknown Author'}
                      </div>
                    ),
                  },
                  {
                    title: 'Publication Venue',
                    dataIndex: 'journal',
                    key: 'journal',
                    render: (journal, record: any) => {
                      const venue = journal || record.booktitle || record.publisher || 'N/A';
                      return (
                        <div style={{ wordWrap: 'break-word', wordBreak: 'break-word', maxHeight: '3em', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {venue}
                        </div>
                      );
                    },
                  },
                ]}
                pagination={{
                  pageSize: 10,
                  showSizeChanger: true,
                  pageSizeOptions: ['10', '20', '50', '100'],
                }}
                loading={loading}
                size="middle"
                className="literature-table"
              />
            </div>
          )}
        </div>
      </Content>
      
      <Footer style={{ textAlign: 'center', background: '#e6f7ff', padding: '16px' }}>
        <div className="flex flex-col items-center justify-center">
          <Text>Literature Review Tool u00a9 {new Date().getFullYear()}</Text>
          <div className="mt-2">
            <a href="https://github.com/yourusername/literature-review-tool" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">
              <GithubOutlined style={{ fontSize: '18px', marginRight: '4px' }} /> View on GitHub
            </a>
          </div>
        </div>
      </Footer>
    </Layout>
  );
}
