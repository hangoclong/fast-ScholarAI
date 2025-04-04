'use client';

import React, { useState, useEffect } from 'react';
import { Typography, Space, Button, Divider, Row, Col, Tag, message, Tooltip, Input } from 'antd';
import { CopyOutlined, LinkOutlined, FileTextOutlined, BookOutlined, EditOutlined, SaveOutlined } from '@ant-design/icons';
import { BibEntry } from '../types';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

interface ExpandableRowProps {
  record: BibEntry;
  screeningType?: 'title' | 'abstract'; // Add screeningType prop
  onUpdateAbstract?: (id: string, abstract: string) => void;
}

const ExpandableRow: React.FC<ExpandableRowProps> = ({ record, screeningType, onUpdateAbstract }) => {
  const [messageApi, contextHolder] = message.useMessage();

  // Copy citation to clipboard
  const copyAsCitation = () => {
    try {
      // Format as APA citation
      let citation = '';
      
      if (record.author) {
        // Format authors
        const authors = record.author.split(' and ');
        if (authors.length === 1) {
          citation += `${record.author}. `;
        } else if (authors.length === 2) {
          citation += `${authors[0]} & ${authors[1]}. `;
        } else {
          citation += `${authors[0]} et al. `;
        }
      }
      
      // Add year
      if (record.year) {
        citation += `(${record.year}). `;
      }
      
      // Add title
      if (record.title) {
        citation += `${record.title}. `;
      }
      
      // Add journal/conference/book
      if (record.journal) {
        citation += `${record.journal}`;
        if (record.volume) {
          citation += `, ${record.volume}`;
          if (record.number) {
            citation += `(${record.number})`;
          }
        }
        if (record.pages) {
          citation += `, ${record.pages}`;
        }
        citation += '. ';
      } else if (record.booktitle) {
        citation += `In ${record.booktitle}. `;
        if (record.publisher) {
          citation += `${record.publisher}. `;
        }
      } else if (record.publisher) {
        citation += `${record.publisher}. `;
      }
      
      // Add DOI
      if (record.doi) {
        citation += `DOI: ${record.doi}`;
      }
      
      navigator.clipboard.writeText(citation);
      messageApi.success('Citation copied to clipboard');
    } catch (error) {
      console.error('Error copying citation:', error);
      messageApi.error('Failed to copy citation');
    }
  };

  // Copy BibTeX to clipboard
  const copyAsBibTeX = () => {
    try {
      let bibtex = `@${record.ENTRYTYPE}{${record.ID},\n`;
      
      // Add fields
      if (record.title) bibtex += `  title = {${record.title}},\n`;
      if (record.author) bibtex += `  author = {${record.author}},\n`;
      if (record.year) bibtex += `  year = {${record.year}},\n`;
      if (record.journal) bibtex += `  journal = {${record.journal}},\n`;
      if (record.booktitle) bibtex += `  booktitle = {${record.booktitle}},\n`;
      if (record.publisher) bibtex += `  publisher = {${record.publisher}},\n`;
      if (record.abstract) bibtex += `  abstract = {${record.abstract}},\n`;
      if (record.doi) bibtex += `  doi = {${record.doi}},\n`;
      if (record.url) bibtex += `  url = {${record.url}},\n`;
      if (record.keywords) bibtex += `  keywords = {${record.keywords}},\n`;
      if (record.pages) bibtex += `  pages = {${record.pages}},\n`;
      if (record.volume) bibtex += `  volume = {${record.volume}},\n`;
      if (record.number) bibtex += `  number = {${record.number}},\n`;
      
      bibtex += `}`;
      
      navigator.clipboard.writeText(bibtex);
      messageApi.success('BibTeX copied to clipboard');
    } catch (error) {
      console.error('Error copying BibTeX:', error);
      messageApi.error('Failed to copy BibTeX');
    }
  };

  // Open URL if available
  const openURL = () => {
    if (record.url) {
      window.open(record.url, '_blank');
    } else if (record.doi) {
      window.open(`https://doi.org/${record.doi}`, '_blank');
    } else {
      messageApi.warning('No URL or DOI available');
    }
  };

  // Abstract editing state
  const [isEditingAbstract, setIsEditingAbstract] = useState<boolean>(false);
  const [abstractValue, setAbstractValue] = useState<string>(record.abstract || '');
  const [isSavingAbstract, setIsSavingAbstract] = useState<boolean>(false);
  
  // Update abstract value when record changes
  useEffect(() => {
    setAbstractValue(record.abstract || '');
  }, [record.abstract]);
  
  // Save abstract changes
  const saveAbstractChanges = async () => {
    if (!onUpdateAbstract) {
      messageApi.error('Cannot save abstract: Update function not provided');
      return;
    }
    
    try {
      setIsSavingAbstract(true);
      await onUpdateAbstract(record.ID, abstractValue);
      setIsEditingAbstract(false);
      
      // Force update the record's abstract value directly
      // This ensures the UI shows the updated value immediately
      if (record) {
        record.abstract = abstractValue;
      }
    } catch (error) {
      console.error('Error saving abstract:', error);
      messageApi.error('Failed to save abstract');
    } finally {
      setIsSavingAbstract(false);
    }
  };

  return (
    <div className="p-4 bg-gray-50">
      {contextHolder}
      
      {/* Actions */}
      <div className="mb-4 flex justify-end">
        <Space>
          <Button icon={<CopyOutlined />} onClick={copyAsCitation}>Copy Citation</Button>
          <Button icon={<CopyOutlined />} onClick={copyAsBibTeX}>Copy BibTeX</Button>
          <Button 
            icon={<LinkOutlined />} 
            onClick={openURL} 
            disabled={!record.url && !record.doi}
          >
            Open URL
          </Button>
        </Space>
      </div>
      
      {/* Abstract */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <Title level={5}>Abstract</Title>
          {!isEditingAbstract && (
            <Button 
              type="text" 
              icon={<EditOutlined />} 
              onClick={() => setIsEditingAbstract(true)}
            >
              Edit
            </Button>
          )}
        </div>
        
        {isEditingAbstract ? (
          <div>
            <TextArea 
              value={abstractValue} 
              onChange={(e) => setAbstractValue(e.target.value)} 
              rows={6} 
              className="w-full"
              placeholder="Enter abstract here..."
            />
            <div className="mt-2 flex justify-end space-x-2">
              <Button onClick={() => setIsEditingAbstract(false)}>Cancel</Button>
              <Button 
                type="primary" 
                icon={<SaveOutlined />} 
                onClick={saveAbstractChanges}
                loading={isSavingAbstract}
              >
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div className="bg-white p-3 border border-gray-200 rounded">
            {record.abstract ? (
              <Paragraph>{record.abstract}</Paragraph>
            ) : (
              <Paragraph type="secondary" italic>No abstract available. Click Edit to add one.</Paragraph>
            )}
          </div>
        )}
      </div>
      
      <Divider orientation="left">Bibliographic Details</Divider>
      
      <Row gutter={[16, 16]}>
        {/* Left column */}
        <Col xs={24} md={12}>
          {/* Publication Details */}
          <div className="mb-4">
            <Title level={5}>
              <BookOutlined /> Publication Details
            </Title>
            <div className="ml-4">
              {record.ENTRYTYPE && (
                <div className="mb-2">
                  <Text strong>Type: </Text>
                  <Tag color="blue">{record.ENTRYTYPE}</Tag>
                </div>
              )}
              {record.journal && (
                <div className="mb-2">
                  <Text strong>Journal: </Text>
                  <Text>{record.journal}</Text>
                </div>
              )}
              {record.booktitle && (
                <div className="mb-2">
                  <Text strong>Book/Conference: </Text>
                  <Text>{record.booktitle}</Text>
                </div>
              )}
              {record.publisher && (
                <div className="mb-2">
                  <Text strong>Publisher: </Text>
                  <Text>{record.publisher}</Text>
                </div>
              )}
              {record.source_database && (
                <div className="mb-2">
                  <Text strong>Source Database: </Text>
                  <Text>{record.source_database}</Text>
                </div>
              )}
              {(record.volume || record.number) && (
                <div className="mb-2">
                  <Text strong>Volume/Issue: </Text>
                  <Text>
                    {record.volume ? `Volume ${record.volume}` : ''}
                    {record.volume && record.number ? ', ' : ''}
                    {record.number ? `Issue ${record.number}` : ''}
                  </Text>
                </div>
              )}
              {record.pages && (
                <div className="mb-2">
                  <Text strong>Pages: </Text>
                  <Text>{record.pages}</Text>
                </div>
              )}
              {record.year && (
                <div className="mb-2">
                  <Text strong>Year: </Text>
                  <Text>{record.year}</Text>
                </div>
              )}
            </div>
          </div>
        </Col>
        
        {/* Right column */}
        <Col xs={24} md={12}>
          {/* Identifiers */}
          <div className="mb-4">
            <Title level={5}>
              <FileTextOutlined /> Identifiers & Links
            </Title>
            <div className="ml-4">
              {record.doi && (
                <div className="mb-2">
                  <Text strong>DOI: </Text>
                  <a href={`https://doi.org/${record.doi}`} target="_blank" rel="noopener noreferrer">
                    {record.doi}
                  </a>
                </div>
              )}
              {record.url && (
                <div className="mb-2">
                  <Text strong>URL: </Text>
                  <a href={record.url} target="_blank" rel="noopener noreferrer">
                    {record.url}
                  </a>
                </div>
              )}
              <div className="mb-2">
                <Text strong>Entry Type: </Text>
                <Tag color="blue">{record.ENTRYTYPE}</Tag>
              </div>
              <div className="mb-2">
                <Text strong>ID: </Text>
                <Text code>{record.ID}</Text>
              </div>
            </div>
          </div>
          
          {/* Keywords */}
          {record.keywords && (
            <div className="mb-4">
              <Title level={5}>Keywords</Title>
              <div>
                {record.keywords.split(',').map((keyword, index) => (
                  <Tag key={index} className="mb-1 mr-1">
                    {keyword.trim()}
                  </Tag>
                ))}
              </div>
            </div>
          )}
        </Col>
      </Row>
      
      {/* Screening Notes - Conditionally display based on screeningType */}
      {screeningType && (record.title_screening_notes || record.abstract_screening_notes) && (
        <>
          <Divider orientation="left">Screening Notes</Divider>
          {screeningType === 'title' && record.title_screening_notes && (
            <div className="mb-2">
              <Text strong>Title Screening: </Text>
              <Text>{record.title_screening_notes}</Text>
            </div>
          )}
          {screeningType === 'abstract' && record.abstract_screening_notes && (
            <div className="mb-2">
              <Text strong>Abstract Screening: </Text>
              <Text>{record.abstract_screening_notes}</Text>
            </div>
          )}
          {/* Fallback if screeningType is not provided but notes exist (shouldn't happen in screening pages) */}
          {!screeningType && record.title_screening_notes && (
             <div className="mb-2">
               <Text strong>Title Screening: </Text>
               <Text>{record.title_screening_notes}</Text>
             </div>
           )}
           {!screeningType && record.abstract_screening_notes && (
             <div className="mb-2">
               <Text strong>Abstract Screening: </Text>
               <Text>{record.abstract_screening_notes}</Text>
             </div>
           )}
        </>
      )}
    </div>
  );
};

export default ExpandableRow;
