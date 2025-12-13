# Реализация сохранения относительных смещений между задачами

## Проблема
При изменении даты начала проекта все настройки связей между задачами (например, "задача начинается за 2 дня до окончания предшественника") слетают на дефолт.

## Решение
Добавить поддержку поля `offset` (смещение в рабочих днях) для каждой задачи, которое сохраняет относительное положение задачи относительно предшественника.

## Изменения в коде

### 1. Добавить поле offset в структуру задачи

Найти строку ~8112 в `implementation_schedule.html`:
```javascript
link: item.link || 'О_Н' // Все задачи по умолчанию О_Н
```

Заменить на:
```javascript
link: item.link || 'О_Н', // Все задачи по умолчанию О_Н
offset: 0 // Смещение в рабочих днях относительно предшественника (0 = по умолчанию для связи)
```

### 2. Добавить функцию вычисления offset

Перед функцией `recalculateDatesFrom` (строка ~14325) добавить:

```javascript
// Вычислить смещение (offset) между текущей задачей и предшественником
function calculateTaskOffset(task, prevTask) {
    if (!task || !prevTask || !task.startDate) return 0;
    
    const linkType = task.link || 'О_Н';
    let referenceDate;
    
    if (linkType === 'Н_Н') {
        // Н_Н: начало-начало - смещение от начала предшественника
        if (!prevTask.startDate) return 0;
        referenceDate = new Date(prevTask.startDate);
    } else if (linkType === 'О_О') {
        // О_О: окончание-окончание - смещение от окончания предшественника
        if (!prevTask.endDate) return 0;
        referenceDate = new Date(prevTask.endDate);
    } else {
        // О_Н: окончание-начало - смещение от окончания предшественника
        if (!prevTask.endDate) return 0;
        referenceDate = new Date(prevTask.endDate);
        referenceDate.setDate(referenceDate.getDate() + 1);
        // Ищем следующий рабочий день
        while (!isWorkday(referenceDate)) {
            referenceDate.setDate(referenceDate.getDate() + 1);
        }
    }
    
    // Вычисляем количество рабочих дней между referenceDate и task.startDate
    const taskStart = new Date(task.startDate);
    let offset = 0;
    let currentDate = new Date(referenceDate);
    
    if (taskStart.getTime() > referenceDate.getTime()) {
        // Задача начинается после referenceDate - положительное смещение
        while (currentDate.getTime() < taskStart.getTime()) {
            if (isWorkday(currentDate)) {
                offset++;
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
    } else if (taskStart.getTime() < referenceDate.getTime()) {
        // Задача начинается до referenceDate - отрицательное смещение
        while (currentDate.getTime() > taskStart.getTime()) {
            currentDate.setDate(currentDate.getDate() - 1);
            if (isWorkday(currentDate)) {
                offset--;
            }
        }
    }
    
    return offset;
}
```

### 3. Обновить функцию recalculateDatesFrom

В функции `recalculateDatesFrom` (строка ~14325) найти блок обработки связей и обновить его:

Найти:
```javascript
} else if (prevTask) {
    if (linkType === 'Н_Н') {
        // Н_Н: начало-начало - задача начинается в ту же дату, что и предшественник
        if (prevTask.startDate) {
            const newStart = new Date(prevTask.startDate);
            dates = getTaskDates(newStart, task.days);
        } else {
            continue;
        }
    } else if (linkType === 'О_О') {
        // О_О: окончание-окончание - задача заканчивается в ту же дату, что и предшественник
        if (prevTask.endDate) {
            const newEnd = new Date(prevTask.endDate);
            dates = getWorkdaysBackward(newEnd, task.days);
        } else {
            continue;
        }
    } else {
        // О_Н (по умолчанию): окончание-начало - задача начинается после окончания предыдущей
        if (prevTask.endDate) {
            const newStart = new Date(prevTask.endDate);
            newStart.setDate(newStart.getDate() + 1);
            dates = getTaskDates(newStart, task.days);
        } else {
            continue;
        }
    }
}
```

