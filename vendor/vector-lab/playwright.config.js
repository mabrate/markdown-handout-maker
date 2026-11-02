import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests',use:{baseURL:'http://127.0.0.1:5187',viewport:{width:1024,height:768}},webServer:{command:'npm run dev -- --port 5187',url:'http://127.0.0.1:5187',reuseExistingServer:false}});
