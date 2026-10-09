import 'dotenv/config';
import { createApp } from './app.js';
import { startZohoSentSync } from './lib/zohoSync.js';

const port = process.env.PORT || 3000;
const app = createApp();

app.listen(port, () => {
  console.log(`Hamper Helper server listening on port ${port}`);
  startZohoSentSync();
});
