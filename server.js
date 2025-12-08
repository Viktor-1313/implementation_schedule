const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

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
    const logs = JSON.parse(raw);
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
    console.log('📝 addLog вызвана:', { userName, action, details, companyId, detailedChanges: detailedChanges ? detailedChanges.length : 0 });
    const logs = readLogs();
    console.log('   Текущее количество логов:', logs.length);
    
    const logEntry = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      userName: userName || 'Неизвестный пользователь',
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

// парсим JSON и разрешаем запросы с файловой страницы
app.use(cors());
// Увеличиваем лимит размера тела запроса до 10MB для загрузки изображений
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ========== API МАРШРУТЫ (должны быть ПЕРЕД статикой) ==========

// ========== API ДЛЯ РАБОТЫ С КОМПАНИЯМИ ==========

// Получить список всех компаний (только для админов)
app.get('/api/companies', (req, res) => {
  try {
    if (!fs.existsSync(COMPANIES_FILE)) {
      return res.json([]);
    }
    const raw = fs.readFileSync(COMPANIES_FILE, 'utf8');
    const companies = JSON.parse(raw);
    // Фильтруем архивированные компании - они не должны показываться в основном списке
    const activeCompanies = companies.filter(c => !c.archived);
    res.json(activeCompanies);
  } catch (e) {
    console.error('Ошибка загрузки компаний:', e);
    res.status(500).json({ ok: false, error: 'load_failed' });
  }
});

// Создать новую компанию
app.post('/api/companies', (req, res) => {
  try {
    const { id, name } = req.body;

    if (!id || !name) {
      return res.status(400).json({ ok: false, error: 'ID и название компании обязательны' });
    }

    if (!isValidCompanyId(id)) {
      return res.status(400).json({ ok: false, error: 'ID компании может содержать только латинские буквы, цифры, дефисы и подчеркивания' });
    }

    // Загружаем существующие компании
    let companies = [];
    if (fs.existsSync(COMPANIES_FILE)) {
      const raw = fs.readFileSync(COMPANIES_FILE, 'utf8');
      companies = JSON.parse(raw);
    }

    // Проверяем, не существует ли уже компания с таким ID
    if (companies.some(c => c.id === id)) {
      return res.status(400).json({ ok: false, error: 'Компания с таким ID уже существует' });
    }

    // Добавляем новую компанию
    const newCompany = {
      id: id.trim(),
      name: name.trim(),
      createdAt: new Date().toISOString()
    };

    companies.push(newCompany);

    // Сохраняем
    fs.writeFileSync(COMPANIES_FILE, JSON.stringify(companies, null, 2), 'utf8');
    
    // Логируем создание компании
    const userName = req.body.userName || req.headers['x-user-name'] || 'Неизвестный пользователь';
    addLog(userName, 'Создал компанию', `Компания: ${name} (ID: ${id})`, id);
    
    res.json({ ok: true, company: newCompany });
  } catch (e) {
    console.error('Ошибка создания компании:', e);
    res.status(500).json({ ok: false, error: 'create_failed' });
  }
});

