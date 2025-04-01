'use client';

import React, { useState, useEffect } from 'react';
import { Card, Typography, Statistic, Row, Col, Button, message, Spin, Layout } from 'antd';
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons';
import Link from 'next/link';
import LiteratureTable from '../components/LiteratureTable';
import { BibEntry, ScreeningStatus } from '../types';
import { getTitleScreeningEntries, getDatabaseStats, updateScreeningStatus, isDatabaseInitialized, initDatabase } from '../utils/database';

const { Title, Text } = Typography;
const { Header, Content, Footer } = Layout;

export default function TitleScreeningPage() {
  const [entries, setEntries] = useState<BibEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [stats, setStats] = useState<{
    total: number;
    titleScreening: { pending: number; included: number; excluded: number; maybe: number };
  }>({ 
    total: 0, 
    titleScreening: { pending: 0, included: 0, excluded: 0, maybe: 0 } 
  });
  const [messageApi, contextHolder] = message.useMessage();

  // Load entries and statistics
  const loadData = async () => {
    try {
      setLoading(true);
      
      // Check if database is initialized
      const isInitialized = await isDatabaseInitialized();
      console.log('Title Screening - Database initialized:', isInitialized);
      
      if (!isInitialized) {
        console.log('Title Screening - Initializing database...');
        const initResult = await initDatabase();
        console.log('Title Screening - Database initialization result:', initResult);
        if (!initResult) {
          throw new Error('Failed to initialize database');
        }
      }
      
      // Get entries for title screening
      console.log('Title Screening - Fetching entries...');
      const entriesData = await getTitleScreeningEntries();
      console.log('Title Screening - Entries loaded:', entriesData);
      console.log('Title Screening - Entries count:', entriesData?.length || 0);
      console.log('Title Screening - First entry sample:', entriesData?.[0] || 'No entries');
      
      setEntries(entriesData || []);
      
      // Get database statistics
      const statsData = await getDatabaseStats();
      setStats(statsData);
    } catch (error) {
      console.error('Error loading data:', error);
      // Log more details about the error
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      } else {
        console.error('Unknown error type:', typeof error);
      }
      messageApi.error(`Failed to load data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // Load data on component mount
  useEffect(() => {
    loadData();
  }, []);

  // Debug entries after state update
  useEffect(() => {
    console.log('Title Screening - Entries state updated:', entries);
    console.log('Title Screening - Entries state length:', entries.length);
  }, [entries]);

  // Handle screening action
  const handleScreeningAction = async (id: string, status: ScreeningStatus, notes?: string) => {
    try {
      // Update screening status in database
      await updateScreeningStatus(id, 'title', status, notes);
      
      // Update local state to reflect the change
      setEntries(prevEntries => 
        prevEntries.map(entry => 
          entry.ID === id 
            ? { ...entry, titleScreening: status, title_screening_notes: notes || entry.title_screening_notes } 
            : entry
        )
      );
      
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
                  value={stats.titleScreening.pending} 
                  loading={loading} 
                />
              </Col>
              <Col span={6}>
                <Statistic 
                  title="Included" 
                  value={stats.titleScreening.included} 
                  loading={loading}
                  valueStyle={{ color: '#52c41a' }} 
                />
              </Col>
              <Col span={6}>
                <Statistic 
                  title="Excluded" 
                  value={stats.titleScreening.excluded} 
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
              Review the titles of the imported papers and decide whether to include or exclude them in your literature review.
              Use the AI batch processing feature to automatically screen multiple entries at once.
            </Text>
          </div>
          
          {loading ? (
            <div className="flex justify-center items-center p-8">
              <Spin size="large" />
            </div>
          ) : (
            <LiteratureTable 
              entries={entries}
              loading={loading}
              screeningType="title"
              onScreeningAction={handleScreeningAction}
              showScreeningControls={true}
              refreshData={loadData}
              setEntries={setEntries}
            />
          )}
        </Card>
      </Content>
      
      <Footer style={{ textAlign: 'center', background: '#e6f7ff' }}>
        Literature Review Tool {new Date().getFullYear()}
      </Footer>
    </Layout>
  );
}
