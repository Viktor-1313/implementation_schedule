#!/usr/bin/env node

/**
 * Скрипт для поддержания активности сервиса на Render.com
 * Запускается по расписанию через Render.com Scheduled Jobs
 * 
 * Использование:
 * node keep-alive.js
 * 
 * Или через Render.com Scheduled Jobs:
 * - Command: node keep-alive.js
 * - Schedule: */10 * * * * (каждые 10 минут)
 */

const https = require('https');
const http = require('http');

// URL вашего сервиса на Render.com
const SERVICE_URL = process.env.RENDER_SERVICE_URL || 'https://icona-design.onrender.com';
const HEALTH_ENDPOINT = `${SERVICE_URL}/health`;

// Функция для отправки HTTP/HTTPS запроса
function pingService(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    const req = protocol.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data);
            resolve({
              success: true,
              status: res.statusCode,
              data: json,
              timestamp: new Date().toISOString()
            });
          } catch (e) {
            resolve({
              success: true,
              status: res.statusCode,
              data: data,
              timestamp: new Date().toISOString()
            });
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

// Основная функция
async function main() {
  console.log(`[${new Date().toISOString()}] Запуск keep-alive скрипта...`);
  console.log(`[${new Date().toISOString()}] Отправка запроса к: ${HEALTH_ENDPOINT}`);
  
  try {
    const result = await pingService(HEALTH_ENDPOINT);
    console.log(`[${new Date().toISOString()}] ✅ Успешно! Сервис активен`);
    console.log(`[${new Date().toISOString()}] Ответ:`, JSON.stringify(result.data, null, 2));
    process.exit(0);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Ошибка:`, error.message);
    // Не завершаем с ошибкой, так как сервис может быть в процессе пробуждения
    console.log(`[${new Date().toISOString()}] ⚠️  Сервис может быть в процессе пробуждения, это нормально`);
    process.exit(0);
  }
}

// Запуск
main();







