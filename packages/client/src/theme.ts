import { theme } from 'antd';

const { darkAlgorithm } = theme;

export const appTheme = {
  algorithm: darkAlgorithm,
  token: {
    colorPrimary: '#0066ff',
    colorBgLayout: '#10131c',
    colorBgContainer: '#1d1f28',
    colorBorder: '#424656',
    colorText: '#e1e2ee',
    colorTextSecondary: '#c2c6d8',
    borderRadius: 4,
    fontFamily: 'Inter, sans-serif',
  },
  components: {
    Layout: {
      headerBg: '#1d1f28',
      siderBg: '#191b24',
      bodyBg: '#10131c',
    },
    Select: {
      colorBgContainer: '#0b0e16',
      colorBorder: '#424656',
    },
    Input: {
      colorBgContainer: '#0b0e16',
      colorBorder: '#424656',
    },
    Modal: {
      colorBgContainer: '#1d1f28',
    },
  },
};

export const SIDEBAR_WIDTH = 240;
export const HEADER_HEIGHT = 64;
