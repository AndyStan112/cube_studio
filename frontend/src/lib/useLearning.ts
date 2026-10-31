import { useCallback, useEffect, useState } from 'react';
import { earnLearning, readLearning, storeLearning, type LearningAction } from './learning';
export function useLearning(userId?: string) {
  const [progress, setProgress] = useState(() => readLearning(userId));
  useEffect(() => { setProgress(readLearning(userId)); }, [userId]);
  const award = useCallback((action: LearningAction) => {
    // Read the current profile at the action boundary; StrictMode does not replay awards.
    const result = earnLearning(readLearning(userId), action);
    if (result.earned) { storeLearning(result.progress, userId); setProgress(result.progress); }
    return result.earned;
  }, [userId]);
  return { progress, award };
}
