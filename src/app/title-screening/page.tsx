'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, Typography, Statistic, Row, Col, Button, message, Spin, Layout, Alert } from 'antd'; // Added Alert import
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons';
import Link from 'next/link';
import LiteratureTable from '../components/LiteratureTable'; // Restore LiteratureTable import
import { BibEntry, ScreeningStatus } from '../types';
import { 
  getTitleScreeningEntries, // Keep using the function that filters duplicates
  getDatabaseStats, 
  updateScreeningStatus, 
  isDatabaseInitialized, 
  initDatabase 
} from '../utils/database';

const { Title, Text } = Typography;
const { Header, Content, Footer } = Layout;

export default function TitleScreeningPage() {
  const [entries, setEntries] = useState<BibEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [tableUpdateKey, setTableUpdateKey] = useState<number>(0); // Keep key state for refresh
  const [stats, setStats] = useState<{
    total: number;
    titleScreening: { pending: number; included: number; excluded: number; maybe: number };
    abstractScreening: { pending: number; included: number; excluded: number; maybe: number }; // Keep abstract stats
  }>({ 
    total: 0, 
    titleScreening: { pending: 0, included: 0, excluded: 0, maybe: 0 },
    abstractScreening: { pending: 0, included: 0, excluded: 0, maybe: 0 } 
  });
  const [messageApi, contextHolder] = message.useMessage();

  // Load entries and statistics
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Check if database is initialized (optional)
      // const isInitialized = await isDatabaseInitialized(); ...
      
      // Get entries for title screening (already filters duplicates)
      const entriesData = await getTitleScreeningEntries(); 
      setEntries(entriesData || []);
      
      // Get database statistics
      const statsData = await getDatabaseStats();
      setStats(statsData);

    } catch (error) {
      console.error('Error loading data:', error);
      messageApi.error(`Failed to load data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [messageApi]); // Added messageApi dependency

  // Load data on component mount
  useEffect(() => {
    loadData();
  }, [loadData]); // Use loadData as dependency

  // Handle screening action (passed to LiteratureTable)
  const handleScreeningAction = async (id: string, status: ScreeningStatus, notes?: string) => {
    try {
      // Update screening status in database
      await updateScreeningStatus(id, 'title', status, notes);

      // Update local state to reflect the change (important for stats refresh)
      // This might cause a slight delay in visual update within LiteratureTable 
      // if it doesn't re-fetch internally, but ensures stats are correct.
      // Alternatively, LiteratureTable could handle its own state update + callback.
      // For now, we update the parent state and trigger a refresh via key.
      setEntries(prevEntries =>
        prevEntries.map(entry =>
          entry.ID === id
            ? { ...entry, title_screening_status: status, title_screening_notes: notes ?? entry.title_screening_notes } 
            : entry
        )
      );

      // Force table re-render by changing key (if LiteratureTable uses it)
      setTableUpdateKey(prevKey => prevKey + 1);

      // Refresh statistics
      const statsData = await getDatabaseStats();
      setStats(statsData);

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
      
      {/* Keep original Header structure */}
      <Header className="flex items-center" style={{ background: '#e6f7ff' }}>
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center">
            <Link href="/">
              <Button type="text" icon={<ArrowLeftOutlined />} size="large">
                Back to Home
              </Button>
            </Link>
            <Title level={3} style={{ margin: 0, marginLeft: 16 }}>
              Title Screening
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
        {/* Keep original Stats Card */}
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
                  title="Pending Title Review" // Updated title for clarity
                  value={stats.titleScreening.pending} 
                  loading={loading} 
                />
              </Col>
              <Col span={6}>
                <Statistic 
                  title="Included (Title)" // Updated title for clarity
                  value={stats.titleScreening.included} 
                  loading={loading}
                  valueStyle={{ color: '#52c41a' }} 
                />
              </Col>
              <Col span={6}>
                <Statistic 
                  title="Excluded (Title)" // Updated title for clarity
                  value={stats.titleScreening.excluded} 
                  loading={loading}
                  valueStyle={{ color: '#ff4d4f' }} 
                />
              </Col>
            </Row>
          </Card>
        </div>
        
        {/* Keep original Main Card with LiteratureTable */}
        <Card className="shadow-md hover:shadow-lg transition-all duration-300">
          <div className="mb-4">
            <Text>
              Review the titles of the imported papers and decide whether to include or exclude them in your literature review.
              Use the AI batch processing feature to automatically screen multiple entries at once.
            </Text>
          </div>
          
          {loading ? (
            <div className="flex justify-center items-center p-8">
              <Spin size="large" />
            </div>
          ) : entries.length === 0 ? (
             <Alert message="No entries found requiring title screening." type="info" showIcon />
          ) : (
            // Use LiteratureTable again
            <LiteratureTable 
              entries={entries}
              loading={loading}
              screeningType="title"
              onScreeningAction={handleScreeningAction}
              showScreeningControls={true}
              refreshData={loadData} // Pass loadData for potential internal refresh in LiteratureTable
              tableKey={tableUpdateKey} // Pass the key down as a prop
            />
          )}
        </Card>
      </Content>
      
      {/* Keep original Footer */}
      <Footer style={{ textAlign: 'center', background: '#e6f7ff' }}>
        Literature Review Tool ©{new Date().getFullYear()}
      </Footer>
    </Layout>
  );
}
