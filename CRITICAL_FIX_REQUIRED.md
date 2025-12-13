# КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Сохранение смещений при изменении дат задач

## Проблема
При изменении даты задачи (например, добавлении дня) все последующие задачи сбрасываются на дефолтные значения, теряя настроенные относительные смещения.

## Причина
Функция `recalculateFollowingTasks` не использует сохраненные смещения (`task.offset`), а пересчитывает задачи последовательно по типу связи (О_Н, Н_Н, О_О).

## Решение

### 1. Найдите функцию `recalculateFollowingTasks` (примерно строка 14208)

### 2. В начале функции, сразу после `console.log('🔢 recalculateFollowingTasks: Начало пересчета с индекса', changedIndex);`, добавьте:

```javascript
// КРИТИЧЕСКИ ВАЖНО: Сохраняем смещения ПЕРЕД пересчетом
if (typeof saveTaskOffsets === 'function') {
    saveTaskOffsets();
}
```

### 3. Найдите блок обработки связи О_Н (по умолчанию) в этой же функции. Он выглядит примерно так:

```javascript
} else {
    // О_Н (по умолчанию): окончание-начало - задача начинается после окончания предыдущей
    if (!prevTask.endDate) continue;
    newStart = new Date(prevTask.endDate);
    newStart.setDate(newStart.getDate() + 1);
    // Ищем следующий рабочий день
    while (!isWorkday(newStart)) {
        newStart.setDate(newStart.getDate() + 1);
    }
    const taskStartTime = safeGetTime(task.startDate);
    shouldRecalculate = isNaN(taskStartTime) || taskStartTime !== newStart.getTime();
    
    if (shouldRecalculate) {
        task.startDate = newStart;
        recalculateTaskDatesWithWeekends(task);
    }
}
```

### 4. Замените этот блок на:

```javascript
} else {
    // О_Н (по умолчанию): окончание-начало - задача начинается после окончания предыдущей
    // ВАЖНО: Используем сохраненное смещение!
    if (!prevTask.endDate) continue;
    
    // Получаем сохраненное смещение или вычисляем его
    const offset = task.offset !== undefined ? task.offset : (typeof calculateOffsetFromPredecessor === 'function' ? calculateOffsetFromPredecessor(i) : 0);
    
    // Вычисляем новую дату начала на основе окончания предшественника и смещения
    if (offset === 0) {
        // Задача начинается сразу после предшественника
        newStart = new Date(prevTask.endDate);
        newStart.setDate(newStart.getDate() + 1);
        while (!isWorkday(newStart)) {
            newStart.setDate(newStart.getDate() + 1);
        }
    } else if (offset > 0) {
        // Задача начинается через N рабочих дней после окончания предшественника
        newStart = new Date(prevTask.endDate);
        newStart.setDate(newStart.getDate() + 1);
        while (!isWorkday(newStart)) {
            newStart.setDate(newStart.getDate() + 1);
        }
        // Добавляем offset рабочих дней
        if (typeof addWorkdays === 'function') {
            const workdays = getWorkdaysBetween(newStart, addWorkdays(newStart, offset));
            if (workdays.length > 0 && workdays.length >= offset) {
                newStart = workdays[offset - 1] || newStart;
            }
        }
    } else {
        // Задача начинается за N рабочих дней ДО окончания предшественника (отрицательное смещение)
        const datesBack = getWorkdaysBackward(prevTask.endDate, Math.abs(offset));
        if (datesBack && datesBack.length > 0) {
            newStart = datesBack[Math.abs(offset) - 1] || datesBack[0];
        } else {
            newStart = new Date(prevTask.endDate);
        }
    }
    
    const taskStartTime = safeGetTime(task.startDate);
    shouldRecalculate = isNaN(taskStartTime) || taskStartTime !== newStart.getTime();
    
    if (shouldRecalculate) {
        task.startDate = newStart;
        recalculateTaskDatesWithWeekends(task);
    }
}
```

### 5. Найдите функцию `onTaskTableInputChange` и добавьте сохранение смещений ПЕРЕД изменением дат:

Найдите блок:
```javascript
} else if (field === 'startDate') {
    task.startDate = parseDateFromInput(input.value);
```

Замените на:
```javascript
} else if (field === 'startDate') {
    // Сохраняем смещения ПЕРЕД изменением даты начала
    if (typeof saveTaskOffsets === 'function') {
        saveTaskOffsets();
    }
    task.startDate = parseDateFromInput(input.value);
```

Аналогично для `endDate`:
```javascript
} else if (field === 'endDate') {
    const newEnd = parseDateFromInput(input.value);
    // Сохраняем смещения ПЕРЕД изменением даты окончания
    if (typeof saveTaskOffsets === 'function') {
        saveTaskOffsets();
    }
    // Правило: дата окончания не может быть раньше даты начала
```

## Проверка

После внесения изменений:
1. Настройте вторую задачу за 2 дня до окончания первой
2. Добавьте один день первой задаче
3. Вторая задача должна остаться за 2 дня до окончания первой (смещение сохранится)

## Важно

- Смещения должны сохраняться ПЕРЕД изменением дат, а не после
- Функция `recalculateFollowingTasks` должна использовать сохраненные смещения, а не вычислять их заново
- Все функции (`saveTaskOffsets`, `calculateOffsetFromPredecessor`, `addWorkdays`) должны быть определены
