const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

// Rate limiting (простая реализация без внешних зависимостей)
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 минут
const RATE_LIMIT_MAX_REQUESTS = 100; // максимум 100 запросов
const RATE_LIMIT_AUTH_MAX = 5; // максимум 5 попыток входа

// Функция для очистки старых записей
function cleanRateLimitStore() {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (now > value.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

// Очищаем старые записи каждые 5 минут
setInterval(cleanRateLimitStore, 5 * 60 * 1000);

// Middleware для rate limiting
function rateLimit(maxRequests, windowMs = RATE_LIMIT_WINDOW) {
  return (req, res, next) => {
    // Получаем IP адрес (учитываем прокси)
    const ip = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
    const key = `rate_limit_${ip}`;
    
    cleanRateLimitStore();
    
    const now = Date.now();
    const record = rateLimitStore.get(key);
    
    if (!record || now > record.resetTime) {
      // Создаем новую запись
      rateLimitStore.set(key, {
        count: 1,
        resetTime: now + windowMs
      });
      return next();
    }
    
    if (record.count >= maxRequests) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({ 
        ok: false, 
        error: 'Слишком много запросов. Попробуйте позже.',
        retryAfter: retryAfter
      });
    }
    
    record.count++;
    next();
  };
}

const app = express();
const PORT = process.env.PORT || 3001; // порт для внутреннего сервера компании
const USERS_FILE = path.join(__dirname, 'users.json');
const COMPANIES_FILE = path.join(__dirname, 'companies.json');
const CHART_TYPES_FILE = path.join(__dirname, 'chart-types.json');
const LOGS_FILE = path.join(__dirname, 'activity-logs.json');

// Вспомогательные функции для работы с файлами компаний
function getCompanyDataFile(companyId) {
  return path.join(__dirname, `gantt-state-${companyId}.json`);
}

function getCompanyInfoFile(companyId) {
  return path.join(__dirname, `company-info-${companyId}.json`);
}

// Функция для получения пути к папке версий компании
function getVersionsDir(companyId) {
  const versionsDir = path.join(__dirname, 'versions', companyId);
  if (!fs.existsSync(versionsDir)) {
    fs.mkdirSync(versionsDir, { recursive: true });
  }
  return versionsDir;
}

// Функция для получения пути к файлу версии
function getVersionFile(companyId, versionId) {
  return path.join(getVersionsDir(companyId), `version-${versionId}.json`);
}

// Функция для получения метаданных версий компании
function getVersionsMetadataFile(companyId) {
  return path.join(getVersionsDir(companyId), 'metadata.json');
}

// Сохранение версии графика
function saveVersion(companyId, ganttState, companyInfo = null) {
  try {
    const versionId = Date.now().toString();
    const versionFile = getVersionFile(companyId, versionId);
    const metadataFile = getVersionsMetadataFile(companyId);
    
    // Сохраняем версию графика
    const versionData = {
      versionId,
      companyId,
      timestamp: new Date().toISOString(),
      dateTime: new Date().toLocaleString('ru-RU', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }),
      ganttState,
      companyInfo
    };
    
    fs.writeFileSync(versionFile, JSON.stringify(versionData, null, 2), 'utf8');
    
    // Обновляем метаданные версий
    let metadata = [];
    if (fs.existsSync(metadataFile)) {
      const raw = fs.readFileSync(metadataFile, 'utf8');
      metadata = safeJsonParse(raw) || [];
    }
    
    // Добавляем новую версию в начало списка
    metadata.unshift({
      versionId,
      timestamp: versionData.timestamp,
      dateTime: versionData.dateTime,
      size: JSON.stringify(versionData).length
    });
    
    // Ограничиваем количество версий (храним последние 365 версий - год)
    const maxVersions = 365;
    if (metadata.length > maxVersions) {
      // Удаляем старые версии
      const toDelete = metadata.slice(maxVersions);
      toDelete.forEach(version => {
        const oldVersionFile = getVersionFile(companyId, version.versionId);
        if (fs.existsSync(oldVersionFile)) {
          fs.unlinkSync(oldVersionFile);
        }
      });
      metadata = metadata.slice(0, maxVersions);
    }
    
    fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2), 'utf8');
    
    console.log(`✅ Версия ${versionId} сохранена для компании ${companyId}`);
    return versionId;
  } catch (e) {
    console.error(`❌ Ошибка сохранения версии для компании ${companyId}:`, e);
    throw e;
  }
}

// Получение списка версий компании
function getVersions(companyId) {
  try {
    const metadataFile = getVersionsMetadataFile(companyId);
    if (!fs.existsSync(metadataFile)) {
      return [];
    }
    const raw = fs.readFileSync(metadataFile, 'utf8');
    return safeJsonParse(raw) || [];
  } catch (e) {
    console.error(`❌ Ошибка получения версий для компании ${companyId}:`, e);
    return [];
  }
}

// Загрузка конкретной версии
function loadVersion(companyId, versionId) {
  try {
    const versionFile = getVersionFile(companyId, versionId);
    if (!fs.existsSync(versionFile)) {
      return null;
    }
    const raw = fs.readFileSync(versionFile, 'utf8');
    return safeJsonParse(raw);
  } catch (e) {
    console.error(`❌ Ошибка загрузки версии ${versionId} для компании ${companyId}:`, e);
    return null;
  }
}

// Удаление версии
function deleteVersion(companyId, versionId) {
  try {
    const versionFile = getVersionFile(companyId, versionId);
    if (fs.existsSync(versionFile)) {
      fs.unlinkSync(versionFile);
    }
    
    // Обновляем метаданные
    const metadataFile = getVersionsMetadataFile(companyId);
    if (fs.existsSync(metadataFile)) {
      const raw = fs.readFileSync(metadataFile, 'utf8');
      let metadata = safeJsonParse(raw) || [];
      metadata = metadata.filter(v => v.versionId !== versionId);
      fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2), 'utf8');
    }
    
    console.log(`✅ Версия ${versionId} удалена для компании ${companyId}`);
    return true;
  } catch (e) {
    console.error(`❌ Ошибка удаления версии ${versionId} для компании ${companyId}:`, e);
    throw e;
  }
}

// Автоматическое сохранение всех графиков
async function autoSaveAllVersions() {
  try {
    console.log('🔄 Начало автоматического сохранения версий всех графиков...');
    
    // Получаем список всех компаний
    let companies = [];
    if (fs.existsSync(COMPANIES_FILE)) {
      const raw = fs.readFileSync(COMPANIES_FILE, 'utf8');
      companies = safeJsonParse(raw) || [];
    }
    
    if (companies.length === 0) {
      console.log('📭 Нет компаний для сохранения версий');
      return;
    }
    
    let savedCount = 0;
    let errorCount = 0;
    
    for (const company of companies) {
      try {
        const companyId = company.id;
        const dataFile = getCompanyDataFile(companyId);
        
        // Проверяем, существует ли график
        if (!fs.existsSync(dataFile)) {
          console.log(`⏭️  Пропуск компании ${companyId} - график не существует`);
          continue;
        }
        
        // Загружаем текущий график
        const raw = fs.readFileSync(dataFile, 'utf8');
        const ganttState = safeJsonParse(raw);
        
        // Загружаем информацию о компании
        let companyInfo = null;
        const infoFile = getCompanyInfoFile(companyId);
        if (fs.existsSync(infoFile)) {
          const infoRaw = fs.readFileSync(infoFile, 'utf8');
          companyInfo = safeJsonParse(infoRaw);
        }
        
        // Сохраняем версию
        saveVersion(companyId, ganttState, companyInfo);
        savedCount++;
        console.log(`✅ Версия сохранена для компании ${companyId}`);
      } catch (e) {
        console.error(`❌ Ошибка сохранения версии для компании ${company.id}:`, e);
        errorCount++;
      }
    }
    
    console.log(`✅ Автоматическое сохранение завершено: ${savedCount} успешно, ${errorCount} ошибок`);
  } catch (e) {
    console.error('❌ Критическая ошибка при автоматическом сохранении версий:', e);
  }
}

// Настройка автоматического сохранения один раз в сутки (в 3:00 ночи)
function setupAutoSaveSchedule() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(3, 0, 0, 0); // 3:00 ночи
  
  const msUntilNext = tomorrow.getTime() - now.getTime();
  
  console.log(`⏰ Автоматическое сохранение версий настроено на ${tomorrow.toLocaleString('ru-RU')}`);
  console.log(`   Следующее сохранение через ${Math.round(msUntilNext / 1000 / 60)} минут`);
  
  // Первый запуск через рассчитанное время
  setTimeout(() => {
    autoSaveAllVersions();
    
    // Затем каждые 24 часа
    setInterval(() => {
      autoSaveAllVersions();
    }, 24 * 60 * 60 * 1000);
  }, msUntilNext);
}

// Валидация ID компании (только латинские буквы, цифры, дефисы и подчеркивания)
function isValidCompanyId(companyId) {
  return /^[a-zA-Z0-9_-]+$/.test(companyId);
}

// ========== СИСТЕМА ЛОГИРОВАНИЯ ==========

// Чтение логов
function readLogs() {
  try {
    if (!fs.existsSync(LOGS_FILE)) {
      console.log('📝 Файл логов не существует, создаем пустой массив');
      return [];
    }
    const raw = fs.readFileSync(LOGS_FILE, 'utf8');
    if (!raw || raw.trim() === '') {
      console.log('📝 Файл логов пустой');
      return [];
    }
    const logs = safeJsonParse(raw);
    if (!Array.isArray(logs)) {
      console.warn('⚠️ Файл логов содержит не массив, возвращаем пустой массив');
      return [];
    }
    return logs;
  } catch (e) {
    console.error('❌ Ошибка чтения логов:', e);
    console.error('   Стек ошибки:', e.stack);
    return [];
  }
}

// Запись логов
function writeLogs(logs) {
  try {
    // Ограничиваем количество логов (храним последние 10000 записей)
    const maxLogs = 10000;
    if (logs.length > maxLogs) {
      console.log(`📝 Логи превысили лимит (${logs.length} > ${maxLogs}), обрезаем до последних ${maxLogs}`);
      logs = logs.slice(-maxLogs);
    }
    
    // Убеждаемся, что директория существует
    const dir = path.dirname(LOGS_FILE);
    if (!fs.existsSync(dir)) {
      console.log('📁 Создание директории для логов:', dir);
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const jsonData = JSON.stringify(logs, null, 2);
    fs.writeFileSync(LOGS_FILE, jsonData, 'utf8');
    console.log('✅ Логи записаны в файл:', LOGS_FILE, 'размер:', jsonData.length, 'байт');
  } catch (e) {
    console.error('❌ Ошибка записи логов:', e);
    console.error('   Путь к файлу:', LOGS_FILE);
    console.error('   Стек ошибки:', e.stack);
  }
}

// Добавление лога
function addLog(userName, action, details, companyId = null, detailedChanges = null) {
  try {
    // Более жесткая проверка: не логируем, если пользователь не определен
    const validUserName = userName && userName !== 'Неизвестный пользователь' && userName.trim() !== '';
    if (!validUserName) {
      console.warn('⚠️ addLog: пропускаем логирование - пользователь не определен', { userName, action });
      return; // Не логируем действие, если пользователь не определен
    }
    
    console.log('📝 addLog вызвана:', { userName, action, details, companyId, detailedChanges: detailedChanges ? detailedChanges.length : 0 });
    const logs = readLogs();
    console.log('   Текущее количество логов:', logs.length);
    
    const logEntry = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      userName: userName.trim(), // Используем проверенное имя пользователя
      action: action,
      details: details,
      companyId: companyId,
      detailedChanges: detailedChanges || null, // Детальные изменения для экспорта
      timestamp: new Date().toISOString(),
      dateTime: new Date().toLocaleString('ru-RU', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    };
    logs.push(logEntry);
    console.log('   Новое количество логов:', logs.length);
    
    writeLogs(logs);
    
    // Проверяем, что файл создан/обновлен
    if (fs.existsSync(LOGS_FILE)) {
      const stats = fs.statSync(LOGS_FILE);
      console.log('✅ Файл логов существует, размер:', stats.size, 'байт');
    } else {
      console.error('❌ Файл логов не создан!');
    }
    
    return logEntry;
  } catch (e) {
    console.error('❌ Ошибка добавления лога:', e);
    console.error('   Стек ошибки:', e.stack);
    return null;
  }
}

// ========== НАСТРОЙКА CORS (безопасность) ==========
// Настройка CORS с ограничением разрешенных доменов
const corsOptions = {
  origin: function (origin, callback) {
    // Разрешенные домены
    const allowedOrigins = [];
    
    // Добавляем домены из переменных окружения (для гибкости)
    if (process.env.ALLOWED_ORIGINS) {
      allowedOrigins.push(...process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()));
    }
    
    // Добавляем стандартные домены
    allowedOrigins.push(
      'http://localhost:3001',
      'http://127.0.0.1:3001',
      'http://icona_academy.corppn.ru:3001',
      'https://deadlinepro.onrender.com' // Продакшен на Render.com
    );
    
    // Добавляем домен продакшена из переменной окружения (если указан)
    if (process.env.PRODUCTION_URL) {
      allowedOrigins.push(process.env.PRODUCTION_URL);
      // Также добавляем без порта, если указан порт
      try {
        const url = new URL(process.env.PRODUCTION_URL);
        if (url.port) {
          allowedOrigins.push(`${url.protocol}//${url.hostname}`);
        }
      } catch (e) {
        console.warn('⚠️ Неверный формат PRODUCTION_URL:', process.env.PRODUCTION_URL);
      }
    }
    
    // В режиме разработки разрешаем все локальные домены
    const isDevelopment = process.env.NODE_ENV !== 'production';
    if (isDevelopment) {
      // Разрешаем localhost с любым портом в режиме разработки
      if (!origin || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return callback(null, true);
      }
    }
    
    // Разрешаем запросы без origin (например, Postman, curl, мобильные приложения)
    // Это безопасно, так как мы проверяем авторизацию на уровне API
    if (!origin) {
      return callback(null, true);
    }
    
    // Проверяем, есть ли origin в списке разрешенных
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`⚠️ CORS: Запрос с неразрешенного домена: ${origin}`);
      callback(new Error('Не разрешено политикой CORS'));
    }
  },
  credentials: true, // Разрешаем отправку cookies и заголовков авторизации
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Разрешенные методы
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Login', 'X-User-Name', 'X-User-Name-Encoded'], // Разрешенные заголовки
  exposedHeaders: ['Content-Type'], // Заголовки, доступные клиенту
  optionsSuccessStatus: 200 // Статус для успешных OPTIONS запросов
};

