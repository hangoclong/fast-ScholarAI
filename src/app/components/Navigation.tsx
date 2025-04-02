'use client';

import React from 'react';
import { Menu } from 'antd';
import { 
  SearchOutlined, 
  FilterOutlined, 
  FileTextOutlined, 
  DatabaseOutlined,
  CopyOutlined // Added icon for deduplication
} from '@ant-design/icons';
import { usePathname, useRouter } from 'next/navigation';

const Navigation: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();

  const menuItems = [
    {
      key: '/',
      icon: <DatabaseOutlined />,
      label: 'Dashboard',
    },
    {
      key: '/search',
      icon: <SearchOutlined />,
      label: 'Search',
    },
    { // Moved Deduplication Review link
      key: '/deduplication-review',
      icon: <CopyOutlined />,
      label: 'Deduplication Review',
    },
    {
      key: '/title-screening',
      icon: <FilterOutlined />,
      label: 'Title Screening',
    },
    {
      key: '/abstract-screening',
      icon: <FileTextOutlined />,
      label: 'Abstract Screening',
    },
  ];

  const handleMenuClick = (e: { key: string }) => {
    router.push(e.key);
  };

  return (
    <Menu
      mode="horizontal"
      selectedKeys={[pathname]}
      onClick={handleMenuClick}
      items={menuItems}
      className="w-full"
    />
  );
};

export default Navigation;
