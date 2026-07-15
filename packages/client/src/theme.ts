import { theme } from 'antd';

const { defaultAlgorithm } = theme;

export const appTheme = {
  algorithm: defaultAlgorithm,
  token: {
    colorPrimary: '#0050cb',
    colorBgLayout: '#faf8ff',
    colorBgContainer: '#ecedfa',
    colorBorder: '#c2c6d8',
    colorBorderSecondary: '#e1e2ee',
    colorText: '#191b24',
    colorTextSecondary: '#424656',
    colorSuccess: '#006c49',
    colorError: '#ba1a1a',
    colorWarning: '#a33200',
    borderRadius: 4,
    fontFamily: 'Inter, sans-serif',
  },
  components: {
    Layout: {
      headerBg: '#ecedfa',
      siderBg: '#f2f3ff',
      bodyBg: '#faf8ff',
    },
    Select: {
      colorBgContainer: '#ffffff',
      colorBorder: '#c2c6d8',
    },
    Input: {
      colorBgContainer: '#ffffff',
      colorBorder: '#c2c6d8',
    },
    Modal: {
      colorBgContainer: '#ecedfa',
    },
  },
};

export const SIDEBAR_WIDTH = 240;
export const HEADER_HEIGHT = 64;