// Обновить порядок компаний (должен быть ПЕРЕД /api/companies/:id)
app.put('/api/companies/order', (req, res) => {
  try {
    const { companyIds } = req.body;
    
    if (!Array.isArray(companyIds)) {
      return res.status(400).json({ ok: false, error: 'companyIds должен быть массивом' });
    }

    if (!fs.existsSync(COMPANIES_FILE)) {
      return res.status(404).json({ ok: false, error: 'Файл компаний не найден' });
    }

    const raw = fs.readFileSync(COMPANIES_FILE, 'utf8');
    let companies = JSON.parse(raw);

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

// Обновить компанию (изменить ID и/или название)
app.put('/api/companies/:id', (req, res) => {
  try {
    const oldCompanyId = req.params.id;
    const { id: newCompanyId, name } = req.body;
    console.log('📝 PUT /api/companies/:id', { oldCompanyId, newCompanyId, name });

    if (!fs.existsSync(COMPANIES_FILE)) {
      return res.status(404).json({ ok: false, error: 'Компания не найдена' });
    }

    const raw = fs.readFileSync(COMPANIES_FILE, 'utf8');
    let companies = JSON.parse(raw);

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
    
    // Логируем изменение компании
    const userName = req.body.userName || req.headers['x-user-name'] || 'Неизвестный пользователь';
    const changes = [];
    if (newCompanyId && newCompanyId !== oldCompanyId) {
      changes.push(`ID: ${oldCompanyId} → ${newCompanyId}`);
    }
    if (name) {
      changes.push(`Название: ${name}`);
    }
    addLog(userName, 'Изменил компанию', changes.join(', ') || 'Изменения не указаны', newCompanyId || oldCompanyId);
    
    res.json({ ok: true, company: companies[companyIndex] });
  } catch (e) {
    console.error('Ошибка обновления компании:', e);
    res.status(500).json({ ok: false, error: 'update_failed' });
  }
});

// Удалить компанию
app.delete('/api/companies/:id', (req, res) => {
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
      companies = JSON.parse(raw);
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
    
    // Логируем удаление компании
    console.log('   📝 Логирование удаления компании...');
    try {
      const userName = req.body.userName || req.headers['x-user-name'] || 'Неизвестный пользователь';
      const logResult = addLog(userName, 'Удалил компанию', `Компания: ${deletedCompany.name || companyId} (ID: ${companyId})`, companyId);
      if (logResult) {
        console.log('   ✅ Лог добавлен успешно');
      } else {
        console.warn('   ⚠️ Не удалось добавить лог, но это не критично');
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

// Архивировать компанию
app.post('/api/companies/:id/archive', (req, res) => {
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
      companies = JSON.parse(raw);
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
      const userName = req.body.userName || req.headers['x-user-name'] || 'Неизвестный пользователь';
      const logResult = addLog(userName, 'Архивировал компанию', `Компания: ${company.name || companyId} (ID: ${companyId})`, companyId);
      if (logResult) {
        console.log('   ✅ Лог добавлен успешно');
      } else {
        console.warn('   ⚠️ Не удалось добавить лог, но это не критично');
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

// Восстановить компанию из архива
app.post('/api/companies/:id/restore', (req, res) => {
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
      companies = JSON.parse(raw);
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
      const userName = req.body.userName || req.headers['x-user-name'] || 'Неизвестный пользователь';
      const logResult = addLog(userName, 'Восстановил компанию из архива', `Компания: ${company.name || companyId} (ID: ${companyId})`, companyId);
      if (logResult) {
        console.log('   ✅ Лог добавлен успешно');
      } else {
        console.warn('   ⚠️ Не удалось добавить лог, но это не критично');
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

// Получить архивированные компании
app.get('/api/companies/archived', (req, res) => {
  try {
    if (!fs.existsSync(COMPANIES_FILE)) {
      return res.json({ ok: true, companies: [] });
    }

    const raw = fs.readFileSync(COMPANIES_FILE, 'utf8');
    const companies = JSON.parse(raw);

    // Фильтруем только архивированные компании
    const archivedCompanies = companies.filter(c => c.archived === true);

    // Загружаем информацию о компаниях (логотипы)
    const companiesWithInfo = archivedCompanies.map(company => {
      const infoFile = getCompanyInfoFile(company.id);
      if (fs.existsSync(infoFile)) {
        try {
          const infoData = JSON.parse(fs.readFileSync(infoFile, 'utf8'));
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

// получить сохранённое состояние графика
app.get('/api/gantt-state', (req, res) => {
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
    res.json(JSON.parse(raw));
  } catch (e) {
    console.error('Ошибка загрузки gantt-state:', e);
    res.status(500).json({ ok: false, error: 'load_failed' });
  }
});

// сохранить состояние графика
app.post('/api/gantt-state', (req, res) => {
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
    
    // Если и userName, и userLogin не определены, это проблема
    if (userName === 'Неизвестный пользователь' && !userLogin) {
      console.error('❌ КРИТИЧЕСКАЯ ПРОБЛЕМА: Пользователь не определен!');
      console.error('   req.body.userName:', req.body.userName);
      console.error('   req.headers[x-user-name]:', req.headers['x-user-name']);
      console.error('   req.body.userLogin:', req.body.userLogin);
    }
    
    // Получаем название компании для лога
    let companyName = companyId;
    try {
      const companiesFile = path.join(__dirname, 'companies.json');
      if (fs.existsSync(companiesFile)) {
        const companies = JSON.parse(fs.readFileSync(companiesFile, 'utf8'));
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

// ========== API ДЛЯ РАБОТЫ СО СКЕЛЕТОМ ГРАФИКА ==========

// Получить скелет графика по типу
app.get('/api/gantt-skeleton', (req, res) => {
  try {
    const chartType = req.query.chartType || 'icona';
    const skeletonFile = path.join(__dirname, `gantt-skeleton-${chartType}.json`);
    
    if (!fs.existsSync(skeletonFile)) {
      // Если файл не существует, возвращаем пустой массив
      return res.json({ chartType, skeleton: [] });
    }
    
    const raw = fs.readFileSync(skeletonFile, 'utf8');
    const data = JSON.parse(raw);
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

// Сохранить скелет графика
app.post('/api/gantt-skeleton', (req, res) => {
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
        chartTypes = JSON.parse(raw);
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
    
    // Логируем сохранение скелета
    const userName = req.body.userName || req.headers['x-user-name'] || 'Неизвестный пользователь';
    addLog(userName, 'Сохранил скелет графика', `Тип: ${chartType}, задач: ${skeleton.length}`, null);
    
    res.json({ ok: true, chartType, taskCount: skeleton.length });
  } catch (e) {
    console.error('Ошибка сохранения скелета:', e);
    res.status(500).json({ ok: false, error: 'save_failed', message: e.message });
  }
});

// Получить список всех типов графиков
app.get('/api/chart-types', (req, res) => {
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
    const chartTypes = JSON.parse(raw);
    
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

// Создать новый тип графика
app.post('/api/chart-types', (req, res) => {
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
      chartTypes = JSON.parse(raw);
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
    
    // Логируем создание типа графика
    const userName = req.body.userName || req.headers['x-user-name'] || 'Неизвестный пользователь';
    addLog(userName, 'Создал тип графика', `Тип: ${chartTypeName} (${chartTypeId}), контейнер: ${containerName}`, null);
    
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

// Удалить тип графика
app.delete('/api/chart-types/:id', (req, res) => {
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
    let chartTypes = JSON.parse(raw);
    
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
    
    // Логируем удаление типа графика
    const userName = req.body.userName || req.headers['x-user-name'] || 'Неизвестный пользователь';
    if (deletedType) {
      addLog(userName, 'Удалил тип графика', `Тип: ${deletedType.chartTypeName || chartTypeId} (${chartTypeId})`, null);
    }
    
    res.json({ ok: true });
  } catch (e) {
    console.error('Ошибка удаления типа графика:', e);
    res.status(500).json({ ok: false, error: 'delete_failed', message: e.message });
  }
});

// получить информацию о компании (название и логотип)
app.get('/api/company-info', (req, res) => {
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
    res.json(JSON.parse(raw));
  } catch (e) {
    console.error('Ошибка загрузки company-info:', e);
    res.status(500).json({ ok: false, error: 'load_failed' });
  }
});

// сохранить информацию о компании
app.post('/api/company-info', (req, res) => {
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
        oldInfo = JSON.parse(fs.readFileSync(infoFile, 'utf8'));
      } catch (e) {
        // Игнорируем ошибку, если файл поврежден
      }
    }
    
    fs.writeFileSync(infoFile, JSON.stringify(req.body, null, 2), 'utf8');
    
    // Логируем изменение информации о компании
    const userName = req.body.userName || req.headers['x-user-name'] || 'Неизвестный пользователь';
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
    if (changes.length > 0) {
      addLog(userName, 'Изменил информацию о компании', changes.join(', '), companyId);
    }
    
    res.json({ ok: true });
  } catch (e) {
    console.error('Ошибка сохранения company-info:', e);
    res.status(500).json({ ok: false, error: 'save_failed' });
  }
});

// ========== API ДЛЯ РАБОТЫ С ПОЛЬЗОВАТЕЛЯМИ ==========

// Получить список пользователей (для конкретной компании или всех)
app.get('/api/users', (req, res) => {
  try {
    const companyId = req.query.company; // Опционально: фильтр по компании

    if (!fs.existsSync(USERS_FILE)) {
      return res.json([]);
    }
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    let users = JSON.parse(raw);

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

// Добавить нового пользователя
app.post('/api/users', async (req, res) => {
  try {
    const { name, login, password, role, companies } = req.body;

    if (!name || !login || !password) {
      return res.status(400).json({ ok: false, error: 'Не все поля заполнены' });
    }

    // Проверяем, что пароль не пустой после trim
    const trimmedPassword = password.trim();
    if (!trimmedPassword) {
      return res.status(400).json({ ok: false, error: 'Пароль не может быть пустым' });
    }

    // Загружаем существующих пользователей
    let users = [];
    if (fs.existsSync(USERS_FILE)) {
      const raw = fs.readFileSync(USERS_FILE, 'utf8');
      users = JSON.parse(raw);
    }

    // Проверяем, не существует ли уже пользователь с таким логином
    if (users.some(u => u.login === login)) {
      return res.status(400).json({ ok: false, error: 'Пользователь с таким логином уже существует' });
    }

    // Хешируем пароль (используем trimmed версию)
    const hashedPassword = await bcrypt.hash(trimmedPassword, 10);
    
    // Проверяем, что хеш создан правильно
    if (!hashedPassword || !hashedPassword.startsWith('$2')) {
      console.error('❌ Ошибка создания хеша пароля!');
      return res.status(500).json({ ok: false, error: 'Ошибка создания пароля' });
    }
    
    console.log(`🔐 Создание пользователя "${login.trim()}": пароль хеширован успешно`);

    // Добавляем нового пользователя
    const newUser = {
      id: Date.now().toString(),
      name: name.trim(),
      login: login.trim(),
      password: hashedPassword,
      role: role || 'user',
      companies: Array.isArray(companies) ? companies : [], // Массив ID компаний
      createdAt: new Date().toISOString()
    };

    users.push(newUser);

    // Сохраняем
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    console.log(`✅ Пользователь "${login.trim()}" успешно создан с хешированным паролем`);
    
    // Логируем создание пользователя
    const userName = req.body.userName || req.headers['x-user-name'] || 'Система';
    const companyList = Array.isArray(companies) && companies.length > 0 ? companies.join(', ') : 'нет';
    addLog(userName, 'Создал пользователя', `Пользователь: ${name} (${login}), роль: ${role || 'user'}, компании: ${companyList}`, null);
    
    res.json({ ok: true });
  } catch (e) {
    console.error('Ошибка добавления пользователя:', e);
    res.status(500).json({ ok: false, error: 'add_failed' });
  }
});

// Удалить пользователя
app.delete('/api/users/:login', (req, res) => {
  try {
    let login = req.params.login;
    
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
      users = JSON.parse(raw);
    } catch (e) {
      console.error('Ошибка чтения файла users.json:', e);
      return res.status(500).json({ ok: false, error: 'Ошибка чтения данных пользователей' });
    }

    // Получаем информацию об удаляемом пользователе для лога ДО удаления
    const deletedUser = users.find(u => u.login === login);
    
    if (!deletedUser) {
      return res.status(404).json({ ok: false, error: 'Пользователь не найден' });
    }

    const initialLength = users.length;
    users = users.filter(u => u.login !== login);

    if (users.length === initialLength) {
      return res.status(404).json({ ok: false, error: 'Пользователь не найден' });
    }
    
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    
    // Логируем удаление пользователя
    const userName = req.body.userName || req.headers['x-user-name'] || 'Система';
    addLog(userName, 'Удалил пользователя', `Пользователь: ${deletedUser.name || deletedUser.login} (${login})`, null);
    
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

// Обновление профиля пользователя
app.put('/api/users/update', async (req, res) => {
  try {
    const { oldLogin, newLogin, name, password } = req.body;

    if (!oldLogin || !newLogin) {
      return res.status(400).json({ ok: false, error: 'Логин обязателен' });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ ok: false, error: 'Имя пользователя обязательно' });
    }

    if (!fs.existsSync(USERS_FILE)) {
      return res.status(404).json({ ok: false, error: 'Пользователь не найден' });
    }

    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    let users = JSON.parse(raw);

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

// Обновить доступ пользователя к компаниям
app.put('/api/users/:login/companies', (req, res) => {
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
      users = JSON.parse(raw);
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

// Обновление пользователя админом (имя, роль, компании, пароль)
app.put('/api/users/:login', async (req, res) => {
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
      users = JSON.parse(raw);
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

// Проверка авторизации пользователя
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
    const users = JSON.parse(raw);

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

// Получить логи активности
app.get('/api/activity-logs', (req, res) => {
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

// Очистить логи (только для админов)
app.delete('/api/activity-logs', (req, res) => {
  try {
    writeLogs([]);
    res.json({ ok: true, message: 'Логи очищены' });
  } catch (e) {
    console.error('Ошибка очистки логов:', e);
    res.status(500).json({ ok: false, error: 'clear_failed' });
  }
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
    const users = JSON.parse(raw);
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