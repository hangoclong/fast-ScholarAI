'use client';

import { useState, useEffect } from 'react';
import { Layout, Typography, Divider, Alert, Spin, Card, Statistic, Row, Col } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, QuestionCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import Navigation from '../components/Navigation';
import LiteratureTable from '../components/LiteratureTable';
import { BibEntry, ScreeningStatus } from '../types';
import { getTitleScreeningEntries, updateScreeningStatus } from '../utils/database';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

export default function TitleScreeningPage() {
  const [entries, setEntries] = useState<BibEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    total: number;
    pending: number;
    included: number;
    excluded: number;
    maybe: number;
  }>({ total: 0, pending: 0, included: 0, excluded: 0, maybe: 0 });

  // Load title screening entries
  const loadEntries = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch entries for title screening
      const data = await getTitleScreeningEntries();
      setEntries(data);
      
      // Calculate statistics
      const total = data.length;
      const pending = data.filter(entry => !entry.title_screening_status || entry.title_screening_status === 'pending').length;
      const included = data.filter(entry => entry.title_screening_status === 'included').length;
      const excluded = data.filter(entry => entry.title_screening_status === 'excluded').length;
      const maybe = data.filter(entry => entry.title_screening_status === 'maybe').length;
      
      setStats({ total, pending, included, excluded, maybe });
    } catch (err: any) {
      console.error('Error loading title screening entries:', err);
      setError(err.message || 'An error occurred while loading entries');
    } finally {
      setLoading(false);
    }
  };

  // Handle screening action
  const handleScreeningAction = async (id: string, status: ScreeningStatus, notes?: string) => {
    try {
      // Update entry status
      await updateScreeningStatus(id, 'title', status, notes);
      
      // Update local entries
      setEntries(prev => prev.map(entry => {
        if (entry.ID === id) {
          return { 
            ...entry, 
            title_screening_status: status,
            title_screening_notes: notes || entry.title_screening_notes
          };
        }
        return entry;
      }));
      
      // Update statistics
      setStats(prev => {
        // Determine previous status to decrement
        const prevStatus = entries.find(e => e.ID === id)?.title_screening_status || 'pending';
        
        // Create a copy of previous stats
        const newStats = { ...prev };
        
        // Decrement previous status count
        if (prevStatus === 'pending') newStats.pending = Math.max(0, newStats.pending - 1);
        if (prevStatus === 'included') newStats.included = Math.max(0, newStats.included - 1);
        if (prevStatus === 'excluded') newStats.excluded = Math.max(0, newStats.excluded - 1);
        if (prevStatus === 'maybe') newStats.maybe = Math.max(0, newStats.maybe - 1);
        
        // Increment new status count
        if (status === 'pending') newStats.pending += 1;
        if (status === 'included') newStats.included += 1;
        if (status === 'excluded') newStats.excluded += 1;
        if (status === 'maybe') newStats.maybe += 1;
        
        return newStats;
      });
    } catch (err: any) {
      console.error('Error updating screening status:', err);
      // Show error in UI if needed
    }
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
          <Title level={4}>Title Screening</Title>
          
          {error && <Alert message={error} type="error" className="mb-4" />}
          
          {/* Statistics */}
          <Row gutter={[16, 16]} className="mb-4">
            <Col xs={24} sm={12} md={4}>
              <Card>
                <Statistic 
                  title="Total" 
                  value={stats.total} 
                  loading={loading}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={5}>
              <Card>
                <Statistic 
                  title="Pending" 
                  value={stats.pending} 
                  valueStyle={{ color: '#1890ff' }}
                  loading={loading}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={5}>
              <Card>
                <Statistic 
                  title="Included" 
                  value={stats.included} 
                  valueStyle={{ color: '#52c41a' }}
                  prefix={<CheckCircleOutlined />}
                  loading={loading}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={5}>
              <Card>
                <Statistic 
                  title="Excluded" 
                  value={stats.excluded} 
                  valueStyle={{ color: '#f5222d' }}
                  prefix={<CloseCircleOutlined />}
                  loading={loading}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={5}>
              <Card>
                <Statistic 
                  title="Maybe" 
                  value={stats.maybe} 
                  valueStyle={{ color: '#faad14' }}
                  prefix={<QuestionCircleOutlined />}
                  loading={loading}
                />
              </Card>
            </Col>
          </Row>
          
          <Divider orientation="left">Entries for Title Screening</Divider>
          
          {loading ? (
            <div className="text-center py-8">
              <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
              <div className="mt-2">Loading entries...</div>
            </div>
          ) : (
            <LiteratureTable 
              entries={entries} 
              loading={loading}
              screeningType="title"
              onScreeningAction={handleScreeningAction}
              showScreeningControls={true}
              showAllEntries={true} // Show all entries for title screening
            />
          )}
        </div>
      </Content>
    </Layout>
  );
}
