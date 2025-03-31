'use client';

import { useState, useEffect } from 'react';
import { Layout, Typography, Card, Statistic, Row, Col, Button, Divider, Alert } from 'antd';
import { DatabaseOutlined, SearchOutlined, FilterOutlined, FileTextOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import Navigation from './components/Navigation';
import { isDatabaseInitialized, initDatabase, getDatabaseStats } from './utils/database';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState<boolean>(true);
  const [dbInitialized, setDbInitialized] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    total: number;
    titleScreening: { pending: number; included: number; excluded: number; maybe: number };
    abstractScreening: { pending: number; included: number; excluded: number; maybe: number };
  }>({ 
    total: 0, 
    titleScreening: { pending: 0, included: 0, excluded: 0, maybe: 0 },
    abstractScreening: { pending: 0, included: 0, excluded: 0, maybe: 0 }
  });

  // Check database initialization and load stats
  const loadDatabaseStats = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Check if database is initialized
      const isInitialized = await isDatabaseInitialized();
      setDbInitialized(isInitialized);
      
      if (isInitialized) {
        // Get database stats
        const dbStats = await getDatabaseStats();
        setStats(dbStats);
      }
    } catch (err: any) {
      console.error('Error loading database stats:', err);
      setError(err.message || 'An error occurred while loading database statistics');
    } finally {
      setLoading(false);
    }
  };

  // Initialize database
  const handleInitDatabase = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Initialize database
      await initDatabase();
      setDbInitialized(true);
      
      // Load stats after initialization
      await loadDatabaseStats();
    } catch (err: any) {
      console.error('Error initializing database:', err);
      setError(err.message || 'An error occurred while initializing the database');
    } finally {
      setLoading(false);
    }
  };

  // Load stats on component mount
  useEffect(() => {
    loadDatabaseStats();
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
          <Title level={4}>Dashboard</Title>
          
          {error && <Alert message={error} type="error" className="mb-4" />}
          
          {!dbInitialized && !loading ? (
            <div className="mb-4">
              <Alert
                message="Database Not Initialized"
                description="The database has not been initialized yet. Click the button below to initialize it."
                type="warning"
                showIcon
              />
              <div className="mt-4">
                <Button type="primary" onClick={handleInitDatabase} loading={loading}>
                  Initialize Database
                </Button>
              </div>
            </div>
          ) : null}
          
          <Divider orientation="left">Literature Review Statistics</Divider>
          
          <Row gutter={[16, 16]} className="mb-4">
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic 
                  title="Total Entries" 
                  value={stats.total} 
                  prefix={<DatabaseOutlined />} 
                  loading={loading}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic 
                  title="Title Screening Pending" 
                  value={stats.titleScreening.pending} 
                  prefix={<FilterOutlined />} 
                  loading={loading}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic 
                  title="Abstract Screening Pending" 
                  value={stats.abstractScreening.pending} 
                  prefix={<FileTextOutlined />} 
                  loading={loading}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic 
                  title="Included Literature" 
                  value={stats.abstractScreening.included} 
                  prefix={<CheckCircleOutlined />} 
                  loading={loading}
                />
              </Card>
            </Col>
          </Row>
          
          <Divider orientation="left">Quick Actions</Divider>
          
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={6}>
              <Card 
                hoverable 
                className="text-center" 
                onClick={() => router.push('/search')}
              >
                <SearchOutlined style={{ fontSize: '24px' }} />
                <div className="mt-2">Search & Import</div>
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card 
                hoverable 
                className="text-center" 
                onClick={() => router.push('/title-screening')}
              >
                <FilterOutlined style={{ fontSize: '24px' }} />
                <div className="mt-2">Title Screening</div>
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card 
                hoverable 
                className="text-center" 
                onClick={() => router.push('/abstract-screening')}
              >
                <FileTextOutlined style={{ fontSize: '24px' }} />
                <div className="mt-2">Abstract Screening</div>
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card 
                hoverable 
                className="text-center" 
                onClick={() => router.push('/included-literature')}
              >
                <CheckCircleOutlined style={{ fontSize: '24px' }} />
                <div className="mt-2">Included Literature</div>
              </Card>
            </Col>
          </Row>
        </div>
      </Content>
    </Layout>
  );
}
