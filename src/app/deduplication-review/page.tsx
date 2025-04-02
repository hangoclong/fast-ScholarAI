'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Layout,
  Table,
  Button,
  message, // Ensure message is imported
  Tag,
  Checkbox, // Import Checkbox
  Space,
  Typography,
  Spin,
  Alert,
  Tooltip,
  Card,
  Row,
  Col,
  Statistic
} from 'antd';
import type { CheckboxChangeEvent } from 'antd/es/checkbox'; // Import Checkbox event type
import type { TableProps } from 'antd';
import { StarFilled, ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { BibEntry, ScreeningStatus } from '../types';
import {
  getDeduplicationReviewEntries,
  updateDeduplicationStatus,
  runDeduplicationCheck,
  getDatabaseStats
} from '../utils/database';

const { Header, Content, Footer } = Layout;
const { Title, Text } = Typography;

// Interface for table data structure, adding group info
interface DeduplicationTableRow extends BibEntry {
  key: string; // Required by Ant Table
  groupId: string;
  isFirstInGroup: boolean; // For row spanning
  groupSize: number; // For row spanning
}

// Interface for storing review decisions (simplified for checkbox)
interface Decision {
  status: ScreeningStatus; // 'included' (Keep) or 'excluded' (Remove)
}

// Define the expected shape of the stats object returned by getDatabaseStats
interface PageStats {
  total: number;
  titleScreening: { pending: number; included: number; excluded: number; maybe: number };
  abstractScreening: { pending: number; included: number; excluded: number; maybe: number };
  deduplication: { groupsPending: number; entriesPending: number; excluded: number; };
}

const DeduplicationReviewPage: React.FC = () => {
  const [groupedEntries, setGroupedEntries] = useState<Record<string, BibEntry[]>>({});
  const [tableData, setTableData] = useState<DeduplicationTableRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [runningCheck, setRunningCheck] = useState<boolean>(false);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({}); // Key: entry.ID
  // Use the PageStats interface for state and provide a matching initial state
  const [stats, setStats] = useState<PageStats>({
    total: 0,
    titleScreening: { pending: 0, included: 0, excluded: 0, maybe: 0 },
    abstractScreening: { pending: 0, included: 0, excluded: 0, maybe: 0 },
    deduplication: { groupsPending: 0, entriesPending: 0, excluded: 0 }
  });
  const [messageApi, contextHolder] = message.useMessage(); // Use the hook correctly

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch both entries and stats
      const [entriesData, statsData] = await Promise.all([
        getDeduplicationReviewEntries(),
        getDatabaseStats()
      ]);

      setGroupedEntries(entriesData);
      // Ensure the fetched stats data conforms to PageStats before setting
      if (statsData && typeof statsData === 'object' && 'deduplication' in statsData) {
         setStats(statsData as PageStats);
      } else {
         console.error("Fetched stats data is missing 'deduplication' property:", statsData);
         setStats({ // Reset to default if data is invalid
            total: 0,
            titleScreening: { pending: 0, included: 0, excluded: 0, maybe: 0 },
            abstractScreening: { pending: 0, included: 0, excluded: 0, maybe: 0 },
            deduplication: { groupsPending: 0, entriesPending: 0, excluded: 0 }
         });
      }

      // Prepare table data and initial decisions
      const newTableData: DeduplicationTableRow[] = [];
      const initialDecisions: Record<string, Decision> = {};
      Object.entries(entriesData).forEach(([groupId, entries]) => {
        // Determine initial state: if any entry in the group was marked primary, keep it. Otherwise, exclude all.
        const primaryEntry = entries.find(e => e.is_primary_duplicate === 1);

        entries.forEach((entry, index) => {
          const isFirst = index === 0;
          newTableData.push({
            ...entry,
            key: entry.ID,
            groupId: groupId,
            isFirstInGroup: isFirst,
            groupSize: entries.length,
          });
          // Initial decision: Keep if it was the primary, otherwise exclude.
          initialDecisions[entry.ID] = {
            status: primaryEntry && entry.ID === primaryEntry.ID ? 'included' : 'excluded',
          };
        });
      });
      setTableData(newTableData);
      setDecisions(initialDecisions);

    } catch (error) {
      messageApi.error('Failed to load data.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [messageApi]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRunDeduplication = async () => {
    setRunningCheck(true);
    messageApi.loading({ content: 'Running deduplication check...', key: 'dedupCheck' });
    try {
      const result = await runDeduplicationCheck();
      messageApi.success({ content: `Deduplication check complete. ${result.count} entries updated for review. Refreshing list...`, key: 'dedupCheck', duration: 3 });
      loadData(); // Refresh the list and stats
    } catch (error) {
      messageApi.error({ content: 'Failed to run deduplication check.', key: 'dedupCheck', duration: 3 });
      console.error(error);
    } finally {
      setRunningCheck(false);
    }
  };

  // Updated handler for Checkbox
  const handleDecisionChange = (e: CheckboxChangeEvent, record: DeduplicationTableRow) => {
    const isChecked = e.target.checked;
    const newStatus = isChecked ? 'included' : 'excluded';

    setDecisions(prev => {
      const newDecisions = { ...prev };
      // Ensure decision object exists before modifying
      if (!newDecisions[record.ID]) newDecisions[record.ID] = { status: 'pending' };
      newDecisions[record.ID].status = newStatus;
      return newDecisions;
    });
  };

  const handleSaveChanges = async () => {
    setSaving(true);
    messageApi.loading({ content: 'Saving decisions...', key: 'saveDecisions' });

    // Validation removed - allow any number of 'Keep' selections

    const updatesToSave = Object.entries(decisions)
       // Only include decisions for entries currently displayed
      .filter(([id]) => tableData.some(row => row.ID === id))
      .map(([id, decision]) => ({
        id,
        status: decision.status,
        // Corrected logic: is_duplicate is 1 if status is 'excluded', 0 if 'included'
        is_duplicate: decision.status === 'included' ? 0 : 1,
        // is_primary is no longer relevant here, set to 0 or remove from DB update if possible
        is_primary: 0,
      }));

    if (updatesToSave.length === 0) {
       messageApi.info({ content: 'No changes to save.', key: 'saveDecisions', duration: 2 });
       setSaving(false);
       return;
    }

    try {
      await updateDeduplicationStatus(updatesToSave);
      messageApi.success({ content: 'Decisions saved successfully!', key: 'saveDecisions', duration: 3 });
      loadData(); // Refresh data and stats
    } catch (error) {
      messageApi.error({ content: 'Failed to save decisions.', key: 'saveDecisions', duration: 3 });
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  // Updated columns definition
  const columns: TableProps<DeduplicationTableRow>['columns'] = [
    {
      title: 'Group',
      dataIndex: 'groupId',
      key: 'groupId',
      width: 100,
      render: (value, record) => {
        const obj = {
          children: <Tooltip title={value}><Text copyable={{ text: value }}>{value.substring(0, 8)}...</Text></Tooltip>,
          props: { rowSpan: 0 },
        };
        if (record.isFirstInGroup) {
          obj.props.rowSpan = record.groupSize;
        }
        return obj;
      },
    },
    // Expand icon will be placed here by setting expandIconColumnIndex: 1
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true
    },
    {
      title: 'Authors',
      dataIndex: 'author',
      key: 'author',
      ellipsis: true,
      width: 200
    },
    {
      title: 'Year',
      dataIndex: 'year',
      key: 'year',
      width: 80
    },
    {
      title: 'Decision',
      key: 'decision',
      width: 100, // Adjusted width
      align: 'center',
      render: (_, record) => (
        <Checkbox
          onChange={(e) => handleDecisionChange(e, record)}
          checked={decisions[record.ID]?.status === 'included'}
          disabled={saving}
        >
          Keep
        </Checkbox>
      ),
    },
  ];

  // Define content for expandable rows (remains the same)
  const expandedRowRender = (record: DeduplicationTableRow) => {
    return (
      <div style={{ padding: '8px 16px', backgroundColor: '#f8f8f8' }}>
        <Row gutter={[16, 8]}>
          <Col span={24}>
            <Text strong>Abstract:</Text>
            <Text style={{ display: 'block', marginLeft: '8px' }}>{record.abstract || 'N/A'}</Text>
          </Col>
          <Col span={8}>
            <Text strong>DOI:</Text> <Text copyable={{ text: record.doi }}>{record.doi || 'N/A'}</Text>
          </Col>
          <Col span={8}>
            <Text strong>Source:</Text> {record.source || 'N/A'}
          </Col>
           <Col span={8}>
            <Text strong>Abstract Length:</Text> {record.abstract?.length || 0}
          </Col>
           <Col span={8}>
            <Text strong>Authors:</Text> {record.author || 'N/A'}
          </Col>
           <Col span={8}>
            <Text strong>Year:</Text> {record.year || 'N/A'}
          </Col>
           <Col span={8}>
            <Text strong>Journal/Booktitle:</Text> {record.journal || record.booktitle || 'N/A'}
          </Col>
          {/* Add other fields if needed */}
        </Row>
      </div>
    );
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {contextHolder} {/* Add contextHolder for messageApi */}
      {/* Header similar to Title Screening */}
      <Header style={{ padding: '0 20px', background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
         <Space>
           <Link href="/">
             <Button type="text" icon={<ArrowLeftOutlined />} size="large" style={{ marginRight: 8 }}>
               Back
             </Button>
           </Link>
           <Title level={3} style={{ margin: 0 }}>
             Deduplication Review
           </Title>
         </Space>
         <Button
           icon={<ReloadOutlined />}
           onClick={loadData} // Use loadData
           loading={loading && !runningCheck && !saving}
         >
           Refresh Data
         </Button>
      </Header>

      <Content style={{ padding: '20px' }}>
         {/* Statistics Row */}
         <Row gutter={16} style={{ marginBottom: 20 }}>
           <Col span={6}>
             <Card bordered={false} size="small">
               <Statistic title="Total Entries (Post-Dedup)" value={stats.total} loading={loading} />
             </Card>
           </Col>
           <Col span={6}>
             <Card bordered={false} size="small">
               <Statistic title="Groups Pending Review" value={stats.deduplication.groupsPending} loading={loading} />
             </Card>
           </Col>
           <Col span={6}>
             <Card bordered={false} size="small">
               <Statistic title="Entries Pending Review" value={stats.deduplication.entriesPending} loading={loading} />
             </Card>
           </Col>
           <Col span={6}>
             <Card bordered={false} size="small">
               <Statistic title="Excluded (Dedup)" value={stats.deduplication.excluded} loading={loading} valueStyle={{ color: '#ff4d4f' }} />
             </Card>
           </Col>
        </Row>

        {/* Main Content Card */}
        <Card bordered={false}>
          {/* Updated instruction text */}
          <Text style={{ display: 'block', marginBottom: 16 }}>
            Review potential duplicate entries below, grouped by similarity (DOI or Title). Use the checkbox in the 'Decision' column to mark entries you wish to 'Keep'. You can keep multiple entries per group. Entries left unchecked will be marked as duplicates. Click 'Save Decisions' to finalize.
          </Text>
          <Space style={{ marginBottom: 16 }}>
            <Button
             type="primary"
             onClick={handleRunDeduplication}
             loading={runningCheck}
           >
             Run Deduplication Check
           </Button>
           <Button
             onClick={handleSaveChanges}
             loading={saving}
             disabled={tableData.length === 0 || loading || runningCheck}
             danger
           >
             Save Decisions & Finalize Duplicates
           </Button>
          </Space>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '50px 0' }}>
              <Spin size="large" tip="Loading entries..." />
            </div>
          ) : tableData.length === 0 ? (
             <Alert message="No potential duplicates found requiring review. Run the 'Deduplication Check' if you have imported entries." type="info" showIcon />
          ) : (
            <Table
              columns={columns}
              dataSource={tableData}
              bordered
              size="small"
              pagination={false} // Show all groups at once
              expandable={{
                expandedRowRender,
                expandIconColumnIndex: 1 // Place expand icon after the first column ('Group')
              }}
              rowClassName={(record) => {
                // Simplified row class logic without 'suggested-primary'
                let className = '';
                const groupIds = Object.keys(groupedEntries);
                const groupIndex = groupIds.indexOf(record.groupId);
                if (groupIndex % 2 !== 0) {
                  className += ' alternate-group-color';
                }
                return className.trim();
              }}
            />
          )}
          {/* Simplified global styles */}
          <style jsx global>{`
            .alternate-group-color td {
              background-color:rgb(232, 244, 253) !important;
            }
            tr:hover td {
               background-color:rgb(244, 218, 218) !important;
            }
             tr.alternate-group-color:hover td {
               background-color:rgb(242, 228, 228) !important;
            }
          `}</style>
        </Card>
      </Content>
      {/* Footer similar to Title Screening */}
      <Footer style={{ textAlign: 'center', background: '#e6f7ff' }}>
        Literature Review Tool ©{new Date().getFullYear()}
      </Footer>
    </Layout>
  );
};

export default DeduplicationReviewPage;
