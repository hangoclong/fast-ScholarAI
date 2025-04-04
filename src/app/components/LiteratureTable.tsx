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
  // Add props for controlled pagination
  currentPage?: number;
  pageSize?: number;
  onPaginationChange?: (page: number, pageSize: number) => void;
  totalCount?: number; // Add prop for total count
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
  // Destructure pagination props, provide defaults if needed for standalone use (though less likely now)
  currentPage = 1,
  pageSize = 10,
  onPaginationChange,
  totalCount = 0, // Destructure totalCount, default to 0
}: LiteratureTableProps) {
  console.log('LiteratureTable - Received props - currentPage:', currentPage, 'pageSize:', pageSize, 'totalCount:', totalCount); // Log received props
  console.log('LiteratureTable - received entries:', entries);
  console.log('LiteratureTable - entries length:', entries?.length || 0);
  console.log('LiteratureTable - entries is array:', Array.isArray(entries));
  
  // Initialize state
  const [searchText, setSearchText] = useState<string>('');
  const [filterField, setFilterField] = useState<string>('all');
  const [sortField, setSortField] = useState<string>('year');
  const [sortOrder, setSortOrder] = useState<'ascend' | 'descend' | null>('descend'); // Allow null for sortOrder state
  const [statusFilter, setStatusFilter] = useState<string>('all'); // Changed state type and initial value
  // Removed AI Modal/Progress state - handled by AIBatchProcessor internally
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [messageApi, contextHolder] = message.useMessage();
  // Removed internal state for currentPage and pageSize
  // const [currentPage, setCurrentPage] = useState<number>(1);
  // const [pageSize, setPageSize] = useState<number>(10);
  // Removed triggerAiProcessing state

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

  // 4. Final Display Entries (No additional screening filter needed here)
  // The statusFilteredEntries already correctly filters based on the dropdown selection.
  const displayEntries = useMemo(() => {
    return statusFilteredEntries;
  }, [statusFilteredEntries]); // Dependency is just the result of status filtering

  // 5. Sort Entries
  const sortedEntries = useMemo(() => {
    if (!displayEntries.length) return []; // Use the displayEntries directly

    return [...displayEntries].sort((a, b) => { // Sort the displayEntries
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

  // Removed handleAiScreening function as individual AI screening is not performed here

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
        {/* Removed individual AI Screening button */}
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

  // Handle table changes (sorting, pagination)
  const handleTableChange: TableProps<BibEntry>['onChange'] = (pagination, filters, sorter) => {
    // Call the handler passed from the parent for pagination changes
    if (onPaginationChange) {
      onPaginationChange(pagination.current || 1, pagination.pageSize || 10);
    }

    // Update sorting state (remains internal to the table for now)
    if (sorter && 'field' in sorter && sorter.field) {
      setSortField(sorter.field as string);
      setSortOrder(sorter.order || null); // Allow resetting sort order
    } else {
      // Reset sorting if column header is clicked without a specific order
      setSortField('year'); // Or your default sort field
      setSortOrder('descend'); // Or your default sort order
     }
   };
 
   // Removed handleProgressUpdate and handleStatusUpdate callbacks
 
   // Table pagination configuration (used for options and total display)
   const paginationConfig = {
     pageSize: 10, // Default page size
     showSizeChanger: true,
    pageSizeOptions: ['10', '20', '50', '100'], // Keep page sizes reasonable for performance
    showTotal: (total: number) => `Total ${total} items`,
   };
 
   // Removed handleAIBatchProcessing function
 
   // Handle AI processing completion from AIBatchProcessor
   const handleAIProcessingComplete = () => {
     console.log('AI batch processing complete signal received in LiteratureTable.');
     // Reset selection in LiteratureTable after AIBatchProcessor finishes
     setSelectedRowKeys([]);
     // Refresh data if needed
     if (refreshData) {
       refreshData();
     }
   };
 
   // Log the final data being passed to the AntD Table (Moved this log before return)
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
         
         {/* Render AIBatchProcessor directly - it handles its own button/modal */}
         {screeningType && onScreeningAction && (
           <div className="flex-shrink-0 ml-auto">
             <AIBatchProcessor
               screeningType={screeningType}
               // Pass only the selected entries to the processor
               entries={entries.filter(entry => selectedRowKeys.includes(entry.ID || ''))}
               onScreeningAction={onScreeningAction} // Pass down the screening action handler
               onComplete={handleAIProcessingComplete} // Pass the completion handler
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
        pagination={{ // Pass state and config options
          current: currentPage,
          pageSize: pageSize,
          pageSizeOptions: paginationConfig.pageSizeOptions,
          showSizeChanger: paginationConfig.showSizeChanger,
          showTotal: paginationConfig.showTotal,
          total: totalCount, // Use the totalCount prop from the parent
        }}
        expandable={{
          expandedRowRender: (record) => (
            <ExpandableRow
              record={record}
              screeningType={screeningType} // Pass screeningType down
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
          selectedRowKeys, // Control selected keys
          onChange: (keys: React.Key[]) => {
            setSelectedRowKeys(keys);
          },
          selections: [ // Add custom selection options
            Table.SELECTION_ALL, // Default "Select All on Current Page"
            Table.SELECTION_INVERT, // Default "Invert Selection on Current Page"
            Table.SELECTION_NONE, // Default "Clear All Selections"
            { // Custom option to select all filtered data
              key: 'selectAllFiltered',
              text: `Select All ${sortedEntries.length} Filtered Items`,
              onSelect: () => {
                const allFilteredIds = sortedEntries.map(entry => entry.ID);
                setSelectedRowKeys(allFilteredIds);
                // Show confirmation message
                messageApi.info(`Selected all ${allFilteredIds.length} filtered entries.`); 
              },
            },
          ],
        }}
       />
       
       {/* Removed the external AI Processing Modal - AIBatchProcessor handles its own */}
     </div>
  );
};
