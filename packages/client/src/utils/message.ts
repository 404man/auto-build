import { App } from 'antd';
import { useEffect } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';

let globalMessage: MessageInstance | null = null;

export function setGlobalMessage(msg: MessageInstance) {
  globalMessage = msg;
}

export function getGlobalMessage() {
  return globalMessage;
}

/** 放在 AntdApp 内部的初始化组件，将 context-aware message 存入全局变量 */
export function MessageInit() {
  const { message } = App.useApp();
  useEffect(() => {
    setGlobalMessage(message);
  }, [message]);
  return null;
}
