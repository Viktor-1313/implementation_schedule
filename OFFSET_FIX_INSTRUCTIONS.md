# Инструкция по исправлению сохранения относительных смещений между задачами

## Проблема
При изменении даты старта проекта все задачи сбрасываются на дефолтные значения, теряя настроенные относительные смещения (например, "задача начинается за 2 дня до окончания предшественника").

## Решение
Добавить систему сохранения относительных смещений между задачами, чтобы при изменении даты старта проекта все задачи сдвигались, сохраняя свои относительные позиции.

## Шаги внедрения

### 1. Добавить новые функции перед функцией `updateStartDate()`

Найдите в файле `implementation_schedule.html` строку:
```javascript
async function updateStartDate() {
```

Перед этой строкой добавьте следующие функции:

```javascript
        // Вычисляет относительное смещение задачи от предшественника в рабочих днях
        function calculateOffsetFromPredecessor(taskIndex) {
            if (taskIndex === 0) {
                // Первая задача не имеет предшественника, смещение = 0
                return 0;
            }
            
            const task = tasks[taskIndex];
            const prevTask = tasks[taskIndex - 1];
            
            if (!task || !prevTask || !task.startDate || !prevTask.endDate) {
                return 0;
            }
            
            // Вычисляем количество рабочих дней между окончанием предшественника и началом текущей задачи
            const dates = getWorkdaysBetween(prevTask.endDate, task.startDate);
            // Если задача начинается до окончания предшественника, смещение отрицательное
            if (task.startDate < prevTask.endDate) {
                // Считаем рабочие дни назад
                const datesBack = getWorkdaysBetween(task.startDate, prevTask.endDate);
                return -datesBack.length;
            }
            
            return dates.length;
        }
        
        // Сохраняет относительные смещения для всех задач
        function saveTaskOffsets() {
            tasks.forEach((task, index) => {
                if (index === 0) {
                    // Первая задача всегда имеет смещение 0
                    task.offset = 0;
                } else {
                    // Вычисляем смещение от предшественника
                    task.offset = calculateOffsetFromPredecessor(index);
                }
            });
            console.log('💾 Сохранены смещения задач:', tasks.map((t, i) => `Задача ${i}: offset=${t.offset}`));
        }
        
        // Добавляет указанное количество рабочих дней к дате
        function addWorkdays(startDate, workdays) {
            if (workdays === 0) return new Date(startDate);
            
            let currentDate = new Date(startDate);
            let added = 0;
            const direction = workdays > 0 ? 1 : -1;
            const targetDays = Math.abs(workdays);
            
            while (added < targetDays) {
                currentDate.setDate(currentDate.getDate() + direction);
                if (isWorkday(currentDate)) {
                    added++;
                }
            }
            
            return currentDate;
        }
        
        // Сдвигает все задачи на указанное количество рабочих дней, сохраняя относительные смещения
        function shiftAllTasksByWorkdays(workdaysDiff) {
            if (tasks.length === 0) return;
            
            // Сдвигаем первую задачу
            const firstTask = tasks[0];
            if (firstTask.startDate) {
                const newStartDate = addWorkdays(firstTask.startDate, workdaysDiff);
                firstTask.startDate = newStartDate;
                // Пересчитываем даты первой задачи
                recalculateTaskDatesWithWeekends(firstTask);
            }
            
            // Сдвигаем остальные задачи, сохраняя их относительные смещения
            for (let i = 1; i < tasks.length; i++) {
                const task = tasks[i];
                const prevTask = tasks[i - 1];
                
                // Восстанавливаем смещение, если оно было сохранено
                const offset = task.offset !== undefined ? task.offset : calculateOffsetFromPredecessor(i);
                
                if (prevTask.endDate) {
                    // Вычисляем новую дату начала на основе окончания предшественника и смещения
                    let newStartDate;
                    if (offset === 0) {
                        // Задача начинается сразу после предшественника
                        newStartDate = new Date(prevTask.endDate);
                        newStartDate.setDate(newStartDate.getDate() + 1);
                        while (!isWorkday(newStartDate)) {
                            newStartDate.setDate(newStartDate.getDate() + 1);
                        }
                    } else if (offset > 0) {
                        // Задача начинается через N рабочих дней после окончания предшественника
                        newStartDate = new Date(prevTask.endDate);
                        newStartDate.setDate(newStartDate.getDate() + 1);
                        while (!isWorkday(newStartDate)) {
                            newStartDate.setDate(newStartDate.getDate() + 1);
                        }
                        // Добавляем offset рабочих дней
                        const workdays = getWorkdaysBetween(newStartDate, addWorkdays(newStartDate, offset));
                        if (workdays.length > 0 && workdays.length >= offset) {
                            newStartDate = workdays[offset - 1] || newStartDate;
                        }
                    } else {
                        // Задача начинается за N рабочих дней ДО окончания предшественника (отрицательное смещение)
                        const datesBack = getWorkdaysBackward(prevTask.endDate, Math.abs(offset));
                        if (datesBack && datesBack.length > 0) {
                            newStartDate = datesBack[Math.abs(offset) - 1] || datesBack[0];
                        } else {
                            newStartDate = new Date(prevTask.endDate);
                        }
                    }
                    
                    task.startDate = newStartDate;
                    recalculateTaskDatesWithWeekends(task);
                }
            }
        }

```

