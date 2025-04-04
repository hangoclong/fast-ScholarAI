'use client';

import React, { useState, useEffect, useCallback } from 'react'; // Import useCallback
import { Card, Typography, Statistic, Row, Col, Button, message, Spin, Layout, Alert, Space, App } from 'antd'; // Import App, Space, Alert
import { ArrowLeftOutlined, ReloadOutlined, ExclamationCircleOutlined } from '@ant-design/icons'; // Added ExclamationCircleOutlined
import Link from 'next/link';
import LiteratureTable from '../components/LiteratureTable';
import { BibEntry, ScreeningStatus } from '../types';
import { 
  getAbstractScreeningEntries, 
  getDatabaseStats, 
  updateScreeningStatus,
  resetAbstractScreeningStatus // Added reset function import
} from '../utils/database';

const { Title, Text } = Typography;
const { Header, Content, Footer } = Layout;

export default function AbstractScreeningPage() {
  const { modal } = App.useApp(); // Use the hook to get modal instance
  const [entries, setEntries] = useState<BibEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [tableRefreshKey, setTableRefreshKey] = useState<number>(0); // State for forcing table refresh
  // Add pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10); // Default page size
  const [totalEntries, setTotalEntries] = useState<number>(0); // State for total count
  const [stats, setStats] = useState<{
    total: number; // This might become redundant
    abstractScreening: { pending: number; included: number; excluded: number; maybe: number };
  }>({ 
    total: 0, 
    abstractScreening: { pending: 0, included: 0, excluded: 0, maybe: 0 } 
  });
  const [messageApi, contextHolder] = message.useMessage();
  const [resetting, setResetting] = useState<boolean>(false); // State for reset button loading

  // Load entries and statistics (now with pagination)
  const loadData = useCallback(async (page = currentPage, size = pageSize) => {
    setLoading(true);
    try {
      // Fetch paginated entries for abstract screening
      // NOTE: getAbstractScreeningEntries needs modification
      const result = await getAbstractScreeningEntries(page, size);
      console.log('AbstractScreeningPage - Fetched data result:', result); // Log fetched result
      setEntries(result?.entries || []);
      const fetchedTotalCount = result?.totalCount || 0;
      setTotalEntries(fetchedTotalCount); // Update total count
      console.log('AbstractScreeningPage - Setting totalEntries state to:', fetchedTotalCount); // Log state update

      // Get database statistics
      const statsData = await getDatabaseStats();
      setStats(statsData);
      // setTableRefreshKey(prevKey => prevKey + 1); // Key refresh might not be needed with controlled pagination
    } catch (error) {
      console.error('Error loading data:', error);
      messageApi.error('Failed to load data');
      setEntries([]);
      setTotalEntries(0);
    } finally {
      setLoading(false);
    }
  }, [messageApi, currentPage, pageSize]); // Add dependencies

  // Load data on component mount and when pagination changes
  useEffect(() => {
    loadData(currentPage, pageSize);
  }, [loadData, currentPage, pageSize]); // Trigger loadData when page/size changes

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

      // Force table re-render by updating the key (optional, might not be needed)
      // setTableRefreshKey(prevKey => prevKey + 1); 
      
      // Optionally reload current page data
      // await loadData(currentPage, pageSize);

      // Show success message
      messageApi.success(`Entry marked as ${status}`);
    } catch (error) {
      console.error('Error updating screening status:', error);
      messageApi.error('Failed to update screening status');
    }
  };

  // Handle pagination changes from LiteratureTable
  const handlePaginationChange = (page: number, size: number) => {
    setCurrentPage(page);
    setPageSize(size);
    // Data reloading is handled by the useEffect hook
  };

  // Handle resetting abstract screening status for all relevant entries (with Confirmation)
  const handleResetStatus = async () => {
    console.log("Reset All Abstract Statuses button clicked - Confirmation requested."); // Log confirmation request
    modal.confirm({ // Use the modal instance from the useApp hook
      title: 'Are you sure you want to reset all abstract screening statuses?',
      icon: <ExclamationCircleOutlined />,
      content: 'This action will set the status of ALL entries eligible for abstract screening (i.e., included in title screening and not duplicates) back to "pending". This cannot be undone.',
      okText: 'Yes, Reset All',
      okType: 'danger',
      cancelText: 'No, Cancel',
      onOk: async () => {
        try {
          setResetting(true);
          messageApi.loading({ content: 'Resetting statuses...', key: 'resetStatusMsg' });
          await resetAbstractScreeningStatus(); // Call the correct reset function
          messageApi.success({ content: 'All relevant abstract screening statuses reset to pending.', key: 'resetStatusMsg', duration: 2 });
          await loadData(); // Refresh data after resetting
        } catch (error) {
          console.error('Error resetting abstract screening status:', error);
          messageApi.error({ content: `Failed to reset statuses: ${error instanceof Error ? error.message : 'Unknown error'}`, key: 'resetStatusMsg', duration: 3 });
        } finally {
          setResetting(false);
        }
      },
      onCancel() {
        console.log('Reset cancelled');
      },
    });
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
          <Space> {/* Group buttons */}
            <Button 
              danger // Use danger style for reset button
              onClick={handleResetStatus}
              loading={resetting}
              disabled={loading} // Disable if main data is loading
            >
              Reset All Statuses
            </Button>
            <Button 
              icon={<ReloadOutlined />} 
              onClick={() => loadData()} // Correctly wrap loadData in arrow function for onClick
              loading={loading}
              disabled={resetting} // Disable if reset is in progress
            >
              Refresh
            </Button>
          </Space>
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
          ) : entries.length === 0 ? (
             <Alert message="No entries found requiring abstract screening (ensure they passed title screening)." type="info" showIcon />
          ) : (
            <>
            {/* Log prop being passed */}
            {(() => { console.log('AbstractScreeningPage - Rendering LiteratureTable with totalCount:', totalEntries); return null; })()}
            <LiteratureTable 
              tableKey={tableRefreshKey} // Pass the key to LiteratureTable
              entries={entries}
              loading={loading}
              screeningType="abstract"
              onScreeningAction={handleScreeningAction}
              showScreeningControls={true}
              refreshData={() => loadData(currentPage, pageSize)} // Refresh current page
              // Pass pagination props
              currentPage={currentPage}
              pageSize={pageSize}
              totalCount={totalEntries}
              onPaginationChange={handlePaginationChange}
            />
            </>
          )}
        </Card>
      </Content>
      
      <Footer style={{ textAlign: 'center', background: '#e6f7ff' }}>
        Literature Review Tool u00a9 {new Date().getFullYear()}
      </Footer>
    </Layout>
  );
}