app.use(cors(corsOptions));

// Увеличиваем лимит размера тела запроса до 10MB для загрузки изображений
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ========== MIDDLEWARE ДЛЯ АВТОРИЗАЦИИ И ПРОВЕРКИ ПРАВ ==========

// Middleware для проверки авторизации пользователя
// Проверяет наличие логина пользователя и загружает данные пользователя из users.json
async function requireAuth(req, res, next) {
  try {
    // Логирование для отладки
    console.log(`🔍 [requireAuth] ${req.method} ${req.path}`);
    
    // Читаем заголовки с учетом разных регистров
    const xUserLogin = req.headers['x-user-login'] || req.headers['X-User-Login'];
    const xUserName = req.headers['x-user-name'] || req.headers['X-User-Name'];
    const xUserNameEncoded = req.headers['x-user-name-encoded'] || req.headers['X-User-Name-Encoded'];
    
    console.log(`🔍 [requireAuth] Заголовки:`, {
      'x-user-login': xUserLogin,
      'x-user-name': xUserName,
      'x-user-name-encoded': xUserNameEncoded
    });
    console.log(`🔍 [requireAuth] Body:`, {
      userLogin: req.body?.userLogin,
      userName: req.body?.userName
    });
    
    // Получаем логин пользователя из body или заголовков
    // Для GET запросов req.body может быть undefined, поэтому используем optional chaining
    let userLogin = (req.body && req.body.userLogin) || xUserLogin || null;
    
    // Если логина нет, пытаемся получить из userName (для обратной совместимости)
    if (!userLogin) {
      let userName = (req.body && req.body.userName) || xUserName || null;
      
      // Декодируем userName, если он закодирован
      if (userName && xUserNameEncoded === 'base64') {
        try {
          userName = decodeURIComponent(Buffer.from(userName, 'base64').toString('utf8'));
        } catch (e) {
          console.warn('⚠️ Ошибка декодирования userName:', e);
        }
      }
      
      // Если userName есть, используем его как логин (для обратной совместимости)
      if (userName && userName !== 'Неизвестный пользователь') {
        userLogin = userName;
      }
    }
    
    // Если логин не указан, возвращаем ошибку
    if (!userLogin || !userLogin.trim()) {
      console.warn('⚠️ Попытка доступа без авторизации:', req.method, req.path);
      return res.status(401).json({ ok: false, error: 'Требуется авторизация' });
    }
    
    userLogin = userLogin.trim();
    console.log(`🔍 [requireAuth] Используемый логин: "${userLogin}"`);
    
    // Загружаем данные пользователя из файла
    if (!fs.existsSync(USERS_FILE)) {
      console.error(`❌ [requireAuth] Файл ${USERS_FILE} не существует`);
      return res.status(401).json({ ok: false, error: 'Пользователь не найден' });
    }
    
    let raw;
    try {
      raw = fs.readFileSync(USERS_FILE, 'utf8');
    } catch (e) {
      console.error(`❌ [requireAuth] Ошибка чтения файла ${USERS_FILE}:`, e);
      console.error(`   Детали ошибки:`, e.message, e.stack);
      return res.status(500).json({ ok: false, error: 'Ошибка чтения файла пользователей' });
    }
    
    if (!raw || raw.trim() === '') {
      console.error(`❌ [requireAuth] Файл ${USERS_FILE} пустой`);
      return res.status(500).json({ ok: false, error: 'Файл пользователей пустой' });
    }
    
    let users;
    try {
      users = safeJsonParse(raw);
    } catch (e) {
      console.error(`❌ [requireAuth] Ошибка парсинга JSON из ${USERS_FILE}:`, e);
      console.error(`   Первые 200 символов файла:`, raw.substring(0, 200));
      return res.status(500).json({ ok: false, error: 'Ошибка парсинга файла пользователей' });
    }
    
    if (!Array.isArray(users)) {
      console.error(`❌ [requireAuth] Файл ${USERS_FILE} не содержит массив, тип:`, typeof users);
      return res.status(500).json({ ok: false, error: 'Неверный формат файла пользователей' });
    }
    
    console.log(`🔍 [requireAuth] Загружено пользователей: ${users.length}`);
    console.log(`🔍 [requireAuth] Логины в файле:`, users.map(u => u.login));
    
    const user = users.find(u => u.login === userLogin);
    
    if (!user) {
      console.warn(`⚠️ [requireAuth] Пользователь с логином "${userLogin}" не найден`);
      console.warn(`⚠️ [requireAuth] Доступные логины:`, users.map(u => u.login));
      return res.status(401).json({ ok: false, error: 'Пользователь не найден' });
    }
    
    console.log(`✅ [requireAuth] Пользователь найден: ${user.login}, роль: ${user.role}`);
    
    // Сохраняем данные пользователя в req.user (без пароля)
    const { password: _, ...userWithoutPassword } = user;
    req.user = userWithoutPassword;
    
    next();
  } catch (e) {
    console.error('❌ Ошибка проверки авторизации:', e);
    console.error('   Детали ошибки:', e.message);
    console.error('   Стек ошибки:', e.stack);
    return res.status(500).json({ ok: false, error: 'Ошибка проверки авторизации', details: process.env.NODE_ENV !== 'production' ? e.message : undefined });
  }
}

// Middleware для проверки прав администратора
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ ok: false, error: 'Требуется авторизация' });
  }
  
  if (req.user.role !== 'admin') {
    console.warn(`⚠️ Попытка доступа к админ-функции пользователем "${req.user.login}" (роль: ${req.user.role})`);
    return res.status(403).json({ ok: false, error: 'Требуются права администратора' });
  }
  
  next();
}

// Middleware для проверки доступа к компании
function checkCompanyAccess(req, res, next) {
  // Если пользователь не авторизован (режим просмотра), разрешаем доступ только для GET запросов
  if (!req.user) {
    if (req.method === 'GET') {
      // В режиме просмотра разрешаем только чтение
      return next();
    }
    return res.status(401).json({ ok: false, error: 'Требуется авторизация' });
  }
  
  // Админы имеют доступ ко всем компаниям
  if (req.user.role === 'admin') {
    return next();
  }
  
  // Получаем ID компании из разных источников
  const companyId = req.query.company || req.params.id || req.body.company;
  
  if (!companyId) {
    // Если компания не указана, разрешаем доступ (для операций без привязки к компании)
    return next();
  }
  
  // Проверяем, есть ли у пользователя доступ к этой компании
  const userCompanies = req.user.companies || [];
  if (!userCompanies.includes(companyId)) {
    console.warn(`⚠️ Пользователь "${req.user.login}" пытается получить доступ к компании "${companyId}"`);
    return res.status(403).json({ ok: false, error: 'Нет доступа к этой компании' });
  }
  
  next();
}

// Middleware для опциональной авторизации (для режима просмотра)
// Разрешает доступ, если пользователь авторизован, но не требует обязательной авторизации
async function optionalAuth(req, res, next) {
  try {
    // Читаем заголовки с учетом разных регистров
    const xUserLogin = req.headers['x-user-login'] || req.headers['X-User-Login'];
    const xUserName = req.headers['x-user-name'] || req.headers['X-User-Name'];
    const xUserNameEncoded = req.headers['x-user-name-encoded'] || req.headers['X-User-Name-Encoded'];
    
    // Для GET запросов req.body может быть undefined, поэтому используем проверку
    let userLogin = (req.body && req.body.userLogin) || xUserLogin || null;
    
    if (!userLogin) {
      let userName = (req.body && req.body.userName) || xUserName || null;
      if (userName && xUserNameEncoded === 'base64') {
        try {
          userName = decodeURIComponent(Buffer.from(userName, 'base64').toString('utf8'));
        } catch (e) {
          // Игнорируем ошибку декодирования
        }
      }
      if (userName && userName !== 'Неизвестный пользователь') {
        userLogin = userName;
      }
    }
    
    if (userLogin && userLogin.trim() && fs.existsSync(USERS_FILE)) {
      try {
        const raw = fs.readFileSync(USERS_FILE, 'utf8');
        if (raw && raw.trim()) {
          const users = safeJsonParse(raw);
          if (Array.isArray(users)) {
            const user = users.find(u => u.login === userLogin.trim());
            if (user) {
              const { password: _, ...userWithoutPassword } = user;
              req.user = userWithoutPassword;
            }
          }
        }
      } catch (e) {
        // В режиме просмотра игнорируем ошибки чтения файла
        console.warn('⚠️ [optionalAuth] Ошибка чтения файла пользователей:', e.message);
      }
    }
    
    next();
  } catch (e) {
    // В режиме просмотра игнорируем ошибки авторизации
    console.warn('⚠️ [optionalAuth] Ошибка при опциональной авторизации:', e.message);
    next();
  }
}

// ========== ВАЛИДАЦИЯ ВХОДНЫХ ДАННЫХ ==========

// Функции валидации
function validateString(value, fieldName, minLength = 1, maxLength = 1000) {
  if (typeof value !== 'string') {
    return { valid: false, error: `${fieldName} должно быть строкой` };
  }
  const trimmed = value.trim();
  if (trimmed.length < minLength) {
    return { valid: false, error: `${fieldName} должно содержать минимум ${minLength} символов` };
  }
  if (trimmed.length > maxLength) {
    return { valid: false, error: `${fieldName} должно содержать максимум ${maxLength} символов` };
  }
  return { valid: true, value: trimmed };
}

function validateCompanyId(id) {
  if (typeof id !== 'string') {
    return { valid: false, error: 'ID компании должно быть строкой' };
  }
  if (!isValidCompanyId(id)) {
    return { valid: false, error: 'ID компании может содержать только латинские буквы, цифры, дефисы и подчеркивания' };
  }
  if (id.length > 100) {
    return { valid: false, error: 'ID компании не может быть длиннее 100 символов' };
  }
  return { valid: true, value: id.trim() };
}

function validateLogin(login) {
  const validation = validateString(login, 'Логин', 1, 50);
  if (!validation.valid) return validation;
  
  // Логин может содержать только латинские буквы, цифры, дефисы, подчеркивания и точки
  if (!/^[a-zA-Z0-9_.-]+$/.test(validation.value)) {
    return { valid: false, error: 'Логин может содержать только латинские буквы, цифры, дефисы, подчеркивания и точки' };
  }
  return validation;
}

function validatePassword(password) {
  if (typeof password !== 'string') {
    return { valid: false, error: 'Пароль должен быть строкой' };
  }
  if (password.length < 6) {
    return { valid: false, error: 'Пароль должен содержать минимум 6 символов' };
  }
  if (password.length > 200) {
    return { valid: false, error: 'Пароль не может быть длиннее 200 символов' };
  }
  return { valid: true, value: password };
}

function validateRole(role) {
  if (role !== 'admin' && role !== 'user') {
    return { valid: false, error: 'Роль должна быть "admin" или "user"' };
  }
  return { valid: true, value: role };
}

function validateArray(value, fieldName, maxLength = 1000) {
  if (!Array.isArray(value)) {
    return { valid: false, error: `${fieldName} должно быть массивом` };
  }
  if (value.length > maxLength) {
    return { valid: false, error: `${fieldName} не может содержать более ${maxLength} элементов` };
  }
  return { valid: true, value: value };
}

// Безопасный парсинг JSON с защитой от DoS
function safeJsonParse(jsonString, maxLength = 10 * 1024 * 1024) {
  if (typeof jsonString !== 'string') {
    throw new Error('JSON должен быть строкой');
  }
  if (jsonString.length > maxLength) {
    throw new Error(`JSON слишком большой (максимум ${maxLength} байт)`);
  }
  try {
    const parsed = JSON.parse(jsonString);
    // Проверка на циклические ссылки
    JSON.stringify(parsed);
    return parsed;
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error('Неверный формат JSON');
    }
    throw new Error('Ошибка обработки JSON');
  }
}

// ========== ГЛОБАЛЬНАЯ ОБРАБОТКА ОШИБОК ==========

// Middleware для обработки ошибок (должен быть после всех маршрутов)
app.use((err, req, res, next) => {
  console.error('❌ Ошибка сервера:', err);
  console.error('   Путь:', req.path);
  console.error('   Метод:', req.method);
  console.error('   Стек:', err.stack);
  
  // В продакшене не показываем детали ошибок
  const isProduction = process.env.NODE_ENV === 'production';
  const errorMessage = isProduction 
    ? 'Внутренняя ошибка сервера' 
    : err.message || 'Неизвестная ошибка';
  
  res.status(err.status || 500).json({ 
    ok: false, 
    error: errorMessage,
    ...(isProduction ? {} : { details: err.message, stack: err.stack })
  });
});

// ========== API МАРШРУТЫ (должны быть ПЕРЕД статикой) ==========

// Rate limiting отключен для беспрепятственной работы
// app.use('/api/', rateLimit(RATE_LIMIT_MAX_REQUESTS));

// ========== API ДЛЯ РАБОТЫ С КОМПАНИЯМИ ==========

// Получить список всех компаний (опциональная авторизация для режима просмотра)
app.get('/api/companies', optionalAuth, (req, res) => {
  try {
    if (!fs.existsSync(COMPANIES_FILE)) {
      return res.json([]);
    }
    const raw = fs.readFileSync(COMPANIES_FILE, 'utf8');
      const companies = safeJsonParse(raw);
    // Фильтруем архивированные компании - они не должны показываться в основном списке
    const activeCompanies = companies.filter(c => !c.archived);
    res.json(activeCompanies);
  } catch (e) {
    console.error('Ошибка загрузки компаний:', e);
    res.status(500).json({ ok: false, error: 'load_failed' });
  }
});

