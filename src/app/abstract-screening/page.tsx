'use client';

import React, { useState, useEffect, useCallback } from 'react'; // Import useCallback
import { Card, Typography, Statistic, Row, Col, Button, message, Spin, Layout } from 'antd';
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons';
import Link from 'next/link';
import LiteratureTable from '../components/LiteratureTable';
import { BibEntry, ScreeningStatus } from '../types';
import { getAbstractScreeningEntries, getDatabaseStats, updateScreeningStatus } from '../utils/database';

const { Title, Text } = Typography;
const { Header, Content, Footer } = Layout;

export default function AbstractScreeningPage() {
  const [entries, setEntries] = useState<BibEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [tableRefreshKey, setTableRefreshKey] = useState<number>(0); // State for forcing table refresh
  const [stats, setStats] = useState<{
    total: number;
    abstractScreening: { pending: number; included: number; excluded: number; maybe: number };
  }>({ 
    total: 0, 
    abstractScreening: { pending: 0, included: 0, excluded: 0, maybe: 0 } 
  });
  const [messageApi, contextHolder] = message.useMessage();

  // Load entries and statistics (using useCallback for stability if passed as prop)
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setEntries([]); // Clear entries before loading new ones
      
      // Get entries for abstract screening
      const entriesData = await getAbstractScreeningEntries();
      setEntries(entriesData);
      
      // Get database statistics
      const statsData = await getDatabaseStats();
      setStats(statsData);
      setTableRefreshKey(prevKey => prevKey + 1); // Ensure table refreshes after loading data
    } catch (error) {
      console.error('Error loading data:', error);
      messageApi.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [messageApi]); // Add dependencies if needed, messageApi is stable

  // Load data on component mount
  useEffect(() => {
    loadData();
  }, [loadData]); // Use loadData as dependency

  // Handle screening action
  const handleScreeningAction = async (id: string, status: ScreeningStatus, notes?: string, confidence?: number) => { // Added confidence parameter
    try {
      // Update screening status in database, including confidence
      await updateScreeningStatus(id, 'abstract', status, notes, confidence);
      
      // Update local state to reflect the change
      setEntries(prevEntries => 
        prevEntries.map(entry => 
          entry.ID === id 
            ? { 
                ...entry, 
                abstract_screening_status: status, 
                abstract_screening_notes: notes ?? entry.abstract_screening_notes,
                // Conditionally add confidence if provided
                ...(confidence !== undefined && { abstract_screening_confidence: confidence }) 
              } 
            : entry
        )
      );
      
      // Refresh statistics
      const statsData = await getDatabaseStats();
      setStats(statsData);

      // Force table re-render by updating the key
      setTableRefreshKey(prevKey => prevKey + 1); 
      
      // Show success message
      messageApi.success(`Entry marked as ${status}`);
    } catch (error) {
      console.error('Error updating screening status:', error);
      messageApi.error('Failed to update screening status');
    }
  };

  return (
    <Layout className="min-h-screen">
      {contextHolder}
      
      <Header className="flex items-center" style={{ background: '#e6f7ff' }}>
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center">
            <Link href="/">
              <Button type="text" icon={<ArrowLeftOutlined />} size="large">
                Back to Home
              </Button>
            </Link>
            <Title level={3} style={{ margin: 0, marginLeft: 16 }}>
              Abstract Screening
            </Title>
          </div>
          <Button 
            icon={<ReloadOutlined />} 
            onClick={loadData}
            loading={loading}
          >
            Refresh
          </Button>
        </div>
      </Header>
      
      <Content className="p-6">
        <div className="mb-6">
          <Card className="shadow-md hover:shadow-lg transition-all duration-300">
            <Row gutter={16}>
              <Col span={6}>
                <Statistic 
                  title="Total Entries" 
                  value={stats.total} 
                  loading={loading} 
                />
              </Col>
              <Col span={6}>
                <Statistic 
                  title="Pending" 
                  value={stats.abstractScreening.pending} 
                  loading={loading} 
                />
              </Col>
              <Col span={6}>
                <Statistic 
                  title="Included" 
                  value={stats.abstractScreening.included} 
                  loading={loading}
                  valueStyle={{ color: '#52c41a' }} 
                />
              </Col>
              <Col span={6}>
                <Statistic 
                  title="Excluded" 
                  value={stats.abstractScreening.excluded} 
                  loading={loading}
                  valueStyle={{ color: '#ff4d4f' }} 
                />
              </Col>
            </Row>
          </Card>
        </div>
        
        <Card className="shadow-md hover:shadow-lg transition-all duration-300">
          <div className="mb-4">
            <Text>
              Review the abstracts of the papers that passed title screening and decide whether to include or exclude them in your literature review.
              Use the AI batch processing feature to automatically screen multiple entries at once.
            </Text>
          </div>
          
          {loading ? (
            <div className="flex justify-center items-center p-8">
              <Spin size="large" />
            </div>
          ) : (
            <LiteratureTable 
              tableKey={tableRefreshKey} // Pass the key to LiteratureTable
              entries={entries}
              loading={loading}
              screeningType="abstract"
              onScreeningAction={handleScreeningAction}
              showScreeningControls={true}
              refreshData={loadData}
            />
          )}
        </Card>
      </Content>
      
      <Footer style={{ textAlign: 'center', background: '#e6f7ff' }}>
        Literature Review Tool u00a9 {new Date().getFullYear()}
      </Footer>
    </Layout>
  );
}
