'use client';

import { useState, useEffect } from 'react';
import { Layout, Typography, Card, Statistic, Row, Col, Button, Divider, Alert } from 'antd';
import { DatabaseOutlined, SearchOutlined, FilterOutlined, FileTextOutlined, CheckCircleOutlined, GithubOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import Navigation from './components/Navigation'; // Assuming Navigation has its own styling
import { isDatabaseInitialized, initDatabase, getDatabaseStats } from './utils/database';

const { Header, Content, Footer } = Layout;
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
      <Header className="flex items-center justify-between" style={{ background: '#e6f7ff', padding: '0 24px' }}>
        <div className="flex items-center">
          <Title level={3} className="m-0" style={{ color: '#1890ff' }}>Literature Review Tool</Title>
        </div>
      </Header>

      {/* Navigation bar with improved styling */}
      <div style={{ background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <Navigation />
      </div>

      <Content className="p-6" style={{ background: '#f5f5f5' }}>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <Title level={4} style={{ color: '#1890ff' }}>Dashboard</Title>

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
              <Card hoverable className="h-full transition-all duration-300 hover:shadow-lg" style={{ backgroundColor: '#eff6ff' }}>
                <Statistic
                  title="Total Entries"
                  value={stats.total}
                  prefix={<DatabaseOutlined style={{ color: '#1890ff' }} />}
                  loading={loading}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card hoverable className="h-full transition-all duration-300 hover:shadow-lg" style={{ backgroundColor: '#eff6ff' }}>
                <Statistic
                  title="Title Screening Pending"
                  value={stats.titleScreening.pending}
                  prefix={<FilterOutlined style={{ color: '#1890ff' }} />}
                  loading={loading}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card hoverable className="h-full transition-all duration-300 hover:shadow-lg" style={{ backgroundColor: '#eff6ff' }}>
                <Statistic
                  title="Abstract Screening Pending"
                  value={stats.abstractScreening.pending}
                  prefix={<FileTextOutlined style={{ color: '#1890ff' }} />}
                  loading={loading}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card hoverable className="h-full transition-all duration-300 hover:shadow-lg" style={{ backgroundColor: '#eff6ff' }}>
                <Statistic
                  title="Included Literature"
                  value={stats.abstractScreening.included}
                  prefix={<CheckCircleOutlined style={{ color: '#1890ff' }} />}
                  loading={loading}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Card>
            </Col>
          </Row>

          <Divider orientation="left">Quick Actions</Divider>

          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={6}>
              <Card
                hoverable
                className="text-center transition-all duration-300 hover:shadow-lg hover:border-blue-400"
                style={{ backgroundColor: '#eff6ff' }}
                onClick={() => router.push('/search')}
              >
                <SearchOutlined style={{ fontSize: '28px', color: '#1890ff' }} />
                <div className="mt-2 font-medium">Search & Import</div>
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card
                hoverable
                className="text-center transition-all duration-300 hover:shadow-lg hover:border-blue-400"
                style={{ backgroundColor: '#eff6ff' }}
                onClick={() => router.push('/title-screening')}
              >
                <FilterOutlined style={{ fontSize: '28px', color: '#1890ff' }} />
                <div className="mt-2 font-medium">Title Screening</div>
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card
                hoverable
                className="text-center transition-all duration-300 hover:shadow-lg hover:border-blue-400"
                style={{ backgroundColor: '#eff6ff' }}
                onClick={() => router.push('/abstract-screening')}
              >
                <FileTextOutlined style={{ fontSize: '28px', color: '#1890ff' }} />
                <div className="mt-2 font-medium">Abstract Screening</div>
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card
                hoverable
                className="text-center transition-all duration-300 hover:shadow-lg hover:border-blue-400"
                style={{ backgroundColor: '#eff6ff' }}
                onClick={() => router.push('/included-literature')}
              >
                <CheckCircleOutlined style={{ fontSize: '28px', color: '#1890ff' }} />
                <div className="mt-2 font-medium">Included Literature</div>
              </Card>
            </Col>
          </Row>
        </div>
      </Content>
      
      <Footer style={{ textAlign: 'center', background: '#e6f7ff', padding: '16px' }}>
        <div className="flex flex-col items-center justify-center">
          <Text>Literature Review Tool {new Date().getFullYear()}</Text>
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
