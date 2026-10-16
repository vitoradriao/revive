/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { getOfflineClient } from '../offline/client';
const OfflineContext = createContext(null);
export function OfflineProvider({ children }) {
  const client = getOfflineClient();
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  useEffect(() => client.start(), [client]);
  return <OfflineContext.Provider value={{ ...state, client }}>{children}</OfflineContext.Provider>;
}
export function useOffline() {
  const context = useContext(OfflineContext);
  if (!context) throw new Error('OfflineProvider ausente');
  return context;
}
