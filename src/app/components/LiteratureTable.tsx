'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Table, Input, Button, Space, Tag, Tooltip, Select, Typography, Modal, Progress, message } from 'antd';
import { SearchOutlined, CheckOutlined, CloseOutlined, QuestionOutlined, FilterOutlined, 
  SortAscendingOutlined, SortDescendingOutlined, RobotOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { TableProps, ColumnsType } from 'antd/es/table';
import { BibEntry, ScreeningStatus } from '../types';
import ExpandableRow from './ExpandableRow';
import { updateEntryAbstract } from '../utils/database';

const { Search } = Input;
const { Option } = Select;
const { Text } = Typography;

interface LiteratureTableProps {
  entries: BibEntry[];
  loading: boolean;
  screeningType?: 'title' | 'abstract';
  onScreeningAction?: (id: string, status: ScreeningStatus, notes?: string) => void;
  showScreeningControls?: boolean;
  showAllEntries?: boolean; // If true, show all entries regardless of status
  refreshData?: () => void; // Function to refresh the data
}

const LiteratureTable: React.FC<LiteratureTableProps> = ({
  entries,
  loading,
  screeningType,
  onScreeningAction,
  showScreeningControls = false,
  showAllEntries = false,
  refreshData,
}) => {
  const [searchText, setSearchText] = useState<string>('');
  const [filterField, setFilterField] = useState<string>('all');
  const [sortField, setSortField] = useState<string>('year');
  const [sortOrder, setSortOrder] = useState<'ascend' | 'descend'>('descend');
  const [aiProcessingModalVisible, setAiProcessingModalVisible] = useState<boolean>(false);
  const [aiProcessingProgress, setAiProcessingProgress] = useState<number>(0);
  const [aiProcessingStatus, setAiProcessingStatus] = useState<string>('idle');
  const [messageApi, contextHolder] = message.useMessage();
  const [filteredEntries, setFilteredEntries] = useState(entries);
  
  useEffect(() => {
    setFilteredEntries(entries);
  }, [entries]);

  const statusFilteredEntries = useMemo(() => {
    return showAllEntries 
      ? filteredEntries
      : screeningType === 'title'
        ? filteredEntries.filter(entry => !entry.title_screening_status || entry.title_screening_status === 'pending')
        : filteredEntries.filter(entry => entry.title_screening_status === 'included' && 
            (!entry.abstract_screening_status || entry.abstract_screening_status === 'pending'));
  }, [filteredEntries, showAllEntries, screeningType]);

  const displayedEntries = useMemo(() => {
    if (!searchText) return statusFilteredEntries;
    
    const searchLower = searchText.toLowerCase();
    
    // Filter by specific field if selected
    if (filterField !== 'all') {
      return statusFilteredEntries.filter(entry => {
        const fieldValue = entry[filterField as keyof BibEntry];
        return typeof fieldValue === 'string' && fieldValue.toLowerCase().includes(searchLower);
      });
    }
    
    // Search across all relevant fields
    return statusFilteredEntries.filter(entry => (
      (entry.title?.toLowerCase().includes(searchLower) ?? false) ||
      (entry.author?.toLowerCase().includes(searchLower) ?? false) ||
      (entry.year?.toLowerCase().includes(searchLower) ?? false) ||
      (entry.journal?.toLowerCase().includes(searchLower) ?? false) ||
      (entry.booktitle?.toLowerCase().includes(searchLower) ?? false) ||
      (entry.publisher?.toLowerCase().includes(searchLower) ?? false) ||
      (entry.abstract?.toLowerCase().includes(searchLower) ?? false) ||
      (entry.keywords?.toLowerCase().includes(searchLower) ?? false)
    ));
  }, [searchText, filterField, statusFilteredEntries]);

  // Sort entries based on sort field and order
  const sortedEntries = [...displayedEntries].sort((a, b) => {
    const fieldA = a[sortField as keyof BibEntry] as string || '';
    const fieldB = b[sortField as keyof BibEntry] as string || '';
    
    // Special case for year (numeric sorting)
    if (sortField === 'year') {
      const yearA = parseInt(fieldA) || 0;
      const yearB = parseInt(fieldB) || 0;
      return sortOrder === 'ascend' ? yearA - yearB : yearB - yearA;
    }
    
    // String comparison for other fields
    return sortOrder === 'ascend' 
      ? fieldA.localeCompare(fieldB) 
      : fieldB.localeCompare(fieldA);
  });

  // Define screening status tag color
  const getStatusColor = (status?: ScreeningStatus) => {
    switch (status) {
      case 'included': return 'success';
      case 'excluded': return 'error';
      case 'maybe': return 'warning';
      case 'in_progress': return 'processing';
      default: return 'default';
    }
  };

  // Mock AI screening function for individual entries
  const handleAiScreening = (record: BibEntry) => {
    // Simulate AI processing
    messageApi.loading('AI is analyzing the entry...');
    
    setTimeout(() => {
      // Analyze title and abstract for keywords
      const titleLower = record.title?.toLowerCase() || '';
      const abstractLower = record.abstract?.toLowerCase() || '';
      const contentToAnalyze = screeningType === 'title' ? titleLower : titleLower + ' ' + abstractLower;
      
      // Default probability
      let inclusionProbability = 0.5;
      
      // Positive signals (increase probability)
      const positiveKeywords = ['significant', 'important', 'novel', 'breakthrough', 'effective', 'improvement'];
      positiveKeywords.forEach(keyword => {
        if (contentToAnalyze.includes(keyword)) {
          inclusionProbability += 0.1; // Increase probability for each positive keyword
        }
      });
      
      // Negative signals (decrease probability)
      const negativeKeywords = ['limited', 'preliminary', 'inconclusive', 'restricted', 'narrow'];
      negativeKeywords.forEach(keyword => {
        if (contentToAnalyze.includes(keyword)) {
          inclusionProbability -= 0.1; // Decrease probability for each negative keyword
        }
      });
      
      // Ensure probability is between 0 and 1
      inclusionProbability = Math.max(0, Math.min(1, inclusionProbability));
      
      // Threshold for decision (can be adjusted)
      const inclusionThreshold = 0.6;
      const exclusionThreshold = 0.4;
      
      let aiDecision: ScreeningStatus = 'maybe';
      let aiNotes = `AI analysis: Inclusion probability ${(inclusionProbability * 100).toFixed(1)}%`;
      
      if (inclusionProbability >= inclusionThreshold) {
        aiDecision = 'included';
        aiNotes += '. Recommended for inclusion based on content analysis.';
      } else if (inclusionProbability <= exclusionThreshold) {
        aiDecision = 'excluded';
        aiNotes += '. Recommended for exclusion based on content analysis.';
      } else {
        aiNotes += '. Requires human review - confidence level insufficient for automated decision.';
      }
      
      // Update screening status if callback is provided
      if (onScreeningAction) {
        onScreeningAction(record.ID, aiDecision, aiNotes);
      }
      
      messageApi.success('AI analysis complete');
    }, 1000);
  };

  // Batch AI processing
  const handleBatchAiProcessing = () => {
    setAiProcessingModalVisible(true);
    setAiProcessingProgress(0);
    setAiProcessingStatus('processing');
    
    // Get entries that need processing
    const entriesToProcess = sortedEntries.filter(entry => {
      const status = screeningType === 'title' 
        ? entry.title_screening_status 
        : entry.abstract_screening_status;
      return !status || status === 'pending' || status === 'in_progress';
    });
    
    if (entriesToProcess.length === 0) {
      setAiProcessingStatus('complete');
      messageApi.info('No entries to process');
      return;
    }
    
    // Process entries with delay to simulate API calls
    let processed = 0;
    const totalToProcess = entriesToProcess.length;
    let includedCount = 0;
    let excludedCount = 0;
    let maybeCount = 0;
    
    const processNext = () => {
      if (processed >= totalToProcess) {
        setAiProcessingStatus('complete');
        setAiProcessingProgress(100);
        
        // Show summary of processing results
        messageApi.success(`Processing complete: ${includedCount} included, ${excludedCount} excluded, ${maybeCount} maybe`);
        return;
      }
      
      const entry = entriesToProcess[processed];
      processed++;
      
      // Mock decision based on content analysis
      // In a real implementation, this would call an AI API
      let inclusionProbability = 0.5; // Default probability
      
      // Analyze title and abstract for keywords
      const titleLower = entry.title?.toLowerCase() || '';
      const abstractLower = entry.abstract?.toLowerCase() || '';
      const contentToAnalyze = screeningType === 'title' ? titleLower : titleLower + ' ' + abstractLower;
      
      // Positive signals (increase probability)
      const positiveKeywords = ['significant', 'important', 'novel', 'breakthrough', 'effective', 'improvement'];
      positiveKeywords.forEach(keyword => {
        if (contentToAnalyze.includes(keyword)) {
          inclusionProbability += 0.1; // Increase probability for each positive keyword
        }
      });
      
      // Negative signals (decrease probability)
      const negativeKeywords = ['limited', 'preliminary', 'inconclusive', 'restricted', 'narrow'];
      negativeKeywords.forEach(keyword => {
        if (contentToAnalyze.includes(keyword)) {
          inclusionProbability -= 0.1; // Decrease probability for each negative keyword
        }
      });
      
      // Ensure probability is between 0 and 1
      inclusionProbability = Math.max(0, Math.min(1, inclusionProbability));
      
      // Threshold for decision (can be adjusted)
      const inclusionThreshold = 0.6;
      const exclusionThreshold = 0.4;
      
      let aiDecision: ScreeningStatus = 'maybe';
      let aiNotes = `AI analysis: Inclusion probability ${(inclusionProbability * 100).toFixed(1)}%`;
      
      if (inclusionProbability >= inclusionThreshold) {
        aiDecision = 'included';
        aiNotes += '. Recommended for inclusion based on content analysis.';
        includedCount++;
      } else if (inclusionProbability <= exclusionThreshold) {
        aiDecision = 'excluded';
        aiNotes += '. Recommended for exclusion based on content analysis.';
        excludedCount++;
      } else {
        aiNotes += '. Requires human review - confidence level insufficient for automated decision.';
        maybeCount++;
      }
      
      // Update screening status if callback is provided
      if (onScreeningAction) {
        onScreeningAction(entry.ID, aiDecision, aiNotes);
      }
      
      // Update progress
      const progress = Math.floor((processed / totalToProcess) * 100);
      setAiProcessingProgress(progress);
      
      // Process next entry with delay
      setTimeout(processNext, 300);
    };
    
    // Start processing
    setTimeout(processNext, 500);
  };

  // Handle abstract update
  const handleUpdateAbstract = async (id: string, abstract: string) => {
    try {
      // Call the database utility function to update the abstract
      const success = await updateEntryAbstract(id, abstract);
      
      if (!success) {
        throw new Error('Failed to update abstract');
      }
      
      // Update the local state to reflect the change immediately
      const updatedEntries = filteredEntries.map(entry => {
        if (entry.ID === id) {
          return { ...entry, abstract };
        }
        return entry;
      });
      
      // Update the entries state directly to force a re-render
      setFilteredEntries(updatedEntries);
      
      // Show success message
      messageApi.success('Abstract updated successfully');
      
      // Refresh the data to ensure UI is in sync with database
      if (refreshData) {
        refreshData();
      }
    } catch (error) {
      console.error('Error updating abstract:', error);
      messageApi.error('Failed to update abstract');
    }
  };

  // Define screening action buttons
  const renderScreeningActions = (record: BibEntry) => {
    if (!showScreeningControls || !onScreeningAction) return null;
    
    // Get current status
    const status = screeningType === 'title' 
      ? record.title_screening_status 
      : record.abstract_screening_status;
    
    return (
      <Space size="small" className="flex-nowrap" style={{ whiteSpace: 'nowrap' }}>
        <Tooltip title="Include">
          <Button 
            type={status === 'included' ? 'primary' : 'default'}
            icon={<CheckOutlined />} 
            size="small"
            onClick={() => onScreeningAction(record.ID, 'included')}
            style={{ padding: '0 8px' }}
          />
        </Tooltip>
        <Tooltip title="Exclude">
          <Button 
            danger={status === 'excluded'}
            icon={<CloseOutlined />} 
            size="small"
            onClick={() => onScreeningAction(record.ID, 'excluded')}
            style={{ padding: '0 8px' }}
          />
        </Tooltip>
        <Tooltip title="Maybe">
          <Button 
            type={status === 'maybe' ? 'dashed' : 'default'}
            icon={<QuestionOutlined />} 
            size="small"
            onClick={() => onScreeningAction(record.ID, 'maybe')}
            style={{ padding: '0 8px' }}
          />
        </Tooltip>
        <Tooltip title="AI Screening">
          <Button
            icon={<RobotOutlined />}
            size="small"
            onClick={() => handleAiScreening(record)}
            style={{ padding: '0 8px' }}
          />
        </Tooltip>
      </Space>
    );
  };

  // Define table columns
  const columns: ColumnsType<BibEntry> = [
    {
      title: 'Year',
      dataIndex: 'year',
      key: 'year',
      sorter: true,
      sortOrder: sortField === 'year' ? sortOrder : null,
      width: 80,
      fixed: 'left',
      ellipsis: true,
      render: (text: string) => text || 'N/A',
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      sorter: true,
      sortOrder: sortField === 'title' ? sortOrder : null,
      width: 300,
      ellipsis: { showTitle: false },
      render: (text: string) => (
        <Tooltip title={text || 'N/A'} placement="topLeft">
          <div className="line-clamp-2" style={{ wordWrap: 'break-word', wordBreak: 'break-word', maxHeight: '3em', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {text || 'N/A'}
          </div>
        </Tooltip>
      ),
    },
    {
      title: 'Author(s)',
      dataIndex: 'author',
      key: 'author',
      sorter: true,
      sortOrder: sortField === 'author' ? sortOrder : null,
      width: 200,
      ellipsis: { showTitle: false },
      render: (text: string) => (
        <Tooltip title={text || 'N/A'} placement="topLeft">
          <div className="line-clamp-2" style={{ wordWrap: 'break-word', wordBreak: 'break-word', maxHeight: '3em', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {text || 'N/A'}
          </div>
        </Tooltip>
      ),
    },
    {
      title: 'Publication Venue',
      key: 'venue',
      dataIndex: 'journal',
      width: 200,
      ellipsis: { showTitle: false },
      sorter: true,
      sortOrder: sortField === 'journal' ? sortOrder : null,
      render: (_: any, record: BibEntry) => {
        const venue = record.journal || record.booktitle || record.publisher || 'N/A';
        return (
          <Tooltip title={venue} placement="topLeft">
            <div className="line-clamp-2" style={{ wordWrap: 'break-word', wordBreak: 'break-word', maxHeight: '3em', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {venue}
            </div>
          </Tooltip>
        );
      },
    },
  ];

  // Add screening status column if screening type is provided
  if (screeningType) {
    columns.push({
      title: 'Status',
      key: 'status',
      dataIndex: screeningType === 'title' ? 'title_screening_status' : 'abstract_screening_status',
      width: 100,
      sorter: true,
      sortOrder: sortField === (screeningType === 'title' ? 'title_screening_status' : 'abstract_screening_status') ? sortOrder : null,
      render: (_: any, record: BibEntry) => {
        const status = screeningType === 'title' 
          ? record.title_screening_status 
          : record.abstract_screening_status;
        return (
          <Tag color={getStatusColor(status)}>
            {status || 'pending'}
          </Tag>
        );
      },
    });
  }

  // Add actions column if screening controls are enabled
  if (showScreeningControls) {
    columns.push({
      title: 'Actions',
      key: 'actions',
      dataIndex: 'ID',
      width: 150,
      fixed: 'right',
      render: (_: any, record: BibEntry) => renderScreeningActions(record),
    });
  }

  // Handle table sorting
  const handleTableChange = (pagination: any, filters: any, sorter: any) => {
    if (sorter && sorter.field) {
      setSortField(sorter.field as string);
      setSortOrder(sorter.order as 'ascend' | 'descend' || 'ascend');
    }
  };

  // Table pagination configuration
  const paginationConfig = {
    pageSize: 10,
    showSizeChanger: true,
    pageSizeOptions: ['10', '20', '50'],
    showTotal: (total: number) => `Total ${total} items`,
  };

  return (
    <div>
      {contextHolder}
      
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex-grow">
          <Search
            placeholder="Search in table"
            allowClear
            enterButton={<SearchOutlined />}
            size="large"
            onSearch={setSearchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
        <div className="flex-shrink-0">
          <Select 
            defaultValue="all" 
            style={{ width: 150 }} 
            onChange={setFilterField}
            placeholder="Filter by field"
          >
            <Option value="all">All Fields</Option>
            <Option value="title">Title</Option>
            <Option value="author">Author</Option>
            <Option value="year">Year</Option>
            <Option value="journal">Journal</Option>
            <Option value="abstract">Abstract</Option>
            <Option value="keywords">Keywords</Option>
          </Select>
        </div>
        <div className="flex-shrink-0 flex items-center gap-2">
          <span>Sort by:</span>
          <Select 
            value={sortField} 
            style={{ width: 150 }} 
            onChange={setSortField}
          >
            <Option value="year">Year</Option>
            <Option value="title">Title</Option>
            <Option value="author">Author</Option>
            <Option value="journal">Journal</Option>
            {screeningType && (
              <Option value={screeningType === 'title' ? 'title_screening_status' : 'abstract_screening_status'}>
                Status
              </Option>
            )}
          </Select>
          <Button 
            icon={sortOrder === 'ascend' ? <SortAscendingOutlined /> : <SortDescendingOutlined />}
            onClick={() => setSortOrder(sortOrder === 'ascend' ? 'descend' : 'ascend')}
          />
          {showScreeningControls && (
            <Button 
              type="primary"
              icon={<ThunderboltOutlined />}
              onClick={handleBatchAiProcessing}
              title="Batch AI Processing"
            >
              AI Batch
            </Button>
          )}
        </div>
      </div>
      
      <Table 
        columns={columns} 
        dataSource={sortedEntries} 
        rowKey="ID"
        loading={loading}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100'],
        }}
        expandable={{
          expandedRowRender: (record) => (
            <ExpandableRow 
              record={record} 
              onUpdateAbstract={handleUpdateAbstract}
            />
          ),
        }}
        onChange={handleTableChange}
        size="middle"
        className="literature-table"
      />
      
      {/* AI Processing Modal */}
      <Modal
        title="AI Batch Processing"
        open={aiProcessingModalVisible}
        onCancel={() => {
          if (aiProcessingStatus !== 'processing') {
            setAiProcessingModalVisible(false);
          }
        }}
        footer={[
          <Button 
            key="close" 
            onClick={() => setAiProcessingModalVisible(false)}
            disabled={aiProcessingStatus === 'processing'}
          >
            Close
          </Button>
        ]}
        width={600}
      >
        <div className="py-4">
          <Progress 
            percent={aiProcessingProgress} 
            status={aiProcessingStatus === 'processing' ? 'active' : 'success'} 
            strokeWidth={10}
          />
          <div className="mt-4 mb-2">
            <Text strong>
              {aiProcessingStatus === 'idle' && 'Ready to process entries'}
              {aiProcessingStatus === 'processing' && `Processing entries (${aiProcessingProgress}% complete)`}
              {aiProcessingStatus === 'complete' && 'Processing complete!'}
            </Text>
          </div>
          <div className="bg-gray-50 p-4 rounded">
            <Text type="secondary">
              <p>The AI screening process analyzes the content of each entry to determine its relevance to your research.</p>
              <ul>
                <li>Entries with strong positive indicators will be marked as <Tag color="success">included</Tag></li>
                <li>Entries with strong negative indicators will be marked as <Tag color="error">excluded</Tag></li>
                <li>Entries with mixed or inconclusive signals will be marked as <Tag color="warning">maybe</Tag> for human review</li>
              </ul>
              <p>You can always manually change the AI's decision for any entry.</p>
            </Text>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default LiteratureTable;
