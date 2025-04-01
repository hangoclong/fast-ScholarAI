'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Table, Input, Button, Space, Tag, Tooltip, Select, Typography, Modal, Progress, message } from 'antd';
import { SearchOutlined, CheckOutlined, CloseOutlined, QuestionOutlined, FilterOutlined, 
  SortAscendingOutlined, SortDescendingOutlined, RobotOutlined, ThunderboltOutlined } from '@ant-design/icons';
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
  tableKey?: number; // Add prop for the key
}

export default function LiteratureTable({
  entries = [],
  loading = false,
  screeningType,
  onScreeningAction,
  showScreeningControls = false,
  showAllEntries = false,
  refreshData,
  tableKey, // Destructure the key prop
}: LiteratureTableProps) {
  console.log('LiteratureTable - received entries:', entries);
  console.log('LiteratureTable - entries length:', entries?.length || 0);
  console.log('LiteratureTable - entries is array:', Array.isArray(entries));
  
  // Initialize state
  const [searchText, setSearchText] = useState<string>('');
  const [filterField, setFilterField] = useState<string>('all');
  const [sortField, setSortField] = useState<string>('year');
  const [sortOrder, setSortOrder] = useState<'ascend' | 'descend'>('descend');
  const [statusFilter, setStatusFilter] = useState<string>('all'); // Changed state type and initial value
  const [aiModalVisible, setAIModalVisible] = useState<boolean>(false);
  const [aiProcessingStatus, setAiProcessingStatus] = useState<string>('idle');
  const [aiProcessingProgress, setAiProcessingProgress] = useState<number>(0);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [messageApi, contextHolder] = message.useMessage();

  console.log('Rendering LiteratureTable - Current statusFilter state:', statusFilter); // Log state value

  // 1. Base Entries (Always start with the full list for filtering)
  const baseEntries = useMemo(() => {
    return Array.isArray(entries) ? entries : [];
  }, [entries]);

  // 2. Apply Search Filter
  const searchedEntries = useMemo(() => {
    if (!searchText) return baseEntries;

    const searchLower = searchText.toLowerCase();
    return baseEntries.filter(entry => {
      if (filterField === 'all') {
        return Object.keys(entry).some(key => {
          const value = entry[key as keyof BibEntry];
          return typeof value === 'string' && value.toLowerCase().includes(searchLower);
        });
      } else {
        const value = entry[filterField as keyof BibEntry];
        return typeof value === 'string' && value.toLowerCase().includes(searchLower);
      }
    });
  }, [baseEntries, searchText, filterField]);

  // 3. Apply Status Filter
  const statusFilteredEntries = useMemo(() => {
    if (statusFilter === 'all' || !screeningType) {
      return searchedEntries; // Pass through if 'All Status' or no screening context
    }

    const statusKey = screeningType === 'title' ? 'title_screening_status' : 'abstract_screening_status';
    const targetStatus = statusFilter === 'pending' ? null : statusFilter;

    return searchedEntries.filter(entry => {
      const entryStatus = entry[statusKey] || null; // Default to null if undefined
      if (targetStatus === null) { // Check for 'pending' (null or 'pending' string)
        return !entryStatus || entryStatus === 'pending';
      }
      return entryStatus === targetStatus;
    });
  }, [searchedEntries, statusFilter, screeningType]);

  // 4. Apply Screening Filter (Conditionally)
  const displayEntries = useMemo(() => {
    // If showing all entries prop is set OR 'All Status' is selected, bypass screening filter
    if (showAllEntries || statusFilter === 'all') {
      return statusFilteredEntries;
    }

    // Otherwise, apply the screening-specific filter
    if (screeningType === 'title') {
      return statusFilteredEntries.filter(entry => !entry.title_screening_status || entry.title_screening_status === 'pending');
    } else if (screeningType === 'abstract') {
      return statusFilteredEntries.filter(entry =>
        entry.title_screening_status === 'included' &&
        (!entry.abstract_screening_status || entry.abstract_screening_status === 'pending')
      );
    }

    // Fallback: If no screening type, return the status-filtered list
    return statusFilteredEntries;
  }, [statusFilteredEntries, showAllEntries, statusFilter, screeningType]);

  // 5. Sort Entries
  const sortedEntries = useMemo(() => {
    if (!displayEntries.length) return []; // Use final display entries

    return [...displayEntries].sort((a, b) => { // Use final display entries
      const aValue = a[sortField as keyof BibEntry] ?? ''; // Use nullish coalescing
      const bValue = b[sortField as keyof BibEntry] ?? ''; // Use nullish coalescing

      // Special handling for year field (ensure consistent comparison)
      if (sortField === 'year') {
        const yearA = parseInt(String(aValue), 10) || 0; // Specify radix 10
        const yearB = parseInt(String(bValue), 10) || 0; // Specify radix 10
        if (yearA !== yearB) {
          return sortOrder === 'ascend' ? yearA - yearB : yearB - yearA;
        }
        // If years are the same, potentially fall through to secondary sort (e.g., title) - optional
      }

      // String comparison for other fields (case-insensitive)
      const strA = String(aValue).toLocaleLowerCase(); // Use localeCompare for better i18n
      const strB = String(bValue).toLocaleLowerCase();
      if (strA !== strB) {
        return sortOrder === 'ascend' ? strA.localeCompare(strB) : strB.localeCompare(strA);
      }

      // Optional: Add secondary sort criteria if primary values are equal
      // e.g., sort by title if years are the same
      // if (sortField !== 'title') {
      //   const titleA = String(a.title || '').toLocaleLowerCase();
      //   const titleB = String(b.title || '').toLocaleLowerCase();
      //   return titleA.localeCompare(titleB);
      // }

      return 0; // Entries are equal based on current criteria
    });
  }, [displayEntries, sortField, sortOrder]); // Use final display entries

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
    pageSizeOptions: ['10', '20', '50'],
    showTotal: (total: number) => `Total ${total} items`,
  };

  // Handle AI batch processing
  const handleAIBatchProcessing = () => {
    if (selectedRowKeys.length === 0) {
      messageApi.warning('Please select entries to process');
      return;
    }
    
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

  // Log the final data being passed to the AntD Table
  console.log('LiteratureTable - Final sortedEntries for rendering:', sortedEntries);

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
            onChange={(value) => setStatusFilter(value)} // Correctly set statusFilter state
            placeholder="Filter by status"
            value={statusFilter} // Control the selected value
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
        {screeningType && onScreeningAction && (
          <div className="flex-shrink-0 ml-auto">
            <AIBatchProcessor 
              screeningType={screeningType || 'title'}
              entries={entries.filter(entry => selectedRowKeys.includes(entry.ID || ''))}
              onScreeningAction={(id, status, notes) => {
                if (onScreeningAction) {
                  onScreeningAction(id, status, notes);
                }
              }}
              onComplete={() => {
                setAIModalVisible(false);
                setSelectedRowKeys([]);
                if (refreshData) refreshData();
              }}
            />
          </div>
        )}
      </div>
      
      <Table
        key={tableKey} // Use the passed-in key here
        columns={columns}
        dataSource={sortedEntries}
        rowKey="ID"
        loading={loading}
        pagination={{
          defaultPageSize: 50, // Set default page size to 50
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`, // Improve total display
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
        rowSelection={{
          onChange: (selectedRowKeys: React.Key[]) => {
            setSelectedRowKeys(selectedRowKeys);
          },
        }}
      />
      
      {/* AI Processing Modal */}
      <Modal
        title="AI Batch Processing"
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
          </Button>,
          <Button
            key="process"
            type="primary"
            onClick={handleAIBatchProcessing}
            loading={aiProcessingStatus === 'processing'}
            disabled={selectedRowKeys.length === 0 || aiProcessingStatus === 'processing'}
          >
            Process
          </Button>,
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
        
        <AIBatchProcessor 
          screeningType={screeningType || 'title'}
          entries={entries.filter(entry => selectedRowKeys.includes(entry.ID || ''))}
          onScreeningAction={(id, status, notes) => {
            if (onScreeningAction) {
              onScreeningAction(id, status, notes);
            }
          }}
          onComplete={() => {
            setAIModalVisible(false);
            setSelectedRowKeys([]);
            if (refreshData) refreshData();
          }}
        />
      </Modal>
    </div>
  );
};
