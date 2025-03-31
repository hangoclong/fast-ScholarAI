'use client';

import { useState, useEffect } from 'react';
import { Layout, Typography, Divider, Alert, Spin, Card, Statistic, Row, Col, Button } from 'antd';
import { CheckCircleOutlined, DownloadOutlined, LoadingOutlined } from '@ant-design/icons';
import Navigation from '../components/Navigation';
import LiteratureTable from '../components/LiteratureTable';
import { BibEntry } from '../types';
import { getIncludedLiterature } from '../utils/database';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

export default function IncludedLiteraturePage() {
  const [entries, setEntries] = useState<BibEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
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

  // Load entries on component mount
  useEffect(() => {
    loadEntries();
  }, []);

  return (
    <Layout className="min-h-screen">
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
            <Button 
              type="primary" 
              icon={<DownloadOutlined />} 
              onClick={exportBibTeX}
              disabled={entries.length === 0}
            >
              Export BibTeX
            </Button>
          </div>
          
          {error && <Alert message={error} type="error" className="mb-4" />}
          
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