// Создать новую компанию (требуется авторизация, только админы)
app.post('/api/companies', requireAuth, requireAdmin, (req, res) => {
  try {
    const { id, name } = req.body;

    // Валидация ID компании
    const idValidation = validateCompanyId(id);
    if (!idValidation.valid) {
      return res.status(400).json({ ok: false, error: idValidation.error });
    }

    // Валидация названия компании
    const nameValidation = validateString(name, 'Название компании', 1, 200);
    if (!nameValidation.valid) {
      return res.status(400).json({ ok: false, error: nameValidation.error });
    }

    // Загружаем существующие компании
    let companies = [];
    if (fs.existsSync(COMPANIES_FILE)) {
      const raw = fs.readFileSync(COMPANIES_FILE, 'utf8');
      companies = safeJsonParse(raw);
    }

    // Проверяем, не существует ли уже компания с таким ID
    if (companies.some(c => c.id === idValidation.value)) {
      return res.status(400).json({ ok: false, error: 'Компания с таким ID уже существует' });
    }

    // Добавляем новую компанию
    const newCompany = {
      id: idValidation.value,
      name: nameValidation.value,
      createdAt: new Date().toISOString()
    };

    companies.push(newCompany);

    // Сохраняем
    fs.writeFileSync(COMPANIES_FILE, JSON.stringify(companies, null, 2), 'utf8');
    
    // Логируем создание компании (только если пользователь определен)
    const userName = req.body.userName || req.headers['x-user-name'] || null;
    if (userName) {
      addLog(userName, 'Создал компанию', `Компания: ${name} (ID: ${id})`, id);
    }
    
    res.json({ ok: true, company: newCompany });
  } catch (e) {
    console.error('Ошибка создания компании:', e);
    res.status(500).json({ ok: false, error: 'create_failed' });
  }
});

// Обновить порядок компаний (требуется авторизация, только админы)
app.put('/api/companies/order', requireAuth, requireAdmin, (req, res) => {
  try {
    const { companyIds } = req.body;
    
    if (!Array.isArray(companyIds)) {
      return res.status(400).json({ ok: false, error: 'companyIds должен быть массивом' });
    }

    if (!fs.existsSync(COMPANIES_FILE)) {
      return res.status(404).json({ ok: false, error: 'Файл компаний не найден' });
    }

    const raw = fs.readFileSync(COMPANIES_FILE, 'utf8');
    let companies = safeJsonParse(raw);

    // Создаем карту компаний для быстрого доступа
    const companyMap = new Map(companies.map(c => [c.id, c]));

    // Проверяем, что все ID существуют
    for (const id of companyIds) {
      if (!companyMap.has(id)) {
        return res.status(400).json({ ok: false, error: `Компания с ID ${id} не найдена` });
      }
    }

    // Переупорядочиваем компании согласно переданному порядку
    const orderedCompanies = companyIds.map(id => companyMap.get(id));
    
    // Добавляем компании, которых нет в списке (на случай, если порядок обновляется частично)
    const existingIds = new Set(companyIds);
    const remainingCompanies = companies.filter(c => !existingIds.has(c.id));
    orderedCompanies.push(...remainingCompanies);

    fs.writeFileSync(COMPANIES_FILE, JSON.stringify(orderedCompanies, null, 2), 'utf8');
    res.json({ ok: true, companies: orderedCompanies });
  } catch (e) {
    console.error('Ошибка обновления порядка компаний:', e);
    res.status(500).json({ ok: false, error: 'update_order_failed' });
  }
});

// Обновить компанию (требуется авторизация, только админы)
app.put('/api/companies/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const oldCompanyId = req.params.id;
    const { id: newCompanyId, name } = req.body;
    console.log('📝 PUT /api/companies/:id', { oldCompanyId, newCompanyId, name });

    if (!fs.existsSync(COMPANIES_FILE)) {
      return res.status(404).json({ ok: false, error: 'Компания не найдена' });
    }

    const raw = fs.readFileSync(COMPANIES_FILE, 'utf8');
    let companies = safeJsonParse(raw);

    const companyIndex = companies.findIndex(c => c.id === oldCompanyId);
    if (companyIndex === -1) {
      return res.status(404).json({ ok: false, error: 'Компания не найдена' });
    }

    // Если ID меняется, проверяем уникальность нового ID
    if (newCompanyId && newCompanyId !== oldCompanyId) {
      if (!isValidCompanyId(newCompanyId)) {
        return res.status(400).json({ ok: false, error: 'ID компании может содержать только латинские буквы, цифры, дефисы и подчеркивания' });
      }
      
      if (companies.some(c => c.id === newCompanyId && c.id !== oldCompanyId)) {
        return res.status(400).json({ ok: false, error: 'Компания с таким ID уже существует' });
      }

      // Переименовываем файлы данных компании
      const oldDataFile = getCompanyDataFile(oldCompanyId);
      const oldInfoFile = getCompanyInfoFile(oldCompanyId);
      const newDataFile = getCompanyDataFile(newCompanyId);
      const newInfoFile = getCompanyInfoFile(newCompanyId);

      if (fs.existsSync(oldDataFile)) {
        fs.renameSync(oldDataFile, newDataFile);
      }
      if (fs.existsSync(oldInfoFile)) {
        fs.renameSync(oldInfoFile, newInfoFile);
      }
    }

    // Обновляем данные компании
    if (newCompanyId) {
      companies[companyIndex].id = newCompanyId.trim();
    }
    if (name) {
      companies[companyIndex].name = name.trim();
    }

    fs.writeFileSync(COMPANIES_FILE, JSON.stringify(companies, null, 2), 'utf8');
    
    // Логируем изменение компании (только если пользователь определен)
    const userName = req.body.userName || req.headers['x-user-name'] || null;
    if (userName) {
      const changes = [];
      if (newCompanyId && newCompanyId !== oldCompanyId) {
        changes.push(`ID: ${oldCompanyId} → ${newCompanyId}`);
      }
      if (name) {
        changes.push(`Название: ${name}`);
      }
      addLog(userName, 'Изменил компанию', changes.join(', ') || 'Изменения не указаны', newCompanyId || oldCompanyId);
    }
    
    res.json({ ok: true, company: companies[companyIndex] });
  } catch (e) {
    console.error('Ошибка обновления компании:', e);
    res.status(500).json({ ok: false, error: 'update_failed' });
  }
});

// Удалить компанию (требуется авторизация, только админы)
app.delete('/api/companies/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    let companyId = req.params.id;
    console.log('🗑️ DELETE /api/companies/:id вызван');
    console.log('   companyId из params:', companyId);
    console.log('   typeof companyId:', typeof companyId);
    
    // Декодируем ID компании, если он был закодирован в URL
    try {
      companyId = decodeURIComponent(companyId);
      console.log('   companyId после декодирования:', companyId);
    } catch (decodeError) {
      console.warn('   Предупреждение: не удалось декодировать companyId, используем как есть');
    }

    if (!fs.existsSync(COMPANIES_FILE)) {
      console.error('   ❌ Файл companies.json не найден');
      return res.status(404).json({ ok: false, error: 'Компания не найдена' });
    }

    console.log('   📖 Чтение файла companies.json...');
    let raw, companies;
    try {
      raw = fs.readFileSync(COMPANIES_FILE, 'utf8');
      companies = safeJsonParse(raw);
      console.log('   ✅ Файл прочитан, компаний:', companies.length);
    } catch (readError) {
      console.error('   ❌ Ошибка чтения/парсинга companies.json:', readError);
      return res.status(500).json({ ok: false, error: 'Ошибка чтения данных компаний' });
    }

    // Сохраняем информацию о компании ДО удаления для логирования
    console.log('   🔍 Поиск компании с ID:', companyId);
    const deletedCompany = companies.find(c => c.id === companyId);
    if (!deletedCompany) {
      console.error('   ❌ Компания не найдена. Доступные ID:', companies.map(c => c.id));
      return res.status(404).json({ ok: false, error: 'Компания не найдена' });
    }
    console.log('   ✅ Компания найдена:', deletedCompany.name || deletedCompany.id);

    const initialLength = companies.length;
    companies = companies.filter(c => c.id !== companyId);

    if (companies.length === initialLength) {
      console.error('   ❌ Компания не была удалена из массива');
      return res.status(404).json({ ok: false, error: 'Компания не найдена' });
    }
    console.log('   ✅ Компания удалена из массива (было:', initialLength, ', стало:', companies.length, ')');

    // Удаляем файлы данных компании
    const dataFile = getCompanyDataFile(companyId);
    const infoFile = getCompanyInfoFile(companyId);
    console.log('   🗑️ Удаление файлов компании...');
    console.log('      dataFile:', dataFile);
    console.log('      infoFile:', infoFile);
    try {
      if (fs.existsSync(dataFile)) {
        fs.unlinkSync(dataFile);
        console.log('      ✅ dataFile удален');
      } else {
        console.log('      ℹ️ dataFile не существует, пропускаем');
      }
      if (fs.existsSync(infoFile)) {
        fs.unlinkSync(infoFile);
        console.log('      ✅ infoFile удален');
      } else {
        console.log('      ℹ️ infoFile не существует, пропускаем');
      }
    } catch (fileError) {
      console.error('   ⚠️ Ошибка удаления файлов компании:', fileError);
      console.error('      Стек ошибки:', fileError.stack);
      // Продолжаем выполнение, даже если файлы не удалились
    }

    console.log('   💾 Сохранение обновленного списка компаний...');
    try {
      fs.writeFileSync(COMPANIES_FILE, JSON.stringify(companies, null, 2), 'utf8');
      console.log('   ✅ Файл companies.json обновлен');
    } catch (writeError) {
      console.error('   ❌ Ошибка записи companies.json:', writeError);
      console.error('      Стек ошибки:', writeError.stack);
      return res.status(500).json({ ok: false, error: 'Ошибка сохранения данных' });
    }
    
    // Логируем удаление компании (только если пользователь определен)
    console.log('   📝 Логирование удаления компании...');
    try {
      const userName = req.body.userName || req.headers['x-user-name'] || null;
      if (userName) {
        addLog(userName, 'Удалил компанию', `Компания: ${deletedCompany.name || companyId} (ID: ${companyId})`, companyId);
        console.log('   ✅ Лог добавлен успешно');
      } else {
        console.warn('   ⚠️ Пропускаем логирование - пользователь не определен');
      }
    } catch (logError) {
      console.error('   ⚠️ Ошибка логирования (не критично):', logError);
      // Не прерываем выполнение из-за ошибки логирования
    }
    
    console.log('   ✅ Удаление компании завершено успешно');
    res.json({ ok: true });
  } catch (e) {
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА удаления компании:', e);
    console.error('   Тип ошибки:', e.constructor.name);
    console.error('   Сообщение:', e.message);
    console.error('   Стек ошибки:', e.stack);
    res.status(500).json({ ok: false, error: 'delete_failed', message: process.env.NODE_ENV === 'development' ? e.message : 'Внутренняя ошибка сервера' });
  }
});

// Архивировать компанию (требуется авторизация, только админы)
app.post('/api/companies/:id/archive', requireAuth, requireAdmin, (req, res) => {
  try {
    let companyId = req.params.id;
    console.log('📦 POST /api/companies/:id/archive вызван');
    console.log('   companyId из params:', companyId);
    console.log('   typeof companyId:', typeof companyId);
    
    // Декодируем ID компании, если он был закодирован в URL
    try {
      companyId = decodeURIComponent(companyId);
      console.log('   companyId после декодирования:', companyId);
    } catch (decodeError) {
      console.warn('   Предупреждение: не удалось декодировать companyId, используем как есть');
      console.warn('   Ошибка декодирования:', decodeError.message);
    }

    if (!fs.existsSync(COMPANIES_FILE)) {
      console.error('   ❌ Файл companies.json не найден');
      return res.status(404).json({ ok: false, error: 'Компания не найдена' });
    }

    console.log('   📖 Чтение файла companies.json...');
    let raw, companies;
    try {
      raw = fs.readFileSync(COMPANIES_FILE, 'utf8');
      companies = safeJsonParse(raw);
      console.log('   ✅ Файл прочитан, компаний:', companies.length);
    } catch (readError) {
      console.error('   ❌ Ошибка чтения/парсинга companies.json:', readError);
      console.error('      Тип ошибки:', readError.constructor.name);
      console.error('      Сообщение:', readError.message);
      console.error('      Стек ошибки:', readError.stack);
      return res.status(500).json({ ok: false, error: 'Ошибка чтения данных компаний' });
    }

    console.log('   🔍 Поиск компании с ID:', companyId);
    const companyIndex = companies.findIndex(c => c.id === companyId);
    if (companyIndex === -1) {
      console.error('   ❌ Компания не найдена. Доступные ID:', companies.map(c => c.id));
      return res.status(404).json({ ok: false, error: 'Компания не найдена' });
    }
    
    const company = companies[companyIndex];
    console.log('   ✅ Компания найдена:', company.name || company.id);
    console.log('   Текущий статус архивирования:', company.archived ? 'архивирована' : 'не архивирована');

    // Помечаем компанию как архивированную
    console.log('   📦 Помечаем компанию как архивированную...');
    companies[companyIndex].archived = true;
    companies[companyIndex].archivedAt = new Date().toISOString();
    console.log('   ✅ Компания помечена как архивированная');

    console.log('   💾 Сохранение обновленного списка компаний...');
    try {
      fs.writeFileSync(COMPANIES_FILE, JSON.stringify(companies, null, 2), 'utf8');
      console.log('   ✅ Файл companies.json обновлен');
    } catch (writeError) {
      console.error('   ❌ Ошибка записи companies.json:', writeError);
      console.error('      Тип ошибки:', writeError.constructor.name);
      console.error('      Сообщение:', writeError.message);
      console.error('      Стек ошибки:', writeError.stack);
      return res.status(500).json({ ok: false, error: 'Ошибка сохранения данных' });
    }
    
    // Логируем архивирование компании
    console.log('   📝 Логирование архивирования компании...');
    try {
      const userName = req.body.userName || req.headers['x-user-name'] || null;
      if (userName) {
        addLog(userName, 'Архивировал компанию', `Компания: ${company.name || companyId} (ID: ${companyId})`, companyId);
        console.log('   ✅ Лог добавлен успешно');
      } else {
        console.warn('   ⚠️ Пропускаем логирование - пользователь не определен');
      }
    } catch (logError) {
      console.error('   ⚠️ Ошибка логирования (не критично):', logError);
      console.error('      Тип ошибки:', logError.constructor.name);
      console.error('      Сообщение:', logError.message);
      console.error('      Стек ошибки:', logError.stack);
      // Не прерываем выполнение из-за ошибки логирования
    }
    
    console.log('   ✅ Архивирование компании завершено успешно');
    res.json({ ok: true });
  } catch (e) {
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА архивирования компании:', e);
    console.error('   Тип ошибки:', e.constructor.name);
    console.error('   Сообщение:', e.message);
    console.error('   Стек ошибки:', e.stack);
    res.status(500).json({ ok: false, error: 'archive_failed', message: process.env.NODE_ENV === 'development' ? e.message : 'Внутренняя ошибка сервера' });
  }
});

