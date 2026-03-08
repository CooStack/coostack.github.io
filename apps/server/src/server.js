import { createApp } from './app.js';
import { API_PORT } from './config/paths.js';

const app = createApp();

app.listen(API_PORT, () => {
  console.log(`blogs server listening on http://localhost:${API_PORT}`);
});
