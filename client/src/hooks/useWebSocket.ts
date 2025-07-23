/**
 * WebSocket Hook - 前端WebSocket连接管理
 * 支持实时通知、多用户同步、AI设置更新等
 */

import { useEffect, useRef, useState, useCallback } from 'react';

interface WebSocketMessage {
  type: string;
  data: any;
}

interface UseWebSocketOptions {
  url?: string;
  token?: string;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onMessage?: (message: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

interface WebSocketState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  reconnectAttempts: number;
}

export const useWebSocket = (options: UseWebSocketOptions = {}) => {
  const {
    url = `ws://localhost:3000/ws`,
    token,
    reconnect = true,
    reconnectInterval = 3000,
    maxReconnectAttempts = 5,
    onMessage,
    onConnect,
    onDisconnect,
    onError
  } = options;

  const [state, setState] = useState<WebSocketState>({
    connected: false,
    connecting: false,
    error: null,
    reconnectAttempts: 0
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  // 使用ref来存储回调函数，避免依赖变化导致的重新连接
  const callbacksRef = useRef({ onMessage, onConnect, onDisconnect, onError });
  
  // 更新回调函数引用
  useEffect(() => {
    callbacksRef.current = { onMessage, onConnect, onDisconnect, onError };
  }, [onMessage, onConnect, onDisconnect, onError]);

  const connect = useCallback(() => {
    if (state.connecting || state.connected) {
      return;
    }

    if (!token) {
      console.warn('WebSocket: 缺少认证token');
      setState(prev => ({ ...prev, error: '缺少认证token' }));
      return;
    }

    // 初始连接延迟，给服务器时间启动
    const connectDelay = reconnectAttemptsRef.current === 0 ? 100 : 0;
    
    const doConnect = () => {
      setState(prev => ({ ...prev, connecting: true, error: null }));

      try {
        const wsUrl = `${url}?token=${encodeURIComponent(token)}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('WebSocket连接已建立');
          setState(prev => ({
            ...prev,
            connected: true,
            connecting: false,
            error: null,
            reconnectAttempts: 0
          }));
          reconnectAttemptsRef.current = 0;
          callbacksRef.current.onConnect?.();
        };

        ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            console.log('WebSocket消息:', message);
            callbacksRef.current.onMessage?.(message);
          } catch (error) {
            console.error('WebSocket消息解析失败:', error);
          }
        };

        ws.onclose = (event) => {
          console.log('WebSocket连接已关闭', event.code, event.reason);
          setState(prev => ({
            ...prev,
            connected: false,
            connecting: false
          }));
          
          wsRef.current = null;
          callbacksRef.current.onDisconnect?.();

          // 自动重连
          if (reconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
            const delay = reconnectInterval * Math.pow(1.5, reconnectAttemptsRef.current);
            console.log(`WebSocket将在${delay}ms后尝试重连 (第${reconnectAttemptsRef.current + 1}次)`);
            
            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectAttemptsRef.current++;
              setState(prev => ({ ...prev, reconnectAttempts: reconnectAttemptsRef.current }));
              connect();
            }, delay);
          } else if (reconnect) {
            setState(prev => ({ ...prev, error: '重连次数已达上限' }));
          }
        };

        ws.onerror = (error) => {
          // 区分初始连接错误和重连错误
          const isInitialConnection = reconnectAttemptsRef.current === 0;
          const errorMessage = isInitialConnection 
            ? '正在建立连接...' 
            : 'WebSocket连接错误';
          
          console.error('WebSocket错误:', error);
          setState(prev => ({
            ...prev,
            error: errorMessage,
            connecting: false
          }));
          callbacksRef.current.onError?.(error);
        };

      } catch (error) {
        console.error('WebSocket连接失败:', error);
        setState(prev => ({
          ...prev,
          connecting: false,
          error: 'WebSocket连接失败'
        }));
      }
    };

    // 如果是初始连接，添加延迟
    if (connectDelay > 0) {
      setTimeout(doConnect, connectDelay);
    } else {
      doConnect();
    }
  }, [url, token, reconnect, reconnectInterval, maxReconnectAttempts, state]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setState(prev => ({
      ...prev,
      connected: false,
      connecting: false,
      error: null
    }));
  }, []);
  const sendMessage = useCallback((message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error('WebSocket发送消息失败:', error);
        return false;
      }
    }
    console.warn('WebSocket未连接，无法发送消息');
    return false;
  }, []);

  const joinRoom = useCallback((roomId: string) => {
    return sendMessage({
      type: 'join_room',
      roomId
    });
  }, [sendMessage]);

  const leaveRoom = useCallback((roomId: string) => {
    return sendMessage({
      type: 'leave_room',
      roomId
    });
  }, [sendMessage]);

  const ping = useCallback(() => {
    return sendMessage({
      type: 'ping',
      timestamp: new Date().toISOString()
    });
  }, [sendMessage]);
  // 自动连接 - 只在token变化时重新连接
  useEffect(() => {
    if (token) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [token]); // 移除connect和disconnect依赖，避免循环

  // 定期心跳检测
  useEffect(() => {
    if (state.connected) {
      const interval = setInterval(() => {
        ping();
      }, 30000); // 每30秒发送一次心跳

      return () => clearInterval(interval);
    }
  }, [state.connected, ping]);

  return {
    ...state,
    connect,
    disconnect,
    sendMessage,
    joinRoom,
    leaveRoom,
    ping,
    isConnected: state.connected,
    isConnecting: state.connecting,
    hasError: !!state.error
  };
};

// 导出类型定义
export type { WebSocketMessage, UseWebSocketOptions, WebSocketState };
