# Исправление критической проблемы #1: Проверка авторизации на API эндпоинтах

**Дата:** 2025-01-XX  
**Статус:** ✅ Выполнено

## Проблема

Большинство API эндпоинтов не проверяли, авторизован ли пользователь перед выполнением операций. Это позволяло неавторизованным пользователям:
- Просматривать данные всех компаний
- Создавать/удалять компании
- Изменять графики
- Управлять пользователями
- Просматривать логи активности

## Решение

### 1. Созданы middleware для проверки авторизации

Добавлены три middleware в `server.js`:

#### `requireAuth` - Обязательная авторизация
- Проверяет наличие логина пользователя в `req.body.userLogin` или `req.headers['x-user-login']`
- Загружает данные пользователя из `users.json`
- Сохраняет пользователя в `req.user` (без пароля)
- Возвращает 401, если пользователь не авторизован

#### `requireAdmin` - Проверка прав администратора
- Требует, чтобы пользователь был авторизован (`requireAuth` должен быть применен первым)
- Проверяет, что `req.user.role === 'admin'`
- Возвращает 403, если пользователь не администратор

#### `checkCompanyAccess` - Проверка доступа к компании
- Администраторы имеют доступ ко всем компаниям
- Обычные пользователи могут работать только с компаниями из своего списка `companies`
- В режиме просмотра (без авторизации) разрешены только GET запросы
- Возвращает 403, если нет доступа к компании

#### `optionalAuth` - Опциональная авторизация
- Используется для эндпоинтов, доступных в режиме просмотра
- Загружает данные пользователя, если они есть, но не требует обязательной авторизации
- Позволяет работать в режиме просмотра без авторизации

### 2. Применены middleware к защищенным эндпоинтам

#### Эндпоинты компаний:
- `GET /api/companies` - `requireAuth` (требуется авторизация)
- `POST /api/companies` - `requireAuth, requireAdmin` (только админы)
- `PUT /api/companies/:id` - `requireAuth, requireAdmin` (только админы)
- `DELETE /api/companies/:id` - `requireAuth, requireAdmin` (только админы)
- `POST /api/companies/:id/archive` - `requireAuth, requireAdmin` (только админы)
- `POST /api/companies/:id/restore` - `requireAuth, requireAdmin` (только админы)
- `GET /api/companies/archived` - `requireAuth, requireAdmin` (только админы)

#### Эндпоинты графика Ганта:
- `GET /api/gantt-state` - `optionalAuth, checkCompanyAccess` (режим просмотра разрешен)
- `POST /api/gantt-state` - `requireAuth, checkCompanyAccess` (требуется авторизация)
- `GET /api/company-info` - `optionalAuth, checkCompanyAccess` (режим просмотра разрешен)
- `POST /api/company-info` - `requireAuth, checkCompanyAccess` (требуется авторизация)

#### Эндпоинты скелетов графиков:
- `GET /api/gantt-skeleton` - `requireAuth` (требуется авторизация)
- `POST /api/gantt-skeleton` - `requireAuth, requireAdmin` (только админы)
- `GET /api/chart-types` - `requireAuth` (требуется авторизация)
- `POST /api/chart-types` - `requireAuth, requireAdmin` (только админы)
- `DELETE /api/chart-types/:id` - `requireAuth, requireAdmin` (только админы)

#### Эндпоинты пользователей:
- `GET /api/users` - `requireAuth, requireAdmin` (только админы)
- `POST /api/users` - `requireAuth, requireAdmin` (только админы)
- `DELETE /api/users/:login` - `requireAuth, requireAdmin` (только админы)
- `PUT /api/users/update` - `requireAuth` (пользователь может менять только свой профиль)
- `PUT /api/users/:login/companies` - `requireAuth, requireAdmin` (только админы)
- `PUT /api/users/:login` - `requireAuth, requireAdmin` (только админы)

#### Эндпоинты логов:
- `GET /api/activity-logs` - `requireAuth, requireAdmin` (только админы)
- `DELETE /api/activity-logs` - `requireAuth, requireAdmin` (только админы)

#### Эндпоинты бэкапа:
- `GET /api/company-backup` - `requireAuth, checkCompanyAccess` (требуется авторизация)
- `POST /api/company-restore` - `requireAuth, checkCompanyAccess` (требуется авторизация)

### 3. Добавлены функции-хелперы на клиенте

В `implementation_schedule.html` добавлены функции для автоматического добавления заголовков авторизации:

#### `getAuthHeaders()` - Получение заголовков авторизации
```javascript
function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    // Добавляет X-User-Login, X-User-Name, X-User-Name-Encoded
    return headers;
}
```

#### `getAuthBody()` - Получение данных пользователя для body
```javascript
function getAuthBody() {
    const body = {};
    // Добавляет userLogin, userName
    return body;
}
```

## Как это работает

1. **Авторизация через `/api/auth`**:
   - Пользователь вводит логин и пароль
   - Сервер проверяет пароль через bcrypt
   - Возвращает данные пользователя (без пароля)
   - Клиент сохраняет данные в `localStorage`

2. **Последующие запросы**:
   - Клиент получает данные пользователя из `localStorage`
   - Добавляет `userLogin` в заголовки или body запроса
   - Сервер проверяет авторизацию через `requireAuth`
   - Загружает данные пользователя из `users.json`
   - Проверяет права доступа через `requireAdmin` или `checkCompanyAccess`

3. **Режим просмотра**:
   - Пользователь не авторизован (нет данных в `localStorage`)
   - GET запросы работают через `optionalAuth` и `checkCompanyAccess`
   - POST/PUT/DELETE запросы блокируются (требуется авторизация)

## Безопасность

✅ Все защищенные эндпоинты теперь требуют авторизацию  
✅ Проверка прав доступа к компаниям  
✅ Администраторы имеют полный доступ  
✅ Обычные пользователи могут работать только со своими компаниями  
✅ Режим просмотра работает только для GET запросов  

## Обратная совместимость

- Поддерживается старый формат с `userName` в body/заголовках
- Автоматическое определение логина из `userName` для обратной совместимости
- Режим просмотра продолжает работать как раньше

## Следующие шаги

1. Обновить все клиентские запросы для использования `getAuthHeaders()` и `getAuthBody()`
2. Протестировать все сценарии использования
3. Перейти к исправлению проблемы #2 (проверка прав доступа - уже частично реализована)

## Тестирование

Для проверки работы:

1. **Без авторизации**:
   ```bash
   curl http://localhost:3001/api/companies
   # Должно вернуть: {"ok":false,"error":"Требуется авторизация"}
   ```

2. **С авторизацией**:
   ```bash
   # Сначала авторизуйтесь через /api/auth
   # Затем используйте полученный userLogin в заголовках
   curl -H "X-User-Login: Driga_VA" http://localhost:3001/api/companies
   ```

3. **Режим просмотра**:
   ```bash
   # GET запросы должны работать без авторизации
   curl "http://localhost:3001/api/gantt-state?company=test"
   ```

---

**Важно:** После этого исправления все неавторизованные запросы к защищенным эндпоинтам будут отклоняться с ошибкой 401.






