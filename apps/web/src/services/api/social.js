import { http } from './http.js';

export function fetchBilibiliStat() {
  return http('/social/bilibili/stat');
}