// Восстановить компанию из архива (требуется авторизация, только админы)
app.post('/api/companies/:id/restore', requireAuth, requireAdmin, (req, res) => {
  try {
    let companyId = req.params.id;
    console.log('♻️ POST /api/companies/:id/restore вызван');
    console.log('   companyId из params:', companyId);
    console.log('   typeof companyId:', typeof companyId);
    
    // Декодируем ID компании, если он был закодирован в URL
    try {
      companyId = decodeURIComponent(companyId);
      console.log('   companyId после декодирования:', companyId);
    } catch (decodeError) {
      console.warn('   Предупреждение: не удалось декодировать companyId, используем как есть');
      console.warn('   Ошибка декодирования:', decodeError.message);
    }

    if (!fs.existsSync(COMPANIES_FILE)) {
      console.error('   ❌ Файл companies.json не найден');
      return res.status(404).json({ ok: false, error: 'Компания не найдена' });
    }

    console.log('   📖 Чтение файла companies.json...');
    let raw, companies;
    try {
      raw = fs.readFileSync(COMPANIES_FILE, 'utf8');
      companies = safeJsonParse(raw);
      console.log('   ✅ Файл прочитан, компаний:', companies.length);
    } catch (readError) {
      console.error('   ❌ Ошибка чтения/парсинга companies.json:', readError);
      console.error('      Тип ошибки:', readError.constructor.name);
      console.error('      Сообщение:', readError.message);
      console.error('      Стек ошибки:', readError.stack);
      return res.status(500).json({ ok: false, error: 'Ошибка чтения данных компаний' });
    }

    console.log('   🔍 Поиск компании с ID:', companyId);
    const companyIndex = companies.findIndex(c => c.id === companyId);
    if (companyIndex === -1) {
      console.error('   ❌ Компания не найдена. Доступные ID:', companies.map(c => c.id));
      return res.status(404).json({ ok: false, error: 'Компания не найдена' });
    }
    
    const company = companies[companyIndex];
    console.log('   ✅ Компания найдена:', company.name || company.id);
    console.log('   Текущий статус архивирования:', company.archived ? 'архивирована' : 'не архивирована');

    // Убираем флаг архивирования
    console.log('   ♻️ Восстанавливаем компанию из архива...');
    companies[companyIndex].archived = false;
    if (companies[companyIndex].archivedAt) {
      delete companies[companyIndex].archivedAt;
    }
    console.log('   ✅ Компания восстановлена из архива');

    console.log('   💾 Сохранение обновленного списка компаний...');
    try {
      fs.writeFileSync(COMPANIES_FILE, JSON.stringify(companies, null, 2), 'utf8');
      console.log('   ✅ Файл companies.json обновлен');
    } catch (writeError) {
      console.error('   ❌ Ошибка записи companies.json:', writeError);
      console.error('      Тип ошибки:', writeError.constructor.name);
      console.error('      Сообщение:', writeError.message);
      console.error('      Стек ошибки:', writeError.stack);
      return res.status(500).json({ ok: false, error: 'Ошибка сохранения данных' });
    }
    
    // Логируем восстановление компании
    console.log('   📝 Логирование восстановления компании...');
    try {
      const userName = req.body.userName || req.headers['x-user-name'] || null;
      if (userName) {
        addLog(userName, 'Восстановил компанию из архива', `Компания: ${company.name || companyId} (ID: ${companyId})`, companyId);
        console.log('   ✅ Лог добавлен успешно');
      } else {
        console.warn('   ⚠️ Пропускаем логирование - пользователь не определен');
      }
    } catch (logError) {
      console.error('   ⚠️ Ошибка логирования (не критично):', logError);
      console.error('      Тип ошибки:', logError.constructor.name);
      console.error('      Сообщение:', logError.message);
      console.error('      Стек ошибки:', logError.stack);
      // Не прерываем выполнение из-за ошибки логирования
    }
    
    console.log('   ✅ Восстановление компании завершено успешно');
    res.json({ ok: true });
  } catch (e) {
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА восстановления компании:', e);
    console.error('   Тип ошибки:', e.constructor.name);
    console.error('   Сообщение:', e.message);
    console.error('   Стек ошибки:', e.stack);
    res.status(500).json({ ok: false, error: 'restore_failed', message: process.env.NODE_ENV === 'development' ? e.message : 'Внутренняя ошибка сервера' });
  }
});

// Получить архивированные компании (требуется авторизация, только админы)
app.get('/api/companies/archived', requireAuth, requireAdmin, (req, res) => {
  try {
    if (!fs.existsSync(COMPANIES_FILE)) {
      return res.json({ ok: true, companies: [] });
    }

    const raw = fs.readFileSync(COMPANIES_FILE, 'utf8');
      const companies = safeJsonParse(raw);

    // Фильтруем только архивированные компании
    const archivedCompanies = companies.filter(c => c.archived === true);

    // Загружаем информацию о компаниях (логотипы)
    const companiesWithInfo = archivedCompanies.map(company => {
      const infoFile = getCompanyInfoFile(company.id);
      if (fs.existsSync(infoFile)) {
        try {
          const infoData = safeJsonParse(fs.readFileSync(infoFile, 'utf8'));
          return { ...company, logoData: infoData.logoData || null };
        } catch (e) {
          return company;
        }
      }
      return company;
    });

    res.json({ ok: true, companies: companiesWithInfo });
  } catch (e) {
    console.error('Ошибка загрузки архива:', e);
    res.status(500).json({ ok: false, error: 'load_archive_failed' });
  }
});

// ========== API ДЛЯ РАБОТЫ С ГРАФИКОМ ГАНТА ==========

// получить сохранённое состояние графика (требуется авторизация или режим просмотра)
app.get('/api/gantt-state', optionalAuth, checkCompanyAccess, (req, res) => {
  try {
    const companyId = req.query.company;
    if (!companyId || !isValidCompanyId(companyId)) {
      return res.status(400).json({ ok: false, error: 'Не указан или неверный ID компании' });
    }

    const dataFile = getCompanyDataFile(companyId);
    if (!fs.existsSync(dataFile)) {
      return res.json(null);
    }
    const raw = fs.readFileSync(dataFile, 'utf8');
    res.json(safeJsonParse(raw));
  } catch (e) {
    console.error('Ошибка загрузки gantt-state:', e);
    res.status(500).json({ ok: false, error: 'load_failed' });
  }
});

