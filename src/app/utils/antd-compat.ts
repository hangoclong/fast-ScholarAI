// This file provides React 19 compatibility for Ant Design v5

import React from 'react';
import ReactDOM from 'react-dom';
import { createRoot } from 'react-dom/client';

// Create a compatibility layer for Ant Design to work with React 19
type ReactDOMWithLegacyMethods = typeof ReactDOM & {
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: any;
  createPortal: any;
  render: (node: React.ReactElement, container: Element) => any;
  unmountComponentAtNode: (container: Element) => boolean;
};

const fullClone = {
  ...ReactDOM,
} as ReactDOMWithLegacyMethods;

// Add the render method that Ant Design expects
fullClone.render = (node: React.ReactElement, container: Element) => {
  const root = createRoot(container);
  root.render(node);
  return null; // Return null as it's not used
};

// Add the unmountComponentAtNode method that Ant Design expects
fullClone.unmountComponentAtNode = (container: Element) => {
  const root = createRoot(container);
  root.unmount();
  return true; // Return true to indicate success
};

// Export the compatibility layer
export default fullClone;
