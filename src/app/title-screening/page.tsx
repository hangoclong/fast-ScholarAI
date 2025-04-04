'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, Typography, Statistic, Row, Col, Button, message, Spin, Layout, Alert, Modal, Space, App, Select } from 'antd'; // Import App and Select
import { ArrowLeftOutlined, ReloadOutlined, ExclamationCircleOutlined } from '@ant-design/icons'; // Added ExclamationCircleOutlined
import Link from 'next/link';
import LiteratureTable from '../components/LiteratureTable'; // Restore LiteratureTable import
import { BibEntry, ScreeningStatus } from '../types';
import { 
  getTitleScreeningEntries, // Keep using the function that filters duplicates
  getDatabaseStats, 
  updateScreeningStatus, 
  isDatabaseInitialized, 
  initDatabase,
  resetTitleScreeningStatus // Added reset function import
} from '../utils/database';

const { Title, Text } = Typography; // Correctly placed destructuring
const { Header, Content, Footer } = Layout;

export default function TitleScreeningPage() {
  const { modal } = App.useApp(); // Use the hook to get modal instance
  const [entries, setEntries] = useState<BibEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [tableUpdateKey, setTableUpdateKey] = useState<number>(0); // Keep key state for refresh
  // Add pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10); // Default page size
  const [totalEntries, setTotalEntries] = useState<number>(0); // State for total count
  const [stats, setStats] = useState<{
    total: number; // This might become redundant if totalEntries is accurate
    titleScreening: { pending: number; included: number; excluded: number; maybe: number };
    abstractScreening: { pending: number; included: number; excluded: number; maybe: number }; // Keep abstract stats
  }>({ 
    total: 0, 
    titleScreening: { pending: 0, included: 0, excluded: 0, maybe: 0 },
    abstractScreening: { pending: 0, included: 0, excluded: 0, maybe: 0 } 
  });
  const [messageApi, contextHolder] = message.useMessage();
  const [resetting, setResetting] = useState<boolean>(false); // State for reset button loading
  const [selectedModel, setSelectedModel] = useState<string>('gemini-2.0-flash'); // State for selected AI model

  // --- Model Options ---
  const modelOptions = [
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
    // Add more models here if needed in the future
  ];

  // --- Handler for Model Change ---
  const handleModelChange = (value: string) => {
    setSelectedModel(value);
    messageApi.info(`AI Model set to: ${modelOptions.find(opt => opt.value === value)?.label || value}`);
  };

  // Load entries and statistics (now with pagination)
  const loadData = useCallback(async (page = currentPage, size = pageSize) => {
    setLoading(true);
    try {
      // Fetch paginated entries for title screening
      // NOTE: getTitleScreeningEntries needs modification to accept page/size
      // and return { entries: BibEntry[], totalCount: number }
      const result = await getTitleScreeningEntries(page, size);
      console.log('TitleScreeningPage - Fetched data result:', result); // Log fetched result
      setEntries(result?.entries || []);
      const fetchedTotalCount = result?.totalCount || 0; // Get count
      setTotalEntries(fetchedTotalCount); // Update total count
      console.log('TitleScreeningPage - Setting totalEntries state to:', fetchedTotalCount); // Log state update
      
      // Get database statistics (might need adjustment if total is handled differently)
      const statsData = await getDatabaseStats(); // Keep fetching stats for now
      setStats(statsData); // Update stats

    } catch (error) {
      console.error('Error loading data:', error);
      messageApi.error(`Failed to load data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setEntries([]); // Clear entries on error
      setTotalEntries(0); // Reset total count on error
    } finally {
      setLoading(false);
    }
  }, [messageApi, currentPage, pageSize]); // Add currentPage and pageSize dependencies

  // Load data on component mount and when pagination changes
  useEffect(() => {
    loadData(currentPage, pageSize);
  }, [loadData, currentPage, pageSize]); // Trigger loadData when page/size changes

  // Handle screening action (passed to LiteratureTable and AIBatchProcessor)
  const handleScreeningAction = async (id: string, status: ScreeningStatus, notes?: string, confidence?: number) => { // Added confidence parameter
    try {
      // Update screening status in database, now including confidence
      await updateScreeningStatus(id, 'title', status, notes, confidence);

      // Update local state to reflect the change (important for stats refresh)
      // This might cause a slight delay in visual update within LiteratureTable
      // if it doesn't re-fetch internally, but ensures stats are correct.
      // Alternatively, LiteratureTable could handle its own state update + callback.
      // For now, we update the parent state and trigger a refresh via key.
      setEntries(prevEntries =>
        prevEntries.map(entry =>
          entry.ID === id
            ? { 
                ...entry, 
                title_screening_status: status, 
                title_screening_notes: notes ?? entry.title_screening_notes,
                // Conditionally add confidence if provided
                ...(confidence !== undefined && { title_screening_confidence: confidence }) 
              } 
            : entry
        )
      );

      // Force table re-render by changing key (if LiteratureTable uses it)
      setTableUpdateKey(prevKey => prevKey + 1);

      // Refresh statistics (consider if this needs pagination awareness too)
      const statsData = await getDatabaseStats();
      setStats(statsData);

      // Optionally, reload current page data if the update might affect it
      // await loadData(currentPage, pageSize); // Or rely on the key update below

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
    // Data reloading is handled by the useEffect hook watching currentPage and pageSize
  };

  // Handle resetting title screening status for all entries (with Confirmation)
  const handleResetStatus = async () => {
    console.log("Reset All Statuses button clicked - Confirmation requested."); // Log confirmation request
    modal.confirm({ // Use the modal instance from the useApp hook
      title: 'Are you sure you want to reset all title screening statuses?',
      icon: <ExclamationCircleOutlined />,
      content: 'This action will set the status of ALL entries back to "pending" for title screening. This cannot be undone.',
      okText: 'Yes, Reset All',
      okType: 'danger',
      cancelText: 'No, Cancel',
      onOk: async () => {
        try {
          setResetting(true);
          messageApi.loading({ content: 'Resetting statuses...', key: 'resetStatusMsg' });
          await resetTitleScreeningStatus();
          messageApi.success({ content: 'All title screening statuses reset to pending.', key: 'resetStatusMsg', duration: 2 });
          await loadData(); // Refresh data after resetting
        } catch (error) {
          console.error('Error resetting title screening status:', error);
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
              onClick={() => loadData()} // Correctly call loadData in onClick
              loading={loading}
              disabled={resetting} // Disable if reset is in progress
            >
              Refresh
            </Button>
          </Space>
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
            <Text> {/* Ensure Text is used correctly as a component */}
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
              entries={entries} // Pass the fetched page of entries
              loading={loading}
              screeningType="title"
              onScreeningAction={handleScreeningAction}
              showScreeningControls={true}
              refreshData={() => loadData(currentPage, pageSize)} // Refresh current page
              tableKey={tableUpdateKey} // Pass the key down as a prop
              // Pass pagination state and handler
              currentPage={currentPage}
              pageSize={pageSize}
              onPaginationChange={handlePaginationChange}
              // Pass total count for pagination display
              totalCount={totalEntries}
              // Pass model selection state and handler
              selectedModel={selectedModel}
              onModelChange={handleModelChange}
              modelOptions={modelOptions} // Pass options for the dropdown
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