// сохранить состояние графика (требуется авторизация и доступ к компании)
app.post('/api/gantt-state', requireAuth, checkCompanyAccess, (req, res) => {
  try {
    const companyId = req.query.company || req.body.company;
    console.log('📥 POST /api/gantt-state получен');
    console.log('   companyId из query:', req.query.company);
    console.log('   companyId из body:', req.body.company);
    console.log('   Итоговый companyId:', companyId);
    
    if (!companyId || !isValidCompanyId(companyId)) {
      console.error('❌ Ошибка: не указан или неверный ID компании:', companyId);
      return res.status(400).json({ ok: false, error: 'Не указан или неверный ID компании' });
    }

    const dataFile = getCompanyDataFile(companyId);
    console.log('💾 Сохранение графика для компании:', companyId);
    console.log('📁 Путь к файлу:', dataFile);
    console.log('📦 Размер данных:', JSON.stringify(req.body).length, 'байт');
    console.log('📊 Количество задач в данных:', req.body.tasks ? req.body.tasks.length : 'нет');
    
    // Проверяем, что директория существует
    const dir = path.dirname(dataFile);
    if (!fs.existsSync(dir)) {
      console.log('📁 Создание директории:', dir);
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Сохраняем данные
    const dataToSave = req.body;
    fs.writeFileSync(dataFile, JSON.stringify(dataToSave, null, 2), 'utf8');
    
    // Проверяем, что файл действительно создан
    if (fs.existsSync(dataFile)) {
      const stats = fs.statSync(dataFile);
    console.log('✅ График успешно сохранен в файл:', dataFile);
      console.log('✅ Размер сохраненного файла:', stats.size, 'байт');
    } else {
      console.error('❌ Файл не был создан после записи!');
      throw new Error('Файл не был создан');
    }
    
    // Логируем изменения графика с детальной информацией
    // Сначала получаем userName из body (там всегда правильное значение)
    let userName = req.body.userName || 'Неизвестный пользователь';
    
    // Если userName не в body, пытаемся получить из заголовка
    if (userName === 'Неизвестный пользователь' && req.headers['x-user-name']) {
      const headerUserName = req.headers['x-user-name'];
      // Проверяем, закодировано ли имя (если есть флаг X-User-Name-Encoded)
      if (req.headers['x-user-name-encoded'] === 'base64') {
        try {
          // Декодируем base64 -> decodeURIComponent
          userName = decodeURIComponent(atob(headerUserName));
          console.log('✅ Имя пользователя декодировано из заголовка:', userName);
        } catch (e) {
          console.warn('⚠️ Ошибка декодирования имени пользователя из заголовка:', e);
          userName = 'Неизвестный пользователь';
        }
      } else {
        // Если не закодировано, используем как есть (для обратной совместимости)
        userName = headerUserName;
      }
    }
    
    const userLogin = req.body.userLogin || null; // Логин пользователя для дополнительной идентификации
    const changeInfo = req.body.changeInfo; // Информация об изменениях от клиента
    
    console.log('📝 Логирование изменения графика:');
    console.log('   userName из body:', req.body.userName);
    console.log('   userName из header (raw):', req.headers['x-user-name']);
    console.log('   userName из header (encoded):', req.headers['x-user-name-encoded']);
    console.log('   userLogin из body:', req.body.userLogin);
    console.log('   Итоговый userName:', userName);
    console.log('   Итоговый userLogin:', userLogin);
    console.log('   companyId:', companyId);
    console.log('   changeInfo:', changeInfo ? JSON.stringify(changeInfo, null, 2) : 'нет');
    
    // Если userName все еще "Неизвестный пользователь", но есть userLogin, используем его
    if (userName === 'Неизвестный пользователь' && userLogin) {
      console.warn('⚠️ userName не определен, но есть userLogin. Используем userLogin:', userLogin);
      userName = userLogin; // Используем логин как имя пользователя
    }
    
    // Если и userName, и userLogin не определены, это проблема - не логируем
    if (userName === 'Неизвестный пользователь' && !userLogin) {
      console.error('❌ КРИТИЧЕСКАЯ ПРОБЛЕМА: Пользователь не определен! Пропускаем логирование.');
      console.error('   req.body.userName:', req.body.userName);
      console.error('   req.headers[x-user-name]:', req.headers['x-user-name']);
      console.error('   req.body.userLogin:', req.body.userLogin);
      // Не логируем, если пользователь не определен - просто возвращаем успешный ответ
      return res.json({ ok: true, saved: true, skippedLog: true });
    }
    
    // Получаем название компании для лога
    let companyName = companyId;
    try {
      const companiesFile = path.join(__dirname, 'companies.json');
      if (fs.existsSync(companiesFile)) {
        const companies = safeJsonParse(fs.readFileSync(companiesFile, 'utf8'));
        const company = companies.find(c => c.id === companyId);
        if (company && company.name) {
          companyName = company.name;
        }
      }
    } catch (e) {
      console.warn('Не удалось получить название компании:', e);
    }
    
    // Всегда логируем изменения графика с деталями
    let logEntry = null;
    const detailedChanges = req.body.detailedChanges || null; // Детальные изменения из клиента
    
    if (changeInfo && changeInfo.action) {
      // Если есть детальная информация об изменениях
      // Форматируем детали для лучшей читаемости
      let formattedDetails = changeInfo.details || 'Изменения в графике';
      
      // Если детали содержат только число (например "28"), это некорректно
      // В таком случае используем более информативное описание
      if (/^\d+$/.test(formattedDetails.trim())) {
        const taskCount = req.body.tasks ? req.body.tasks.length : 0;
        formattedDetails = `Изменения в графике (задач: ${taskCount})`;
      }
      
      const details = `${formattedDetails} | Компания: ${companyName} (${companyId})`;
      logEntry = addLog(userName, changeInfo.action, details, companyId, detailedChanges);
    } else {
      // Общее логирование изменений графика с информацией о компании
      const taskCount = req.body.tasks ? req.body.tasks.length : 0;
      const details = `Изменения в графике (задач: ${taskCount}) | Компания: ${companyName} (${companyId})`;
      logEntry = addLog(userName, 'Изменил график', details, companyId, detailedChanges);
    }
    
    if (logEntry) {
      console.log('✅ Лог успешно добавлен:', logEntry.id);
    } else {
      console.error('❌ Ошибка добавления лога!');
    }
    
    res.json({ ok: true });
  } catch (e) {
    console.error('❌ Ошибка сохранения gantt-state:', e);
    console.error('   Тип ошибки:', e.constructor.name);
    console.error('   Сообщение:', e.message);
    console.error('   Стек ошибки:', e.stack);
    res.status(500).json({ ok: false, error: 'save_failed', message: e.message });
  }
});

// ========== API ДЛЯ РАБОТЫ С ВЕРСИЯМИ ГРАФИКОВ ==========

// Получить список версий графика компании (требуется авторизация, только админы)
app.get('/api/versions', requireAuth, requireAdmin, (req, res) => {
  try {
    const companyId = req.query.company;
    if (!companyId || !isValidCompanyId(companyId)) {
      return res.status(400).json({ ok: false, error: 'Не указан или неверный ID компании' });
    }

    const versions = getVersions(companyId);
    res.json({ ok: true, versions });
  } catch (e) {
    console.error('Ошибка получения версий:', e);
    res.status(500).json({ ok: false, error: 'load_versions_failed' });
  }
});

// Получить конкретную версию графика (требуется авторизация, только админы)
app.get('/api/versions/:versionId', requireAuth, requireAdmin, (req, res) => {
  try {
    const companyId = req.query.company;
    const versionId = req.params.versionId;
    
    if (!companyId || !isValidCompanyId(companyId)) {
      return res.status(400).json({ ok: false, error: 'Не указан или неверный ID компании' });
    }
    
    if (!versionId) {
      return res.status(400).json({ ok: false, error: 'Не указан ID версии' });
    }

    const version = loadVersion(companyId, versionId);
    if (!version) {
      return res.status(404).json({ ok: false, error: 'Версия не найдена' });
    }

    res.json({ ok: true, version });
  } catch (e) {
    console.error('Ошибка загрузки версии:', e);
    res.status(500).json({ ok: false, error: 'load_version_failed' });
  }
});

// Удалить версию графика (требуется авторизация, только админы)
app.delete('/api/versions/:versionId', requireAuth, requireAdmin, (req, res) => {
  try {
    const companyId = req.query.company;
    const versionId = req.params.versionId;
    
    if (!companyId || !isValidCompanyId(companyId)) {
      return res.status(400).json({ ok: false, error: 'Не указан или неверный ID компании' });
    }
    
    if (!versionId) {
      return res.status(400).json({ ok: false, error: 'Не указан ID версии' });
    }

    deleteVersion(companyId, versionId);
    
    // Логируем удаление версии
    const userName = req.body.userName || req.headers['x-user-name'] || 'Администратор';
    addLog(userName, 'Удалил версию графика', `Компания: ${companyId}, Версия: ${versionId}`, companyId);
    
    res.json({ ok: true, message: 'Версия удалена' });
  } catch (e) {
    console.error('Ошибка удаления версии:', e);
    res.status(500).json({ ok: false, error: 'delete_version_failed' });
  }
});

// Восстановить график из версии (требуется авторизация, только админы)
app.post('/api/versions/:versionId/restore', requireAuth, requireAdmin, (req, res) => {
  try {
    const companyId = req.query.company;
    const versionId = req.params.versionId;
    
    if (!companyId || !isValidCompanyId(companyId)) {
      return res.status(400).json({ ok: false, error: 'Не указан или неверный ID компании' });
    }
    
    if (!versionId) {
      return res.status(400).json({ ok: false, error: 'Не указан ID версии' });
    }

    const version = loadVersion(companyId, versionId);
    if (!version) {
      return res.status(404).json({ ok: false, error: 'Версия не найдена' });
    }

    // Восстанавливаем график
    const dataFile = getCompanyDataFile(companyId);
    fs.writeFileSync(dataFile, JSON.stringify(version.ganttState, null, 2), 'utf8');
    
    // Восстанавливаем информацию о компании, если она есть
    if (version.companyInfo) {
      const infoFile = getCompanyInfoFile(companyId);
      fs.writeFileSync(infoFile, JSON.stringify(version.companyInfo, null, 2), 'utf8');
    }
    
    // Логируем восстановление версии
    const userName = req.body.userName || req.headers['x-user-name'] || 'Администратор';
    addLog(userName, 'Восстановил график из версии', `Компания: ${companyId}, Версия: ${versionId} (${version.dateTime})`, companyId);
    
    res.json({ ok: true, message: 'График восстановлен из версии' });
  } catch (e) {
    console.error('Ошибка восстановления версии:', e);
    res.status(500).json({ ok: false, error: 'restore_version_failed' });
  }
});

// Получить список всех версий всех компаний (требуется авторизация, только админы)
app.get('/api/versions/all', requireAuth, requireAdmin, (req, res) => {
  try {
    // Получаем список всех компаний
    let companies = [];
    if (fs.existsSync(COMPANIES_FILE)) {
      const raw = fs.readFileSync(COMPANIES_FILE, 'utf8');
      companies = safeJsonParse(raw) || [];
    }
    
    const allVersions = [];
    
    for (const company of companies) {
      const versions = getVersions(company.id);
      if (versions.length > 0) {
        allVersions.push({
          companyId: company.id,
          companyName: company.name || company.id,
          versions: versions
        });
      }
    }
    
    res.json({ ok: true, companies: allVersions });
  } catch (e) {
    console.error('Ошибка получения всех версий:', e);
    res.status(500).json({ ok: false, error: 'load_all_versions_failed' });
  }
});

// ========== API ДЛЯ РАБОТЫ СО СКЕЛЕТОМ ГРАФИКА ==========

// Получить скелет графика по типу (опциональная авторизация для режима просмотра)
app.get('/api/gantt-skeleton', optionalAuth, (req, res) => {
  try {
    const chartType = req.query.chartType || 'icona';
    const skeletonFile = path.join(__dirname, `gantt-skeleton-${chartType}.json`);
    
    if (!fs.existsSync(skeletonFile)) {
      // Если файл не существует, возвращаем пустой массив
      return res.json({ chartType, skeleton: [] });
    }
    
    const raw = fs.readFileSync(skeletonFile, 'utf8');
    const data = safeJsonParse(raw);
    res.json({ 
      chartType, 
      skeleton: data.skeleton || [],
      columns: data.columns || null
    });
  } catch (e) {
    console.error('Ошибка загрузки скелета:', e);
    res.status(500).json({ ok: false, error: 'load_failed' });
  }
});

// Сохранить скелет графика (требуется авторизация, только админы)
app.post('/api/gantt-skeleton', requireAuth, requireAdmin, (req, res) => {
  try {
    const { chartType, skeleton, columns, containerName, chartTypeName } = req.body;
    
    if (!chartType) {
      return res.status(400).json({ ok: false, error: 'Тип графика обязателен' });
    }
    
    if (!Array.isArray(skeleton)) {
      return res.status(400).json({ ok: false, error: 'Скелет должен быть массивом' });
    }
    
    const skeletonFile = path.join(__dirname, `gantt-skeleton-${chartType}.json`);
    const dataToSave = {
      chartType,
      skeleton,
      updatedAt: new Date().toISOString()
    };
    
    // Сохраняем метаданные столбцов, если они переданы
    if (columns && Array.isArray(columns)) {
      dataToSave.columns = columns;
    }
    
    // Если переданы метаданные, обновляем список типов графиков
    if (containerName && chartTypeName) {
      let chartTypes = [];
      if (fs.existsSync(CHART_TYPES_FILE)) {
        const raw = fs.readFileSync(CHART_TYPES_FILE, 'utf8');
        chartTypes = safeJsonParse(raw);
      }
      
      // Проверяем, существует ли уже такой тип
      const existingIndex = chartTypes.findIndex(ct => ct.id === chartType);
      const chartTypeData = {
        id: chartType,
        containerName,
        chartTypeName,
        createdAt: existingIndex >= 0 ? chartTypes[existingIndex].createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      if (existingIndex >= 0) {
        chartTypes[existingIndex] = chartTypeData;
      } else {
        chartTypes.push(chartTypeData);
      }
      
      fs.writeFileSync(CHART_TYPES_FILE, JSON.stringify(chartTypes, null, 2), 'utf8');
      console.log(`✅ Тип графика ${chartType} обновлён в списке типов`);
    }
    
    fs.writeFileSync(skeletonFile, JSON.stringify(dataToSave, null, 2), 'utf8');
    console.log(`✅ Скелет для ${chartType} сохранён, задач:`, skeleton.length);
    
    // Логируем сохранение скелета (только если пользователь определен)
    const userName = req.body.userName || req.headers['x-user-name'] || null;
    if (userName) {
      addLog(userName, 'Сохранил скелет графика', `Тип: ${chartType}, задач: ${skeleton.length}`, null);
    }
    
    res.json({ ok: true, chartType, taskCount: skeleton.length });
  } catch (e) {
    console.error('Ошибка сохранения скелета:', e);
    res.status(500).json({ ok: false, error: 'save_failed', message: e.message });
  }
});

// Получить список всех типов графиков (опциональная авторизация для режима просмотра)
app.get('/api/chart-types', optionalAuth, (req, res) => {
  try {
    if (!fs.existsSync(CHART_TYPES_FILE)) {
      // Создаём дефолтные типы, если файла нет
      const defaultTypes = [
        { id: 'icona', containerName: 'Icona', chartTypeName: 'Внедрение Icona', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: 'praktis', containerName: 'Praktis ID', chartTypeName: 'Внедрение Praktis ID', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      ];
      // ВАЖНО: Не перезаписываем файл, если он уже существует в репозитории
      // Файл chart-types.json должен быть закоммичен в репозиторий для сохранения всех контейнеров
      console.log('⚠️ Файл chart-types.json не найден. Создаю дефолтные типы. Убедитесь, что файл chart-types.json закоммичен в репозиторий!');
      fs.writeFileSync(CHART_TYPES_FILE, JSON.stringify(defaultTypes, null, 2), 'utf8');
      return res.json(defaultTypes);
    }
    
    const raw = fs.readFileSync(CHART_TYPES_FILE, 'utf8');
    const chartTypes = safeJsonParse(raw);
    
    // Проверяем, что файл не пустой и содержит валидные данные
    if (!Array.isArray(chartTypes) || chartTypes.length === 0) {
      console.warn('⚠️ Файл chart-types.json пустой или содержит невалидные данные. Используем дефолтные типы.');
      const defaultTypes = [
        { id: 'icona', containerName: 'Icona', chartTypeName: 'Внедрение Icona', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: 'praktis', containerName: 'Praktis ID', chartTypeName: 'Внедрение Praktis ID', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      ];
      return res.json(defaultTypes);
    }
    
    res.json(chartTypes);
  } catch (e) {
    console.error('Ошибка загрузки типов графиков:', e);
    // В случае ошибки возвращаем дефолтные типы
    const defaultTypes = [
      { id: 'icona', containerName: 'Icona', chartTypeName: 'Внедрение Icona', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'praktis', containerName: 'Praktis ID', chartTypeName: 'Внедрение Praktis ID', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    ];
    res.json(defaultTypes);
  }
});

// Создать новый тип графика (требуется авторизация, только админы)
app.post('/api/chart-types', requireAuth, requireAdmin, (req, res) => {
  try {
    const { containerName, chartTypeName } = req.body;
    
    if (!containerName || !chartTypeName) {
      return res.status(400).json({ ok: false, error: 'Название контейнера и типа графика обязательны' });
    }
    
    // Генерируем ID на основе названия контейнера (латиница, цифры, дефисы)
    const chartTypeId = containerName.toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    
    if (!chartTypeId) {
      return res.status(400).json({ ok: false, error: 'Некорректное название контейнера' });
    }
    
    let chartTypes = [];
    if (fs.existsSync(CHART_TYPES_FILE)) {
      const raw = fs.readFileSync(CHART_TYPES_FILE, 'utf8');
      chartTypes = safeJsonParse(raw);
    }
    
    // Проверяем, не существует ли уже такой ID
    if (chartTypes.find(ct => ct.id === chartTypeId)) {
      return res.status(400).json({ ok: false, error: 'Тип графика с таким ID уже существует' });
    }
    
    const newChartType = {
      id: chartTypeId,
      containerName,
      chartTypeName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    chartTypes.push(newChartType);
    fs.writeFileSync(CHART_TYPES_FILE, JSON.stringify(chartTypes, null, 2), 'utf8');
    
    // Логируем создание типа графика (только если пользователь определен)
    const userName = req.body.userName || req.headers['x-user-name'] || null;
    if (userName) {
      addLog(userName, 'Создал тип графика', `Тип: ${chartTypeName} (${chartTypeId}), контейнер: ${containerName}`, null);
    }
    
    // Создаём пустой скелет для нового типа
    const skeletonFile = path.join(__dirname, `gantt-skeleton-${chartTypeId}.json`);
    const emptySkeleton = {
      chartType: chartTypeId,
      skeleton: [],
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(skeletonFile, JSON.stringify(emptySkeleton, null, 2), 'utf8');
    
    console.log(`✅ Создан новый тип графика: ${chartTypeId} (${chartTypeName})`);
    res.json({ ok: true, chartType: newChartType });
  } catch (e) {
    console.error('Ошибка создания типа графика:', e);
    res.status(500).json({ ok: false, error: 'create_failed', message: e.message });
  }
});

// Удалить тип графика (требуется авторизация, только админы)
app.delete('/api/chart-types/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const chartTypeId = req.params.id;
    
    // Защита от удаления дефолтных типов
    if (chartTypeId === 'icona' || chartTypeId === 'praktis') {
      return res.status(400).json({ ok: false, error: 'Нельзя удалить стандартные типы графиков (Icona и Praktis ID)' });
    }
    
    if (!fs.existsSync(CHART_TYPES_FILE)) {
      return res.status(404).json({ ok: false, error: 'Тип графика не найден' });
    }
    
    const raw = fs.readFileSync(CHART_TYPES_FILE, 'utf8');
    let chartTypes = safeJsonParse(raw);
    
    const initialLength = chartTypes.length;
    chartTypes = chartTypes.filter(ct => ct.id !== chartTypeId);
    
    if (chartTypes.length === initialLength) {
      return res.status(404).json({ ok: false, error: 'Тип графика не найден' });
    }
    
    fs.writeFileSync(CHART_TYPES_FILE, JSON.stringify(chartTypes, null, 2), 'utf8');
    
    // Получаем информацию об удаляемом типе для лога
    const deletedType = chartTypes.find(ct => ct.id === chartTypeId);
    
    // Удаляем файл скелета
    const skeletonFile = path.join(__dirname, `gantt-skeleton-${chartTypeId}.json`);
    if (fs.existsSync(skeletonFile)) {
      fs.unlinkSync(skeletonFile);
    }
    
    console.log(`✅ Тип графика ${chartTypeId} удалён`);
    
    // Логируем удаление типа графика (только если пользователь определен)
    const userName = req.body.userName || req.headers['x-user-name'] || null;
    if (deletedType && userName) {
      addLog(userName, 'Удалил тип графика', `Тип: ${deletedType.chartTypeName || chartTypeId} (${chartTypeId})`, null);
    }
    
    res.json({ ok: true });
  } catch (e) {
    console.error('Ошибка удаления типа графика:', e);
    res.status(500).json({ ok: false, error: 'delete_failed', message: e.message });
  }
});

// получить информацию о компании (требуется авторизация или режим просмотра)
app.get('/api/company-info', optionalAuth, checkCompanyAccess, (req, res) => {
  try {
    const companyId = req.query.company;
    if (!companyId || !isValidCompanyId(companyId)) {
      return res.status(400).json({ ok: false, error: 'Не указан или неверный ID компании' });
    }

    const infoFile = getCompanyInfoFile(companyId);
    if (!fs.existsSync(infoFile)) {
      return res.json(null);
    }
    const raw = fs.readFileSync(infoFile, 'utf8');
    res.json(safeJsonParse(raw));
  } catch (e) {
    console.error('Ошибка загрузки company-info:', e);
    res.status(500).json({ ok: false, error: 'load_failed' });
  }
});

// сохранить информацию о компании (требуется авторизация и доступ к компании)
app.post('/api/company-info', requireAuth, checkCompanyAccess, (req, res) => {
  try {
    const companyId = req.query.company || req.body.company;
    if (!companyId || !isValidCompanyId(companyId)) {
      return res.status(400).json({ ok: false, error: 'Не указан или неверный ID компании' });
    }

    // ожидаем объект вида { name: string, logoData: string | null }
    const infoFile = getCompanyInfoFile(companyId);
    
    // Загружаем старую информацию для сравнения
    let oldInfo = null;
    if (fs.existsSync(infoFile)) {
      try {
        oldInfo = safeJsonParse(fs.readFileSync(infoFile, 'utf8'));
      } catch (e) {
        // Игнорируем ошибку, если файл поврежден
      }
    }
    
    fs.writeFileSync(infoFile, JSON.stringify(req.body, null, 2), 'utf8');
    
    // Логируем изменение информации о компании (только если пользователь определен)
    const userName = req.body.userName || req.headers['x-user-name'] || null;
    const changes = [];
    if (req.body.name && (!oldInfo || oldInfo.name !== req.body.name)) {
      changes.push(`Название: ${oldInfo?.name || '(не было)'} → ${req.body.name}`);
    }
    if (req.body.logoData !== undefined && (!oldInfo || oldInfo.logoData !== req.body.logoData)) {
      if (req.body.logoData) {
        changes.push('Логотип обновлен');
      } else {
        changes.push('Логотип удален');
      }
    }
    if (req.body.chartType && (!oldInfo || oldInfo.chartType !== req.body.chartType)) {
      changes.push(`Тип графика: ${oldInfo?.chartType || '(не было)'} → ${req.body.chartType}`);
    }
    if (changes.length > 0 && userName) {
      addLog(userName, 'Изменил информацию о компании', changes.join(', '), companyId);
    }
    
    res.json({ ok: true });
  } catch (e) {
    console.error('Ошибка сохранения company-info:', e);
    res.status(500).json({ ok: false, error: 'save_failed' });
  }
});

// ========== API ДЛЯ РАБОТЫ С ПОЛЬЗОВАТЕЛЯМИ ==========

// Получить список пользователей (требуется авторизация, только админы)
app.get('/api/users', requireAuth, requireAdmin, (req, res) => {
  try {
    const companyId = req.query.company; // Опционально: фильтр по компании

    if (!fs.existsSync(USERS_FILE)) {
      return res.json([]);
    }
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    let users = safeJsonParse(raw);

    // Фильтруем по компании, если указана
    if (companyId) {
      users = users.filter(u => {
        // Админы видят всех пользователей
        if (u.role === 'admin') return true;
        // Обычные пользователи только если у них есть доступ к компании
        return u.companies && u.companies.includes(companyId);
      });
    }

    // Не возвращаем пароли
    const usersWithoutPasswords = users.map(({ password, ...user }) => user);
    res.json(usersWithoutPasswords);
  } catch (e) {
    console.error('Ошибка загрузки пользователей:', e);
    res.status(500).json({ ok: false, error: 'load_failed' });
  }
});

// Добавить нового пользователя (требуется авторизация, только админы)
app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, login, password, role, companies } = req.body;

    // Валидация имени
    const nameValidation = validateString(name, 'Имя пользователя', 1, 100);
    if (!nameValidation.valid) {
      return res.status(400).json({ ok: false, error: nameValidation.error });
    }

    // Валидация логина
    const loginValidation = validateLogin(login);
    if (!loginValidation.valid) {
      return res.status(400).json({ ok: false, error: loginValidation.error });
    }

    // Валидация пароля
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ ok: false, error: passwordValidation.error });
    }

    // Валидация роли
    const roleValidation = validateRole(role || 'user');
    if (!roleValidation.valid) {
      return res.status(400).json({ ok: false, error: roleValidation.error });
    }

    // Валидация массива компаний
    const companiesValidation = validateArray(companies || [], 'Компании', 100);
    if (!companiesValidation.valid) {
      return res.status(400).json({ ok: false, error: companiesValidation.error });
    }

    // Загружаем существующих пользователей
    let users = [];
    if (fs.existsSync(USERS_FILE)) {
      const raw = fs.readFileSync(USERS_FILE, 'utf8');
      users = safeJsonParse(raw);
    }

    // Проверяем, не существует ли уже пользователь с таким логином
    if (users.some(u => u.login === loginValidation.value)) {
      return res.status(400).json({ ok: false, error: 'Пользователь с таким логином уже существует' });
    }

    // Хешируем пароль
    const hashedPassword = await bcrypt.hash(passwordValidation.value, 10);
    
    // Проверяем, что хеш создан правильно
    if (!hashedPassword || !hashedPassword.startsWith('$2')) {
      console.error('❌ Ошибка создания хеша пароля!');
      return res.status(500).json({ ok: false, error: 'Ошибка создания пароля' });
    }
    
    console.log(`🔐 Создание пользователя "${loginValidation.value}": пароль хеширован успешно`);

    // Добавляем нового пользователя
    const newUser = {
      id: Date.now().toString(),
      name: nameValidation.value,
      login: loginValidation.value,
      password: hashedPassword,
      role: roleValidation.value,
      companies: companiesValidation.value, // Массив ID компаний
      createdAt: new Date().toISOString()
    };

    users.push(newUser);

    // Сохраняем
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    console.log(`✅ Пользователь "${loginValidation.value}" успешно создан с хешированным паролем`);
    
    // Логируем создание пользователя
    const userName = req.body.userName || req.headers['x-user-name'] || 'Система';
    const companyList = companiesValidation.value.length > 0 ? companiesValidation.value.join(', ') : 'нет';
    addLog(userName, 'Создал пользователя', `Пользователь: ${nameValidation.value} (${loginValidation.value}), роль: ${roleValidation.value}, компании: ${companyList}`, null);
    
    res.json({ ok: true });
  } catch (e) {
    console.error('Ошибка добавления пользователя:', e);
    res.status(500).json({ ok: false, error: 'add_failed' });
  }
});

