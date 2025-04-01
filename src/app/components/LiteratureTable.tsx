'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Table, Input, Button, Space, Tag, Tooltip, Select, Typography, Modal, Progress, message } from 'antd';
import { SearchOutlined, CheckOutlined, CloseOutlined, QuestionOutlined, FilterOutlined, 
  SortAscendingOutlined, SortDescendingOutlined, RobotOutlined, ThunderboltOutlined, SettingOutlined } from '@ant-design/icons';
import type { TableProps, ColumnsType } from 'antd/es/table';
import { BibEntry, ScreeningStatus } from '../types';
import ExpandableRow from './ExpandableRow';
import { updateEntryAbstract } from '../utils/database';
import AIBatchProcessor from './AIBatchProcessor';
import { getAIPrompt, getAPIKey } from '../utils/database';
import { processWithGemini } from '../services/geminiService';

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
  setEntries?: (entries: BibEntry[]) => void;
}

export default function LiteratureTable({
  entries = [],
  loading = false,
  screeningType,
  onScreeningAction,
  showScreeningControls = false,
  showAllEntries = false,
  refreshData,
  setEntries,
}: LiteratureTableProps) {
  console.log('LiteratureTable - received entries:', entries);
  console.log('LiteratureTable - entries length:', entries?.length || 0);
  console.log('LiteratureTable - entries is array:', Array.isArray(entries));
  
  // Initialize state
  const [searchText, setSearchText] = useState<string>('');
  const [filterField, setFilterField] = useState<string>('all');
  const [sortField, setSortField] = useState<string>('year');
  const [sortOrder, setSortOrder] = useState<'ascend' | 'descend'>('descend');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [aiModalVisible, setAIModalVisible] = useState<boolean>(false);
  const [aiProcessingStatus, setAiProcessingStatus] = useState<string>('idle');
  const [aiProcessingProgress, setAiProcessingProgress] = useState<number>(0);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [messageApi, contextHolder] = message.useMessage();
  
  // Filter entries based on screening type and showAllEntries
  const filteredByScreeningEntries = useMemo(() => {
    if (!Array.isArray(entries)) return [];
    if (showAllEntries) return entries;
    
    if (screeningType === 'title') {
      return entries.filter(entry => !entry.title_screening_status || entry.title_screening_status === 'pending');
    } else if (screeningType === 'abstract') {
      return entries.filter(entry => 
        entry.title_screening_status === 'included' && 
        (!entry.abstract_screening_status || entry.abstract_screening_status === 'pending')
      );
    }
    
    return entries;
  }, [entries, screeningType, showAllEntries]);
  
  // Filter entries based on search text
  const filteredBySearchEntries = useMemo(() => {
    if (!searchText) return filteredByScreeningEntries;
    
    const searchLower = searchText.toLowerCase();
    
    return filteredByScreeningEntries.filter(entry => {
      if (filterField === 'all') {
        // Search in all text fields
        return Object.keys(entry).some(key => {
          const value = entry[key as keyof BibEntry];
          return typeof value === 'string' && value.toLowerCase().includes(searchLower);
        });
      } else {
        // Search in specific field
        const value = entry[filterField as keyof BibEntry];
        return typeof value === 'string' && value.toLowerCase().includes(searchLower);
      }
    });
  }, [filteredByScreeningEntries, searchText, filterField]);
  
  // Sort entries
  const sortedEntries = useMemo(() => {
    if (!filteredBySearchEntries.length) return [];
    
    return [...filteredBySearchEntries].sort((a, b) => {
      const aValue = a[sortField as keyof BibEntry] || '';
      const bValue = b[sortField as keyof BibEntry] || '';
      
      // Special handling for year field
      if (sortField === 'year') {
        const yearA = parseInt(String(aValue)) || 0;
        const yearB = parseInt(String(bValue)) || 0;
        return sortOrder === 'ascend' ? yearA - yearB : yearB - yearA;
      }
      
      // String comparison for other fields
      const strA = String(aValue).toLowerCase();
      const strB = String(bValue).toLowerCase();
      return sortOrder === 'ascend' ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });
  }, [filteredBySearchEntries, sortField, sortOrder]);

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

  // AI screening for individual entries using Gemini API
  const handleAiScreening = async (record: BibEntry) => {
    if (!screeningType || !onScreeningAction) return;
    
    try {
      // Show loading message
      messageApi.loading('AI is analyzing the entry...');
      
      // Get the prompt and API key
      const prompt = await getAIPrompt(screeningType);
      const apiKey = await getAPIKey('gemini');
      
      // Extract text based on screening type
      const text = screeningType === 'title' 
        ? record.title || ''
        : (record.abstract || record.title || '');
      
      // Process with Gemini API
      const result = await processWithGemini(prompt, text, screeningType);
      
      // Parse the result to determine screening status
      const upperResult = result.toUpperCase();
      let status: ScreeningStatus = 'maybe';
      
      if (upperResult.includes('INCLUDE')) {
        status = 'included';
      } else if (upperResult.includes('EXCLUDE')) {
        status = 'excluded';
      }
      
      // Update screening status
      onScreeningAction(record.ID, status, result);
      
      // Show success message
      messageApi.success('AI analysis complete');
    } catch (error: any) {
      console.error('Error during AI screening:', error);
      messageApi.error(`AI screening failed: ${error.message}`);
    }
  };

  // Handle abstract update
  const handleUpdateAbstract = async (id: string, abstract: string) => {
    try {
      // Call the database utility function to update the abstract
      const success = await updateEntryAbstract(id, abstract);
      
      if (!success) {
        throw new Error('Failed to update abstract');
      }
      
      // Since filteredEntries is now derived from entries using useMemo,
      // we can't update it directly. Instead, we'll just refresh the data.
      
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
            className="hover:shadow-md transition-all duration-300"
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
      width: 80,
      sorter: true,
      sortOrder: sortField === 'year' ? sortOrder : null,
      render: (year) => year || 'N/A',
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      sorter: true,
      sortOrder: sortField === 'title' ? sortOrder : null,
      render: (title, record) => {
        return (
          <Tooltip title={title} placement="topLeft">
            <div className="line-clamp-2" style={{ wordWrap: 'break-word', wordBreak: 'break-word', maxHeight: '3em', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {title || 'No Title'}
            </div>
          </Tooltip>
        );
      },
    },
    {
      title: 'Author(s)',
      dataIndex: 'author',
      key: 'author',
      width: 200,
      sorter: true,
      sortOrder: sortField === 'author' ? sortOrder : null,
      render: (author) => {
        return (
          <Tooltip title={author} placement="topLeft">
            <div className="line-clamp-2" style={{ wordWrap: 'break-word', wordBreak: 'break-word', maxHeight: '3em', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {author || 'Unknown Author'}
            </div>
          </Tooltip>
        );
      },
    },
    {
      title: 'Publication Venue',
      dataIndex: 'journal',
      key: 'journal',
      sorter: true,
      sortOrder: sortField === 'journal' ? sortOrder : null,
      render: (journal, record) => {
        const venue = journal || record.booktitle || record.publisher || 'N/A';
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
    pageSizeOptions: ['10', '20', '50', '100'],
    showTotal: (total: number) => `Total ${total} items`,
  };

  // Handle AI batch processing
  const handleAIBatchProcessing = () => {
    setAIModalVisible(true);
    setAiProcessingStatus('idle');
    setAiProcessingProgress(0);
  };

  // Handle AI processing complete
  const handleAIProcessingComplete = (results: { id: string; status: ScreeningStatus; notes?: string }[]) => {
    console.log('AI processing complete:', results);
    
    // Update entries with AI results
    if (results.length > 0 && onScreeningAction) {
      results.forEach(result => {
        onScreeningAction(result.id, result.status, result.notes);
      });
      
      messageApi.success(`Processed ${results.length} entries with AI`);
    }
    
    // Close modal and reset state
    setAIModalVisible(false);
    setSelectedRowKeys([]);
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
            <Option value="journal">Journal/Venue</Option>
            <Option value="year">Year</Option>
          </Select>
        </div>
        <div className="flex-shrink-0">
          <Select 
            defaultValue="all" 
            style={{ width: 150 }} 
            onChange={(value) => {
              setFilterField(value);
              setSortField(value);
            }}
            placeholder="Filter by status"
          >
            <Option value="all">All Status</Option>
            <Option value="pending">Pending</Option>
            <Option value="included">Included</Option>
            <Option value="excluded">Excluded</Option>
            <Option value="maybe">Maybe</Option>
          </Select>
        </div>
        
        {/* Sort buttons */}
        <div className="flex-shrink-0">
          <Space>
            <Tooltip title="Sort Ascending">
              <Button 
                icon={<SortAscendingOutlined />} 
                onClick={() => setSortOrder('ascend')}
                type={sortOrder === 'ascend' ? 'primary' : 'default'}
              />
            </Tooltip>
            <Tooltip title="Sort Descending">
              <Button 
                icon={<SortDescendingOutlined />} 
                onClick={() => setSortOrder('descend')}
                type={sortOrder === 'descend' ? 'primary' : 'default'}
              />
            </Tooltip>
          </Space>
        </div>
        
        {/* AI Batch Processing */}
          <div className="flex-shrink-0 ml-auto">
            <Space>
              <Button
                type="primary"
                icon={<RobotOutlined />}
                onClick={handleAIBatchProcessing}
                disabled={entries.length === 0}
                className="hover:shadow-md transition-all duration-300"
              >
                AI Batch Processing
              </Button>
              <Button
                icon={<SettingOutlined />}
                onClick={() => setAIModalVisible(true)}
                className="hover:shadow-md transition-all duration-300"
              >
                Edit AI Prompt
              </Button>
            </Space>
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
              onUpdateAbstract={(id, abstract) => {
                handleUpdateAbstract(id, abstract);
              }}
            />
          ),
        }}
        onChange={handleTableChange}
        size="middle"
        className="literature-table"
        onRow={(record) => ({
          onClick: () => {
            console.log('Row clicked:', record);
          },
        })}
      />
      
      {/* AI Processing Modal */}
      <Modal
        title="AI Prompt Settings"
        open={aiModalVisible}
        onCancel={() => {
          if (aiProcessingStatus !== 'processing') {
            setAIModalVisible(false);
          }
        }}
        footer={[
          <Button 
            key="close" 
            onClick={() => setAIModalVisible(false)}
            disabled={aiProcessingStatus === 'processing'}
          >
            Close
          </Button>
        ]}
        width={700}
      >
        <div className="mb-4">
          <Progress 
            percent={aiProcessingProgress} 
            status={aiProcessingStatus === 'error' ? 'exception' : 
                   aiProcessingStatus === 'success' ? 'success' : 'active'} 
            style={{ display: aiProcessingStatus === 'idle' ? 'none' : 'block' }}
          />
        </div>
      </Modal>
    </div>
  );
};
