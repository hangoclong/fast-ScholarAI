'use client';

import { useState, useEffect } from 'react';
import { Layout, Typography, Divider, Alert, Spin, Card, Statistic, Row, Col, Button, message, Space } from 'antd'; // Added message, Space
import { CheckCircleOutlined, DownloadOutlined, LoadingOutlined, FileExcelOutlined } from '@ant-design/icons'; // Added FileExcelOutlined
import * as XLSX from 'xlsx'; // Import xlsx library
import Navigation from '../components/Navigation';
import LiteratureTable from '../components/LiteratureTable';
import { BibEntry } from '../types';
import { getIncludedLiterature } from '../utils/database';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

export default function IncludedLiteraturePage() {
  const [entries, setEntries] = useState<BibEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [exportingExcel, setExportingExcel] = useState<boolean>(false); // State for Excel export loading
  const [error, setError] = useState<string | null>(null);
  const [messageApi, contextHolder] = message.useMessage(); // For user feedback
  const [stats, setStats] = useState<{
    total: number;
    titleOnly: number;
    abstractOnly: number;
    both: number;
  }>({ total: 0, titleOnly: 0, abstractOnly: 0, both: 0 });

  // Load included literature
  const loadEntries = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch included literature entries
      const data = await getIncludedLiterature();
      setEntries(data);
      
      // Calculate statistics
      const total = data.length;
      const titleOnly = data.filter((entry: BibEntry) => 
        entry.title_screening_status === 'included' && 
        (!entry.abstract_screening_status || entry.abstract_screening_status !== 'included')
      ).length;
      const abstractOnly = data.filter((entry: BibEntry) => 
        (!entry.title_screening_status || entry.title_screening_status !== 'included') && 
        entry.abstract_screening_status === 'included'
      ).length;
      const both = data.filter((entry: BibEntry) => 
        entry.title_screening_status === 'included' && 
        entry.abstract_screening_status === 'included'
      ).length;
      
      setStats({ total, titleOnly, abstractOnly, both });
    } catch (err: any) {
      console.error('Error loading included literature:', err);
      setError(err.message || 'An error occurred while loading entries');
    } finally {
      setLoading(false);
    }
  };

  // Export included literature as BibTeX
  const exportBibTeX = () => {
    // Create BibTeX string from entries
    const bibtex = entries.map((entry: BibEntry) => {
      // Basic BibTeX format
      return `@${entry.ENTRYTYPE || 'article'}{${entry.ID},
  title = {${entry.title || ''}},
  author = {${entry.author || ''}},
  year = {${entry.year || ''}},
  journal = {${entry.journal || entry.booktitle || ''}},
  volume = {${entry.volume || ''}},
  number = {${entry.number || ''}},
  pages = {${entry.pages || ''}},
  doi = {${entry.doi || ''}},
  url = {${entry.url || ''}}
}`;
    }).join('\n\n');
    
    // Create a blob and download
    const blob = new Blob([bibtex], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'included_literature.bib';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Export all entries with full details as Excel
  const exportExcel = async () => {
    setExportingExcel(true);
    messageApi.loading({ content: 'Fetching all data for export...', key: 'exportExcelMsg' });

    try {
      // Fetch ALL entries with ALL details from the new backend endpoint
      const response = await fetch('/api/database?action=all-details');
      if (!response.ok) {
        throw new Error(`Failed to fetch detailed data: ${response.statusText}`);
      }
      const result = await response.json();
      if (!result.success || !Array.isArray(result.data)) {
        throw new Error(result.message || 'Failed to parse detailed data');
      }
      const allDetailedEntries = result.data;

      if (allDetailedEntries.length === 0) {
        messageApi.warning({ content: 'No entries found in the database to export.', key: 'exportExcelMsg', duration: 2 });
        setExportingExcel(false);
        return;
      }

      messageApi.loading({ content: 'Generating Excel file...', key: 'exportExcelMsg' });

      // Define headers based on database columns (ensure order is logical)
      const headers = [
        'id', 'entry_type', 'title', 'author', 'year', 'journal', 'booktitle', 
        'publisher', 'abstract', 'doi', 'url', 'keywords', 'pages', 'volume', 
        'issue', 'source', 'title_screening_status', 'abstract_screening_status', 
        'deduplication_status', 'is_duplicate', 'duplicate_group_id', 
        'is_primary_duplicate', 'title_screening_notes', 'abstract_screening_notes', 
        'notes', 'created_at', 'json_data'
      ];

      // Prepare data rows for Excel sheet (Array of Arrays)
      const dataForSheet = [
        headers, // First row is headers
        ...allDetailedEntries.map((entry: any) => // Explicitly type entry as any here
          headers.map(header => entry[header] ?? '') // Get value for each header, default to empty string if null/undefined
        )
      ];

      // Create worksheet and workbook
      const ws = XLSX.utils.aoa_to_sheet(dataForSheet);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'All Entries');

      // Generate and download the file
      XLSX.writeFile(wb, 'literature_review_all_entries.xlsx');

      messageApi.success({ content: 'Excel file exported successfully!', key: 'exportExcelMsg', duration: 2 });

    } catch (err: any) {
      console.error('Error exporting Excel:', err);
      messageApi.error({ content: `Failed to export Excel: ${err.message}`, key: 'exportExcelMsg', duration: 3 });
    } finally {
      setExportingExcel(false);
    }
  };


  // Load entries on component mount
  useEffect(() => {
    loadEntries();
  }, []);

  return (
    <Layout className="min-h-screen">
      {contextHolder} {/* Render message context holder */}
      <Header className="flex items-center bg-white">
        <Title level={3} className="m-0">Literature Review Tool</Title>
      </Header>
      
      <div className="bg-white">
        <Navigation />
      </div>
      
      <Content className="p-6">
        <div className="bg-white p-6 rounded-md shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <Title level={4}>Included Literature</Title>
            <Space> {/* Use Space for button grouping */}
              <Button 
                icon={<FileExcelOutlined />} 
                onClick={exportExcel}
                loading={exportingExcel}
                disabled={loading} // Disable if main data is still loading
              >
                Export All (Excel)
              </Button>
              <Button 
                type="primary" 
                icon={<DownloadOutlined />} 
                onClick={exportBibTeX}
                disabled={entries.length === 0 || loading} // Disable if no entries or loading
              >
                Export Included (BibTeX)
              </Button>
            </Space>
          </div>
          
          {error && <Alert message={`Error loading included literature: ${error}`} type="error" className="mb-4" showIcon />}
          
          {/* Statistics */}
          <Row gutter={[16, 16]} className="mb-4">
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic 
                  title="Total Included" 
                  value={stats.total} 
                  prefix={<CheckCircleOutlined />}
                  valueStyle={{ color: '#52c41a' }}
                  loading={loading}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic 
                  title="Title Screening Only" 
                  value={stats.titleOnly} 
                  loading={loading}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic 
                  title="Abstract Screening Only" 
                  value={stats.abstractOnly} 
                  loading={loading}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic 
                  title="Both Screenings" 
                  value={stats.both} 
                  valueStyle={{ color: '#52c41a' }}
                  loading={loading}
                />
              </Card>
            </Col>
          </Row>
          
          <Divider orientation="left">Included Literature</Divider>
          
          {loading ? (
            <div className="text-center py-8">
              <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
              <div className="mt-2">Loading entries...</div>
            </div>
          ) : entries.length === 0 ? (
            <Alert
              message="No Included Literature"
              description="There are no entries that have been included in your literature review. Complete the screening process to include entries."
              type="info"
              showIcon
            />
          ) : (
            <LiteratureTable 
              entries={entries} 
              loading={loading}
              showScreeningControls={false}
              showAllEntries={true}
              refreshData={loadEntries} // Pass the refresh function to update data after abstract edits
            />
          )}
        </div>
      </Content>
    </Layout>
  );
}