// Удалить пользователя (требуется авторизация, только админы)
app.delete('/api/users/:login', requireAuth, requireAdmin, (req, res) => {
  try {
    console.log('🗑️ DELETE /api/users/:login вызван');
    console.log('   Исходный параметр login:', req.params.login);
    console.log('   Тип параметра:', typeof req.params.login);
    
    let login = req.params.login;
    
    // Декодируем логин из URL
    try {
      login = decodeURIComponent(login);
      console.log('   Декодированный login:', login);
    } catch (e) {
      console.error('Ошибка декодирования логина:', e);
      // Продолжаем с исходным значением
    }
    
    // Валидация логина
    if (!login || typeof login !== 'string' || login.trim().length === 0) {
      return res.status(400).json({ ok: false, error: 'Неверный формат логина' });
    }
    
    login = login.trim();
    
    // Удаляем возможные артефакты в конце логина (например, :1, :2 и т.д.)
    // Это может быть из-за проблем с кодированием или индексацией
    if (login.includes(':')) {
      const parts = login.split(':');
      if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) {
        // Если последняя часть - это число, удаляем её
        login = parts.slice(0, -1).join(':');
        console.warn(`⚠️ Обнаружен артефакт в логине, исправлено: ${req.params.login} → ${login}`);
      }
    }
    
    const MAIN_ADMIN_LOGIN = 'Driga_VA';

    // Защита от удаления главного администратора
    if (login === MAIN_ADMIN_LOGIN) {
      return res.status(403).json({ ok: false, error: 'Нельзя удалить главного администратора' });
    }

    if (!fs.existsSync(USERS_FILE)) {
      return res.status(404).json({ ok: false, error: 'Пользователь не найден' });
    }

    let raw, users;
    try {
      raw = fs.readFileSync(USERS_FILE, 'utf8');
      users = safeJsonParse(raw);
    } catch (e) {
      console.error('Ошибка чтения файла users.json:', e);
      return res.status(500).json({ ok: false, error: 'Ошибка чтения данных пользователей' });
    }

    // Получаем информацию об удаляемом пользователе для лога ДО удаления
    console.log('   Ищем пользователя с логином:', login);
    console.log('   Всего пользователей в файле:', users.length);
    
    const deletedUser = users.find(u => {
      const match = u.login === login;
      if (match) {
        console.log('   Найден пользователь:', u.name || u.login);
      }
      return match;
    });
    
    if (!deletedUser) {
      console.log('   Пользователь не найден');
      return res.status(404).json({ ok: false, error: 'Пользователь не найден' });
    }

    const initialLength = users.length;
    users = users.filter(u => u.login !== login);

    if (users.length === initialLength) {
      console.log('   Пользователь не был удален из массива');
      return res.status(404).json({ ok: false, error: 'Пользователь не найден' });
    }
    
    console.log('   Пользователь удален из массива. Было:', initialLength, 'Стало:', users.length);
    
    try {
      fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
      console.log('   Файл users.json успешно обновлен');
    } catch (writeError) {
      console.error('   Ошибка записи файла users.json:', writeError);
      return res.status(500).json({ ok: false, error: 'Ошибка сохранения данных', details: writeError.message });
    }
    
    // Логируем удаление пользователя (оборачиваем в try-catch, чтобы ошибка логирования не прервала удаление)
    try {
      const userName = req.body.userName || req.headers['x-user-name'] || 'Система';
      addLog(userName, 'Удалил пользователя', `Пользователь: ${deletedUser.name || deletedUser.login} (${login})`, null);
    } catch (logError) {
      console.error('Ошибка при логировании удаления пользователя (не критично):', logError);
      // Продолжаем выполнение, даже если логирование не удалось
    }
    
    res.json({ ok: true });
  } catch (e) {
    console.error('Ошибка удаления пользователя:', e);
    console.error('Детали ошибки:', {
      message: e.message,
      stack: e.stack,
      login: req.params.login
    });
    res.status(500).json({ ok: false, error: 'delete_failed', details: e.message });
  }
});

// Обновление профиля пользователя (требуется авторизация, пользователь может менять только свой профиль)
app.put('/api/users/update', requireAuth, async (req, res) => {
  try {
    const { oldLogin, newLogin, name, password } = req.body;

    if (!oldLogin || !newLogin) {
      return res.status(400).json({ ok: false, error: 'Логин обязателен' });
    }
    
    // Проверяем, что пользователь меняет только свой профиль (или это админ)
    if (req.user.role !== 'admin' && req.user.login !== oldLogin) {
      return res.status(403).json({ ok: false, error: 'Вы можете изменять только свой профиль' });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ ok: false, error: 'Имя пользователя обязательно' });
    }

    if (!fs.existsSync(USERS_FILE)) {
      return res.status(404).json({ ok: false, error: 'Пользователь не найден' });
    }

    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    let users = safeJsonParse(raw);

    const userIndex = users.findIndex(u => u.login === oldLogin);
    if (userIndex === -1) {
      return res.status(404).json({ ok: false, error: 'Пользователь не найден' });
    }

    // Проверяем, не занят ли новый логин другим пользователем
    if (newLogin !== oldLogin && users.some(u => u.login === newLogin && u.login !== oldLogin)) {
      return res.status(400).json({ ok: false, error: 'Пользователь с таким логином уже существует' });
    }

    // Сохраняем старое имя для логирования
    const oldName = users[userIndex].name || '';

    // Обновляем имя пользователя
    users[userIndex].name = name.trim();

    // Обновляем логин
    users[userIndex].login = newLogin.trim();

    // Обновляем пароль, если он указан
    if (password && password.trim()) {
      const hashedPassword = await bcrypt.hash(password, 10);
      users[userIndex].password = hashedPassword;
    }

    // Сохраняем изменения
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    
    // Логируем обновление профиля
    const userName = req.body.userName || req.headers['x-user-name'] || 'Система';
    const changes = [];
    if (oldName && oldName !== name.trim()) {
      changes.push(`Имя: ${oldName} → ${name.trim()}`);
    }
    if (newLogin !== oldLogin) {
      changes.push(`Логин: ${oldLogin} → ${newLogin}`);
    }
    if (password && password.trim()) {
      changes.push('Пароль изменен');
    }
    if (changes.length > 0) {
      addLog(userName, 'Изменил профиль', changes.join(', '), null);
    }
    
    res.json({ ok: true });
  } catch (e) {
    console.error('Ошибка обновления профиля:', e);
    res.status(500).json({ ok: false, error: 'update_failed' });
  }
});

