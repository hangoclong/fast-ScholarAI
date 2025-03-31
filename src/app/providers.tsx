'use client';

import React from 'react';
import { ConfigProvider } from 'antd';
import ReactDOM from './utils/antd-compat';

// Configure Ant Design to use our compatibility layer for React 19
if (typeof window !== 'undefined') {
  // @ts-ignore
  window.ReactDOM = ReactDOM;
}

export function AntdProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider>
      {children}
    </ConfigProvider>
  );
}