Заменить на:
```javascript
} else if (prevTask) {
    // Инициализируем offset, если его нет
    if (task.offset === undefined) {
        task.offset = 0;
    }
    
    let baseDate;
    
    if (linkType === 'Н_Н') {
        // Н_Н: начало-начало - задача начинается в ту же дату, что и предшественник
        if (!prevTask.startDate) continue;
        baseDate = new Date(prevTask.startDate);
    } else if (linkType === 'О_О') {
        // О_О: окончание-окончание - задача заканчивается в ту же дату, что и предшественник
        if (!prevTask.endDate) continue;
        baseDate = new Date(prevTask.endDate);
    } else {
        // О_Н (по умолчанию): окончание-начало - задача начинается после окончания предыдущей
        if (!prevTask.endDate) continue;
        baseDate = new Date(prevTask.endDate);
        baseDate.setDate(baseDate.getDate() + 1);
        // Ищем следующий рабочий день
        while (!isWorkday(baseDate)) {
            baseDate.setDate(baseDate.getDate() + 1);
        }
    }
    
    // Применяем offset (смещение в рабочих днях)
    if (task.offset !== 0) {
        let offsetDays = Math.abs(task.offset);
        let direction = task.offset > 0 ? 1 : -1;
        
        while (offsetDays > 0) {
            baseDate.setDate(baseDate.getDate() + direction);
            if (isWorkday(baseDate)) {
                offsetDays--;
            }
        }
    }
    
    if (linkType === 'О_О') {
        // Для О_О: дата окончания фиксирована, пересчитываем дату начала назад
        dates = getWorkdaysBackward(baseDate, task.days);
    } else {
        // Для Н_Н и О_Н: дата начала фиксирована, пересчитываем дату окончания
        dates = getTaskDates(baseDate, task.days);
    }
}
```

### 4. Обновить обработчик изменения дат

В функции `onTaskTableInputChange` (строка ~13476) найти обработку `field === 'startDate'` и добавить вычисление offset:

Найти:
```javascript
} else if (field === 'startDate') {
    task.startDate = parseDateFromInput(input.value);
    // ... остальной код
}
```

Добавить после установки `task.startDate`:
```javascript
// Вычисляем и сохраняем offset относительно предшественника
if (index > 0) {
    const prevTask = tasks[index - 1];
    if (prevTask) {
        task.offset = calculateTaskOffset(task, prevTask);
        console.log(`📊 Вычислен offset для задачи ${index}: ${task.offset} рабочих дней`);
    }
}
```

### 5. Обновить обработчик изменения связи

В функции `onTaskTableInputChange` найти обработку `field === 'link'` и добавить пересчет offset:

Найти:
```javascript
} else if (field === 'link') {
    task.link = input.value || '';
    // ... остальной код
}
```

Добавить после установки `task.link`:
```javascript
// Пересчитываем offset при изменении связи
if (index > 0) {
    const prevTask = tasks[index - 1];
    if (prevTask) {
        task.offset = calculateTaskOffset(task, prevTask);
        console.log(`📊 Пересчитан offset для задачи ${index} при изменении связи: ${task.offset} рабочих дней`);
    }
}
```

### 6. Добавить миграцию для существующих задач

При загрузке задач из файла добавить вычисление offset для существующих задач, если его нет:

Найти функцию загрузки задач (например, `loadGanttState`) и добавить:

```javascript
// Миграция: вычисляем offset для существующих задач, если его нет
if (tasks && tasks.length > 0) {
    for (let i = 1; i < tasks.length; i++) {
        const task = tasks[i];
        const prevTask = tasks[i - 1];
        
        if (task.offset === undefined && prevTask) {
            task.offset = calculateTaskOffset(task, prevTask);
            console.log(`📊 Вычислен offset для существующей задачи ${i}: ${task.offset} рабочих дней`);
        }
    }
}
```

## Тестирование

1. Создать несколько задач
2. Настроить связи между задачами (например, вторая задача начинается за 2 дня до окончания первой)
3. Изменить дату начала проекта
4. Проверить, что относительные смещения сохранились