// Обновить доступ пользователя к компаниям (требуется авторизация, только админы)
app.put('/api/users/:login/companies', requireAuth, requireAdmin, (req, res) => {
  try {
    let { login } = req.params;
    
    // Декодируем логин из URL
    try {
      login = decodeURIComponent(login);
    } catch (e) {
      console.error('Ошибка декодирования логина:', e);
    }
    
    // Валидация логина
    if (!login || typeof login !== 'string' || login.trim().length === 0) {
      return res.status(400).json({ ok: false, error: 'Неверный формат логина' });
    }
    
    login = login.trim();
    
    // Удаляем возможные артефакты в конце логина (например, :1, :2 и т.д.)
    // Это может быть из-за проблем с кодированием или индексацией
    if (login.includes(':')) {
      const parts = login.split(':');
      if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) {
        // Если последняя часть - это число, удаляем её
        login = parts.slice(0, -1).join(':');
        console.warn(`⚠️ Обнаружен артефакт в логине, исправлено: ${req.params.login} → ${login}`);
      }
    }
    
    const { companies } = req.body;

    if (!Array.isArray(companies)) {
      return res.status(400).json({ ok: false, error: 'companies должен быть массивом' });
    }

    if (!fs.existsSync(USERS_FILE)) {
      return res.status(404).json({ ok: false, error: 'Пользователь не найден' });
    }

    let raw, users;
    try {
      raw = fs.readFileSync(USERS_FILE, 'utf8');
      users = safeJsonParse(raw);
    } catch (e) {
      console.error('Ошибка чтения файла users.json:', e);
      return res.status(500).json({ ok: false, error: 'Ошибка чтения данных пользователей' });
    }

    const userIndex = users.findIndex(u => u.login === login);
    if (userIndex === -1) {
      return res.status(404).json({ ok: false, error: 'Пользователь не найден' });
    }

    // Сохраняем старый список компаний для лога
    const oldCompanies = users[userIndex].companies || [];
    
    // Обновляем список компаний
    users[userIndex].companies = companies;

    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    
    // Логируем изменение доступа к компаниям
    const userName = req.body.userName || req.headers['x-user-name'] || 'Система';
    const oldList = oldCompanies.length > 0 ? oldCompanies.join(', ') : 'нет';
    const newList = companies.length > 0 ? companies.join(', ') : 'нет';
    addLog(userName, 'Изменил доступ к компаниям', `Пользователь: ${login}, компании: ${oldList} → ${newList}`, null);
    
    res.json({ ok: true });
  } catch (e) {
    console.error('Ошибка обновления доступа к компаниям:', e);
    console.error('Детали ошибки:', {
      message: e.message,
      stack: e.stack,
      login: req.params.login,
      companies: req.body.companies
    });
    res.status(500).json({ ok: false, error: 'update_failed', details: e.message });
  }
});

// Обновление пользователя админом (требуется авторизация, только админы)
app.put('/api/users/:login', requireAuth, requireAdmin, async (req, res) => {
  try {
    let { login } = req.params;
    
    // Декодируем логин из URL
    try {
      login = decodeURIComponent(login);
    } catch (e) {
      console.error('Ошибка декодирования логина:', e);
    }
    
    // Валидация логина
    if (!login || typeof login !== 'string' || login.trim().length === 0) {
      return res.status(400).json({ ok: false, error: 'Неверный формат логина' });
    }
    
    login = login.trim();
    
    // Удаляем возможные артефакты в конце логина (например, :1, :2 и т.д.)
    // Это может быть из-за проблем с кодированием или индексацией
    if (login.includes(':')) {
      const parts = login.split(':');
      if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) {
        // Если последняя часть - это число, удаляем её
        login = parts.slice(0, -1).join(':');
        console.warn(`⚠️ Обнаружен артефакт в логине, исправлено: ${req.params.login} → ${login}`);
      }
    }
    
    const { name, role, companies, password } = req.body;
    const MAIN_ADMIN_LOGIN = 'Driga_VA';

    if (!fs.existsSync(USERS_FILE)) {
      return res.status(404).json({ ok: false, error: 'Пользователь не найден' });
    }

    let raw, users;
    try {
      raw = fs.readFileSync(USERS_FILE, 'utf8');
      users = safeJsonParse(raw);
    } catch (e) {
      console.error('Ошибка чтения файла users.json:', e);
      return res.status(500).json({ ok: false, error: 'Ошибка чтения данных пользователей' });
    }

    const userIndex = users.findIndex(u => u.login === login);
    
    // Защита главного администратора: нельзя изменить роль или компании
    if (login === MAIN_ADMIN_LOGIN) {
      if (role && role !== 'admin') {
        return res.status(403).json({ ok: false, error: 'Нельзя изменить роль главного администратора' });
      }
      if (companies !== undefined) {
        return res.status(403).json({ ok: false, error: 'Нельзя изменить доступ к компаниям главного администратора' });
      }
    }
    if (userIndex === -1) {
      return res.status(404).json({ ok: false, error: 'Пользователь не найден' });
    }

    // Обновляем имя, если указано
    if (name !== undefined) {
      users[userIndex].name = name.trim();
    }

    // Обновляем роль, если указана
    if (role !== undefined && (role === 'admin' || role === 'user')) {
      users[userIndex].role = role;
    }

    // Обновляем список компаний, если указан
    if (companies !== undefined) {
      if (!Array.isArray(companies)) {
        return res.status(400).json({ ok: false, error: 'companies должен быть массивом' });
      }
      users[userIndex].companies = companies;
    }

    // Обновляем пароль, если указан
    if (password && password.trim()) {
      const trimmedPassword = password.trim();
      const hashedPassword = await bcrypt.hash(trimmedPassword, 10);
      
      // Проверяем, что хеш создан правильно
      if (!hashedPassword || !hashedPassword.startsWith('$2')) {
        console.error(`❌ Ошибка создания хеша пароля для пользователя "${login}"!`);
        return res.status(500).json({ ok: false, error: 'Ошибка создания пароля' });
      }
      
      users[userIndex].password = hashedPassword;
      console.log(`🔐 Пароль пользователя "${login}" обновлен`);
    }

    // Сохраняем старые данные для лога
    const oldUser = { ...users[userIndex] };
    
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    
    // Логируем обновление пользователя
    const userName = req.body.userName || req.headers['x-user-name'] || 'Система';
    const changes = [];
    if (name !== undefined && name !== oldUser.name) {
      changes.push(`Имя: ${oldUser.name} → ${name}`);
    }
    if (role !== undefined && role !== oldUser.role) {
      changes.push(`Роль: ${oldUser.role} → ${role}`);
    }
    if (companies !== undefined) {
      const oldList = (oldUser.companies || []).length > 0 ? oldUser.companies.join(', ') : 'нет';
      const newList = companies.length > 0 ? companies.join(', ') : 'нет';
      if (oldList !== newList) {
        changes.push(`Компании: ${oldList} → ${newList}`);
      }
    }
    if (password && password.trim()) {
      changes.push('Пароль изменен');
    }
    if (changes.length > 0) {
      addLog(userName, 'Изменил пользователя', `Пользователь: ${login}, изменения: ${changes.join(', ')}`, null);
    }
    
    res.json({ ok: true });
  } catch (e) {
    console.error('Ошибка обновления пользователя:', e);
    console.error('Детали ошибки:', {
      message: e.message,
      stack: e.stack,
      login: req.params.login,
      body: req.body
    });
    res.status(500).json({ ok: false, error: 'update_failed', details: e.message });
  }
});

// Проверка авторизации пользователя (rate limiting отключен)
app.post('/api/auth', async (req, res) => {
  try {
    const { login, password, company } = req.body;

    if (!login || !password) {
      return res.status(400).json({ ok: false, error: 'Логин и пароль обязательны' });
    }

    // Убираем пробелы в начале и конце
    const trimmedLogin = login.trim();
    const trimmedPassword = password.trim();

    if (!fs.existsSync(USERS_FILE)) {
      return res.status(401).json({ ok: false, error: 'Неверный логин или пароль' });
    }

    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    const users = safeJsonParse(raw);

    const user = users.find(u => u.login === trimmedLogin);
    if (!user) {
      console.log(`❌ Пользователь с логином "${trimmedLogin}" не найден`);
      return res.status(401).json({ ok: false, error: 'Неверный логин или пароль' });
    }

    // Проверяем формат хеша пароля
    const passwordHash = user.password || '';
    const isBcryptHash = passwordHash.startsWith('$2a$') || passwordHash.startsWith('$2b$') || passwordHash.startsWith('$2y$');
    
    if (!isBcryptHash) {
      console.error(`❌ ОШИБКА: Пароль пользователя "${trimmedLogin}" не является bcrypt хешем!`);
      console.error(`   Формат пароля: ${passwordHash.substring(0, 20)}...`);
      console.error(`   Это означает, что пароль был сохранен неправильно при создании пользователя.`);
      console.error(`   Нужно обновить пароль пользователя через админ-панель.`);
      return res.status(500).json({ ok: false, error: 'Ошибка формата пароля. Обратитесь к администратору для сброса пароля.' });
    }

    // Проверяем пароль (используем trimmed версию)
    const passwordMatch = await bcrypt.compare(trimmedPassword, user.password);
    if (!passwordMatch) {
      console.log(`❌ Неверный пароль для пользователя "${trimmedLogin}"`);
      return res.status(401).json({ ok: false, error: 'Неверный логин или пароль' });
    }

    console.log(`✅ Успешная авторизация пользователя "${trimmedLogin}"`);

    // Логируем авторизацию
    addLog(trimmedLogin, 'Авторизовался', `Вход в систему${company ? `, компания: ${company}` : ''}`, company || null);

    // Если указана компания, проверяем доступ пользователя к ней
    if (company) {
      // Админы имеют доступ ко всем компаниям
      if (user.role !== 'admin') {
        const userCompanies = user.companies || [];
        if (!userCompanies.includes(company)) {
          return res.status(403).json({ ok: false, error: 'У вас нет доступа к этой компании' });
        }
      }
    }

    // Возвращаем данные пользователя без пароля
    const { password: _, ...userWithoutPassword } = user;
    res.json({ ok: true, user: userWithoutPassword });
  } catch (e) {
    console.error('Ошибка авторизации:', e);
    res.status(500).json({ ok: false, error: 'auth_failed' });
  }
});

// Эндпоинт для проверки работоспособности (для cron-запросов)
// Помогает поддерживать сервис активным на Render.com
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Отдельный endpoint для cron-запросов (без редиректов, минимальный ответ)
// Используйте этот endpoint в cron-сервисах для поддержания активности
app.get('/cron-ping', (req, res) => {
  // Опциональная проверка токена (если нужна защита)
  const token = req.query.token;
  const expectedToken = process.env.CRON_TOKEN;
  
  // Если токен настроен, проверяем его
  if (expectedToken && token !== expectedToken) {
    return res.status(401).json({ 
      status: 'error', 
      message: 'Invalid token' 
    });
  }
  
  // Возвращаем минимальный JSON-ответ без редиректов
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString()
  });
});

// Глобальный обработчик ошибок для необработанных исключений
process.on('uncaughtException', (error) => {
  console.error('❌ Необработанное исключение:', error);
  console.error('   Стек:', error.stack);
  // Не завершаем процесс, чтобы сервер продолжал работать
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Необработанное отклонение промиса:', reason);
  console.error('   Промис:', promise);
  // Не завершаем процесс, чтобы сервер продолжал работать
});

// Обработчик ошибок для Express
app.use((err, req, res, next) => {
  console.error('❌ Ошибка Express:', err);
  console.error('   URL:', req.url);
  console.error('   Метод:', req.method);
  console.error('   Стек:', err.stack);
  
  if (!res.headersSent) {
    res.status(500).json({ 
      ok: false, 
      error: 'internal_server_error',
      message: process.env.NODE_ENV === 'production' ? 'Внутренняя ошибка сервера' : err.message
    });
  }
});

// ========== API ДЛЯ РАБОТЫ С ЛОГАМИ ==========

