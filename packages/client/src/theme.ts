import type { ThemeConfig } from 'antd';

export const SIDEBAR_WIDTH = 320;
export const BREAKPOINT_STACK = 1100;

export const appTheme: ThemeConfig = {
  token: {
    colorPrimary: '#1677ff',
    borderRadius: 8,
    colorBgLayout: '#f7f8fa',
    colorBorder: '#e8e8e8',
    fontSize: 14,
    controlHeight: 36,
  },
  components: {
    Card: {
      boxShadow: 'none',
      boxShadowTertiary: 'none',
    },
    Layout: {
      headerBg: '#ffffff',
      bodyBg: '#f7f8fa',
      siderBg: '#ffffff',
    },
  },
};
