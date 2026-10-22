import { useData } from './DataContext';
import { buildProgressView } from '../utils/progressMetrics';

export function useProgress() {
    const { progressSource } = useData();
    return buildProgressView(progressSource);
}
