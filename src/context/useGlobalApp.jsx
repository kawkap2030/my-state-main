import { useContext } from 'react';
import { GlobalAppContext } from './AppContext';

export const useGlobalApp = () => {
  const context = useContext(GlobalAppContext);
  if (!context) throw new Error('useGlobalApp must be used within GlobalAppProvider');
  return context;
};