### 2. Заменить функцию `updateStartDate()`

Замените существующую функцию:

```javascript
        async function updateStartDate() {
            const input = document.getElementById('startDateInput');
            const newDate = parseDateFromInput(input.value);
            
            if (!isWorkday(newDate)) {
                alert('Пожалуйста, выберите рабочий день');
                return;
            }
            
            // Сохраняем текущие смещения перед изменением
            saveTaskOffsets();
            
            // Вычисляем разницу в рабочих днях между старой и новой датой старта
            const oldStartDate = tasks.length > 0 && tasks[0].startDate ? new Date(tasks[0].startDate) : startDate;
            let workdaysDiff = 0;
            
            if (newDate > oldStartDate) {
                const dates = getWorkdaysBetween(oldStartDate, newDate);
                workdaysDiff = dates.length;
            } else if (newDate < oldStartDate) {
                const datesBack = getWorkdaysBetween(newDate, oldStartDate);
                workdaysDiff = -datesBack.length;
            }
            
            // Сдвигаем все задачи, сохраняя относительные смещения
            shiftAllTasksByWorkdays(workdaysDiff);
            
            // Обновляем глобальную дату старта
            startDate = newDate;
            
            // Перерисовываем график и таблицу
            renderGantt();
            renderTable();
            updateStatistics();
            
            // Сохраняем изменения
            debouncedSave();
            
            closeModal();
        }
```

### 3. Обновить функцию `onTaskTableInputChange` для автоматического сохранения смещений

Найдите в функции `onTaskTableInputChange` место, где обрабатываются изменения дат (после строк с `field === 'startDate'` или `field === 'endDate'`), и добавьте вызов сохранения смещений:

```javascript
            // После обработки изменения дат, сохраняем смещения
            if (field === 'startDate' || field === 'endDate') {
                // Сохраняем смещения после изменения дат
                if (typeof saveTaskOffsets === 'function') {
                    saveTaskOffsets();
                }
            }
```

Также найдите функцию `recalculateFollowingTasks` и добавьте сохранение смещений после пересчета:

```javascript
        function recalculateFollowingTasks(changedIndex) {
            // ... существующий код ...
            
            // После пересчета сохраняем смещения
            if (typeof saveTaskOffsets === 'function') {
                saveTaskOffsets();
            }
        }
```

## Как это работает

1. **При изменении дат задач**: автоматически вычисляется и сохраняется относительное смещение (`offset`) каждой задачи от предшественника в рабочих днях.

2. **При изменении даты старта проекта**: 
   - Сохраняются текущие смещения всех задач
   - Вычисляется разница в рабочих днях между старой и новой датой старта
   - Все задачи сдвигаются на эту разницу, сохраняя свои относительные смещения

3. **Смещения сохраняются в поле `task.offset`** и автоматически применяются при пересчете дат.

## Тестирование

1. Создайте несколько задач
2. Настройте относительные смещения (например, вторая задача начинается за 2 дня до окончания первой)
3. Измените дату старта проекта
4. Проверьте, что все смещения сохранились

## Примечания

- Смещения вычисляются в рабочих днях (выходные и праздники не учитываются)
- Отрицательные смещения поддерживаются (задача может начинаться до окончания предшественника)
- Смещения автоматически сохраняются при изменении дат задач