// Получить логи активности (требуется авторизация, только админы)
app.get('/api/activity-logs', requireAuth, requireAdmin, (req, res) => {
  try {
    const { companyId, userName, limit = 1000, offset = 0 } = req.query;
    let logs = readLogs();
    
    // Фильтрация по компании
    if (companyId) {
      logs = logs.filter(log => log.companyId === companyId);
    }
    
    // Фильтрация по пользователю
    if (userName) {
      logs = logs.filter(log => log.userName.toLowerCase().includes(userName.toLowerCase()));
    }
    
    // Сортировка по дате (новые сначала)
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Пагинация
    const total = logs.length;
    const paginatedLogs = logs.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
    
    res.json({ 
      ok: true, 
      logs: paginatedLogs, 
      total: total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (e) {
    console.error('Ошибка получения логов:', e);
    res.status(500).json({ ok: false, error: 'load_failed' });
  }
});

// Очистить логи (требуется авторизация, только админы)
app.delete('/api/activity-logs', requireAuth, requireAdmin, (req, res) => {
  try {
    writeLogs([]);
    res.json({ ok: true, message: 'Логи очищены' });
  } catch (e) {
    console.error('Ошибка очистки логов:', e);
    res.status(500).json({ ok: false, error: 'clear_failed' });
  }
});

// ========== API ДЛЯ БЭКАПА КОМПАНИЙ ==========

// Экспорт данных компании (требуется авторизация и доступ к компании)
app.get('/api/company-backup', requireAuth, checkCompanyAccess, (req, res) => {
  try {
    const companyId = req.query.company;
    
    if (!companyId || !isValidCompanyId(companyId)) {
      return res.status(400).json({ ok: false, error: 'Не указан или неверный ID компании' });
    }

    const dataFile = getCompanyDataFile(companyId);
    const infoFile = getCompanyInfoFile(companyId);
    
    // Читаем данные графика
    let ganttState = null;
    if (fs.existsSync(dataFile)) {
      const raw = fs.readFileSync(dataFile, 'utf8');
      ganttState = safeJsonParse(raw);
    }
    
    // Читаем информацию о компании
    let companyInfo = null;
    if (fs.existsSync(infoFile)) {
      const raw = fs.readFileSync(infoFile, 'utf8');
      companyInfo = safeJsonParse(raw);
    }
    
    // Формируем объект бэкапа
    const backup = {
      version: '1.0',
      companyId: companyId,
      exportedAt: new Date().toISOString(),
      ganttState: ganttState,
      companyInfo: companyInfo
    };
    
    // Отправляем как JSON файл для скачивания
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="backup-${companyId}-${new Date().toISOString().split('T')[0]}.json"`);
    res.json(backup);
    
    console.log(`✅ Бэкап компании ${companyId} экспортирован`);
  } catch (e) {
    console.error('Ошибка экспорта бэкапа:', e);
    res.status(500).json({ ok: false, error: 'export_failed', message: e.message });
  }
});

// Импорт данных компании (требуется авторизация и доступ к компании)
app.post('/api/company-restore', requireAuth, checkCompanyAccess, (req, res) => {
  try {
    const backup = req.body;
    
    if (!backup || !backup.companyId) {
      return res.status(400).json({ ok: false, error: 'Неверный формат бэкапа: отсутствует ID компании' });
    }
    
    const companyId = backup.companyId;
    
    if (!isValidCompanyId(companyId)) {
      return res.status(400).json({ ok: false, error: 'Неверный ID компании в бэкапе' });
    }
    
    // Проверяем наличие данных для восстановления
    if (!backup.ganttState && !backup.companyInfo) {
      return res.status(400).json({ ok: false, error: 'Бэкап не содержит данных для восстановления' });
    }
    
    // Сравниваем данные с текущими на сервере
    const dataFile = getCompanyDataFile(companyId);
    const infoFile = getCompanyInfoFile(companyId);
    
    let currentGanttState = null;
    let currentCompanyInfo = null;
    
    if (fs.existsSync(dataFile)) {
      const raw = fs.readFileSync(dataFile, 'utf8');
      currentGanttState = safeJsonParse(raw);
    }
    
    if (fs.existsSync(infoFile)) {
      const raw = fs.readFileSync(infoFile, 'utf8');
      currentCompanyInfo = safeJsonParse(raw);
    }
    
    // Функция для глубокого сравнения объектов (игнорируя порядок ключей)
    function deepEqual(obj1, obj2) {
      // Строгое равенство
      if (obj1 === obj2) return true;
      
      // Проверка на null/undefined
      if (obj1 == null || obj2 == null) return obj1 === obj2;
      
      // Проверка типов
      if (typeof obj1 !== typeof obj2) return false;
      
      // Примитивные типы
      if (typeof obj1 !== 'object') return obj1 === obj2;
      
      // Массивы
      if (Array.isArray(obj1) && Array.isArray(obj2)) {
        if (obj1.length !== obj2.length) return false;
        for (let i = 0; i < obj1.length; i++) {
          if (!deepEqual(obj1[i], obj2[i])) return false;
        }
        return true;
      }
      
      // Если один массив, а другой нет
      if (Array.isArray(obj1) || Array.isArray(obj2)) return false;
      
      // Объекты
      const keys1 = Object.keys(obj1).sort();
      const keys2 = Object.keys(obj2).sort();
      
      if (keys1.length !== keys2.length) return false;
      
      for (let key of keys1) {
        if (!keys2.includes(key)) return false;
        if (!deepEqual(obj1[key], obj2[key])) return false;
      }
      
      return true;
    }
    
    // Проверяем, есть ли изменения
    let ganttStateChanged = false;
    let companyInfoChanged = false;
    
    if (backup.ganttState) {
      ganttStateChanged = !deepEqual(backup.ganttState, currentGanttState);
      console.log(`📊 Сравнение графика для ${companyId}:`, {
        hasBackup: !!backup.ganttState,
        hasCurrent: !!currentGanttState,
        changed: ganttStateChanged
      });
    }
    
    if (backup.companyInfo) {
      companyInfoChanged = !deepEqual(backup.companyInfo, currentCompanyInfo);
      console.log(`📊 Сравнение информации о компании для ${companyId}:`, {
        hasBackup: !!backup.companyInfo,
        hasCurrent: !!currentCompanyInfo,
        changed: companyInfoChanged
      });
    }
    
    const hasChanges = ganttStateChanged || companyInfoChanged;
    
    console.log(`📊 Результат сравнения для ${companyId}:`, {
      ganttStateChanged,
      companyInfoChanged,
      hasChanges
    });
    
    // Если изменений нет, возвращаем информацию об этом
    if (!hasChanges) {
      console.log(`✅ Данные идентичны для компании ${companyId}, возвращаем noChanges: true`);
      return res.json({ 
        ok: true, 
        message: 'Данные идентичны текущим на сервере',
        noChanges: true,
        companyId: companyId,
        restored: {
          ganttState: !!backup.ganttState,
          companyInfo: !!backup.companyInfo
        }
      });
    }
    
    // Восстанавливаем график (только если есть изменения)
    if (backup.ganttState && ganttStateChanged) {
      const dir = path.dirname(dataFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(dataFile, JSON.stringify(backup.ganttState, null, 2), 'utf8');
      console.log(`✅ График компании ${companyId} восстановлен из бэкапа`);
    }
    
    // Восстанавливаем информацию о компании (только если есть изменения)
    if (backup.companyInfo && companyInfoChanged) {
      const dir = path.dirname(infoFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(infoFile, JSON.stringify(backup.companyInfo, null, 2), 'utf8');
      console.log(`✅ Информация о компании ${companyId} восстановлена из бэкапа`);
    }
    
    // Проверяем, существует ли компания в списке компаний
    let companies = [];
    if (fs.existsSync(COMPANIES_FILE)) {
      const raw = fs.readFileSync(COMPANIES_FILE, 'utf8');
      companies = safeJsonParse(raw);
    }
    
    const companyExists = companies.some(c => c.id === companyId);
    if (!companyExists && backup.companyInfo) {
      // Добавляем компанию в список, если её нет
      companies.push({
        id: companyId,
        name: backup.companyInfo.name || companyId,
        createdAt: new Date().toISOString()
      });
      fs.writeFileSync(COMPANIES_FILE, JSON.stringify(companies, null, 2), 'utf8');
      console.log(`✅ Компания ${companyId} добавлена в список компаний`);
    }
    
    res.json({ 
      ok: true, 
      message: 'Бэкап успешно восстановлен',
      companyId: companyId,
      restored: {
        ganttState: !!backup.ganttState,
        companyInfo: !!backup.companyInfo
      }
    });
  } catch (e) {
    console.error('Ошибка восстановления бэкапа:', e);
    res.status(500).json({ ok: false, error: 'restore_failed', message: e.message });
  }
});

// ========== ЗАГОЛОВКИ БЕЗОПАСНОСТИ ==========
// Middleware для установки заголовков безопасности
app.use((req, res, next) => {
  // Принудительный HTTPS в продакшене
  if (process.env.NODE_ENV === 'production') {
    // Проверяем, используется ли HTTPS (через прокси или напрямую)
    const isSecure = req.secure || 
                     req.header('x-forwarded-proto') === 'https' ||
                     req.header('x-forwarded-ssl') === 'on';
    
    if (!isSecure && req.method !== 'GET') {
      // Для POST/PUT/DELETE запросов в продакшене требуем HTTPS
      return res.status(403).json({ 
        ok: false, 
        error: 'HTTPS required in production' 
      });
    }
  }
  
  // Заголовки безопасности
  res.setHeader('X-Content-Type-Options', 'nosniff'); // Запрет MIME-sniffing
  res.setHeader('X-Frame-Options', 'SAMEORIGIN'); // Защита от clickjacking (SAMEORIGIN для встраивания в iframe на том же домене)
  res.setHeader('X-XSS-Protection', '1; mode=block'); // Защита от XSS (для старых браузеров)
  
  // Content Security Policy (базовая, можно расширить)
  // Разрешаем только ресурсы с того же домена + cdnjs.cloudflare.com для html2pdf.js
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self';");
  
  // Strict Transport Security (только для HTTPS)
  if (req.secure || req.header('x-forwarded-proto') === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions Policy (бывший Feature-Policy)
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  next();
});

// ========== СТАТИЧЕСКИЕ ФАЙЛЫ (после всех API маршрутов) ==========
// Редирект с корня на страницу авторизации
// Middleware для отключения кэширования HTML файлов
app.use((req, res, next) => {
  if (req.path.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.redirect('/auth.html');
});

// отдаём статику из текущей директории (где находится server.js)
app.use(express.static(__dirname));

// Логирование для отладки (только в development)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`📄 Запрос: ${req.method} ${req.path}`);
    next();
  });
}

// Инициализация главного администратора
async function initializeMainAdmin() {
  try {
    const MAIN_ADMIN_LOGIN = 'Driga_VA';
    
    // Пароль главного админа (можно изменить через переменную окружения)
    // Дефолтный пароль: Admin2024!
    const defaultPassword = process.env.MAIN_ADMIN_PASSWORD || 'Admin2024!';
    const mainAdminPasswordHash = await bcrypt.hash(defaultPassword, 10);

    if (!fs.existsSync(USERS_FILE)) {
      // Создаём файл с главным админом
      const mainAdmin = {
        login: MAIN_ADMIN_LOGIN,
        name: 'Главный администратор',
        password: mainAdminPasswordHash,
        role: 'admin',
        companies: [] // Админы имеют доступ ко всем компаниям
      };
      fs.writeFileSync(USERS_FILE, JSON.stringify([mainAdmin], null, 2), 'utf8');
      console.log(`✅ Главный администратор "${MAIN_ADMIN_LOGIN}" создан`);
      return;
    }

    // Проверяем, существует ли главный админ
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    const users = safeJsonParse(raw);
    const mainAdminExists = users.some(u => u.login === MAIN_ADMIN_LOGIN);

    if (!mainAdminExists) {
      // Добавляем главного админа
      const mainAdmin = {
        login: MAIN_ADMIN_LOGIN,
        name: 'Главный администратор',
        password: mainAdminPasswordHash,
        role: 'admin',
        companies: []
      };
      users.push(mainAdmin);
      fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
      console.log(`✅ Главный администратор "${MAIN_ADMIN_LOGIN}" добавлен`);
    } else {
      // Обновляем данные главного админа (роль и компании), но сохраняем существующий пароль
      const mainAdminIndex = users.findIndex(u => u.login === MAIN_ADMIN_LOGIN);
      if (mainAdminIndex !== -1) {
        // Убеждаемся, что роль админа сохранена и компании пустые
        users[mainAdminIndex].role = 'admin';
        users[mainAdminIndex].companies = [];
        
        // Обновляем пароль только если указана переменная окружения (для восстановления)
        if (process.env.MAIN_ADMIN_PASSWORD) {
          users[mainAdminIndex].password = mainAdminPasswordHash;
          console.log(`⚠️  Пароль главного администратора обновлён из переменной окружения`);
        }
        
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
      }
    }
  } catch (error) {
    console.error('❌ Ошибка инициализации главного администратора:', error);
  }
}

    // Инициализируем главного админа перед запуском сервера
initializeMainAdmin()
  .then(() => {
    // Проверяем наличие основных файлов
    const requiredFiles = ['auth.html', 'companies.html', 'admin.html', 'implementation_schedule.html'];
    const missingFiles = requiredFiles.filter(file => !fs.existsSync(path.join(__dirname, file)));
    
    if (missingFiles.length > 0) {
      console.warn(`⚠️  Предупреждение: не найдены файлы: ${missingFiles.join(', ')}`);
      console.log(`📁 Текущая директория: ${__dirname}`);
      try {
        const dirContents = fs.readdirSync(__dirname);
        console.log(`📁 Содержимое директории:`, dirContents.join(', '));
      } catch (e) {
        console.error('❌ Ошибка чтения директории:', e);
      }
    }
    
    // Обработка ошибок при запуске
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Сервер диаграммы Ганта запущен на порту ${PORT}`);
      console.log(`📁 Данные сохраняются в: ${__dirname}`);
      try {
        const dirContents = fs.readdirSync(__dirname).filter(f => !f.startsWith('.') && f !== 'node_modules');
        console.log(`📁 Содержимое директории:`, dirContents.join(', '));
      } catch (e) {
        console.warn('⚠️  Не удалось прочитать содержимое директории:', e.message);
      }
      
      // Настраиваем автоматическое сохранение версий
      setupAutoSaveSchedule();
      console.log(`\n📋 Доступные страницы:`);
      console.log(`   • Авторизация: http://localhost:${PORT}/auth.html`);
      console.log(`   • Админ-панель: http://localhost:${PORT}/admin.html`);
      console.log(`   • График Ганта: http://localhost:${PORT}/implementation_schedule.html`);
      console.log(`\n💡 После деплоя замените localhost на ваш домен`);
      console.log(`\n🔐 Главный администратор: Driga_VA`);
      console.log(`   Пароль по умолчанию: Admin2024!`);
      console.log(`   Для изменения используйте переменную окружения MAIN_ADMIN_PASSWORD`);
    }).on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Порт ${PORT} уже занят. Используйте другой порт или остановите процесс, занимающий этот порт.`);
      } else {
        console.error('❌ Ошибка сервера:', err);
      }
      process.exit(1);
    });
  })
  .catch((error) => {
    console.error('❌ Критическая ошибка при инициализации сервера:', error);
    console.error('   Стек ошибки:', error.stack);
    // Пытаемся запустить сервер даже при ошибке инициализации админа
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`⚠️  Сервер запущен с ошибкой инициализации на порту ${PORT}`);
      console.log(`   Проверьте логи выше для диагностики проблемы`);
    }).on('error', (err) => {
      console.error('❌ Не удалось запустить сервер:', err);
      process.exit(1);
    });
  });