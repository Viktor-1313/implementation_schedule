const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3001; // порт для внутреннего сервера компании
const USERS_FILE = path.join(__dirname, 'users.json');
const COMPANIES_FILE = path.join(__dirname, 'companies.json');

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
    res.json(companies);
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
    res.json({ ok: true, company: companies[companyIndex] });
  } catch (e) {
    console.error('Ошибка обновления компании:', e);
    res.status(500).json({ ok: false, error: 'update_failed' });
  }
});

// Удалить компанию
app.delete('/api/companies/:id', (req, res) => {
  try {
    const companyId = req.params.id;

    if (!fs.existsSync(COMPANIES_FILE)) {
      return res.status(404).json({ ok: false, error: 'Компания не найдена' });
    }

    const raw = fs.readFileSync(COMPANIES_FILE, 'utf8');
    let companies = JSON.parse(raw);

    const initialLength = companies.length;
    companies = companies.filter(c => c.id !== companyId);

    if (companies.length === initialLength) {
      return res.status(404).json({ ok: false, error: 'Компания не найдена' });
    }

    // Удаляем файлы данных компании
    const dataFile = getCompanyDataFile(companyId);
    const infoFile = getCompanyInfoFile(companyId);
    if (fs.existsSync(dataFile)) fs.unlinkSync(dataFile);
    if (fs.existsSync(infoFile)) fs.unlinkSync(infoFile);

    fs.writeFileSync(COMPANIES_FILE, JSON.stringify(companies, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) {
    console.error('Ошибка удаления компании:', e);
    res.status(500).json({ ok: false, error: 'delete_failed' });
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
    
    res.json({ ok: true });
  } catch (e) {
    console.error('❌ Ошибка сохранения gantt-state:', e);
    console.error('   Тип ошибки:', e.constructor.name);
    console.error('   Сообщение:', e.message);
    console.error('   Стек ошибки:', e.stack);
    res.status(500).json({ ok: false, error: 'save_failed', message: e.message });
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
    fs.writeFileSync(infoFile, JSON.stringify(req.body, null, 2), 'utf8');
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
    res.json({ ok: true });
  } catch (e) {
    console.error('Ошибка добавления пользователя:', e);
    res.status(500).json({ ok: false, error: 'add_failed' });
  }
});

// Удалить пользователя
app.delete('/api/users/:login', (req, res) => {
  try {
    const login = req.params.login;
    const MAIN_ADMIN_LOGIN = 'Driga_VA';

    // Защита от удаления главного администратора
    if (login === MAIN_ADMIN_LOGIN) {
      return res.status(403).json({ ok: false, error: 'Нельзя удалить главного администратора' });
    }

    if (!fs.existsSync(USERS_FILE)) {
      return res.status(404).json({ ok: false, error: 'Пользователь не найден' });
    }

    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    let users = JSON.parse(raw);

    const initialLength = users.length;
    users = users.filter(u => u.login !== login);

    if (users.length === initialLength) {
      return res.status(404).json({ ok: false, error: 'Пользователь не найден' });
    }

    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) {
    console.error('Ошибка удаления пользователя:', e);
    res.status(500).json({ ok: false, error: 'delete_failed' });
  }
});

// Обновление профиля пользователя
app.put('/api/users/update', async (req, res) => {
  try {
    const { oldLogin, newLogin, password } = req.body;

    if (!oldLogin || !newLogin) {
      return res.status(400).json({ ok: false, error: 'Логин обязателен' });
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

    // Обновляем логин
    users[userIndex].login = newLogin.trim();

    // Обновляем пароль, если он указан
    if (password && password.trim()) {
      const hashedPassword = await bcrypt.hash(password, 10);
      users[userIndex].password = hashedPassword;
    }

    // Сохраняем изменения
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) {
    console.error('Ошибка обновления профиля:', e);
    res.status(500).json({ ok: false, error: 'update_failed' });
  }
});

// Обновить доступ пользователя к компаниям
app.put('/api/users/:login/companies', (req, res) => {
  try {
    const { login } = req.params;
    const { companies } = req.body;

    if (!Array.isArray(companies)) {
      return res.status(400).json({ ok: false, error: 'companies должен быть массивом' });
    }

    if (!fs.existsSync(USERS_FILE)) {
      return res.status(404).json({ ok: false, error: 'Пользователь не найден' });
    }

    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    let users = JSON.parse(raw);

    const userIndex = users.findIndex(u => u.login === login);
    if (userIndex === -1) {
      return res.status(404).json({ ok: false, error: 'Пользователь не найден' });
    }

    // Обновляем список компаний
    users[userIndex].companies = companies;

    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) {
    console.error('Ошибка обновления доступа к компаниям:', e);
    res.status(500).json({ ok: false, error: 'update_failed' });
  }
});

// Обновление пользователя админом (имя, роль, компании, пароль)
app.put('/api/users/:login', async (req, res) => {
  try {
    const { login } = req.params;
    const { name, role, companies, password } = req.body;
    const MAIN_ADMIN_LOGIN = 'Driga_VA';

    if (!fs.existsSync(USERS_FILE)) {
      return res.status(404).json({ ok: false, error: 'Пользователь не найден' });
    }

    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    let users = JSON.parse(raw);

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

    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) {
    console.error('Ошибка обновления пользователя:', e);
    res.status(500).json({ ok: false, error: 'update_failed' });
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

// ========== СТАТИЧЕСКИЕ ФАЙЛЫ (после всех API маршрутов) ==========
// Редирект с корня на страницу авторизации
app.get('/', (req, res) => {
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
initializeMainAdmin().then(() => {
  // Проверяем наличие основных файлов
  const requiredFiles = ['auth.html', 'companies.html', 'admin.html', 'implementation_schedule.html'];
  const missingFiles = requiredFiles.filter(file => !fs.existsSync(path.join(__dirname, file)));
  
  if (missingFiles.length > 0) {
    console.warn(`⚠️  Предупреждение: не найдены файлы: ${missingFiles.join(', ')}`);
    console.log(`📁 Текущая директория: ${__dirname}`);
    console.log(`📁 Содержимое директории:`, fs.readdirSync(__dirname).join(', '));
  }
  
  // Обработка ошибок при запуске
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Сервер диаграммы Ганта запущен на порту ${PORT}`);
    console.log(`📁 Данные сохраняются в: ${__dirname}`);
    console.log(`📁 Содержимое директории:`, fs.readdirSync(__dirname).filter(f => !f.startsWith('.') && f !== 'node_modules').join(', '));
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
});